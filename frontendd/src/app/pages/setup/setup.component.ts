import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import {
  ApiService,
  CourseSuggestion,
  TeacherProfileRecord,
  TeacherProfileRecordUpdate,
  TeacherProfileResponse,
  TeacherSubmissionItem
} from '../../core/services/api.service';

@Component({
  selector: 'app-setup',
  templateUrl: './setup.notifications.html',
  styleUrls: ['./setup.screen.css']
})
export class SetupComponent implements OnInit {
  readonly backendUrl = environment.backendUrl;
  teacherName = '';
  teacherId = '';
  teacherUid = '';
  teacherDepartment = '';
  profileLoaded = false;
  setupComplete = false;
  records: TeacherProfileRecord[] = [];
  submissions: TeacherSubmissionItem[] = [];
  pendingSubmissionCount = 0;
  notificationsOpen = false;
  expandedSubmissions: Record<number, boolean> = {};
  semester = '';
  section = '';
  courseCode = '';
  batch = '';
  department = '';
  courseName = '';
  thresholdPercentage = 50;
  courseError = '';
  error = '';
  loadError = '';
  success = '';
  loading = false;
  lookingUp = false;
  courseSuggestions: CourseSuggestion[] = [];
  savingRecord = false;
  expandedRecords: Record<number, boolean> = {};
  editingRecords: Record<number, boolean> = {};
  recordSaving: Record<number, boolean> = {};
  deletingRecord: Record<number, boolean> = {};
  editingSemester: Record<number, string> = {};
  editingSection: Record<number, string> = {};
  editingBatch: Record<number, string> = {};
  editingDepartment: Record<number, string> = {};
  editingCourseCode: Record<number, string> = {};
  editingCourseName: Record<number, string> = {};
  editingCourseError: Record<number, string> = {};
  editingCourseSuggestions: Record<number, CourseSuggestion[]> = {};
  editingThresholds: Record<number, number> = {};
  thresholdSaving: Record<number, boolean> = {};
  reviewDecision: Record<number, 'PASS' | 'FAIL'> = {};
  reviewFeedback: Record<number, string> = {};
  reviewScore: Record<number, string> = {};
  reviewLoading: Record<number, boolean> = {};
  isCompactPortrait = false;
  recordsPanelCollapsed = false;
  readonly semesters = [1, 2, 3, 4, 5, 6, 7, 8];
  private dismissedNotificationIds = new Set<number>();

  constructor(
    private router: Router,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    const role = localStorage.getItem('userRole');
    if (role === 'student') {
      this.router.navigate(['/student/tasks']);
      return;
    }

    this.teacherName = (localStorage.getItem('teacherName') || '').trim();
    this.teacherId = localStorage.getItem('teacherId') || '';
    this.teacherUid = localStorage.getItem('teacherUid') || '';
    this.teacherDepartment = localStorage.getItem('teacherDepartment') || '';

    if (!this.teacherName) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadDismissedNotifications();
    this.syncViewportState();
    this.loadProfile();
    this.loadNotifications();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.syncViewportState();
  }

  onCourseCodeBlur(): void {
    const courseCode = this.courseCode.trim().toUpperCase();
    this.courseCode = courseCode;
    if (!courseCode) {
      this.courseName = '';
      this.courseError = '';
      return;
    }

    this.lookingUp = true;
    this.courseError = '';
    this.courseName = '';

    this.api.lookupCourse(courseCode).subscribe({
      next: (res) => {
        this.lookingUp = false;
        this.courseName = res.course_name;
      },
      error: () => {
        this.lookingUp = false;
        this.courseError = 'Course not found. Please check the code.';
      }
    });
  }

  onCourseCodeInput(): void {
    const courseCode = this.courseCode.trim().toUpperCase();
    this.courseCode = courseCode;
    this.api.searchCourses(courseCode).subscribe({
      next: (res) => {
        this.courseSuggestions = res.courses || [];
        const exact = this.courseSuggestions.find((course) => course.course_code === courseCode);
        if (exact) {
          this.courseName = exact.course_name;
          this.courseError = '';
        }
      },
      error: () => {
        this.courseSuggestions = [];
      }
    });
  }

  selectSuggestedCourse(course: CourseSuggestion): void {
    this.courseCode = course.course_code;
    this.courseName = course.course_name;
    this.courseError = '';
    this.courseSuggestions = [];
  }

  loadProfile(): void {
    this.profileLoaded = false;
    this.loadError = '';

    this.api.getTeacherProfile(this.teacherName).subscribe({
      next: (profile) => {
        this.applyProfile(profile);
        this.profileLoaded = true;
      },
      error: (err) => {
        this.profileLoaded = true;
        this.loadError = err.error?.detail || 'Unable to load your profile right now.';
      }
    });
  }

  loadNotifications(): void {
    if (!this.teacherName) {
      return;
    }

    this.api.getTeacherNotifications(this.teacherName).subscribe({
      next: (res) => {
        const incoming = res.submissions || [];
        this.submissions = incoming.filter((item) => !this.dismissedNotificationIds.has(item.task_id));
        this.pendingSubmissionCount = this.submissions.filter((item) => item.status === 'submitted').length;
      },
      error: () => {
        this.submissions = [];
        this.pendingSubmissionCount = 0;
      }
    });
  }

  private applyProfile(profile: TeacherProfileResponse): void {
    this.teacherId = String(profile.teacher_id ?? this.teacherId ?? '');
    this.teacherUid = profile.teacher_uid || this.teacherUid;
    this.teacherDepartment = profile.department || this.teacherDepartment;
    if (this.teacherId) {
      localStorage.setItem('teacherId', this.teacherId);
    }
    if (this.teacherUid) {
      localStorage.setItem('teacherUid', this.teacherUid);
    }
    if (this.teacherDepartment) {
      localStorage.setItem('teacherDepartment', this.teacherDepartment);
    }

    this.teacherName = profile.teacher_name || this.teacherName;
    localStorage.setItem('teacherName', this.teacherName);
    this.records = profile.records || [];
    this.setupComplete = profile.setup_complete;

    const nextExpanded: Record<number, boolean> = {};
    const nextEditingRecords: Record<number, boolean> = {};
    const nextThresholds: Record<number, number> = {};
    const nextSemester: Record<number, string> = {};
    const nextSection: Record<number, string> = {};
    const nextBatch: Record<number, string> = {};
    const nextDepartment: Record<number, string> = {};
    const nextCourseCode: Record<number, string> = {};
    const nextCourseName: Record<number, string> = {};
    const nextCourseError: Record<number, string> = {};
    const nextCourseSuggestions: Record<number, CourseSuggestion[]> = {};
    for (const record of this.records) {
      nextExpanded[record.id] = this.expandedRecords[record.id] ?? false;
      nextEditingRecords[record.id] = this.editingRecords[record.id] ?? false;
      nextThresholds[record.id] = record.threshold_percentage ?? 50;
      nextSemester[record.id] = String(record.semester ?? '');
      nextSection[record.id] = record.section || '';
      nextBatch[record.id] = record.batch || '';
      nextDepartment[record.id] = record.department || '';
      nextCourseCode[record.id] = record.course_code || '';
      nextCourseName[record.id] = record.course_name || '';
      nextCourseError[record.id] = '';
      nextCourseSuggestions[record.id] = [];
    }
    this.expandedRecords = nextExpanded;
    this.editingRecords = nextEditingRecords;
    this.editingThresholds = nextThresholds;
    this.editingSemester = nextSemester;
    this.editingSection = nextSection;
    this.editingBatch = nextBatch;
    this.editingDepartment = nextDepartment;
    this.editingCourseCode = nextCourseCode;
    this.editingCourseName = nextCourseName;
    this.editingCourseError = nextCourseError;
    this.editingCourseSuggestions = nextCourseSuggestions;
  }

  saveRecord(): void {
    this.error = '';
    this.success = '';

    if (!this.semester || !this.batch.trim() || !this.department.trim() || !this.courseCode.trim()) {
      this.error = 'Please fill semester, batch, department, and course code.';
      return;
    }

    if (!this.isValidThreshold(this.thresholdPercentage)) {
      this.error = 'Threshold must be between 1 and 100.';
      return;
    }

    if (!this.courseName) {
      this.error = 'Please select a valid course code first.';
      return;
    }

    if (!this.teacherName) {
      this.error = 'Your session expired. Please log in again.';
      this.router.navigate(['/login']);
      return;
    }

    this.savingRecord = true;

    this.api.addTeacherProfileRecord({
      teacher_name: this.teacherName,
      semester: this.semester,
      section: this.section.trim().toUpperCase(),
      course_code: this.courseCode.trim().toUpperCase(),
      batch: this.batch.trim().toUpperCase(),
      department: this.department.trim().toUpperCase(),
      threshold_percentage: this.thresholdPercentage
    }).subscribe({
      next: (res: any) => {
        this.savingRecord = false;
        const assignedStudents = typeof res?.assigned_students === 'number' ? res.assigned_students : 0;
        this.success = `Teaching record saved successfully. ${assignedStudents} student${assignedStudents === 1 ? '' : 's'} linked automatically.`;
        this.resetForm();
        this.loadProfile();
        this.loadNotifications();
      },
      error: (err) => {
        this.savingRecord = false;
        this.error = err.error?.detail || 'Could not save the teaching record.';
      }
    });
  }

  goToDashboard(): void {
    this.router.navigate(['/generate']);
  }

  trackByRecordId(_: number, record: TeacherProfileRecord): number {
    return record.id;
  }

  toggleRecord(recordId: number): void {
    this.expandedRecords[recordId] = !this.expandedRecords[recordId];
  }

  toggleRecordsPanel(): void {
    this.recordsPanelCollapsed = !this.recordsPanelCollapsed;
  }

  isRecordExpanded(recordId: number): boolean {
    return !!this.expandedRecords[recordId];
  }

  toggleEditRecord(recordId: number): void {
    this.editingRecords[recordId] = !this.editingRecords[recordId];
    if (!this.editingRecords[recordId]) {
      const record = this.records.find((item) => item.id === recordId);
      if (record) {
        this.resetEditingState(record);
      }
    }
  }

  onExistingCourseCodeInput(recordId: number): void {
    const courseCode = (this.editingCourseCode[recordId] || '').trim().toUpperCase();
    this.editingCourseCode[recordId] = courseCode;
    this.api.searchCourses(courseCode).subscribe({
      next: (res) => {
        this.editingCourseSuggestions[recordId] = res.courses || [];
        const exact = this.editingCourseSuggestions[recordId].find((course) => course.course_code === courseCode);
        if (exact) {
          this.editingCourseName[recordId] = exact.course_name;
          this.editingCourseError[recordId] = '';
        }
      },
      error: () => {
        this.editingCourseSuggestions[recordId] = [];
      }
    });
  }

  onExistingCourseCodeBlur(recordId: number): void {
    const courseCode = (this.editingCourseCode[recordId] || '').trim().toUpperCase();
    this.editingCourseCode[recordId] = courseCode;
    if (!courseCode) {
      this.editingCourseName[recordId] = '';
      this.editingCourseError[recordId] = '';
      return;
    }

    this.api.lookupCourse(courseCode).subscribe({
      next: (res) => {
        this.editingCourseName[recordId] = res.course_name;
        this.editingCourseError[recordId] = '';
      },
      error: () => {
        this.editingCourseError[recordId] = 'Course not found. Please check the code.';
      }
    });
  }

  selectExistingSuggestedCourse(recordId: number, course: CourseSuggestion): void {
    this.editingCourseCode[recordId] = course.course_code;
    this.editingCourseName[recordId] = course.course_name;
    this.editingCourseError[recordId] = '';
    this.editingCourseSuggestions[recordId] = [];
  }

  saveRecordEdit(record: TeacherProfileRecord): void {
    const payload: TeacherProfileRecordUpdate = {
      teacher_name: this.teacherName,
      semester: (this.editingSemester[record.id] || '').trim(),
      section: (this.editingSection[record.id] || '').trim().toUpperCase(),
      batch: (this.editingBatch[record.id] || '').trim().toUpperCase(),
      department: (this.editingDepartment[record.id] || '').trim().toUpperCase(),
      course_code: (this.editingCourseCode[record.id] || '').trim().toUpperCase(),
      threshold_percentage: Number(this.editingThresholds[record.id])
    };

    this.error = '';
    this.success = '';

    if (!payload.semester || !payload.batch || !payload.department || !payload.course_code) {
      this.error = 'Please fill semester, batch, department, and course code.';
      return;
    }

    if (!this.editingCourseName[record.id]) {
      this.error = 'Please select a valid course code first.';
      return;
    }

    if (!this.isValidThreshold(payload.threshold_percentage)) {
      this.error = 'Threshold must be between 1 and 100.';
      return;
    }

    this.recordSaving[record.id] = true;
    this.api.updateTeacherProfileRecord(record.id, payload).subscribe({
      next: (res) => {
        this.recordSaving[record.id] = false;
        this.success = `Record updated. ${res.assigned_students} student${res.assigned_students === 1 ? '' : 's'} matched to ${payload.course_code}.`;
        this.editingRecords[record.id] = false;
        this.loadProfile();
      },
      error: (err) => {
        this.recordSaving[record.id] = false;
        this.error = err.error?.detail || 'Could not update the teaching record.';
      }
    });
  }

  deleteRecord(record: TeacherProfileRecord): void {
    if (!this.teacherName) {
      this.error = 'Your session expired. Please log in again.';
      this.router.navigate(['/login']);
      return;
    }

    const confirmed = window.confirm(`Delete ${record.course_code} from your saved records?`);
    if (!confirmed) {
      return;
    }

    this.error = '';
    this.success = '';
    this.deletingRecord[record.id] = true;
    this.api.deleteTeacherProfileRecord(record.id, this.teacherName).subscribe({
      next: () => {
        this.deletingRecord[record.id] = false;
        this.success = `${record.course_code} deleted successfully.`;
        this.loadProfile();
      },
      error: (err) => {
        this.deletingRecord[record.id] = false;
        this.error = err.error?.detail || 'Could not delete the teaching record.';
      }
    });
  }

  saveThreshold(record: TeacherProfileRecord): void {
    const threshold = Number(this.editingThresholds[record.id]);
    this.error = '';
    this.success = '';

    if (!this.teacherName) {
      this.error = 'Your session expired. Please log in again.';
      this.router.navigate(['/login']);
      return;
    }

    if (!this.isValidThreshold(threshold)) {
      this.error = 'Threshold must be between 1 and 100.';
      return;
    }

    this.thresholdSaving[record.id] = true;
    this.api.updateTeacherProfileThreshold(record.id, {
      teacher_name: this.teacherName,
      threshold_percentage: threshold
    }).subscribe({
      next: () => {
        this.thresholdSaving[record.id] = false;
        this.success = `Threshold updated for ${record.course_code}.`;
        record.threshold_percentage = threshold;
      },
      error: (err) => {
        this.thresholdSaving[record.id] = false;
        this.error = err.error?.detail || 'Could not update the threshold.';
      }
    });
  }

  reviewSubmission(taskId: number, decision: 'PASS' | 'FAIL'): void {
    if (!this.teacherName) {
      return;
    }

    const submission = this.submissions.find((item) => item.task_id === taskId);
    this.reviewLoading[taskId] = true;
    this.api.reviewStudentTask(taskId, {
      teacher_name: this.teacherName,
      decision,
      feedback: this.reviewFeedback[taskId] || '',
      score: this.reviewScore[taskId] || ''
    }).subscribe({
      next: () => {
        this.reviewDecision[taskId] = decision;
        this.reviewLoading[taskId] = false;
        this.loadNotifications();
        if (submission?.course_code) {
          const openTransform = window.confirm(
            `Review saved. The latest ${submission.course_code} marksheet was updated automatically. Do you want to open Transform now?`
          );
          if (openTransform) {
            sessionStorage.setItem('transform:selectedCourseCode', submission.course_code);
            sessionStorage.setItem('transform:openRecords', 'true');
            this.router.navigate(['/transform']);
          }
        }
      },
      error: (err) => {
        this.reviewLoading[taskId] = false;
        this.error = err.error?.detail || 'Could not review the submission.';
      }
    });
  }

  toggleNotifications(): void {
    this.notificationsOpen = !this.notificationsOpen;
  }

  clearNotifications(): void {
    if (!this.submissions.length) {
      return;
    }

    for (const submission of this.submissions) {
      this.dismissedNotificationIds.add(submission.task_id);
    }
    this.persistDismissedNotifications();
    this.submissions = [];
    this.pendingSubmissionCount = 0;
  }

  toggleSubmission(taskId: number): void {
    this.expandedSubmissions[taskId] = !this.expandedSubmissions[taskId];
  }

  isSubmissionExpanded(taskId: number): boolean {
    return !!this.expandedSubmissions[taskId];
  }

  private resetForm(): void {
    this.semester = '';
    this.section = '';
    this.courseCode = '';
    this.batch = '';
    this.department = '';
    this.courseName = '';
    this.thresholdPercentage = 50;
    this.courseError = '';
    this.courseSuggestions = [];
  }

  private isValidThreshold(value: number): boolean {
    return Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 100;
  }

  private resetEditingState(record: TeacherProfileRecord): void {
    this.editingSemester[record.id] = String(record.semester ?? '');
    this.editingSection[record.id] = record.section || '';
    this.editingBatch[record.id] = record.batch || '';
    this.editingDepartment[record.id] = record.department || '';
    this.editingCourseCode[record.id] = record.course_code || '';
    this.editingCourseName[record.id] = record.course_name || '';
    this.editingCourseError[record.id] = '';
    this.editingCourseSuggestions[record.id] = [];
    this.editingThresholds[record.id] = record.threshold_percentage ?? 50;
  }

  private loadDismissedNotifications(): void {
    try {
      const raw = localStorage.getItem(`teacherDismissedNotifications:${this.teacherName}`);
      const parsed = raw ? JSON.parse(raw) : [];
      this.dismissedNotificationIds = new Set(
        Array.isArray(parsed) ? parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : []
      );
    } catch {
      this.dismissedNotificationIds = new Set<number>();
    }
  }

  private persistDismissedNotifications(): void {
    localStorage.setItem(
      `teacherDismissedNotifications:${this.teacherName}`,
      JSON.stringify(Array.from(this.dismissedNotificationIds))
    );
  }

  private syncViewportState(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const compact = window.innerWidth <= 820 || (window.innerWidth <= 1080 && window.innerHeight > window.innerWidth);
    if (compact !== this.isCompactPortrait) {
      this.isCompactPortrait = compact;
      this.recordsPanelCollapsed = compact;
    }
  }
}
