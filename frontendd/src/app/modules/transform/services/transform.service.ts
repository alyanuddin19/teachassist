import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, map, Observable, Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type Student = {
  id: number;
  roll_number: string;
  full_name: string;
  batch: string;
  section: string;
  semester?: string | null;
};

export type TransformCourseOption = {
  record_id: number;
  course_id: number;
  course_code: string;
  course_name: string;
  semester: number | null;
  section: string;
  batch: string;
  department: string;
  student_count: number;
  threshold_percentage: number;
  latest_marksheet_id: number | null;
  reviewed_task_count: number;
};

export type TransformCoursesResponse = {
  teacher_name: string;
  teacher_email: string;
  teacher_uid: string;
  department: string;
  courses: TransformCourseOption[];
};

export type TransformCourseStudentsResponse = {
  teacher_name: string;
  teacher_email: string;
  teacher_uid: string;
  course: TransformCourseOption;
  students: Student[];
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
  teacher_course_id: number;
  exam_type: string;
  total_marks: number;
  export_file_name: string;
  selected_options: Record<string, string>;
  assessment_totals: Record<string, number>;
  student_marks: StudentMarksRowPayload[];
  source_kind?: string;
  source_marksheet_id?: number | null;
};

export type MarksheetSummary = {
  id: number;
  teacher_course_id: number;
  course_id: number;
  course_code: string;
  course_name: string;
  semester: number | null;
  section: string;
  batch: string;
  department: string;
  exam_type: string;
  total_marks: number;
  export_file_name: string;
  selected_options: Record<string, string>;
  assessment_totals: Record<string, number>;
  student_count: number;
  created_at: string;
  expires_at: string | null;
  download_url: string;
  source_kind: string;
  source_marksheet_id: number | null;
  teacher_threshold_percentage: number;
};

export type MarksheetDetail = MarksheetSummary & {
  student_marks: Array<{
    student_id: number;
    student_name: string;
    roll_no: string;
    obtained_marks_by_assessment: Record<string, number>;
    remarks?: string | null;
  }>;
};

export type SaveMarksheetResponse = {
  message: string;
  marksheet: MarksheetDetail;
  download_url: string;
  course_code?: string;
  course_name?: string;
};

export type TeacherContext = {
  teacher_name: string;
};

@Injectable({
  providedIn: 'root'
})
export class TransformService {
  public baseUrl = `${environment.apiUrl}/transform`;
  private teacherContextSubject = new BehaviorSubject<TeacherContext>({
    teacher_name: localStorage.getItem('transform_teacher_name') || localStorage.getItem('teacherName') || '',
  });
  private marksheetSavedSubject = new Subject<void>();
  private editMarksheetSubject = new Subject<number>();
  private openRecordsSubject = new Subject<void>();

  readonly teacherContext$ = this.teacherContextSubject.asObservable();
  readonly marksheetSaved$ = this.marksheetSavedSubject.asObservable();
  readonly editMarksheet$ = this.editMarksheetSubject.asObservable();
  readonly openRecords$ = this.openRecordsSubject.asObservable();

  constructor(private http: HttpClient) {}

  setTeacherContext(context: TeacherContext): void {
    const nextTeacherName = (context.teacher_name || '').trim();
    localStorage.setItem('transform_teacher_name', nextTeacherName);

    if (this.teacherContextSubject.value.teacher_name === nextTeacherName) {
      return;
    }

    this.teacherContextSubject.next({ teacher_name: nextTeacherName });
  }

  clearTeacherContext(): void {
    localStorage.removeItem('transform_teacher_name');
    this.teacherContextSubject.next({ teacher_name: '' });
  }

  notifyMarksheetSaved(): void {
    this.marksheetSavedSubject.next();
  }

  requestEditMarksheet(marksheetId: number): void {
    this.editMarksheetSubject.next(marksheetId);
  }

  requestOpenRecords(): void {
    this.openRecordsSubject.next();
  }

  getTeacherCourses(teacherName: string): Observable<TransformCoursesResponse> {
    const params = new HttpParams().set('teacher_name', teacherName);
    return this.http.get<TransformCoursesResponse>(`${this.baseUrl}/courses`, { params });
  }

  getCourseStudents(recordId: number, teacherName: string): Observable<TransformCourseStudentsResponse> {
    const params = new HttpParams().set('teacher_name', teacherName);
    return this.http.get<TransformCourseStudentsResponse>(`${this.baseUrl}/courses/${recordId}/students`, { params });
  }

  saveMarksheet(payload: MarksheetPayload): Observable<SaveMarksheetResponse> {
    return this.http.post<SaveMarksheetResponse>(`${this.baseUrl}/marksheets`, payload);
  }

  updateMarksheet(marksheetId: number, payload: MarksheetPayload): Observable<SaveMarksheetResponse> {
    return this.http.put<SaveMarksheetResponse>(`${this.baseUrl}/marksheets/${marksheetId}`, payload);
  }

  generateUpdatedMarksheet(marksheetId: number, teacherName: string): Observable<SaveMarksheetResponse & { applied_updates: number }> {
    return this.http.post<SaveMarksheetResponse & { applied_updates: number }>(
      `${this.baseUrl}/marksheets/${marksheetId}/updated`,
      { teacher_name: teacherName }
    );
  }

  deleteMarksheet(marksheetId: number, teacherName: string): Observable<{ status: string; marksheet_id: number }> {
    return this.http.delete<{ status: string; marksheet_id: number }>(
      `${this.baseUrl}/marksheets/${marksheetId}?teacher_name=${encodeURIComponent(teacherName)}`
    );
  }

  getMarksheetDetail(marksheetId: number, teacherName: string): Observable<MarksheetDetail> {
    const params = new HttpParams().set('teacher_name', teacherName);
    return this.http.get<MarksheetDetail>(`${this.baseUrl}/marksheets/${marksheetId}`, { params });
  }

  getMarksheets(teacherName: string): Observable<MarksheetSummary[]> {
    const params = new HttpParams().set('teacher_name', teacherName);
    return this.http.get<{ marksheets: MarksheetSummary[] }>(`${this.baseUrl}/marksheets`, { params }).pipe(
      map((response) => response.marksheets || [])
    );
  }

  downloadMarksheetBlob(marksheetId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/marksheets/${marksheetId}/download`, {
      responseType: 'blob'
    });
  }

  getDownloadUrl(url: string, filename?: string): string {
    if (!url) {
      return '';
    }

    const absoluteUrl =
      url.startsWith('http://') || url.startsWith('https://') ? url : `${environment.backendUrl}${url}`;

    if (!filename?.trim()) {
      return absoluteUrl;
    }

    const separator = absoluteUrl.includes('?') ? '&' : '?';
    return `${absoluteUrl}${separator}filename=${encodeURIComponent(filename.trim())}`;
  }
}
