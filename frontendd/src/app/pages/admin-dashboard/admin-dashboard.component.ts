import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ApiService,
  CreatedCourseResponse,
  CreatedHodResponse,
  CreatedStudentResponse
} from '../../core/services/api.service';

type AdminPanel = 'hod' | 'student' | 'course';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {
  adminName = '';
  activePanel: AdminPanel = 'hod';
  sidebarCollapsed = false;
  isCompactViewport = false;
  error = '';
  success = '';
  savingHod = false;
  savingStudent = false;
  savingCourse = false;
  createdHod: CreatedHodResponse['hod'] | null = null;
  createdStudent: CreatedStudentResponse['student'] | null = null;
  createdCourse: CreatedCourseResponse['course'] | null = null;

  hodForm = {
    fullName: '',
    contactNo: '',
    department: ''
  };

  studentForm = {
    fullName: '',
    rollNo: '',
    contactNo: '',
    department: '',
    program: '',
    batch: '',
    section: '',
    semester: ''
  };

  courseForm = {
    courseCode: '',
    courseName: ''
  };

  constructor(
    private router: Router,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    if (localStorage.getItem('userRole') !== 'admin') {
      this.router.navigate(['/login']);
      return;
    }

    this.adminName = localStorage.getItem('adminName') || 'System Admin';
    this.syncViewportState();
  }

  switchPanel(panel: AdminPanel): void {
    this.activePanel = panel;
    this.error = '';
    this.success = '';
    this.closeSidebar();
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

  createHod(): void {
    this.error = '';
    this.success = '';
    this.createdHod = null;

    if (!this.hodForm.fullName.trim() || !this.hodForm.department.trim()) {
      this.error = 'Please enter HOD full name and department.';
      return;
    }

    this.savingHod = true;
    this.api.createHod({
      full_name: this.hodForm.fullName.trim(),
      contact_no: this.hodForm.contactNo.trim(),
      department: this.hodForm.department.trim().toUpperCase()
    }).subscribe({
      next: (res) => {
        this.savingHod = false;
        this.createdHod = res.hod;
        this.success = `HOD account ready for ${res.hod.full_name}.`;
        this.hodForm = { fullName: '', contactNo: '', department: '' };
      },
      error: (err) => {
        this.savingHod = false;
        this.error = err.error?.detail || 'Unable to create HOD right now.';
      }
    });
  }

  createStudent(): void {
    this.error = '';
    this.success = '';
    this.createdStudent = null;

    if (!this.studentForm.fullName.trim() || !this.studentForm.rollNo.trim() || !this.studentForm.department.trim() || !this.studentForm.program.trim()) {
      this.error = 'Please enter student full name, roll no, department, and program.';
      return;
    }

    this.savingStudent = true;
    this.api.createStudent({
      full_name: this.studentForm.fullName.trim(),
      roll_no: this.studentForm.rollNo.trim().toUpperCase(),
      contact_no: this.studentForm.contactNo.trim(),
      department: this.studentForm.department.trim().toUpperCase(),
      program: this.studentForm.program.trim(),
      batch: this.studentForm.batch.trim().toUpperCase(),
      section: this.studentForm.section.trim().toUpperCase(),
      semester: this.studentForm.semester.trim()
    }).subscribe({
      next: (res) => {
        this.savingStudent = false;
        this.createdStudent = res.student;
        if (res.status === 'already_exists') {
          this.success = `Student already exists in the database: ${res.student.student_name}.`;
        } else {
          this.success = `Student account ready for ${res.student.student_name}.${res.email_sent ? ' Credentials email sent.' : ' Email not sent because SMTP is not configured.'}`;
        }
        this.studentForm = {
          fullName: '',
          rollNo: '',
          contactNo: '',
          department: '',
          program: '',
          batch: '',
          section: '',
          semester: ''
        };
      },
      error: (err) => {
        this.savingStudent = false;
        this.error = err.error?.detail || 'Unable to add student right now.';
      }
    });
  }

  createCourse(): void {
    this.error = '';
    this.success = '';
    this.createdCourse = null;

    if (!this.courseForm.courseCode.trim() || !this.courseForm.courseName.trim()) {
      this.error = 'Please enter course code and course name.';
      return;
    }

    this.savingCourse = true;
    this.api.createCourse({
      course_code: this.courseForm.courseCode.trim().toUpperCase(),
      course_name: this.courseForm.courseName.trim()
    }).subscribe({
      next: (res) => {
        this.savingCourse = false;
        this.createdCourse = res.course;
        this.success = res.status === 'already_exists'
          ? `Course already exists: ${res.course.course_code}.`
          : `Course saved successfully: ${res.course.course_code}.`;
        this.courseForm = { courseCode: '', courseName: '' };
      },
      error: (err) => {
        this.savingCourse = false;
        this.error = err.error?.detail || 'Unable to add course right now.';
      }
    });
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
