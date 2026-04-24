import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { finalize, timeout } from 'rxjs/operators';

import { ApiService, MarksheetSummary, TeacherContext } from '../../services/api.service';

@Component({
  selector: 'app-live-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './live-sheet.component.html',
  styleUrls: ['./live-sheet.component.css'],
})
export class LiveSheetComponent implements OnInit, OnDestroy {
  marksheets: MarksheetSummary[] = [];
  downloadBase = '';
  isLoading = false;
  loadError = '';
  exportNameOverrides: Record<number, string> = {};

  private subscriptions = new Subscription();
  private currentTeacherContext: TeacherContext = { email: '', teacher_name: '' };

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef
  ) {
    this.downloadBase = this.api.baseUrl;
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.api.teacherContext$.subscribe((context) => {
        this.currentTeacherContext = context;
        this.loadMarksheets();
      })
    );

    this.subscriptions.add(
      this.api.marksheetSaved$.subscribe(() => {
        this.loadMarksheets();
      })
    );

    this.loadMarksheets();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadMarksheets(): void {
    const teacherEmail = (this.currentTeacherContext.email || '').trim();
    const teacherName = (this.currentTeacherContext.teacher_name || '').trim();

    this.loadError = '';

    if (!teacherEmail) {
      this.marksheets = [];
      this.isLoading = false;
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    this.api
      .getMarksheets(teacherEmail, teacherName)
      .pipe(
        timeout(8000),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (sheets: MarksheetSummary[]) => {
          this.marksheets = Array.isArray(sheets) ? sheets : [];
          this.loadError = '';
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading marksheets:', error);
          this.marksheets = [];
          this.loadError = 'Could not load saved sheets.';
          this.cdr.detectChanges();
        },
      });
  }

  getDownloadLink(sheet: MarksheetSummary): string {
    return this.api.getDownloadUrl(sheet.download_url, sheet.export_file_name || '');
  }

  objectEntries(obj: Record<string, string> | undefined | null): [string, string][] {
    return Object.entries(obj || {});
  }

  editMarksheet(marksheetId: number): void {
    this.api.requestEditMarksheet(marksheetId);
  }
}