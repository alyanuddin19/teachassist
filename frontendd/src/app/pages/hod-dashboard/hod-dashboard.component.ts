import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, CourseSuggestion, CreatedTeacherResponse } from '../../core/services/api.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-hod-dashboard',
  templateUrl: './hod-dashboard.component.html',
  styleUrls: ['./hod-dashboard.component.css']
})
export class HodDashboardComponent implements OnInit {
  hodName = '';
  hodUid = '';
  department = '';
  sidebarCollapsed = false;
  isCompactViewport = false;
  error = '';
  success = '';
  saving = false;
  courseSuggestions: CourseSuggestion[] = [];
  assignmentResult: CreatedTeacherResponse['teacher'] | null = null;
  darkMode = false;

  form = {
    teacherUsername: '',
    department: '',
    courseCode: '',
    courseName: ''
  };

  constructor(
    private router: Router,
    private api: ApiService,
    private themeService: ThemeService
  ) {}

  ngOnInit(): void {
    if (localStorage.getItem('userRole') !== 'hod') {
      this.router.navigate(['/login']);
      return;
    }

    this.hodName = localStorage.getItem('hodName') || 'HOD';
    this.hodUid = localStorage.getItem('hodUid') || '';
    this.department = localStorage.getItem('hodDepartment') || '';
    this.darkMode = this.themeService.isDarkMode();
    this.form.department = this.department;
    this.syncViewportState();
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

  logout(): void {
    if (!window.confirm('Are you sure you want to log out?')) {
      return;
    }
    const theme = localStorage.getItem('appTheme');
    localStorage.clear();
    sessionStorage.clear();
    if (theme) {
      localStorage.setItem('appTheme', theme);
    }
    this.router.navigate(['/login']);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
    this.darkMode = this.themeService.isDarkMode();
  }
}
