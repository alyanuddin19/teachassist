import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.teacher-shell.html',
  styleUrls: ['./main-layout.component.css']
})
export class MainLayoutComponent implements OnInit {
  sidebarOpen = true;
  isMobileView = false;
  teacherName = '';
  teacherUid = '';
  teacherDepartment = '';

  constructor(
    private router: Router
  ) {}

  ngOnInit(): void {
    const role = localStorage.getItem('userRole');
    if (role === 'student') {
      this.router.navigate(['/student/tasks']);
      return;
    }

    this.teacherName = localStorage.getItem('teacherName') || 'Teacher';
    this.teacherUid = localStorage.getItem('teacherUid') || '';
    this.teacherDepartment = localStorage.getItem('teacherDepartment') || '';
    this.syncViewportState();
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    if (this.isMobileView) {
      this.sidebarOpen = false;
    }
  }

  handleNavSelection(): void {
    this.closeSidebar();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.syncViewportState();
  }

  private syncViewportState(): void {
    this.isMobileView = window.innerWidth <= 960;
    this.sidebarOpen = this.isMobileView ? false : true;
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
