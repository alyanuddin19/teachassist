import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, StudentTask } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-student-tasks',
  templateUrl: './student-tasks.component.html',
  styleUrls: ['./student-tasks.component.css']
})
export class StudentTasksComponent implements OnInit {
  readonly backendUrl = environment.backendUrl;
  studentName = '';
  studentCode = '';
  studentId = 0;
  tasks: StudentTask[] = [];
  loading = true;
  error = '';
  answerText: Record<number, string> = {};
  answerFiles: Record<number, File | null> = {};
  submitting: Record<number, boolean> = {};
  deleting: Record<number, boolean> = {};

  constructor(
    private api: ApiService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const role = localStorage.getItem('userRole');
    const studentIdValue = localStorage.getItem('studentId');
    this.studentName = localStorage.getItem('studentName') || 'Student';
    this.studentCode = localStorage.getItem('studentCode') || 'Student';

    if (role !== 'student' || !studentIdValue) {
      this.router.navigate(['/login']);
      return;
    }

    const studentId = Number(studentIdValue);
    if (Number.isNaN(studentId)) {
      this.router.navigate(['/login']);
      return;
    }
    this.studentId = studentId;

    this.api.getStudentTasks(studentId).subscribe({
      next: (res) => {
        this.loading = false;
        this.studentName = res.student_name || this.studentName;
        this.studentCode = res.student_code || this.studentCode;
        this.tasks = res.tasks || [];
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.detail || 'Unable to load tasks right now.';
      }
    });
  }

  onAnswerFileChange(taskId: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.answerFiles[taskId] = input.files?.[0] || null;
  }

  submitTask(taskId: number): void {
    if (!this.studentId) {
      return;
    }

    const formData = new FormData();
    formData.append('student_id', String(this.studentId));
    formData.append('answer_text', this.answerText[taskId] || '');
    const file = this.answerFiles[taskId];
    if (file) {
      formData.append('answer_file', file);
    }

    this.submitting[taskId] = true;
    this.api.submitStudentTask(taskId, formData).subscribe({
      next: (res) => {
        this.submitting[taskId] = false;
        this.answerText[taskId] = '';
        this.answerFiles[taskId] = null;
        this.tasks = this.tasks.map((task) => task.id === taskId ? res.task : task);
      },
      error: (err) => {
        this.submitting[taskId] = false;
        this.error = err.error?.detail || 'Unable to submit this task.';
      }
    });
  }

  deleteTask(taskId: number): void {
    if (!this.studentId) {
      return;
    }

    if (!window.confirm('Delete this task from your dashboard?')) {
      return;
    }

    this.deleting[taskId] = true;
    this.error = '';
    this.api.deleteStudentTask(taskId, this.studentId).subscribe({
      next: () => {
        this.deleting[taskId] = false;
        this.tasks = this.tasks.filter((task) => task.id !== taskId);
      },
      error: (err) => {
        this.deleting[taskId] = false;
        this.error = err.error?.detail || 'Unable to delete this task.';
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
