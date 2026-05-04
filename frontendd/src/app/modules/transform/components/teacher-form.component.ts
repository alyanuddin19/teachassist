import { ChangeDetectorRef, Component, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription, timeout } from 'rxjs';

import {
  MarksheetDetail,
  MarksheetPayload,
  SaveMarksheetResponse,
  Student,
  TransformCourseOption,
  TransformService,
} from '../services/transform.service';

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

@Component({
  selector: 'app-transform-teacher-form',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './teacher-form.component.html',
  styleUrls: ['./teacher-form.component.css'],
})
export class TeacherFormComponent implements OnInit, OnDestroy {
  studentRows: StudentFormRow[] = [];
  availableCourses: TransformCourseOption[] = [];
  selectedCourseRecordId: number | null = null;
  selectedCourse: TransformCourseOption | null = null;

  cloOptions = ['CLO 1', 'CLO 2', 'CLO 3', 'CLO 4', 'CLO 5'];
  assessmentTypes = ['Quiz', 'Assignment', 'Midterm', 'Final'];
  quizNumbers = ['Quiz 1', 'Quiz 2', 'Quiz 3', 'Quiz 4', 'Quiz 5'];
  assignmentNumbers = ['Assignment 1', 'Assignment 2', 'Assignment 3', 'Assignment 4', 'Assignment 5'];
  questionNumbers = Array.from({ length: 10 }, (_, index) => `Question ${index + 1}`);
  questionParts = ['No Part', 'Part A', 'Part B', 'Part C', 'Part D'];

  teacherName = '';
  teacherEmail = '';
  teacherUid = '';
  teacherDepartment = '';
  courseCode = '';
  courseName = '';
  batch = '';
  section = '';
  semester = '';
  totalMarks: number | null = 100;
  exportFileName = '';

  selectedOptions: SelectionState = {
    clo: '',
    assessment_type: '',
    assessment_item: '',
    question_number: '',
    question_part: 'No Part',
    assessment_total_marks: null,
  };

  statusMessage = '';
  statusType: 'success' | 'error' | 'idle' = 'idle';
  isLoadingCourses = false;
  isLoadingStudents = false;
  isSubmitting = false;
  saveState: 'idle' | 'saving' | 'saved' = 'idle';
  generatingUpdatedSheet = false;
  lastDownloadUrl = '';
  lastSavedMarksheetId: number | null = null;
  lastSavedFileName = '';
  editingMarksheetId: number | null = null;
  isCompactPortrait = false;
  dropdownSectionCollapsed = false;
  marksSectionCollapsed = false;

  cloAssessmentMap: Record<string, string[]> = {};
  selectedColumns: CloPreview[] = [];
  assessmentColumns: AssessmentColumn[] = [];
  groupedAssessmentColumns: CloGroup[] = [];
  assessmentTotals: Record<string, number> = {};

  private subscriptions = new Subscription();

  constructor(
    private api: TransformService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.syncViewportState();
    this.teacherName = (localStorage.getItem('teacherName') || '').trim();
    this.teacherDepartment = (localStorage.getItem('teacherDepartment') || '').trim();
    this.teacherUid = (localStorage.getItem('teacherUid') || '').trim();

    if (!this.teacherName) {
      this.setStatus('Teacher session missing. Please log in again.', 'error');
      return;
    }

    this.api.setTeacherContext({ teacher_name: this.teacherName });
    this.loadTeacherCourses();

    this.subscriptions.add(
      this.api.editMarksheet$.subscribe((marksheetId) => {
        this.startEditing(marksheetId);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.syncViewportState();
  }

  private refreshView(): void {
    this.zone.run(() => {
      this.cdr.detectChanges();
    });
  }

  loadTeacherCourses(preferredRecordId?: number | null): void {
    if (!this.teacherName) {
      return;
    }

    this.isLoadingCourses = true;
    this.refreshView();

    this.api.getTeacherCourses(this.teacherName).subscribe({
      next: (response) => {
        this.isLoadingCourses = false;
        this.teacherEmail = response.teacher_email || '';
        this.teacherUid = response.teacher_uid || this.teacherUid;
        this.teacherDepartment = response.department || this.teacherDepartment;
        this.availableCourses = response.courses || [];
        this.api.setTeacherContext({ teacher_name: this.teacherName });

        const pendingCourseCode = sessionStorage.getItem('transform:selectedCourseCode') || '';
        let nextRecordId = preferredRecordId ?? this.selectedCourseRecordId;

        if (!nextRecordId && pendingCourseCode) {
          const matched = this.availableCourses.find((course) => course.course_code === pendingCourseCode);
          nextRecordId = matched?.record_id ?? null;
          sessionStorage.removeItem('transform:selectedCourseCode');
        }

        if (!nextRecordId && this.availableCourses.length === 1) {
          nextRecordId = this.availableCourses[0].record_id;
        }

        if (nextRecordId) {
          const preserveCurrent = nextRecordId === this.selectedCourseRecordId && this.studentRows.length > 0;
          this.selectedCourseRecordId = nextRecordId;
          this.loadSelectedCourseStudents(nextRecordId, preserveCurrent);
        } else {
          this.selectedCourse = null;
          this.studentRows = [];
          this.refreshView();
        }
      },
      error: () => {
        this.isLoadingCourses = false;
        this.availableCourses = [];
        this.setStatus('Could not load your registered courses.', 'error');
        this.refreshView();
      }
    });
  }

  onCourseChange(): void {
    this.saveState = 'idle';
    this.editingMarksheetId = null;
    this.lastSavedMarksheetId = null;
    this.lastDownloadUrl = '';

    if (!this.selectedCourseRecordId) {
      this.selectedCourse = null;
      this.studentRows = [];
      this.refreshView();
      return;
    }

    this.loadSelectedCourseStudents(this.selectedCourseRecordId, false);
  }

  loadSelectedCourseStudents(recordId: number, preserveMarks: boolean): void {
    this.isLoadingStudents = true;
    this.refreshView();

    this.api.getCourseStudents(recordId, this.teacherName).subscribe({
      next: (response) => {
        this.isLoadingStudents = false;
        this.selectedCourse = response.course;
        this.selectedCourseRecordId = response.course.record_id;
        this.courseCode = response.course.course_code;
        this.courseName = response.course.course_name;
        this.batch = response.course.batch || '';
        this.section = response.course.section || '';
        this.semester = response.course.semester ? `Semester ${response.course.semester}` : '';
        this.teacherDepartment = response.course.department || this.teacherDepartment;

        if (!preserveMarks) {
          this.exportFileName = this.buildDefaultExportFileName();
        }

        const previousMarks = preserveMarks
          ? new Map(this.studentRows.map((row) => [row.id, { marks: { ...row.marksByAssessment }, remarks: row.remarks }]))
          : new Map<number, { marks: Record<string, number | null>; remarks: string }>();

        this.studentRows = (response.students || []).map((student) => ({
          ...student,
          marksByAssessment: preserveMarks
            ? this.buildMarksState(previousMarks.get(student.id)?.marks)
            : this.buildMarksState(),
          remarks: previousMarks.get(student.id)?.remarks || '',
        }));

        this.syncStudentAssessmentColumns();
        if (this.isCompactPortrait && this.studentRows.length) {
          this.marksSectionCollapsed = false;
        }
        this.handlePendingUpdatedSheetRequest();
        this.refreshView();
      },
      error: () => {
        this.isLoadingStudents = false;
        this.studentRows = [];
        this.setStatus('Student list could not be loaded for the selected course.', 'error');
        this.refreshView();
      }
    });
  }

  onAssessmentTypeChange(): void {
    this.selectedOptions.assessment_item = '';
    this.selectedOptions.question_number = '';
    this.selectedOptions.question_part = 'No Part';
    this.selectedOptions.assessment_total_marks = null;
    this.refreshView();
  }

  addAssessmentToClo(): void {
    this.saveState = 'idle';

    if (!this.selectedCourse) {
      this.setStatus('Please select a course first.', 'error');
      return;
    }

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

    if (this.selectedOptions.assessment_total_marks === null || this.selectedOptions.assessment_total_marks <= 0) {
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
    const previousValue = this.assessmentTotals[label] ?? 0;
    const configuredTotal = Object.values(this.assessmentTotals).reduce((sum, marks) => sum + Number(marks || 0), 0);
    const nextConfiguredTotal = configuredTotal - previousValue + Number(this.selectedOptions.assessment_total_marks);
    if (this.totalMarks !== null && nextConfiguredTotal > this.totalMarks) {
      this.setStatus(`Assessment columns cannot exceed the overall total marks of ${this.totalMarks}.`, 'error');
      return;
    }

    if (!existing.includes(value)) {
      this.cloAssessmentMap[clo] = [...existing, value];
    }
    this.assessmentTotals[label] = Number(this.selectedOptions.assessment_total_marks);
    this.refreshAssessmentViews();
    this.syncStudentAssessmentColumns();

    this.setStatus(`${value} has been added to ${clo}.`, 'success');
    this.selectedOptions.assessment_type = '';
    this.selectedOptions.assessment_item = '';
    this.selectedOptions.question_number = '';
    this.selectedOptions.question_part = 'No Part';
    this.selectedOptions.assessment_total_marks = null;
    if (this.isCompactPortrait && this.studentRows.length) {
      this.marksSectionCollapsed = false;
    }
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

    if (!this.selectedCourse || !this.selectedCourseRecordId || !this.totalMarks) {
      this.setStatus('Please select a course and total marks first.', 'error');
      return;
    }

    if (!Object.keys(this.cloAssessmentMap).length) {
      this.setStatus('Please add at least one assessment to a CLO.', 'error');
      return;
    }

    if (!this.studentRows.length) {
      this.setStatus('No students are loaded for this course yet.', 'error');
      return;
    }

    const invalidMarks = this.studentRows.find((row) =>
      this.getAssessmentColumns().some((column) => {
        const value = row.marksByAssessment[column.label];
        return value !== null && (value < 0 || value > column.maxMarks);
      })
    );

    if (invalidMarks) {
      this.setStatus(`Enter valid marks for ${invalidMarks.full_name}.`, 'error');
      return;
    }

    const totalOverflowStudent = this.studentRows.find((row) => this.getStudentTotal(row) > Number(this.totalMarks || 0));
    if (totalOverflowStudent) {
      this.setStatus(`Total marks for ${totalOverflowStudent.full_name} cannot exceed ${this.totalMarks}.`, 'error');
      return;
    }

    this.isSubmitting = true;
    this.saveState = 'saving';
    this.refreshView();

    const payload: MarksheetPayload = {
      teacher_name: this.teacherName,
      teacher_course_id: this.selectedCourseRecordId,
      exam_type: 'Midterm',
      total_marks: this.totalMarks,
      export_file_name: this.exportFileName.trim() || this.buildDefaultExportFileName(),
      selected_options: this.buildSelectedOptions(),
      assessment_totals: this.buildAssessmentTotals(),
      student_marks: this.studentRows
        .map((row) => ({
          student_id: row.id,
          marks: this.getAssessmentColumns()
            .filter((column) => row.marksByAssessment[column.label] !== null)
            .map((column) => ({
              assessment_label: column.label,
              obtained_marks: Number(row.marksByAssessment[column.label]),
            })),
          remarks: row.remarks?.trim() || '',
        }))
        .filter((row) => row.marks.length > 0 || !!row.remarks),
    };

    const request$ = this.editingMarksheetId
      ? this.api.updateMarksheet(this.editingMarksheetId, payload)
      : this.api.saveMarksheet(payload);
    const wasEditing = this.editingMarksheetId !== null;

    request$.pipe(timeout(10000)).subscribe({
      next: (response) => {
        this.onSaveConfirmed(response, wasEditing);
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

  generateUpdatedMarksheet(): void {
    const marksheetId = this.selectedCourse?.latest_marksheet_id;
    if (!marksheetId || !this.teacherName) {
      this.setStatus('Save an initial marksheet first to generate an updated one.', 'error');
      return;
    }

    this.generatingUpdatedSheet = true;
    this.refreshView();

    this.api.generateUpdatedMarksheet(marksheetId, this.teacherName).pipe(timeout(10000)).subscribe({
      next: (response) => {
        this.generatingUpdatedSheet = false;
        this.onSaveConfirmed(response, false, true, response.applied_updates || 0);
      },
      error: () => {
        this.generatingUpdatedSheet = false;
        this.setStatus('The updated marksheet could not be generated right now.', 'error');
        this.refreshView();
      }
    });
  }

  continueToGapAnalysis(): void {
    if (!this.lastSavedMarksheetId) {
      this.setStatus('Save or update a marksheet first.', 'error');
      return;
    }

    const payload = {
      marksheetId: this.lastSavedMarksheetId,
      fileName: this.lastSavedFileName || `${this.courseCode || 'marksheet'}.xlsx`,
      courseCode: this.courseCode,
      courseName: this.courseName,
      teacherName: this.teacherName,
    };
    sessionStorage.setItem('gapAnalysis:transformMarksheet', JSON.stringify(payload));
    this.router.navigate(['/gap-analysis']);
  }

  startEditing(marksheetId: number): void {
    if (!this.teacherName) {
      return;
    }

    this.api.getMarksheetDetail(marksheetId, this.teacherName).subscribe({
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
    const parsed = this.parseNumberInput(value);
    if (parsed === null) {
      row.marksByAssessment[label] = null;
      this.onMarksChanged();
      this.refreshView();
      return;
    }

    const column = this.assessmentColumns.find((item) => item.label === label);
    const boundedValue = column ? Math.min(Math.max(parsed, 0), column.maxMarks) : parsed;
    const otherTotal = this.assessmentColumns.reduce((sum, item) => {
      if (item.label === label) {
        return sum;
      }
      return sum + Number(row.marksByAssessment[item.label] || 0);
    }, 0);
    const allowedByTotal = Math.max(0, Number(this.totalMarks || 0) - otherTotal);
    row.marksByAssessment[label] = Math.min(boundedValue, allowedByTotal);
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

  getAssessmentColumns(): AssessmentColumn[] {
    return this.assessmentColumns;
  }

  getGroupedAssessmentColumns(): CloGroup[] {
    return this.groupedAssessmentColumns;
  }

  getSelectedCourseLabel(course: TransformCourseOption): string {
    return `${course.course_code} - ${course.course_name} (${course.student_count} students)`;
  }

  toggleDropdownSection(): void {
    this.dropdownSectionCollapsed = !this.dropdownSectionCollapsed;
  }

  toggleMarksSection(): void {
    this.marksSectionCollapsed = !this.marksSectionCollapsed;
  }

  private onSaveConfirmed(
    response: SaveMarksheetResponse,
    wasEditing: boolean,
    isUpdatedSheet: boolean = false,
    appliedUpdates: number = 0
  ): void {
    this.isSubmitting = false;
    this.saveState = 'saved';
    this.editingMarksheetId = null;
    this.lastSavedMarksheetId = response.marksheet?.id ?? null;
    this.lastSavedFileName = response.marksheet?.export_file_name || this.buildDefaultExportFileName();

    if (response.download_url) {
      this.lastDownloadUrl = this.api.getDownloadUrl(response.download_url, this.lastSavedFileName);
    }

    this.api.notifyMarksheetSaved();
    this.loadTeacherCourses(this.selectedCourseRecordId);

    const statusText = isUpdatedSheet
      ? `Updated marksheet generated successfully. ${appliedUpdates} reviewed task change${appliedUpdates === 1 ? '' : 's'} applied.`
      : wasEditing
        ? `File "${this.lastSavedFileName}" updated successfully.`
        : `File "${this.lastSavedFileName}" saved successfully.`;

    this.setStatus(statusText, 'success');
    this.refreshView();

    const prompt = isUpdatedSheet
      ? 'Updated marksheet is ready. Do you want to perform Gap Analysis again with this sheet now?'
      : 'Marksheet is ready. Do you want to continue to Gap Analysis with this sheet now?';
    if (window.confirm(prompt)) {
      this.continueToGapAnalysis();
    }
  }

  private buildMarksState(seed: Record<string, number | null> = {}): Record<string, number | null> {
    return Object.fromEntries(this.assessmentColumns.map((column) => [column.label, seed[column.label] ?? null]));
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
    this.selectedCourseRecordId = detail.teacher_course_id;
    this.totalMarks = detail.total_marks;
    this.exportFileName = detail.export_file_name || '';
    this.lastDownloadUrl = this.api.getDownloadUrl(detail.download_url, this.exportFileName);
    this.lastSavedMarksheetId = detail.id;
    this.lastSavedFileName = detail.export_file_name || '';

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

    this.api.getCourseStudents(detail.teacher_course_id, this.teacherName).subscribe({
      next: (response) => {
        this.selectedCourse = response.course;
        this.courseCode = response.course.course_code;
        this.courseName = response.course.course_name;
        this.batch = response.course.batch || '';
        this.section = response.course.section || '';
        this.semester = response.course.semester ? `Semester ${response.course.semester}` : '';
        this.teacherEmail = response.teacher_email || this.teacherEmail;
        this.teacherUid = response.teacher_uid || this.teacherUid;
        this.teacherDepartment = response.course.department || this.teacherDepartment;

        this.studentRows = (response.students || []).map((student) => {
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

        this.setStatus(`File "${detail.export_file_name || 'Selected marksheet'}" has been loaded for update.`, 'success');
        this.refreshView();
      },
      error: () => {
        this.setStatus('Students could not be loaded in update mode.', 'error');
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
    const course = this.courseCode.trim() || 'course';
    const batch = this.batch.trim() || 'batch';
    const section = this.section.trim() || 'section';
    return `${course}_${batch}_${section}_marksheet`;
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

  private handlePendingUpdatedSheetRequest(): void {
    if (!this.selectedCourse) {
      return;
    }

    const raw = sessionStorage.getItem('transform:autoGenerateUpdated');
    if (!raw) {
      return;
    }

    try {
      const payload = JSON.parse(raw);
      if (
        payload?.courseCode === this.selectedCourse.course_code &&
        this.selectedCourse.reviewed_task_count > 0 &&
        this.selectedCourse.latest_marksheet_id &&
        !this.generatingUpdatedSheet
      ) {
        sessionStorage.removeItem('transform:autoGenerateUpdated');
        this.generateUpdatedMarksheet();
        return;
      }
    } catch {
      // ignore malformed payload
    }

    sessionStorage.removeItem('transform:autoGenerateUpdated');
  }

  private syncViewportState(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const compact = window.innerWidth <= 820 || (window.innerWidth <= 1080 && window.innerHeight > window.innerWidth);
    if (compact === this.isCompactPortrait) {
      return;
    }

    this.isCompactPortrait = compact;
    this.dropdownSectionCollapsed = compact;
    this.marksSectionCollapsed = compact;
    if (!compact) {
      this.dropdownSectionCollapsed = false;
      this.marksSectionCollapsed = false;
    }
    this.refreshView();
  }
}
