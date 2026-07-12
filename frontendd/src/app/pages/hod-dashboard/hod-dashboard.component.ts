import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ApiService,
  CourseSuggestion,
  CreatedTeacherResponse,
  StandardTemplate,
  StandardTemplateField
} from '../../core/services/api.service';

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
  activeView: 'manage' | 'templates' = 'manage';
  courseSuggestions: CourseSuggestion[] = [];
  assignmentResult: CreatedTeacherResponse['teacher'] | null = null;
  templates: StandardTemplate[] = [];
  selectedTemplate: StandardTemplate | null = null;
  templateFile: File | null = null;
  templateSaving = false;

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
    this.loadTemplates();
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

  switchView(view: 'manage' | 'templates'): void {
    this.activeView = view;
    this.closeSidebar();
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
