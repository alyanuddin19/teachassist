import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GapAnalysisService {

  private baseUrl = 'http://localhost:8000/gap-analysis';

  constructor(private http: HttpClient) {}

  analyze(questionPaper: File, marksheet: File, teacherName: string): Observable<any> {
    const fd = new FormData();
    fd.append('question_paper', questionPaper);
    fd.append('marksheet', marksheet);
    fd.append('teacher_name', teacherName);
    return this.http.post(`${this.baseUrl}/`, fd);
  }

  analyzeWithRecommendations(
    questionPaper: File,
    marksheet: File,
    cisFile: File,
    difficultyLevel: string,
    teacherName: string
  ): Observable<any> {
    const fd = new FormData();
    fd.append('question_paper', questionPaper);
    fd.append('marksheet', marksheet);
    fd.append('cis_file', cisFile);
    fd.append('difficulty_level', difficultyLevel);
    fd.append('teacher_name', teacherName);
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
    return this.http.post('http://localhost:8000/api/student/tasks/assign', data);
  }

  downloadTransformMarksheet(marksheetId: number): Observable<Blob> {
    return this.http.get(`http://localhost:8000/api/transform/marksheets/${marksheetId}/download`, {
      responseType: 'blob'
    });
  }
}
