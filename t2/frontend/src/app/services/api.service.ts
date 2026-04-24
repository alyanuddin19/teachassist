import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export type Department = {
  id: number;
  name: string;
  code: string;
};

export type Course = {
  id: number;
  course_code: string;
  course_name: string;
  semester?: string | null;
};

export type AcademicSession = {
  id: number;
  name: string;
};

export type FormConfig = {
  departments: Department[];
  batches: string[];
  sections: string[];
  courses: Course[];
  sessions: AcademicSession[];
  dropdowns: Record<string, string[]>;
};

export type Student = {
  id: number;
  roll_number: string;
  full_name: string;
  batch: string;
  section: string;
  semester?: string | null;
};

export type TeacherAssignment = {
  id: number;
  department_id: number;
  batch: string;
  section: string;
  course_id: number;
  session_id: number;
};

export type TeacherAccessResponse = {
  found: boolean;
  teacher_name: string;
  email: string;
  assignments: TeacherAssignment[];
};

export type StudentMarkPayload = {
  assessment_label: string;
  obtained_marks: number;
};

export type StudentMarksRowPayload = {
  student_id: number;
  marks: StudentMarkPayload[];
  remarks: string;
};

export type MarksheetPayload = {
  teacher_name: string;
  email: string;
  department_id: number;
  batch: string;
  section: string;
  course_id: number;
  session_id: number;
  exam_type: string;
  total_marks: number;
  export_file_name: string;
  selected_options: Record<string, string>;
  assessment_totals: Record<string, number>;
  student_marks: StudentMarksRowPayload[];
};

export type MarksheetSummary = {
  id: number;
  teacher_name: string;
  email: string;
  department?: string | null;
  batch?: string;
  section: string;
  course?: string | null;
  session?: string | null;
  exam_type?: string | null;
  total_marks: number;
  export_file_name?: string | null;
  selected_options: Record<string, string>;
  assessment_totals?: Record<string, number>;
  student_count: number;
  created_at: string;
  download_url: string;
};

export type MarksheetDetail = {
  id: number;
  teacher_name: string;
  email: string;
  department_id?: number | null;
  department?: string | null;
  batch: string;
  section: string;
  course_id?: number | null;
  course?: string | null;
  session_id?: number | null;
  session?: string | null;
  exam_type?: string | null;
  total_marks: number;
  export_file_name?: string | null;
  selected_options: Record<string, string>;
  assessment_totals?: Record<string, number>;
  student_marks: Array<{
    student_id: number;
    obtained_marks_by_assessment: Record<string, number>;
    remarks?: string | null;
  }>;
  created_at: string;
  download_url: string;
};

export type SaveMarksheetResponse = {
  message: string;
  marksheet_id: number;
  download_url: string;
  export_file_name?: string | null;
  course?: string | null;
  session?: string | null;
};

export type TeacherContext = {
  email: string;
  teacher_name: string;
};

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  public baseUrl = 'http://127.0.0.1:8000';
  private teacherContextSubject = new BehaviorSubject<TeacherContext>({
    email: localStorage.getItem('current_teacher_email') || '',
    teacher_name: localStorage.getItem('current_teacher_name') || '',
  });
  private marksheetSavedSubject = new Subject<void>();
  private editMarksheetSubject = new Subject<number>();

  readonly teacherContext$ = this.teacherContextSubject.asObservable();
  readonly marksheetSaved$ = this.marksheetSavedSubject.asObservable();
  readonly editMarksheet$ = this.editMarksheetSubject.asObservable();

  constructor(private http: HttpClient) {}

  setTeacherContext(context: TeacherContext): void {
    localStorage.setItem('current_teacher_email', context.email);
    localStorage.setItem('current_teacher_name', context.teacher_name);
    this.teacherContextSubject.next(context);
  }

  clearTeacherContext(): void {
    localStorage.removeItem('current_teacher_email');
    localStorage.removeItem('current_teacher_name');
    this.teacherContextSubject.next({ email: '', teacher_name: '' });
  }

  notifyMarksheetSaved(): void {
    this.marksheetSavedSubject.next();
  }

  requestEditMarksheet(marksheetId: number): void {
    this.editMarksheetSubject.next(marksheetId);
  }

  getFormConfig(): Observable<FormConfig> {
    return this.http.get<FormConfig>(`${this.baseUrl}/form-config`);
  }

  getTeacherAccess(name: string, email: string): Observable<TeacherAccessResponse> {
    const params = new HttpParams()
      .set('teacher_name', name)
      .set('email', email);

    return this.http.get<TeacherAccessResponse>(`${this.baseUrl}/teacher-access`, { params });
  }

  getStudents(deptId: number, batch: string, section: string): Observable<Student[]> {
    const params = new HttpParams()
      .set('department_id', deptId)
      .set('batch', batch)
      .set('section', section);

    return this.http.get<Student[]>(`${this.baseUrl}/students`, { params });
  }

  saveMarksheet(payload: MarksheetPayload): Observable<SaveMarksheetResponse> {
    return this.http.post<SaveMarksheetResponse>(`${this.baseUrl}/marksheets`, payload);
  }

  updateMarksheet(
    marksheetId: number,
    payload: MarksheetPayload
  ): Observable<SaveMarksheetResponse> {
    return this.http.put<SaveMarksheetResponse>(
      `${this.baseUrl}/marksheets/${marksheetId}`,
      payload
    );
  }

  getMarksheetDetail(marksheetId: number): Observable<MarksheetDetail> {
    return this.http.get<MarksheetDetail>(`${this.baseUrl}/marksheets/${marksheetId}`);
  }

  getMarksheets(email?: string, teacherName?: string): Observable<MarksheetSummary[]> {
    let params = new HttpParams();

    if (email) {
      params = params.set('email', email);
    }

    if (teacherName) {
      params = params.set('teacher_name', teacherName);
    }

    return this.http.get<MarksheetSummary[]>(`${this.baseUrl}/marksheets`, { params });
  }

  getDownloadUrl(url: string, filename?: string): string {
    if (!url) {
      return '';
    }

    const absoluteUrl =
      url.startsWith('http://') || url.startsWith('https://') ? url : `${this.baseUrl}${url}`;

    if (!filename?.trim()) {
      return absoluteUrl;
    }

    const separator = absoluteUrl.includes('?') ? '&' : '?';
    return `${absoluteUrl}${separator}filename=${encodeURIComponent(filename.trim())}`;
  }
}
