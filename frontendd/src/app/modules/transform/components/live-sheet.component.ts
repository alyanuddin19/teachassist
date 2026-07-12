import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, Subscription, timeout } from 'rxjs';

import { MarksheetSummary, TeacherContext, TransformService } from '../services/transform.service';

type MarksheetListItem = MarksheetSummary & {
  selectedOptionEntries: [string, string][];
  downloadLink: string;
  expiryLabel: string;
};

@Component({
  selector: 'app-transform-live-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './live-sheet.component.html',
  styleUrls: ['./live-sheet.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveSheetComponent implements OnInit, OnDestroy {
  marksheets: MarksheetListItem[] = [];
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
    this.activeLoadRequestId++;
    this.subscriptions.unsubscribe();
  }

  loadMarksheets(force = false): void {
    const teacherName = (this.currentTeacherContext.teacher_name || '').trim();

    this.loadError = '';

    if (!teacherName) {
      this.marksheets = [];
      this.isLoading = false;
      this.activeTeacherLoad = '';
      this.cdr.markForCheck();
      return;
    }

    if (!force && this.isLoading && this.activeTeacherLoad === teacherName) {
      return;
    }

    this.isLoading = true;
    this.activeTeacherLoad = teacherName;
    const requestId = ++this.activeLoadRequestId;
    this.cdr.markForCheck();

    this.api
      .getMarksheets(teacherName)
      .pipe(
        timeout(8000),
        finalize(() => {
          if (requestId === this.activeLoadRequestId) {
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        })
      )
      .subscribe({
        next: (sheets: MarksheetSummary[]) => {
          if (requestId !== this.activeLoadRequestId) {
            return;
          }
          this.marksheets = this.toListItems(sheets);
          this.loadError = '';
          this.cdr.markForCheck();
        },
        error: (error) => {
          if (requestId !== this.activeLoadRequestId) {
            return;
          }
          console.error('Error loading marksheets:', error);
          this.marksheets = [];
          this.loadError = 'Could not load saved sheets.';
          this.cdr.markForCheck();
        },
      });
  }

  trackByMarksheetId(_index: number, sheet: MarksheetListItem): number {
    return sheet.id;
  }

  trackByOption(_index: number, item: [string, string]): string {
    return `${item[0]}:${item[1]}`;
  }

  editMarksheet(sheet: MarksheetSummary): void {
    const teacherName = (this.currentTeacherContext.teacher_name || '').trim();
    if (!teacherName) {
      this.updateStatus = 'Teacher session missing. Please log in again.';
      this.cdr.markForCheck();
      return;
    }

    if (sheet.source_kind === 'standard_mapping') {
      this.updateStatus = '';
      this.api.requestEditMarksheet(sheet.id);
      this.cdr.markForCheck();
      return;
    }

    this.updatingMarksheetId = sheet.id;
    this.updateStatus = '';
    this.cdr.markForCheck();

    this.api.generateUpdatedMarksheet(sheet.id, teacherName).subscribe({
      next: (response) => {
        this.updatingMarksheetId = null;
        this.updateStatus = response.applied_updates > 0
          ? `Updated ${response.applied_updates} reviewed change${response.applied_updates === 1 ? '' : 's'} in ${sheet.export_file_name || sheet.course_code}.`
          : '';
        this.api.notifyMarksheetSaved();
        this.api.requestEditMarksheet(response.marksheet?.id || sheet.id);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.updatingMarksheetId = null;
        if (error?.error?.detail === 'No new reviewed task changes were available for this sheet.') {
          this.updateStatus = 'No reviewed PASS/FAIL changes matched students in this sheet by roll number.';
          this.api.requestEditMarksheet(sheet.id);
        } else {
          this.updateStatus = 'Could not refresh this marksheet right now.';
        }
        this.cdr.markForCheck();
      }
    });
  }

  deleteMarksheet(sheet: MarksheetSummary): void {
    const teacherName = (this.currentTeacherContext.teacher_name || '').trim();
    if (!teacherName) {
      this.updateStatus = 'Teacher session missing. Please log in again.';
      this.cdr.markForCheck();
      return;
    }

    if (!window.confirm(`Delete "${sheet.export_file_name || sheet.course_code}" from saved records?`)) {
      return;
    }

    this.deletingMarksheetId = sheet.id;
    this.updateStatus = '';
    this.cdr.markForCheck();

    this.api.deleteMarksheet(sheet.id, teacherName).subscribe({
      next: () => {
        this.deletingMarksheetId = null;
        this.marksheets = this.marksheets.filter((item) => item.id !== sheet.id);
        this.updateStatus = `"${sheet.export_file_name || sheet.course_code}" deleted successfully.`;
        this.cdr.markForCheck();
      },
      error: (error: any) => {
        this.deletingMarksheetId = null;
        this.updateStatus = error?.error?.detail || 'Could not delete this marksheet right now.';
        this.cdr.markForCheck();
      }
    });
  }

  private toListItems(sheets: MarksheetSummary[] | null | undefined): MarksheetListItem[] {
    return (Array.isArray(sheets) ? sheets : []).map((sheet) => ({
      ...sheet,
      selectedOptionEntries: Object.entries(sheet.selected_options || {}),
      downloadLink: this.api.getDownloadUrl(sheet.download_url, sheet.export_file_name || 'marksheet'),
      expiryLabel: this.buildExpiryLabel(sheet.expires_at)
    }));
  }

  private buildExpiryLabel(expiresAt: string | null | undefined): string {
    if (!expiresAt) {
      return `Auto-deletes after ${28} days`;
    }

    const expiryTime = new Date(expiresAt).getTime();
    if (Number.isNaN(expiryTime)) {
      return `Auto-deletes after ${28} days`;
    }

    const daysLeft = Math.max(0, Math.ceil((expiryTime - Date.now()) / 86400000));
    return daysLeft === 1 ? 'Deletes tomorrow' : `Deletes in ${daysLeft} days`;
  }
}
