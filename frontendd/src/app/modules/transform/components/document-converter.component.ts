import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-document-converter',
  templateUrl: './document-converter.component.html',
  styleUrls: ['./document-converter.component.css']
})
export class DocumentConverterComponent {
  selectedFile: File | null = null;
  loading = false;
  message = '';
  error = '';

  constructor(private http: HttpClient) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
    this.message = '';
    this.error = '';
  }

  convert(): void {
    if (!this.selectedFile) {
      this.error = 'Please choose a file first.';
      return;
    }

    const formData = new FormData();
    formData.append('file', this.selectedFile);
    formData.append('conversion_type', 'excel_to_pdf');

    this.loading = true;
    this.message = '';
    this.error = '';
    this.http.post(`${environment.backendUrl}/transform/convert-document`, formData, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.downloadBlob(blob);
        this.message = 'Converted file downloaded.';
        this.loading = false;
      },
      error: (error) => {
        this.showConversionError(error);
        this.loading = false;
      }
    });
  }

  private showConversionError(error: any): void {
    if (error?.error instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '{}'));
          this.error = parsed.detail || 'Conversion failed. Please try another file.';
        } catch {
          this.error = 'Conversion failed. Please try another file.';
        }
      };
      reader.readAsText(error.error);
      return;
    }
    this.error = error?.error?.detail || 'Conversion failed. Please try another file.';
  }

  private downloadBlob(blob: Blob): void {
    const sourceName = this.selectedFile?.name.replace(/\.[^.]+$/, '') || 'converted';
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sourceName}.pdf`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }
}
