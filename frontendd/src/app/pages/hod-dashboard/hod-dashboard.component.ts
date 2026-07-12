import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import {
  ApiService,
  CourseSuggestion,
  CreatedTeacherResponse,
  HodInsightCourse,
  HodInsightReport,
  HodInsightSnapshot,
  StandardTemplate,
  StandardTemplateField
} from '../../core/services/api.service';

Chart.register(...registerables);

@Component({
  selector: 'app-hod-dashboard',
  templateUrl: './hod-dashboard.component.html',
  styleUrls: ['./hod-dashboard.component.css']
})
export class HodDashboardComponent implements OnInit, OnDestroy {
  hodName = '';
  hodUid = '';
  department = '';
  sidebarCollapsed = false;
  isCompactViewport = false;
  error = '';
  success = '';
  saving = false;
  activeView: 'manage' | 'templates' | 'insights' = 'manage';
  courseSuggestions: CourseSuggestion[] = [];
  assignmentResult: CreatedTeacherResponse['teacher'] | null = null;
  insightLoading = false;
  insightError = '';
  insightSuccess = '';
  insightDepartments: string[] = ['CS', 'SE'];
  semesters = [1, 2, 3, 4, 5, 6, 7, 8];
  selectedInsightDepartment = 'CS';
  selectedSemester = 1;
  insightCourses: HodInsightCourse[] = [];
  selectedCourse: HodInsightCourse | null = null;
  selectedReports: HodInsightReport[] = [];
  selectedReport: HodInsightReport | null = null;
  showInsightRecords = false;
  snapshotLoading = false;
  savedSnapshots: Array<HodInsightSnapshot & { expiryLabel: string; downloadLink: string }> = [];
  templates: StandardTemplate[] = [];
  selectedTemplate: StandardTemplate | null = null;
  templateFile: File | null = null;
  templateSaving = false;
  private insightCharts: Chart<any, any, any>[] = [];

  form = {
    teacherUsername: '',
    department: '',
    courseCode: '',
    courseName: ''
  };

  templateForm = {
    name: '',
    description: '',
    department: '',
    purpose: 'Marksheet',
    version: 1,
    isActive: false
  };

  constructor(
    private router: Router,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    if (localStorage.getItem('userRole') !== 'hod') {
      this.router.navigate(['/login']);
      return;
    }

    this.hodName = localStorage.getItem('hodName') || 'HOD';
    this.hodUid = localStorage.getItem('hodUid') || '';
    this.department = localStorage.getItem('hodDepartment') || '';
    this.form.department = this.department;
    this.templateForm.department = this.department;
    this.syncViewportState();
    this.loadInsightDepartments();
    this.loadTemplates();
  }

  ngOnDestroy(): void {
    this.destroyInsightCharts();
  }

  onCourseCodeInput(): void {
    const query = this.form.courseCode.trim().toUpperCase();
    this.form.courseCode = query;
    this.form.courseName = '';

    this.api.searchCourses(query).subscribe({
      next: (res) => {
        this.courseSuggestions = res.courses || [];
        const exact = this.courseSuggestions.find((course) => course.course_code === query);
        if (exact) {
          this.form.courseName = exact.course_name;
        }
      },
      error: () => {
        this.courseSuggestions = [];
      }
    });
  }

  selectCourse(course: CourseSuggestion): void {
    this.form.courseCode = course.course_code;
    this.form.courseName = course.course_name;
    this.courseSuggestions = [];
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  switchView(view: 'manage' | 'templates' | 'insights'): void {
    this.activeView = view;
    this.closeSidebar();
    if (view === 'insights' && !this.insightCourses.length) {
      this.loadSemesterInsights();
    }
    if (view === 'templates') {
      this.loadTemplates();
    }
  }

  closeSidebar(): void {
    if (this.isCompactViewport) {
      this.sidebarCollapsed = true;
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.syncViewportState();
  }

  private syncViewportState(): void {
    const compact = typeof window !== 'undefined' && window.innerWidth <= 960;
    if (compact !== this.isCompactViewport) {
      this.isCompactViewport = compact;
      this.sidebarCollapsed = compact;
    }
  }

  assignCourse(): void {
    this.error = '';
    this.success = '';
    this.assignmentResult = null;

    if (!this.form.teacherUsername.trim() || !this.form.department.trim() || !this.form.courseCode.trim()) {
      this.error = 'Please enter teacher username, department, and course code.';
      return;
    }

    this.saving = true;
    this.api.createTeacherByHod({
      hod_name: this.hodName,
      teacher_username: this.form.teacherUsername.trim(),
      department: this.form.department.trim().toUpperCase(),
      course_code: this.form.courseCode.trim().toUpperCase()
    }).subscribe({
      next: (res) => {
        this.saving = false;
        this.assignmentResult = res.teacher;
        this.success = res.status === 'already_assigned'
          ? `Course already assigned to ${res.teacher.teacher_name}.`
          : `Course assigned to ${res.teacher.teacher_name}.`;
        this.form = {
          teacherUsername: '',
          department: this.department,
          courseCode: '',
          courseName: ''
        };
      },
      error: (err) => {
        this.saving = false;
        this.error = err.error?.detail || 'Unable to assign course right now.';
      }
    });
  }

  loadInsightDepartments(): void {
    this.api.getHodInsightDepartments(this.hodName).subscribe({
      next: (res) => {
        this.insightDepartments = res.departments?.length ? res.departments : ['CS', 'SE'];
        this.semesters = res.semesters?.length ? res.semesters : this.semesters;
        this.selectedInsightDepartment = this.insightDepartments.includes('CS')
          ? 'CS'
          : this.insightDepartments[0] || 'CS';
      },
      error: () => {
        this.insightDepartments = ['CS', 'SE'];
      }
    });
  }

  loadSemesterInsights(): void {
    this.insightError = '';
    this.insightSuccess = '';
    this.insightLoading = true;
    this.selectedCourse = null;
    this.selectedReports = [];
    this.selectedReport = null;
    this.destroyInsightCharts();

    this.api.getHodSemesterInsights(
      this.hodName,
      this.selectedInsightDepartment,
      this.selectedSemester
    ).subscribe({
      next: (res) => {
        this.insightLoading = false;
        this.insightCourses = res.courses || [];
      },
      error: (err) => {
        this.insightLoading = false;
        this.insightCourses = [];
        this.insightError = err.error?.detail || 'Unable to load academic insights.';
      }
    });
  }

  openCourseReports(course: HodInsightCourse): void {
    this.insightError = '';
    this.insightSuccess = '';
    this.insightLoading = true;
    this.selectedCourse = course;
    this.selectedReports = [];
    this.selectedReport = null;
    this.destroyInsightCharts();

    this.api.getHodCourseReports(this.hodName, course.teacher_course_id).subscribe({
      next: (res) => {
        this.insightLoading = false;
        this.selectedCourse = res.course || course;
        this.selectedReports = res.reports || [];
        if (this.selectedReports.length) {
          this.selectReport(this.selectedReports[0]);
        }
      },
      error: (err) => {
        this.insightLoading = false;
        this.insightError = err.error?.detail || 'Unable to load course reports.';
      }
    });
  }

  selectReport(report: HodInsightReport): void {
    this.selectedReport = report;
    setTimeout(() => this.renderInsightCharts(), 0);
  }

  saveSelectedSnapshot(): void {
    if (!this.selectedReport) {
      return;
    }

    this.insightError = '';
    this.insightSuccess = '';
    this.api.saveHodInsightSnapshot(this.hodName, this.selectedReport.id).subscribe({
      next: (res) => {
        this.insightSuccess = `Record saved as #${res.snapshot_id}.`;
        this.showInsightRecords = true;
        this.loadHodSnapshots();
      },
      error: (err) => {
        this.insightError = err.error?.detail || 'Unable to save record.';
      }
    });
  }

  toggleInsightRecords(): void {
    this.showInsightRecords = !this.showInsightRecords;
    if (this.showInsightRecords) {
      this.loadHodSnapshots();
    }
  }

  closeInsightRecords(): void {
    this.showInsightRecords = false;
  }

  loadHodSnapshots(): void {
    this.snapshotLoading = true;
    this.insightError = '';
    this.api.getHodInsightSnapshots(this.hodName).subscribe({
      next: (res) => {
        this.snapshotLoading = false;
        this.savedSnapshots = (res.snapshots || []).map((snapshot) => ({
          ...snapshot,
          expiryLabel: this.buildExpiryLabel(snapshot.expires_at),
          downloadLink: this.api.getHodInsightDownloadUrl(snapshot.download_url, this.hodName)
        }));
      },
      error: (err) => {
        this.snapshotLoading = false;
        this.savedSnapshots = [];
        this.insightError = err.error?.detail || 'Unable to load saved records.';
      }
    });
  }

  deleteHodSnapshot(snapshot: HodInsightSnapshot): void {
    if (!window.confirm(`Delete "${snapshot.assessment_title || snapshot.course_code}" from saved HOD records?`)) {
      return;
    }
    this.api.deleteHodInsightSnapshot(this.hodName, snapshot.id).subscribe({
      next: () => {
        this.savedSnapshots = this.savedSnapshots.filter((item) => item.id !== snapshot.id);
      },
      error: (err) => {
        this.insightError = err.error?.detail || 'Unable to delete record.';
      }
    });
  }

  getReportDownloadLink(report: HodInsightReport): string {
    return this.api.getHodInsightDownloadUrl(
      `/api/hod/academic-insights/reports/${report.id}/download`,
      this.hodName
    );
  }

  trackBySnapshotId(_index: number, snapshot: HodInsightSnapshot): number {
    return snapshot.id;
  }

  get reportCloResults(): any[] {
    return this.selectedReport?.report?.clo_results || this.selectedReport?.report?.clo_overview || [];
  }

  get reportGapResults(): any[] {
    return this.selectedReport?.report?.gap_results || [];
  }

  private renderInsightCharts(): void {
    this.destroyInsightCharts();
    if (!this.selectedReport) {
      return;
    }

    const cloCanvas = document.getElementById('hodCloChart') as HTMLCanvasElement | null;
    const questionCanvas = document.getElementById('hodQuestionChart') as HTMLCanvasElement | null;
    const passFailCanvas = document.getElementById('hodPassFailChart') as HTMLCanvasElement | null;
    const summary = this.selectedReport.summary;

    if (cloCanvas && this.reportCloResults.length) {
      this.insightCharts.push(new Chart(cloCanvas, {
        type: 'bar',
        data: {
          labels: this.reportCloResults.map((item) => item.clo),
          datasets: [{
            label: 'CLO Gap %',
            data: this.reportCloResults.map((item) => Number(item.gap_percentage || 0)),
            backgroundColor: '#ef5350'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
      }));
    }

    if (questionCanvas && this.reportGapResults.length) {
      this.insightCharts.push(new Chart(questionCanvas, {
        type: 'bar',
        data: {
          labels: this.reportGapResults.map((item) => `${item.question} (${item.clo || 'CLO'})`),
          datasets: [{
            label: 'Students Below Threshold %',
            data: this.reportGapResults.map((item) => Number(item.gap_percentage || 0)),
            backgroundColor: '#4069d9'
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { beginAtZero: true, max: 100 } }
        }
      }));
    }

    if (passFailCanvas) {
      const passRate = Number(summary?.pass_rate || 0);
      this.insightCharts.push(new Chart(passFailCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Pass', 'At Risk'],
          datasets: [{
            data: [passRate, Math.max(100 - passRate, 0)],
            backgroundColor: ['#1d7f62', '#ef5350']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      }));
    }
  }

  private destroyInsightCharts(): void {
    for (const chart of this.insightCharts) {
      chart.destroy();
    }
    this.insightCharts = [];
  }

  private buildExpiryLabel(expiresAt: string | null | undefined): string {
    if (!expiresAt) {
      return 'Auto-deletes after 28 days';
    }
    const expiryTime = new Date(expiresAt).getTime();
    if (Number.isNaN(expiryTime)) {
      return 'Auto-deletes after 28 days';
    }
    const daysLeft = Math.max(0, Math.ceil((expiryTime - Date.now()) / 86400000));
    return daysLeft === 1 ? 'Deletes tomorrow' : `Deletes in ${daysLeft} days`;
  }

  onTemplateFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.templateFile = input.files?.[0] || null;
  }

  loadTemplates(department = this.department): void {
    const selectedDepartment = (department || '').trim().toUpperCase();
    if (!selectedDepartment) {
      return;
    }
    this.api.getHodTemplates(selectedDepartment).subscribe({
      next: (res) => this.templates = res.templates || [],
      error: () => this.templates = []
    });
  }

  createTemplate(): void {
    this.error = '';
    this.success = '';
    if (!this.templateForm.name.trim() || !this.templateForm.department.trim()) {
      this.error = 'Please enter template name and department.';
      return;
    }
    this.templateSaving = true;
    const formData = new FormData();
    formData.append('name', this.templateForm.name.trim());
    formData.append('description', this.templateForm.description.trim());
    formData.append('department', this.templateForm.department.trim().toUpperCase());
    formData.append('purpose', 'Marksheet');
    formData.append('version', String(this.templateForm.version || 1));
    formData.append('hod_id', localStorage.getItem('hodId') || '0');
    formData.append('is_active', String(this.templateForm.isActive));
    if (this.templateFile) {
      formData.append('template_file', this.templateFile);
    }
    this.api.createHodTemplate(formData).subscribe({
      next: (res) => {
        this.templateSaving = false;
        this.success = 'Standard template saved.';
        this.selectedTemplate = res.template;
        this.templates = [
          res.template,
          ...this.templates.filter((template) => template.id !== res.template.id)
        ];
        const savedDepartment = res.template.department || this.templateForm.department || this.department;
        this.templateForm = {
          name: '',
          description: '',
          department: savedDepartment,
          purpose: 'Marksheet',
          version: 1,
          isActive: false
        };
        this.templateFile = null;
        this.loadTemplates(savedDepartment);
      },
      error: (err) => {
        this.templateSaving = false;
        this.error = err.error?.detail || 'Unable to save template.';
      }
    });
  }

  openTemplate(template: StandardTemplate): void {
    this.api.getHodTemplate(template.id).subscribe({
      next: (res) => {
        this.selectedTemplate = res.template;
        this.templateForm = {
          name: res.template.name || '',
          description: res.template.description || '',
          department: res.template.department || this.department,
          purpose: 'Marksheet',
          version: res.template.version || 1,
          isActive: !!res.template.is_active
        };
        this.success = `${res.template.name} v${res.template.version} opened.`;
      },
      error: (err) => this.error = err.error?.detail || 'Unable to open template.'
    });
  }

  activateTemplate(template: StandardTemplate): void {
    this.templateSaving = true;
    this.api.activateHodTemplate(template.id).subscribe({
      next: () => {
        this.templateSaving = false;
        this.success = 'Template activated.';
        this.loadTemplates();
      },
      error: (err) => {
        this.templateSaving = false;
        this.error = err.error?.detail || 'Unable to activate template.';
      }
    });
  }

  deleteTemplate(template: StandardTemplate): void {
    if (!window.confirm(`Delete ${template.name} v${template.version}?`)) {
      return;
    }
    this.templateSaving = true;
    this.api.archiveHodTemplate(template.id).subscribe({
      next: () => {
        this.templateSaving = false;
        this.success = 'Template deleted.';
        if (this.selectedTemplate?.id === template.id) {
          this.selectedTemplate = null;
        }
        this.loadTemplates();
      },
      error: (err) => {
        this.templateSaving = false;
        this.error = err.error?.detail || 'Unable to delete template.';
      }
    });
  }

  updateSynonyms(field: StandardTemplateField, value: string): void {
    field.synonyms = value.split(',').map(item => item.trim()).filter(Boolean);
  }

  logout(): void {
    if (!window.confirm('Are you sure you want to log out?')) {
      return;
    }
    localStorage.clear();
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }
}
