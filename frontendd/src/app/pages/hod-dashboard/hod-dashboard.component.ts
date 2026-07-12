import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import {
  ApiService,
  CourseSuggestion,
  CreatedTeacherResponse,
  HodInsightCourse,
  HodInsightReport
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
  activeView: 'manage' | 'insights' = 'manage';
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
  private insightCharts: Chart<any, any, any>[] = [];

  form = {
    teacherUsername: '',
    department: '',
    courseCode: '',
    courseName: ''
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
    this.syncViewportState();
    this.loadInsightDepartments();
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

  switchView(view: 'manage' | 'insights'): void {
    this.activeView = view;
    this.closeSidebar();
    if (view === 'insights' && !this.insightCourses.length) {
      this.loadSemesterInsights();
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
        this.insightSuccess = `Snapshot saved as #${res.snapshot_id}.`;
      },
      error: (err) => {
        this.insightError = err.error?.detail || 'Unable to save snapshot.';
      }
    });
  }

  get reportCloResults(): any[] {
    return this.selectedReport?.report?.clo_results || this.selectedReport?.report?.clo_overview || [];
  }

  get reportGapResults(): any[] {
    return this.selectedReport?.report?.gap_results || [];
  }

  get reportHeatmapStudents(): any[] {
    return this.selectedReport?.report?.heatmap?.students || [];
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
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { max: 100 } } }
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
          scales: { x: { max: 100 } }
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

  logout(): void {
    if (!window.confirm('Are you sure you want to log out?')) {
      return;
    }
    localStorage.clear();
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }
}
