import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface GapAnalysisSavedReport {
  id: number;
  teacher_id: number;
  teacher_course_id: number | null;
  course_id: number | null;
  department: string;
  semester: number | null;
  section: string;
  batch: string;
  course_code: string;
  course_name: string;
  teacher_name: string;
  assessment_type: string;
  assessment_title: string;
  question_paper_name: string;
  marksheet_name: string;
  cis_file_name: string;
  created_at: string | null;
  expires_at: string | null;
  download_url: string;
  summary: any;
  report: any;
}

@Injectable({ providedIn: 'root' })
export class GapAnalysisService {

  private baseUrl = environment.gapAnalysisUrl;

  constructor(private http: HttpClient) {}

  analyze(
    questionPaper: File,
    marksheet: File,
    teacherName: string,
    assessmentType: string,
    assessmentTitle: string
  ): Observable<any> {
    const fd = new FormData();
    fd.append('question_paper', questionPaper);
    fd.append('marksheet', marksheet);
    fd.append('teacher_name', teacherName);
    fd.append('assessment_type', assessmentType);
    fd.append('assessment_title', assessmentTitle);
    return this.http.post(`${this.baseUrl}/`, fd);
  }

  analyzeWithRecommendations(
    questionPaper: File,
    marksheet: File,
    cisFile: File,
    difficultyLevel: string,
    teacherName: string,
    assessmentType: string,
    assessmentTitle: string
  ): Observable<any> {
    const fd = new FormData();
    fd.append('question_paper', questionPaper);
    fd.append('marksheet', marksheet);
    fd.append('cis_file', cisFile);
    fd.append('difficulty_level', difficultyLevel);
    fd.append('teacher_name', teacherName);
    fd.append('assessment_type', assessmentType);
    fd.append('assessment_title', assessmentTitle);
    return this.http.post(`${this.baseUrl}/with-recommendations`, fd);
  }

  generateForStudent(
    questionPaper: File,
    marksheet: File,
    cisFile: File,
    studentName: string,
    weakClos: string[],
    cloQuestionMap: { [clo: string]: number },
    difficultyLevel: string
  ): Observable<any> {
    const fd = new FormData();
    fd.append('question_paper', questionPaper);
    fd.append('marksheet', marksheet);
    fd.append('cis_file', cisFile);
    fd.append('student_name', studentName);
    fd.append('weak_clos', JSON.stringify(weakClos));
    fd.append('clo_question_map', JSON.stringify(cloQuestionMap));
    fd.append('difficulty_level', difficultyLevel);
    return this.http.post(`${this.baseUrl}/generate-for-student`, fd);
  }

  sendGeneratedTask(data: FormData): Observable<any> {
    return this.http.post(`${environment.apiUrl}/student/tasks/assign`, data);
  }

  getSavedReports(teacherName: string): Observable<{ reports: GapAnalysisSavedReport[] }> {
    return this.http.get<{ reports: GapAnalysisSavedReport[] }>(
      `${this.baseUrl}/reports?teacher_name=${encodeURIComponent(teacherName)}`
    );
  }

  deleteSavedReport(reportId: number, teacherName: string): Observable<{ status: string; report_id: number }> {
    return this.http.delete<{ status: string; report_id: number }>(
      `${this.baseUrl}/reports/${reportId}?teacher_name=${encodeURIComponent(teacherName)}`
    );
  }

  getReportDownloadUrl(path: string, teacherName: string): string {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${path}${separator}teacher_name=${encodeURIComponent(teacherName)}`;
    return url.startsWith('http') ? url : `${environment.backendUrl}${url}`;
  }

  downloadTransformMarksheet(marksheetId: number): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/transform/marksheets/${marksheetId}/download`, {
      responseType: 'blob'
    });
  }
}
