import { Component, OnDestroy, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { timeout } from 'rxjs/operators';
import { Subscription } from 'rxjs';

import { ApiService, FormConfig, MarksheetDetail, MarksheetPayload, Student, TeacherAccessResponse } from '../../services/api.service';

type StudentFormRow = Student & {
  marksByAssessment: Record<string, number | null>;
  remarks: string;
};

type SelectionState = {
  clo: string;
  assessment_type: string;
  assessment_item: string;
  question_number: string;
  question_part: string;
  assessment_total_marks: number | null;
};

type CloPreview = {
  label: string;
  value: string;
};

type AssessmentColumn = {
  label: string;
  clo: string;
  item: string;
  maxMarks: number;
};

type CloGroup = {
  clo: string;
  items: AssessmentColumn[];
  totalMarks: number;
};

type DepartmentItem = {
  id: number;
  name: string;
  code: string;
};

@Component({
  selector: 'app-teacher-form',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './teacher-form.component.html',
  styleUrls: ['./teacher-form.component.css'],
})
export class TeacherFormComponent implements OnInit, OnDestroy {
  formConfig: FormConfig = {
    departments: [],
    batches: [],
    sections: [],
    courses: [],
    sessions: [],
    dropdowns: {},
  };

  teacherAccess: TeacherAccessResponse | null = null;
  availableDepartments: DepartmentItem[] = [];
  availableBatches: string[] = [];
  availableSections: string[] = [];
  studentRows: StudentFormRow[] = [];

  cloOptions = ['CLO 1', 'CLO 2', 'CLO 3', 'CLO 4', 'CLO 5'];
  assessmentTypes = ['Quiz', 'Assignment', 'Midterm', 'Final'];
  quizNumbers = ['Quiz 1', 'Quiz 2', 'Quiz 3', 'Quiz 4', 'Quiz 5'];
  assignmentNumbers = ['Assignment 1', 'Assignment 2', 'Assignment 3', 'Assignment 4', 'Assignment 5'];
  questionNumbers = Array.from({ length: 10 }, (_, index) => `Question ${index + 1}`);
  questionParts = ['No Part', 'Part A', 'Part B', 'Part C', 'Part D'];

  teacherName = '';
  email = '';
  departmentId: number | null = null;
  selectedDepartmentName = '';
  batch = '';
  section = '';
  totalMarks: number | null = 100;
  exportFileName = '';

  selectedOptions: SelectionState = {
    clo: '',
    assessment_type: '',
    assessment_item: '',
    question_number: '',
    question_part: '',
    assessment_total_marks: null,
  };

  statusMessage = '';
  statusType: 'success' | 'error' | 'idle' = 'idle';
  isLoadingStudents = false;
  isSubmitting = false;
  saveState: 'idle' | 'saving' | 'saved' = 'idle';
  isLoadingTeacherAccess = false;
  lastDownloadUrl = '';
  editingMarksheetId: number | null = null;

  cloAssessmentMap: Record<string, string[]> = {};
  selectedColumns: CloPreview[] = [];
  assessmentColumns: AssessmentColumn[] = [];
  groupedAssessmentColumns: CloGroup[] = [];
  assessmentTotals: Record<string, number> = {};

  private teacherLookupTimeout: ReturnType<typeof setTimeout> | null = null;
  private subscriptions = new Subscription();

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.api.getFormConfig().subscribe({
      next: (config) => {
        this.formConfig = config;
        this.refreshAssessmentViews();
        this.refreshView();
      },
      error: () => {
        this.setStatus('Could not load form configuration from the backend.', 'error');
      },
    });

    this.subscriptions.add(
      this.api.editMarksheet$.subscribe((marksheetId) => {
        this.startEditing(marksheetId);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.teacherLookupTimeout) {
      clearTimeout(this.teacherLookupTimeout);
    }
  }

  private refreshView(): void {
    this.zone.run(() => {
      this.cdr.detectChanges();
    });
  }

  scheduleTeacherAccessLookup(): void {
    if (this.teacherLookupTimeout) {
      clearTimeout(this.teacherLookupTimeout);
    }

    this.teacherLookupTimeout = setTimeout(() => {
      this.loadTeacherAccess();
    }, 150);
  }

  loadTeacherAccess(): void {
    this.teacherAccess = null;
    this.availableDepartments = [];
    this.availableBatches = [];
    this.availableSections = [];
    this.departmentId = null;
    this.selectedDepartmentName = '';
    this.batch = '';
    this.section = '';
    this.studentRows = [];

    if (!this.teacherName || !this.email) {
      this.statusMessage = '';
      this.statusType = 'idle';
      this.isLoadingTeacherAccess = false;
      this.api.clearTeacherContext();
      this.refreshView();
      return;
    }

    this.isLoadingTeacherAccess = true;
    this.refreshView();

    this.api.getTeacherAccess(this.teacherName, this.email).subscribe({
      next: (response) => {
        this.isLoadingTeacherAccess = false;
        this.teacherAccess = response;

        if (!response.found) {
          this.api.clearTeacherContext();
          this.setStatus('This teacher is not registered. Please enter the correct registered teacher name and email.', 'error');
          this.refreshView();
          return;
        }

        const deptIds = [
          ...new Set(
            response.assignments
              .map((a) => a.department_id)
              .filter((id): id is number => id !== null)
          ),
        ];

        this.availableDepartments = this.formConfig.departments.filter((dept) =>
          deptIds.includes(dept.id)
        );

        this.api.setTeacherContext({
          email: response.email,
          teacher_name: response.teacher_name,
        });

        if (!this.exportFileName.trim()) {
          this.exportFileName = this.buildDefaultExportFileName();
        }

        this.setStatus('Teacher verified. Only assigned departments, batches, and sections are now available.', 'success');
        this.refreshView();
      },
      error: () => {
        this.isLoadingTeacherAccess = false;
        this.api.clearTeacherContext();
        this.setStatus('Teacher verification could not be loaded.', 'error');
        this.refreshView();
      },
    });
  }

  onDepartmentChange(): void {
    this.batch = '';
    this.section = '';
    this.studentRows = [];
    this.availableSections = [];
    this.availableBatches = [];

    const selected = this.availableDepartments.find((d) => d.id === this.departmentId);
    this.selectedDepartmentName = selected ? selected.name : '';

    if (!this.teacherAccess || !this.departmentId) {
      this.refreshView();
      return;
    }

    this.availableBatches = [
      ...new Set(
        this.teacherAccess.assignments
          .filter((a) => a.department_id === this.departmentId)
          .map((a) => a.batch)
      ),
    ];

    this.refreshView();
  }

  onBatchChange(): void {
    this.section = '';
    this.studentRows = [];
    this.availableSections = [];

    if (!this.teacherAccess || !this.departmentId || !this.batch) {
      this.refreshView();
      return;
    }

    this.availableSections = [
      ...new Set(
        this.teacherAccess.assignments
          .filter((a) => a.department_id === this.departmentId && a.batch === this.batch)
          .map((a) => a.section)
      ),
    ];

    this.refreshView();
  }

  onClassChange(): void {
    this.studentRows = [];
    this.saveState = 'idle';

    if (!this.departmentId || !this.batch || !this.section) {
      this.refreshView();
      return;
    }

    this.isLoadingStudents = true;
    this.refreshView();

    this.api.getStudents(this.departmentId, this.batch, this.section).subscribe({
      next: (students) => {
        this.studentRows = students.map((student) => ({
          ...student,
          marksByAssessment: this.buildMarksState(),
          remarks: '',
        }));
        this.syncStudentAssessmentColumns();
        this.isLoadingStudents = false;
        this.refreshView();
      },
      error: () => {
        this.isLoadingStudents = false;
        this.setStatus('Student list could not be loaded for the selected class.', 'error');
        this.refreshView();
      },
    });
  }

  onAssessmentTypeChange(): void {
    this.selectedOptions.assessment_item = '';
    this.selectedOptions.question_number = '';
    this.selectedOptions.question_part = '';
    this.selectedOptions.assessment_total_marks = null;
    this.refreshView();
  }

  addAssessmentToClo(): void {
    this.saveState = 'idle';

    if (!this.selectedOptions.clo) {
      this.setStatus('Please select a CLO first.', 'error');
      return;
    }

    if (!this.selectedOptions.assessment_type) {
      this.setStatus('Please select an assessment type first.', 'error');
      return;
    }

    if (this.shouldShowAssessmentItem() && !this.selectedOptions.assessment_item) {
      this.setStatus('Please select a quiz or assignment number.', 'error');
      return;
    }

    if (this.shouldShowQuestionFields() && !this.selectedOptions.question_number) {
      this.setStatus('Please select a question number.', 'error');
      return;
    }

    if (
      this.selectedOptions.assessment_total_marks === null ||
      this.selectedOptions.assessment_total_marks <= 0
    ) {
      this.setStatus('Please enter the total marks for this assessment.', 'error');
      return;
    }

    const clo = this.selectedOptions.clo;
    const value = this.getAssessmentDisplayValue();
    const label = `${clo} - ${value}`;

    if (!value) {
      this.setStatus('The assessment value could not be created.', 'error');
      return;
    }

    const existing = this.cloAssessmentMap[clo] || [];
    if (!existing.includes(value)) {
      this.cloAssessmentMap[clo] = [...existing, value];
      this.assessmentTotals[label] = Number(this.selectedOptions.assessment_total_marks);
      this.refreshAssessmentViews();
      this.syncStudentAssessmentColumns();
    } else {
      this.assessmentTotals[label] = Number(this.selectedOptions.assessment_total_marks);
      this.refreshAssessmentViews();
    }

    this.setStatus(`${value} has been added to ${clo}.`, 'success');

    this.selectedOptions.assessment_type = '';
    this.selectedOptions.assessment_item = '';
    this.selectedOptions.question_number = '';
    this.selectedOptions.question_part = '';
    this.selectedOptions.assessment_total_marks = null;

    this.refreshView();
  }

  removeAssessmentFromClo(clo: string, value: string): void {
    this.saveState = 'idle';
    this.cloAssessmentMap[clo] = (this.cloAssessmentMap[clo] || []).filter((item) => item !== value);
    delete this.assessmentTotals[`${clo} - ${value}`];
    if (!this.cloAssessmentMap[clo].length) {
      delete this.cloAssessmentMap[clo];
    }
    this.refreshAssessmentViews();
    this.syncStudentAssessmentColumns();
    this.refreshView();
  }

  getAssessmentItemOptions(): string[] {
    if (this.selectedOptions.assessment_type === 'Quiz') {
      return this.quizNumbers;
    }

    if (this.selectedOptions.assessment_type === 'Assignment') {
      return this.assignmentNumbers;
    }

    return [];
  }

  shouldShowAssessmentItem(): boolean {
    return ['Quiz', 'Assignment'].includes(this.selectedOptions.assessment_type);
  }

  shouldShowQuestionFields(): boolean {
    return ['Midterm', 'Final'].includes(this.selectedOptions.assessment_type);
  }

  saveMarksheet(): void {
    this.flushPendingInput();
    this.refreshView();

    if (!this.teacherName || !this.email || !this.departmentId || !this.batch || !this.section || !this.totalMarks) {
      this.setStatus('Please fill teacher details, class, and total marks first.', 'error');
      return;
    }

    if (!this.teacherAccess?.found) {
      this.setStatus('Please verify the registered teacher first.', 'error');
      return;
    }

    if (!Object.keys(this.cloAssessmentMap).length) {
      this.setStatus('Please add at least one assessment to a CLO.', 'error');
      return;
    }

    if (!this.studentRows.length) {
      this.setStatus('No students are loaded for this department, batch and section.', 'error');
      return;
    }

    const invalidMarks = this.studentRows.find((row) =>
      this.getAssessmentColumns().some((column) => {
        const value = row.marksByAssessment[column.label];
        return value === null || value < 0 || value > column.maxMarks;
      })
    );

    if (invalidMarks) {
      this.setStatus(`Enter valid marks for ${invalidMarks.full_name}.`, 'error');
      return;
    }

    const matchingAssignment = this.teacherAccess.assignments.find(
      (assignment) =>
        assignment.department_id === this.departmentId &&
        assignment.batch === this.batch &&
        assignment.section === this.section
    );

    if (!matchingAssignment) {
      this.setStatus('Selected class is not assigned to this teacher.', 'error');
      return;
    }

    if (matchingAssignment.course_id == null || matchingAssignment.session_id == null) {
      this.setStatus('Selected assignment is missing course or session.', 'error');
      return;
    }

    this.isSubmitting = true;
    this.saveState = 'saving';
    this.refreshView();

    const payload: MarksheetPayload = {
      teacher_name: this.teacherName,
      email: this.email,
      department_id: this.departmentId,
      batch: this.batch,
      section: this.section,
      course_id: matchingAssignment.course_id,
      session_id: matchingAssignment.session_id,
      exam_type: 'Midterm',
      total_marks: this.totalMarks,
      export_file_name: this.exportFileName.trim() || this.buildDefaultExportFileName(),
      selected_options: this.buildSelectedOptions(),
      assessment_totals: this.buildAssessmentTotals(),
      student_marks: this.studentRows.map((row) => ({
        student_id: row.id,
        marks: this.getAssessmentColumns().map((column) => ({
          assessment_label: column.label,
          obtained_marks: Number(row.marksByAssessment[column.label]),
        })),
        remarks: row.remarks?.trim() || '',
      })),
    };

    const request$ = this.editingMarksheetId
      ? this.api.updateMarksheet(this.editingMarksheetId, payload)
      : this.api.saveMarksheet(payload);

    const wasEditing = this.editingMarksheetId !== null;

    request$
      .pipe(timeout(6000))
      .subscribe({
        next: (response) => {
          this.onSaveConfirmed(response ?? undefined, wasEditing);
          this.refreshView();
        },
        error: () => {
          this.isSubmitting = false;
          this.saveState = 'idle';
          this.setStatus(
            wasEditing
              ? 'The marksheet could not be updated. Please try again.'
              : 'The marksheet could not be saved. Please try again.',
            'error'
          );
          this.refreshView();
        },
      });
  }

  startEditing(marksheetId: number): void {
    this.api.getMarksheetDetail(marksheetId).subscribe({
      next: (detail) => {
        this.populateFromDetail(detail);
        this.refreshView();
      },
      error: () => {
        this.setStatus('The saved sheet could not be loaded for update.', 'error');
        this.refreshView();
      },
    });
  }

  trackByStudentId(_: number, row: StudentFormRow): number {
    return row.id;
  }

  updateTotalMarks(value: string): void {
    this.totalMarks = this.parseNumberInput(value);
    this.refreshView();
  }

  updateAssessmentTotalMarks(value: string): void {
    this.selectedOptions.assessment_total_marks = this.parseNumberInput(value);
    this.refreshView();
  }

  updateStudentMark(row: StudentFormRow, label: string, value: string): void {
    row.marksByAssessment[label] = this.parseNumberInput(value);
    this.onMarksChanged();
    this.refreshView();
  }

  getStudentTotal(row: StudentFormRow): number {
    return this.assessmentColumns.reduce((sum, column) => {
      const value = Number(row.marksByAssessment[column.label]);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  onMarksChanged(): void {
    if (this.saveState === 'saved') {
      this.saveState = 'idle';
    }
    this.refreshView();
  }

  getAssessmentMaxMarks(label: string): number {
    return this.assessmentTotals[label] ?? 0;
  }

  getCloHeader(group: CloGroup): string {
    return `${group.clo} (${group.totalMarks})`;
  }

  getSelectedColumns(): { label: string; value: string }[] {
    return this.selectedColumns;
  }

  getAssessmentColumns(): AssessmentColumn[] {
    return this.assessmentColumns;
  }

  getGroupedAssessmentColumns(): CloGroup[] {
    return this.groupedAssessmentColumns;
  }

  private onSaveConfirmed(
    response?: { download_url?: string; export_file_name?: string | null },
    wasEditing: boolean = false
  ): void {
    this.isSubmitting = false;
    this.saveState = 'saved';
    this.editingMarksheetId = null;

    this.api.setTeacherContext({
      email: this.teacherAccess?.email || this.email,
      teacher_name: this.teacherAccess?.teacher_name || this.teacherName,
    });

    const displayName =
      this.exportFileName.trim() || response?.export_file_name || this.buildDefaultExportFileName();

    if (response?.download_url) {
      this.lastDownloadUrl = this.api.getDownloadUrl(
        response.download_url,
        displayName
      );
    }

    this.api.notifyMarksheetSaved();
    this.setStatus(
      wasEditing
        ? `File "${displayName}" updated successfully.`
        : `File "${displayName}" saved successfully.`,
      'success'
    );
    this.refreshView();
  }

  private buildMarksState(): Record<string, number | null> {
    return Object.fromEntries(this.getAssessmentColumns().map((column) => [column.label, null]));
  }

  private syncStudentAssessmentColumns(): void {
    const columns = this.assessmentColumns;
    this.studentRows = this.studentRows.map((row) => {
      const nextMarks: Record<string, number | null> = {};
      for (const column of columns) {
        nextMarks[column.label] = row.marksByAssessment[column.label] ?? null;
      }
      return {
        ...row,
        marksByAssessment: nextMarks,
      };
    });
  }

  private buildSelectedOptions(): Record<string, string> {
    return Object.fromEntries(this.assessmentColumns.map((column) => [column.label, column.item]));
  }

  private buildAssessmentTotals(): Record<string, number> {
    return Object.fromEntries(
      this.assessmentColumns.map((column) => [column.label, column.maxMarks])
    );
  }

  private refreshAssessmentViews(): void {
    this.selectedColumns = Object.entries(this.cloAssessmentMap).map(([label, values]) => ({
      label,
      value: values
        .map((item) => `${item} (${this.assessmentTotals[`${label} - ${item}`] ?? 0})`)
        .join(', '),
    }));

    this.assessmentColumns = Object.entries(this.cloAssessmentMap).flatMap(([clo, values]) =>
      values.map((item) => ({
        label: `${clo} - ${item}`,
        clo,
        item,
        maxMarks: this.assessmentTotals[`${clo} - ${item}`] ?? 0,
      }))
    );

    this.groupedAssessmentColumns = Object.entries(this.cloAssessmentMap).map(([clo, values]) => ({
      clo,
      items: values.map((item) => ({
        label: `${clo} - ${item}`,
        clo,
        item,
        maxMarks: this.assessmentTotals[`${clo} - ${item}`] ?? 0,
      })),
      totalMarks: values.reduce(
        (sum, item) => sum + (this.assessmentTotals[`${clo} - ${item}`] ?? 0),
        0
      ),
    }));
  }

  private populateFromDetail(detail: MarksheetDetail): void {
    this.editingMarksheetId = detail.id;
    this.saveState = 'idle';
    this.teacherName = detail.teacher_name;
    this.email = detail.email;
    this.departmentId = detail.department_id ?? null;
    this.batch = detail.batch;
    this.section = detail.section;
    this.totalMarks = detail.total_marks;
    this.exportFileName = detail.export_file_name || '';
    this.lastDownloadUrl = this.api.getDownloadUrl(detail.download_url, this.exportFileName);

    this.refreshView();

    this.api.getTeacherAccess(this.teacherName, this.email).subscribe({
      next: (response) => {
        this.teacherAccess = response;

        const deptIds = [
          ...new Set(
            response.assignments
              .map((a) => a.department_id)
              .filter((id): id is number => id !== null)
          ),
        ];

        this.availableDepartments = this.formConfig.departments.filter((dept) => deptIds.includes(dept.id));

        const selected = this.availableDepartments.find((d) => d.id === this.departmentId);
        this.selectedDepartmentName = selected ? selected.name : '';

        this.availableBatches = [
          ...new Set(
            response.assignments
              .filter((a) => a.department_id === this.departmentId)
              .map((a) => a.batch)
          ),
        ];

        this.availableSections = [
          ...new Set(
            response.assignments
              .filter((a) => a.department_id === this.departmentId && a.batch === this.batch)
              .map((a) => a.section)
          ),
        ];

        this.cloAssessmentMap = {};
        this.assessmentTotals = {};
        Object.entries(detail.selected_options).forEach(([label, item]) => {
          const [clo, ...rest] = label.split(' - ');
          const itemLabel = rest.join(' - ') || item;
          if (!this.cloAssessmentMap[clo]) {
            this.cloAssessmentMap[clo] = [];
          }
          this.cloAssessmentMap[clo].push(itemLabel);
          this.assessmentTotals[label] = detail.assessment_totals?.[label] ?? detail.total_marks;
        });

        this.refreshAssessmentViews();
        this.refreshView();

        this.api.getStudents(this.departmentId!, this.batch, this.section).subscribe({
          next: (students) => {
            this.studentRows = students.map((student) => {
              const existing = detail.student_marks.find((row) => row.student_id === student.id);
              const marksByAssessment = Object.fromEntries(
                this.assessmentColumns.map((column) => [
                  column.label,
                  existing?.obtained_marks_by_assessment[column.label] ?? null,
                ])
              );

              return {
                ...student,
                marksByAssessment,
                remarks: existing?.remarks || '',
              };
            });

            this.setStatus(
              `File "${detail.export_file_name || 'Selected marksheet'}" has been loaded for update.`,
              'success'
            );
            this.refreshView();
          },
          error: () => {
            this.setStatus('Students could not be loaded in update mode.', 'error');
            this.refreshView();
          },
        });
      },
      error: () => {
        this.setStatus('Teacher assignments could not be loaded in update mode.', 'error');
        this.refreshView();
      },
    });
  }

  private getAssessmentDisplayValue(): string {
    if (!this.selectedOptions.assessment_type) {
      return '';
    }

    if (this.shouldShowAssessmentItem()) {
      return this.selectedOptions.assessment_item;
    }

    if (this.shouldShowQuestionFields()) {
      const partValue =
        this.selectedOptions.question_part && this.selectedOptions.question_part !== 'No Part'
          ? ` ${this.selectedOptions.question_part}`
          : '';
      return `${this.selectedOptions.assessment_type} ${this.selectedOptions.question_number}${partValue}`.trim();
    }

    return this.selectedOptions.assessment_type;
  }

  private setStatus(message: string, type: 'success' | 'error' | 'idle'): void {
    this.statusMessage = message;
    this.statusType = type;
    this.refreshView();
  }

  private buildDefaultExportFileName(): string {
    const teacher = this.teacherName.trim().replace(/\s+/g, '_') || 'teacher';
    const batch = this.batch.trim() || 'batch';
    const section = this.section.trim() || 'section';
    return `${teacher}_${batch}_${section}_marksheet`;
  }

  private parseNumberInput(value: string): number | null {
    if (value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  flushPendingInput(): void {
    if (typeof document === 'undefined') {
      return;
    }

    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }
  }
}