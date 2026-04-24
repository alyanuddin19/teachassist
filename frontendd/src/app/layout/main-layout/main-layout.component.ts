import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.teacher-shell.html',
  styleUrls: ['./main-layout.component.css']
})
export class MainLayoutComponent implements OnInit {
  sidebarOpen = true;
  teacherName = '';
  teacherUid = '';
  teacherDepartment = '';

  constructor(private router: Router) {}

  ngOnInit(): void {
    const role = localStorage.getItem('userRole');
    if (role === 'student') {
      this.router.navigate(['/student/tasks']);
      return;
    }

    this.teacherName = localStorage.getItem('teacherName') || 'Teacher';
    this.teacherUid = localStorage.getItem('teacherUid') || '';
    this.teacherDepartment = localStorage.getItem('teacherDepartment') || '';
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  logout(): void {
    localStorage.clear();
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }
}
