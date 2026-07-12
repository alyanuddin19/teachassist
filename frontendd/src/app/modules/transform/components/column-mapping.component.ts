import { Component } from '@angular/core';
import {
  ColumnMappingService,
  HeaderInfo,
  MappingSettings,
  MappingSuggestion,
  StandardTemplate
} from '../services/column-mapping.service';

type PreviewRow = {
  target: string;
  selectedSource: string;
  confidence: string;
  method: string;
  status: string;
  needsAttention: boolean;
};

@Component({
  selector: 'app-column-mapping',
  templateUrl: './column-mapping.component.html',
  styleUrls: ['./column-mapping.component.css']
})
export class ColumnMappingComponent {
  sourceFile: File | null = null;
  sessionId = '';
  sourceSheets: string[] = [];
  templates: StandardTemplate[] = [];
  selectedTemplateId = 0;
  selectedTemplate: StandardTemplate | null = null;
  templateNotice = '';
  sourceSheet = '';
  sourceHeaders: HeaderInfo[] = [];
  targetHeaders: HeaderInfo[] = [];
  suggestions: MappingSuggestion[] = [];
  previewRows: PreviewRow[] = [];
  missingColumns: any[] = [];
  manualValues: Record<string, string> = {};
  requiredTargets = new Set<string>();
  settings: MappingSettings = {
    allow_duplicate_target_mappings: false,
    required_targets: []
  };
  rowSettings = {
    source_header_row: 0,
    target_header_row: 0,
    source_data_start_row: 0,
    target_data_start_row: 0
  };
  detectedRows: Record<string, number> = {};
  uploadLoading = false;
  templateLoading = false;
  previewLoading = false;
  transforming = false;
  downloading = false;
  message = '';
  error = '';

  constructor(private columnMappingService: ColumnMappingService) {}

  get currentStep(): number {
    if (this.suggestions.length) {
      return 4;
    }
    if (this.sessionId) {
      return 2;
    }
    if (this.sourceFile) {
      return 2;
    }
    return 1;
  }

  get mappedCount(): number {
    return this.confirmedMappings().length;
  }

  get reviewCount(): number {
    return this.previewRows.filter((row) => row.needsAttention).length;
  }

  onSourceSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.sourceFile = input.files?.[0] || null;
    this.resetSession();
  }

  uploadFiles(): void {
    if (!this.sourceFile) {
      this.error = 'Please choose a source Excel file.';
      return;
    }

    this.uploadLoading = true;
    this.error = '';
    this.message = '';
    this.columnMappingService.uploadSource(this.sourceFile).subscribe({
      next: (response) => {
        this.sessionId = response.session_id;
        this.sourceSheets = response.source_sheets;
        this.sourceSheet = this.sourceSheets[0] || '';
        this.loadTemplates();
        this.message = 'Source file loaded. Choose a standard template, then check columns.';
        this.uploadLoading = false;
      },
      error: (error) => {
        this.error = this.extractError(error) || 'Could not upload files.';
        this.uploadLoading = false;
      }
    });
  }

  analyze(): void {
    if (!this.sessionId || !this.sourceSheet || !this.selectedTemplateId) {
      this.error = 'Please choose a source sheet and standard template.';
      return;
    }

    this.previewLoading = true;
    this.error = '';
    this.message = '';
    this.columnMappingService.analyzeStandard(this.sessionId, this.selectedTemplateId, this.sourceSheet).subscribe({
      next: (response) => {
        this.selectedTemplate = response.template || this.selectedTemplate;
        this.sourceHeaders = response.source_headers;
        this.targetHeaders = response.target_headers;
        this.suggestions = response.suggestions;
        this.missingColumns = response.missing_columns || [];
        this.detectedRows = response.detected;
        this.settings = response.settings;
        this.requiredTargets.clear();
        response.settings.required_targets.forEach((target) => this.requiredTargets.add(target));
        this.rebuildPreviewRows();
        this.message = 'Automatic mapping preview is ready. Check it once, then download.';
        this.previewLoading = false;
      },
      error: (error) => {
        this.error = this.extractError(error) || 'Could not analyze headers.';
        this.previewLoading = false;
      }
    });
  }

  setTarget(mapping: MappingSuggestion, target: string): void {
    mapping.target_column = target || null;
    mapping.status = target ? 'Mapped' : 'Unmapped';
    mapping.conflict = this.hasDuplicateTarget(target, mapping);
  }

  onTemplateSelected(): void {
    this.selectedTemplate = this.templates.find((template) => template.id === Number(this.selectedTemplateId)) || null;
    this.suggestions = [];
    this.missingColumns = [];
    this.targetHeaders = [];
    this.sourceHeaders = [];
    this.previewRows = [];
    this.message = this.selectedTemplate ? 'Template selected. Click Check Columns to preview mapping.' : '';
  }

  toggleRequired(target: string, checked: boolean): void {
    if (checked) {
      this.requiredTargets.add(target);
      return;
    }
    this.requiredTargets.delete(target);
  }

  resetMappings(): void {
    this.suggestions = this.suggestions.map((mapping) => ({
      ...mapping,
      target_column: mapping.suggested_target_column,
      status: mapping.suggested_target_column ? mapping.status : 'Unmapped'
    }));
    this.rebuildPreviewRows();
    this.message = 'Mappings reset to backend suggestions.';
    this.error = '';
  }

  transform(): void {
    const validation = this.validationMessage();
    if (validation) {
      this.error = validation;
      return;
    }

    this.transforming = true;
    this.error = '';
    this.message = '';
    this.columnMappingService.transform(
      this.sessionId,
      this.sourceSheet,
      '',
      this.suggestions,
      Array.from(this.requiredTargets),
      this.effectiveRowSettings()
    ).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, 'intelligent-column-mapping.xlsx');
        this.message = 'Transformation complete. Download started.';
        this.transforming = false;
      },
      error: (error) => {
        this.error = this.extractError(error) || 'Transformation failed.';
        this.transforming = false;
      }
    });
  }

  confirmAndDownload(): void {
    this.downloading = true;
    this.error = '';
    this.message = '';
    this.columnMappingService.transformStandard(
      this.sessionId,
      this.selectedTemplateId,
      this.sourceSheet,
      this.confirmedMappings(),
      this.manualValues,
      '',
      true
    ).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, 'standardized-template-output.xlsx');
        this.message = 'Download started.';
        this.downloading = false;
      },
      error: (error) => {
        this.error = this.extractError(error) || 'Download failed.';
        this.downloading = false;
      }
    });
  }

  validationMessage(): string {
    return '';
  }

  setSourceForTarget(target: string, source: string): void {
    this.suggestions = this.suggestions.map((mapping) => {
      if (mapping.target_column === target) {
        return { ...mapping, target_column: null, status: 'Unmapped', conflict: false };
      }
      if (source && mapping.source_column === source) {
        return { ...mapping, target_column: target, status: 'Mapped', conflict: false };
      }
      return mapping;
    });

    if (source && !this.suggestions.some((mapping) => mapping.source_column === source)) {
      this.suggestions = [
        ...this.suggestions,
        {
          source_column: source,
          suggested_target_column: target,
          target_column: target,
          confidence_score: 1,
          confidence_label: 'Manual',
          matching_method: 'manual',
          status: 'Mapped',
          conflict: false
        }
      ];
    }
    this.rebuildPreviewRows();
    this.error = '';
  }

  readableMethod(method: string): string {
    const labels: Record<string, string> = {
      exact: 'Exact name',
      'case-insensitive': 'Same name',
      normalized: 'Cleaned name',
      'special-character-normalized': 'Cleaned name',
      abbreviation: 'Short form matched',
      synonym: 'Similar meaning',
      semantic: 'Semantic match',
      'semantic-assessment': 'Semantic assessment match',
      'academic-field': 'Academic field match',
      manual: 'Teacher selected',
      fuzzy: 'Closest match',
      'no-match': 'Not matched'
    };
    return labels[method] || method;
  }

  readableMissingRule(column: any): string {
    const rule = column.missing_value_rule;
    if (rule === 'manual') {
      return 'Teacher will enter this value';
    }
    if (rule === 'blank') {
      return 'Left blank by template rule';
    }
    if (rule === 'zero') {
      return 'Filled with 0 by template rule';
    }
    if (rule === 'fixed') {
      return `Filled with "${column.default_value || ''}"`;
    }
    if (rule === 'sequence') {
      return 'Auto serial number';
    }
    if (rule === 'current_date') {
      return 'Today date';
    }
    if (rule === 'formula') {
      return 'Formula from template';
    }
    return 'Handled by template rule';
  }

  isTargetUsed(target: string, current: MappingSuggestion): boolean {
    return !this.settings.allow_duplicate_target_mappings && this.hasDuplicateTarget(target, current);
  }

  private hasDuplicateTarget(target: string, current: MappingSuggestion): boolean {
    if (!target) {
      return false;
    }
    return this.suggestions.some((mapping) => mapping !== current && mapping.target_column === target);
  }

  private confirmedMappings(): MappingSuggestion[] {
    const byTarget = new Map<string, MappingSuggestion>();
    this.suggestions
      .filter((mapping) => !!mapping.target_column)
      .forEach((mapping) => {
        const target = mapping.target_column as string;
        const current = byTarget.get(target);
        if (!current || mapping.confidence_score > current.confidence_score) {
          byTarget.set(target, { ...mapping, conflict: false, status: 'Mapped' });
        }
      });
    return Array.from(byTarget.values());
  }

  private bestMappingForTarget(target: string): MappingSuggestion | undefined {
    return this.confirmedMappings().find((mapping) => mapping.target_column === target);
  }

  private rebuildPreviewRows(): void {
    const mappingsByTarget = new Map<string, MappingSuggestion>();
    this.confirmedMappings().forEach((mapping) => {
      if (mapping.target_column) {
        mappingsByTarget.set(mapping.target_column, mapping);
      }
    });
    const missingByTarget = new Map<string, any>();
    this.missingColumns.forEach((column) => missingByTarget.set(column.target_column, column));

    this.previewRows = this.targetHeaders.map((target) => {
      const mapped = mappingsByTarget.get(target.name);
      if (mapped) {
        return {
          target: target.name,
          selectedSource: mapped.source_column,
          confidence: `${mapped.confidence_score} ${mapped.confidence_label}`,
          method: this.readableMethod(mapped.matching_method),
          status: mapped.conflict ? 'Needs review' : 'Mapped',
          needsAttention: mapped.status !== 'Mapped' || !!mapped.conflict
        };
      }

      const missing = missingByTarget.get(target.name);
      if (missing) {
        return {
          target: target.name,
          selectedSource: '',
          confidence: '-',
          method: 'Template rule',
          status: 'Not mapped',
          needsAttention: true
        };
      }

      return {
        target: target.name,
        selectedSource: '',
        confidence: '-',
        method: 'Not matched',
        status: 'Not mapped',
        needsAttention: true
      };
    });
  }

  private effectiveRowSettings(): Record<string, number> {
    return {
      source_header_row: this.rowSettings.source_header_row || this.detectedRows['source_header_row'] || 0,
      target_header_row: this.rowSettings.target_header_row || this.detectedRows['target_header_row'] || 0,
      source_data_start_row: this.rowSettings.source_data_start_row || this.detectedRows['source_data_start_row'] || 0,
      target_data_start_row: this.rowSettings.target_data_start_row || this.detectedRows['target_data_start_row'] || 0
    };
  }

  private resetSession(): void {
    this.sessionId = '';
    this.sourceSheets = [];
    this.templates = [];
    this.selectedTemplateId = 0;
    this.selectedTemplate = null;
    this.templateNotice = '';
    this.sourceHeaders = [];
    this.targetHeaders = [];
    this.suggestions = [];
    this.missingColumns = [];
    this.uploadLoading = false;
    this.templateLoading = false;
    this.previewLoading = false;
    this.transforming = false;
    this.downloading = false;
    this.requiredTargets.clear();
    this.message = '';
    this.error = '';
  }

  private loadTemplates(): void {
    const department = (
      localStorage.getItem('teacherDepartment') ||
      localStorage.getItem('department') ||
      localStorage.getItem('hodDepartment') ||
      ''
    ).trim();
    this.templateNotice = '';
    this.templateLoading = true;
    this.fetchTemplates(department, true);
  }

  private fetchTemplates(department: string, allowFallback: boolean, fallbackReason = ''): void {
    this.columnMappingService.getStandardTemplates(department).subscribe({
      next: (templates) => {
        if (!templates.length && allowFallback) {
          this.fetchTemplates('', false, department ? 'department-mismatch' : 'missing-department');
          return;
        }
        this.templateLoading = false;
        this.templates = templates;
        this.selectedTemplateId = templates[0]?.id || 0;
        this.selectedTemplate = templates[0] || null;
        if (!templates.length) {
          this.error = 'No active HOD template found. Ask the HOD to upload and activate one standard template.';
          return;
        }
        this.error = '';
        if (fallbackReason === 'department-mismatch') {
          this.templateNotice = '';
        } else if (!department || fallbackReason === 'missing-department') {
          this.templateNotice = '';
        }
        this.message = 'Source file loaded. Choose a template, then click Check Columns.';
      },
      error: (error) => {
        this.templateLoading = false;
        this.error = this.extractError(error) || 'Could not load standard templates.';
      }
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  private extractError(error: any): string {
    const raw = error?.error;
    if (raw instanceof Blob) {
      return '';
    }
    return raw?.detail || error?.message || '';
  }
}
