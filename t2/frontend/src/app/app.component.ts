import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LiveSheetComponent } from './components/live-sheet/live-sheet.component';
import { TeacherFormComponent } from './components/teacher-form/teacher-form.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TeacherFormComponent, LiveSheetComponent],
  template: `
    <main class="page-shell">
      <app-teacher-form></app-teacher-form>
      <section class="toolbar">
        <button class="records-toggle" type="button" (click)="toggleRecords()">
          {{ showRecords ? 'Hide Records' : 'View Records' }}
        </button>
      </section>
      <app-live-sheet *ngIf="showRecords"></app-live-sheet>
    </main>
  `,
  styleUrl: './app.css',
})
export class AppComponent {
  showRecords = false;

  toggleRecords(): void {
    this.showRecords = !this.showRecords;
  }
}
