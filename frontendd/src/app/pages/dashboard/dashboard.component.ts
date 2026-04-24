import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent {

  api = environment.apiUrl;

  file!: File;
  examType = 'quiz';
  mcqs = 5;
  shorts = 3;
  longs = 2;
  difficulty = 'Medium';
  blooms = 'Understand, Apply';
  instructions = '';

  loading = false;
  result = '';
  examId!: number;

  constructor(private http: HttpClient) {}

  onFile(e: any) {
    this.file = e.target.files[0];
  }

  generate() {
    const form = new FormData();
    form.append('exam_type', this.examType);
    form.append('mcqs', this.mcqs.toString());
    form.append('shorts', this.shorts.toString());
    form.append('longs', this.longs.toString());
    form.append('difficulty', this.difficulty);
    form.append('marks', 'Auto');
    form.append('blooms', this.blooms);
    form.append('instructions', this.instructions);
    form.append('file', this.file);

    this.loading = true;

    this.http.post<any>(`${this.api}/generate-exam`, form)
      .subscribe(res => {
        this.result = res.content;
        this.examId = res.id;
        this.loading = false;
      });
  }
}
