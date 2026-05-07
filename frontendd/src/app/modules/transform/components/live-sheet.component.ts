import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, Subscription, timeout } from 'rxjs';

import { MarksheetSummary, TeacherContext, TransformService } from '../services/transform.service';

@Component({
  selector: 'app-transform-live-sheet',
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
  updateStatus = '';
  updatingMarksheetId: number | null = null;
  deletingMarksheetId: number | null = null;

  private subscriptions = new Subscription();
  private currentTeacherContext: TeacherContext = { teacher_name: '' };
  private activeLoadRequestId = 0;
  private activeTeacherLoad = '';

  constructor(
    private api: TransformService,
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
        this.loadMarksheets(true);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadMarksheets(force = false): void {
    const teacherName = (this.currentTeacherContext.teacher_name || '').trim();

    this.loadError = '';

    if (!teacherName) {
      this.marksheets = [];
      this.isLoading = false;
      this.activeTeacherLoad = '';
      this.cdr.detectChanges();
      return;
    }

    if (!force && this.isLoading && this.activeTeacherLoad === teacherName) {
      return;
    }

    this.isLoading = true;
    this.activeTeacherLoad = teacherName;
    const requestId = ++this.activeLoadRequestId;
    this.cdr.detectChanges();

    this.api
      .getMarksheets(teacherName)
      .pipe(
        timeout(8000),
        finalize(() => {
          if (requestId !== this.activeLoadRequestId) {
            return;
          }
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (sheets: MarksheetSummary[]) => {
          if (requestId !== this.activeLoadRequestId) {
            return;
          }
          this.marksheets = Array.isArray(sheets) ? sheets : [];
          this.loadError = '';
          this.cdr.detectChanges();
        },
        error: (error) => {
          if (requestId !== this.activeLoadRequestId) {
            return;
          }
          console.error('Error loading marksheets:', error);
          this.marksheets = [];
          this.loadError = 'Could not load saved sheets.';
          this.cdr.detectChanges();
        },
      });
  }

  getDownloadLink(sheet: MarksheetSummary): string {
    return this.api.getDownloadUrl(sheet.download_url, sheet.export_file_name || 'marksheet');
  }

  objectEntries(obj: Record<string, string> | undefined | null): [string, string][] {
    return Object.entries(obj || {});
  }

  editMarksheet(sheet: MarksheetSummary): void {
    const teacherName = (this.currentTeacherContext.teacher_name || '').trim();
    if (!teacherName) {
      this.updateStatus = 'Teacher session missing. Please log in again.';
      this.cdr.detectChanges();
      return;
    }

    this.updatingMarksheetId = sheet.id;
    this.updateStatus = '';
    this.cdr.detectChanges();

    this.api.generateUpdatedMarksheet(sheet.id, teacherName).subscribe({
      next: (response) => {
        this.updatingMarksheetId = null;
        this.updateStatus = response.applied_updates > 0
          ? `Updated ${response.applied_updates} reviewed change${response.applied_updates === 1 ? '' : 's'} in ${sheet.export_file_name || sheet.course_code}.`
          : '';
        this.api.notifyMarksheetSaved();
        this.api.requestEditMarksheet(response.marksheet?.id || sheet.id);
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.updatingMarksheetId = null;
        if (error?.error?.detail === 'No new reviewed task changes were available for this sheet.') {
          this.updateStatus = 'No new reviewed-task changes were pending for this sheet.';
          this.api.requestEditMarksheet(sheet.id);
        } else {
          this.updateStatus = 'Could not refresh this marksheet right now.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  deleteMarksheet(sheet: MarksheetSummary): void {
    const teacherName = (this.currentTeacherContext.teacher_name || '').trim();
    if (!teacherName) {
      this.updateStatus = 'Teacher session missing. Please log in again.';
      this.cdr.detectChanges();
      return;
    }

    if (!window.confirm(`Delete "${sheet.export_file_name || sheet.course_code}" from saved records?`)) {
      return;
    }

    this.deletingMarksheetId = sheet.id;
    this.updateStatus = '';
    this.cdr.detectChanges();

    this.api.deleteMarksheet(sheet.id, teacherName).subscribe({
      next: () => {
        this.deletingMarksheetId = null;
        this.marksheets = this.marksheets.filter((item) => item.id !== sheet.id);
        this.updateStatus = `"${sheet.export_file_name || sheet.course_code}" deleted successfully.`;
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        this.deletingMarksheetId = null;
        this.updateStatus = error?.error?.detail || 'Could not delete this marksheet right now.';
        this.cdr.detectChanges();
      }
    });
  }
}
