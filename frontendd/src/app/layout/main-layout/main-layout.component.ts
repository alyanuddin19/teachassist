import { Component, HostListener, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

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
  currentPageLabel = 'teacher dashboard';

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
    this.updateCurrentPageLabel();
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateCurrentPageLabel();
      }
    });
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

  private updateCurrentPageLabel(): void {
    const url = this.router.url || '';
    if (url.includes('gap-analysis')) {
      this.currentPageLabel = 'gap analysis';
      return;
    }
    if (url.includes('transform')) {
      this.currentPageLabel = 'transform';
      return;
    }
    if (url.includes('generate')) {
      this.currentPageLabel = 'generate exam';
      return;
    }
    this.currentPageLabel = 'teacher profile';
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
