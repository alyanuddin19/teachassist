import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type MappingUploadResponse = {
  session_id: string;
  source_sheets: string[];
  target_sheets: string[];
  settings: MappingSettings;
};

export type MappingSettings = {
  allow_duplicate_target_mappings: boolean;
  required_targets: string[];
};

export type StandardTemplate = {
  id: number;
  name: string;
  description: string;
  department: string;
  purpose: string;
  version: number;
  status: string;
  is_active: boolean;
  sheet_name: string;
  fields?: any[];
};

export type HeaderInfo = {
  name: string;
  column_index: number;
  duplicate_index: number;
  is_empty: boolean;
};

export type MappingSuggestion = {
  source_column: string;
  suggested_target_column: string | null;
  target_column?: string | null;
  confidence_score: number;
  confidence_label: string;
  matching_method: string;
  status: string;
  conflict?: boolean;
  matching_reasons?: string[];
  source_tokens?: Record<string, any>;
  target_tokens?: Record<string, any>;
  alternatives?: Array<{
    target_column: string;
    confidence_score: number;
    matching_reasons: string[];
  }>;
};

export type MappingAnalyzeResponse = {
  template?: StandardTemplate;
  source_headers: HeaderInfo[];
  target_headers: HeaderInfo[];
  suggestions: MappingSuggestion[];
  mappings?: any[];
  unmatched_source_columns?: any[];
  missing_target_columns?: any[];
  missing_columns?: Array<{
    target_column: string;
    required: boolean;
    missing_value_rule: string;
    default_value: string;
    formula_definition: string;
    editable_by_teacher: boolean;
    status: string;
  }>;
  detected: {
    source_header_row: number;
    target_header_row: number;
    source_data_start_row: number;
    target_data_start_row: number;
  };
  settings: MappingSettings;
};

@Injectable({
  providedIn: 'root'
})
export class ColumnMappingService {
  private baseUrl = `${environment.apiUrl}/transform/column-mapping`;

  constructor(private http: HttpClient) {}

  uploadFiles(sourceFile: File, targetFile: File): Observable<MappingUploadResponse> {
    const formData = new FormData();
    formData.append('source_file', sourceFile);
    formData.append('target_file', targetFile);
    return this.http.post<MappingUploadResponse>(`${this.baseUrl}/upload`, formData);
  }

  getStandardTemplates(department = ''): Observable<StandardTemplate[]> {
    const params = department ? `?department=${encodeURIComponent(department)}` : '';
    return this.http.get<{ templates: StandardTemplate[] }>(
      `${environment.apiUrl}/transform/standard-templates${params}`
    ).pipe(map((response) => response.templates || []));
  }

  uploadSource(sourceFile: File): Observable<{ session_id: string; source_sheets: string[] }> {
    const formData = new FormData();
    formData.append('source_file', sourceFile);
    return this.http.post<{ session_id: string; source_sheets: string[] }>(`${this.baseUrl}/upload-source`, formData);
  }

  analyze(
    sessionId: string,
    sourceSheet: string,
    targetSheet: string,
    rowSettings: Record<string, number>
  ): Observable<MappingAnalyzeResponse> {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('source_sheet', sourceSheet);
    formData.append('target_sheet', targetSheet);
    Object.entries(rowSettings).forEach(([key, value]) => formData.append(key, String(value || 0)));
    return this.http.post<MappingAnalyzeResponse>(`${this.baseUrl}/analyze`, formData).pipe(
      map((response) => ({
        ...response,
        suggestions: response.suggestions.map((suggestion) => ({
          ...suggestion,
          target_column: suggestion.suggested_target_column
        }))
      }))
    );
  }

  transform(
    sessionId: string,
    sourceSheet: string,
    targetSheet: string,
    mappings: MappingSuggestion[],
    requiredTargets: string[],
    rowSettings: Record<string, number>
  ): Observable<Blob> {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('source_sheet', sourceSheet);
    formData.append('target_sheet', targetSheet);
    formData.append('mappings_json', JSON.stringify(
      mappings
        .filter((mapping) => mapping.target_column)
        .map((mapping) => ({
          source_column: mapping.source_column,
          target_column: mapping.target_column
        }))
    ));
    formData.append('required_targets_json', JSON.stringify(requiredTargets));
    Object.entries(rowSettings).forEach(([key, value]) => formData.append(key, String(value || 0)));
    return this.http.post(`${this.baseUrl}/transform`, formData, { responseType: 'blob' });
  }

  analyzeStandard(sessionId: string, templateId: number, sourceSheet: string): Observable<MappingAnalyzeResponse> {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('template_id', String(templateId));
    formData.append('source_sheet', sourceSheet);
    return this.http.post<MappingAnalyzeResponse>(`${this.baseUrl}/analyze-standard`, formData).pipe(
      map((response) => ({
        ...response,
        suggestions: response.suggestions.map((suggestion) => ({
          ...suggestion,
          target_column: suggestion.suggested_target_column
        }))
      }))
    );
  }

  transformStandard(
    sessionId: string,
    templateId: number,
    sourceSheet: string,
    mappings: MappingSuggestion[],
    manualValues: Record<string, string>,
    teacherName = '',
    cleanupSession = true
  ): Observable<Blob> {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('template_id', String(templateId));
    formData.append('source_sheet', sourceSheet);
    formData.append('mappings_json', JSON.stringify(this.uniqueTargetMappings(mappings)));
    formData.append('manual_values_json', JSON.stringify(manualValues));
    formData.append('teacher_name', teacherName);
    formData.append('cleanup_session', String(cleanupSession));
    return this.http.post(`${this.baseUrl}/transform-standard`, formData, { responseType: 'blob' });
  }

  private uniqueTargetMappings(mappings: MappingSuggestion[]): Array<{ source_column: string; target_column: string }> {
    const byTarget = new Map<string, MappingSuggestion>();
    mappings
      .filter((mapping) => !!mapping.target_column)
      .forEach((mapping) => {
        const target = mapping.target_column as string;
        const current = byTarget.get(target);
        if (!current || mapping.confidence_score > current.confidence_score) {
          byTarget.set(target, mapping);
        }
      });
    return Array.from(byTarget.values()).map((mapping) => ({
      source_column: mapping.source_column,
      target_column: mapping.target_column as string
    }));
  }
}
