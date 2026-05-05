import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ThemeService } from '../../core/services/theme.service';

type LoginRole = 'teacher' | 'student' | 'admin' | 'hod';

@Component({
  selector: 'app-login',
  templateUrl: './login.screen.html',
  styleUrls: ['./login.screen.css']
})
export class LoginComponent {
  role: LoginRole = 'teacher';
  username = '';
  password = '';
  showLoginPassword = false;
  showSignupPassword = false;
  showSignupConfirmPassword = false;
  teacherSignupOpen = false;
  teacherSignup = {
    fullName: '',
    contactNo: '',
    email: '',
    password: '',
    confirmPassword: ''
  };
  error: string | null = null;
  success: string | null = null;
  loading = false;
  signupLoading = false;
  darkMode = false;

  constructor(
    private router: Router,
    private api: ApiService,
    private themeService: ThemeService
  ) {
    this.username = '';
    this.password = '';
    this.darkMode = this.themeService.isDarkMode();
  }

  setRole(role: LoginRole): void {
    this.role = role;
    this.username = '';
    this.password = '';
    this.error = null;
    this.success = null;
    this.teacherSignupOpen = false;
    this.showLoginPassword = false;
  }

  login(): void {
    this.error = null;
    this.success = null;

    const username = this.username.trim();
    const password = this.password.trim();

    if (!username || !password) {
      this.error = 'Please enter both username and password.';
      return;
    }

    this.loading = true;
    if (this.role === 'teacher') {
      this.loginTeacher(username, password);
    } else if (this.role === 'student') {
      this.loginStudent(username, password);
    } else if (this.role === 'admin') {
      this.loginAdmin(username, password);
    } else {
      this.loginHod(username, password);
    }
  }

  private loginTeacher(username: string, password: string): void {
    this.api.loginTeacher({
      teacher_name: username,
      password
    }).subscribe({
      next: (res) => {
        this.loading = false;

        if (res.status === 'not_found') {
          this.error = 'Only existing teachers can log in. Contact the admin if your account is missing.';
          return;
        }

        if (res.status === 'invalid_password') {
          this.error = 'Incorrect teacher password.';
          return;
        }

        if (res.status === 'pending_setup') {
          this.error = 'Your teacher account is created, but you still need to set your password from Teacher Signup.';
          return;
        }

        const teacherName = res.teacher_name || username;
        this.resetSessionPreservingTheme();
        localStorage.setItem('userRole', 'teacher');
        localStorage.setItem('teacherName', teacherName);
        localStorage.setItem('teacherId', String(res.teacher_id ?? ''));
        localStorage.setItem('teacherUid', res.teacher_uid || '');
        localStorage.setItem('teacherDepartment', res.department || '');
        localStorage.setItem('teacherUsername', res.username || username);

        this.api.getTeacherStatus(teacherName).subscribe({
          next: (statusRes) => {
            this.router.navigate(['/profile']);
          },
          error: () => {
            this.router.navigate(['/profile']);
          }
        });
      },
      error: () => {
        this.loading = false;
        this.error = 'Teacher login failed. Please try again.';
      }
    });
  }

  private loginAdmin(username: string, password: string): void {
    this.api.loginAdmin({ username, password }).subscribe({
      next: (res) => {
        this.loading = false;

        if (res.status !== 'found') {
          this.error = 'Incorrect admin credentials.';
          return;
        }

        this.resetSessionPreservingTheme();
        localStorage.setItem('userRole', 'admin');
        localStorage.setItem('adminName', res.admin_name || 'System Admin');
        this.router.navigate(['/admin/dashboard']);
      },
      error: () => {
        this.loading = false;
        this.error = 'Admin login failed. Please try again.';
      }
    });
  }

  private loginHod(username: string, password: string): void {
    this.api.loginHod({ username, password }).subscribe({
      next: (res) => {
        this.loading = false;

        if (res.status === 'not_found') {
          this.error = 'HOD account not found.';
          return;
        }

        if (res.status === 'invalid_password') {
          this.error = 'Incorrect HOD password.';
          return;
        }

        this.resetSessionPreservingTheme();
        localStorage.setItem('userRole', 'hod');
        localStorage.setItem('hodName', res.hod_name || username);
        localStorage.setItem('hodId', String(res.hod_id ?? ''));
        localStorage.setItem('hodUid', res.hod_uid || '');
        localStorage.setItem('hodDepartment', res.department || '');
        localStorage.setItem('hodUsername', res.username || username);
        this.router.navigate(['/hod/dashboard']);
      },
      error: () => {
        this.loading = false;
        this.error = 'HOD login failed. Please try again.';
      }
    });
  }

  private loginStudent(username: string, password: string): void {
    this.api.loginStudent({
      student_code: username.toUpperCase(),
      password
    }).subscribe({
      next: (res) => {
        this.loading = false;

        if (res.status === 'not_found') {
          this.error = 'Only preregistered students can log in.';
          return;
        }

        if (res.status === 'invalid_password') {
          this.error = 'Incorrect student password.';
          return;
        }

        const studentCode = res.student_code || username.toUpperCase();
        const studentName = res.student_name || studentCode;
        this.resetSessionPreservingTheme();
        localStorage.setItem('userRole', 'student');
        localStorage.setItem('studentCode', studentCode);
        localStorage.setItem('studentName', studentName);
        localStorage.setItem('studentId', String(res.student_id ?? ''));
        this.router.navigate(['/student/tasks']);
      },
      error: () => {
        this.loading = false;
        this.error = 'Student login failed. Please try again.';
      }
    });
  }

  toggleTeacherSignup(): void {
    this.teacherSignupOpen = !this.teacherSignupOpen;
    this.error = null;
    this.success = null;
    if (!this.teacherSignupOpen) {
      this.showSignupPassword = false;
      this.showSignupConfirmPassword = false;
    }
  }

  closeTeacherSignup(): void {
    this.teacherSignupOpen = false;
    this.showSignupPassword = false;
    this.showSignupConfirmPassword = false;
  }

  signupTeacher(): void {
    this.error = null;
    this.success = null;

    const payload = {
      full_name: this.teacherSignup.fullName.trim(),
      contact_no: this.teacherSignup.contactNo.trim(),
      email: this.teacherSignup.email.trim(),
      password: this.teacherSignup.password
    };

    if (!payload.full_name || !payload.password.trim()) {
      this.error = 'Please enter the teacher full name and your password.';
      return;
    }

    if (this.teacherSignup.password !== this.teacherSignup.confirmPassword) {
      this.error = 'Password and confirm password must match.';
      return;
    }

    this.signupLoading = true;
    this.api.signupTeacher(payload).subscribe({
      next: (res) => {
        this.signupLoading = false;
        const teacher = res.teacher;
        this.success = `Teacher account saved. Username: ${teacher.username}`;
        this.teacherSignup = { fullName: '', contactNo: '', email: '', password: '', confirmPassword: '' };
        this.closeTeacherSignup();
      },
      error: (err) => {
        this.signupLoading = false;
        this.error = err.error?.detail || 'Unable to save teacher signup.';
      }
    });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
    this.darkMode = this.themeService.isDarkMode();
  }

  private resetSessionPreservingTheme(): void {
    const theme = localStorage.getItem('appTheme');
    localStorage.clear();
    sessionStorage.clear();
    if (theme) {
      localStorage.setItem('appTheme', theme);
    }
  }
}
