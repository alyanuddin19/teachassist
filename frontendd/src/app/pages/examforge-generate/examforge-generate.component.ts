import { Component } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

type ExamType = 'quiz' | 'mid' | 'final' | 'assignment';
type QuestionType = 'short' | 'descriptive' | 'case_study';
type ToastType = 'success' | 'error' | 'info';

interface TheoryQuestion {
  marks: number;
  blooms_level: string;
  question_type: QuestionType;
}

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

interface BloomLevel {
  value: string;
  label: string;
  keywords: string[];
}

@Component({
  selector: 'app-examforge-generate',
  templateUrl: './examforge-generate.component.html',
  styleUrls: ['./examforge-generate.component.css']
})
export class ExamforgeGenerateComponent {
  readonly bloomsLevels: BloomLevel[] = [
    { value: 'remember', label: 'L1 - Remember', keywords: ['Define', 'List', 'Memorize', 'Recall', 'Repeat', 'State', 'Identify', 'Name'] },
    { value: 'understand', label: 'L2 - Understand', keywords: ['Explain', 'Summarize', 'Paraphrase', 'Describe', 'Interpret', 'Classify', 'Compare'] },
    { value: 'apply', label: 'L3 - Apply', keywords: ['Execute', 'Implement', 'Solve', 'Use', 'Demonstrate', 'Calculate', 'Sketch'] },
    { value: 'analyze', label: 'L4 - Analyze', keywords: ['Differentiate', 'Organize', 'Attribute', 'Deconstruct', 'Outline', 'Structure', 'Integrate'] },
    { value: 'evaluate', label: 'L5 - Evaluate', keywords: ['Check', 'Critique', 'Judge', 'Defend', 'Appraise', 'Argue', 'Support', 'Conclude'] },
    { value: 'create', label: 'L6 - Create', keywords: ['Generate', 'Plan', 'Produce', 'Design', 'Assemble', 'Construct', 'Develop', 'Write'] }
  ];

  readonly examConstraints: Record<ExamType, { maxMarks: number | null; time: string; timeLabel: string }> = {
    quiz: { maxMarks: null, time: '60 minutes', timeLabel: '1 hour' },
    mid: { maxMarks: 20, time: '90 minutes', timeLabel: '90 mins' },
    final: { maxMarks: 50, time: '3 hours', timeLabel: '3 hours' },
    assignment: { maxMarks: 20, time: 'N/A', timeLabel: '' }
  };

  currentStep = 1;
  selectedFiles: File[] = [];
  sessionId: string | null = null;
  sessionIds: string[] = [];
  examType: ExamType | null = null;
  mcqEnabled = true;
  theoryEnabled = true;
  mcqCount = 10;
  mcqMarks = 1;
  theoryCount = 3;
  theoryQuestions: TheoryQuestion[] = [];
  generatedPrompt = '';
  examContent = '';
  previewMode = false;
  previewHtml = '';
  uploadBusy = false;
  generatePromptBusy = false;
  generateExamBusy = false;
  downloadBusy = false;
  uploadProgress = 0;
  uploadProgressLabel = '';
  loading = false;
  loadingTitle = 'Processing...';
  loadingSubtitle = 'Please wait';
  toasts: ToastMessage[] = [];

  private toastId = 0;

  constructor(private api: ApiService) {
    this.initTheoryQuestions();
  }

  get grandTotal(): number {
    const mcqTotal = this.mcqEnabled && this.examType !== 'assignment' ? this.mcqCount * this.mcqMarks : 0;
    const theoryTotal = this.theoryEnabled ? this.theoryQuestions.reduce((sum, question) => sum + Number(question.marks || 0), 0) : 0;
    return mcqTotal + theoryTotal;
  }

  get mcqTotal(): number {
    return this.mcqEnabled && this.examType !== 'assignment' ? this.mcqCount * this.mcqMarks : 0;
  }

  get theoryTotal(): number {
    return this.theoryEnabled ? this.theoryQuestions.reduce((sum, question) => sum + Number(question.marks || 0), 0) : 0;
  }

  get examTypeCards() {
    return [
      { value: 'quiz', name: 'Quiz', desc: 'Short assessment', icon: '\u{1F4DD}' },
      { value: 'mid', name: 'Mid-Term', desc: 'Mid semester', icon: '\u{1F4D8}' },
      { value: 'final', name: 'Final', desc: 'End of semester', icon: '\u{1F393}' },
      { value: 'assignment', name: 'Assignment', desc: 'Take-home task', icon: '\u{1F4DA}' }
    ] as const;
  }

  isStepActive(step: number): boolean { return this.currentStep === step; }
  isStepCompleted(step: number): boolean { return this.currentStep > step; }

  goToStep(step: number): void {
    this.currentStep = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.handleFiles(files);
    input.value = '';
  }

  onFilesDropped(event: DragEvent): void {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    this.handleFiles(files);
  }

  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.selectedFiles = [...this.selectedFiles];
  }

  async uploadFiles(): Promise<void> {
    if (!this.selectedFiles.length || this.uploadBusy) { return; }
    this.uploadBusy = true;
    this.uploadProgress = 0;
    this.uploadProgressLabel = '';
    const sessionIds: string[] = [];

    try {
      for (let index = 0; index < this.selectedFiles.length; index += 1) {
        const file = this.selectedFiles[index];
        this.uploadProgressLabel = `Uploading "${file.name}"...`;
        this.uploadProgress = Math.round((index / this.selectedFiles.length) * 100);
        const form = new FormData();
        form.append('file', file);
        const response = await firstValueFrom(this.api.uploadPromptGeneratorFile(form));
        sessionIds.push(response.session_id);
        this.uploadProgress = Math.round(((index + 1) / this.selectedFiles.length) * 100);
      }
      this.sessionId = sessionIds[0];
      this.sessionIds = sessionIds;
      this.uploadProgressLabel = 'All files uploaded successfully';
      this.showToast(this.selectedFiles.length > 1 ? `${this.selectedFiles.length} files uploaded successfully` : 'File uploaded successfully', 'success');
      this.initTheoryQuestions();
      this.goToStep(2);
    } catch (error: any) {
      this.showToast(error?.error?.detail || error?.message || 'Upload failed', 'error');
    } finally {
      this.uploadBusy = false;
    }
  }

  onExamTypeSelect(type: ExamType): void {
    this.examType = type;
    this.mcqEnabled = type !== 'assignment';
    this.initTheoryQuestions();
    this.updatePreview();
  }

  toggleMcq(): void {
    if (this.examType === 'assignment') { this.mcqEnabled = false; return; }
    this.mcqEnabled = !this.mcqEnabled;
  }

  toggleTheory(): void { this.theoryEnabled = !this.theoryEnabled; }

  adjustNumber(field: 'mcqCount' | 'mcqMarks' | 'theoryCount', action: 'inc' | 'dec'): void {
    const step = field === 'mcqMarks' ? 0.5 : 1;
    const min = field === 'mcqMarks' ? 0.5 : 1;
    const max = field === 'mcqMarks' ? 10 : field === 'theoryCount' ? 20 : 100;
    const currentValue = Number(this[field]);
    const nextValue = action === 'inc' ? currentValue + step : currentValue - step;
    const bounded = Math.max(min, Math.min(max, nextValue));
    (this as any)[field] = field === 'mcqMarks' ? Number(bounded.toFixed(1)) : bounded;
    if (field === 'theoryCount') { this.initTheoryQuestions(); }
  }

  onTheoryCountInput(): void {
    this.theoryCount = Math.max(1, Math.min(20, Number(this.theoryCount || 1)));
    this.initTheoryQuestions();
  }

  getQuestionTypeOptions(): { value: QuestionType; label: string }[] {
    if (this.examType === 'assignment') {
      return [{ value: 'descriptive', label: 'Descriptive' }, { value: 'case_study', label: 'Case Study' }];
    }
    if (this.examType === 'quiz') {
      return [{ value: 'short', label: 'Short' }, { value: 'case_study', label: 'Case Study' }];
    }
    return [{ value: 'short', label: 'Short' }, { value: 'descriptive', label: 'Descriptive' }, { value: 'case_study', label: 'Case Study' }];
  }

  onQuestionTypeChange(index: number): void {
    const allowed = this.getQuestionTypeOptions().map((item) => item.value);
    const question = this.theoryQuestions[index];
    if (!allowed.includes(question.question_type)) { question.question_type = allowed[0]; }
  }

  async generatePrompt(): Promise<void> {
    if (!this.sessionId) { this.showToast('Please upload a file first.', 'error'); return; }
    if (!this.examType) { this.showToast('Please select an exam type.', 'error'); return; }
    if (!this.mcqEnabled && !this.theoryEnabled) { this.showToast('Please enable at least one section.', 'error'); return; }
    const maxMarks = this.examConstraints[this.examType].maxMarks;
    if (maxMarks !== null && this.grandTotal > maxMarks) {
      this.showToast(`Total marks (${this.grandTotal}) exceed the ${maxMarks}-mark limit for this exam type.`, 'error');
      return;
    }
    this.generatePromptBusy = true;
    this.showLoading('Building Prompt...', 'Crafting your exam configuration into an AI prompt');
    try {
      const theoryQuestions = this.theoryEnabled ? this.theoryQuestions : [];
      const enrichedTheory = theoryQuestions.map((question) => {
        const level = this.bloomsLevels.find((item) => item.value === question.blooms_level) || this.bloomsLevels[1];
        return { ...question, blooms_label: level.label, blooms_keywords: level.keywords };
      });
      const response = await firstValueFrom(this.api.generatePromptGeneratorPrompt({
        session_id: this.sessionId,
        session_ids: this.sessionIds,
        exam_type: this.examType,
        mcq_count: this.mcqEnabled && this.examType !== 'assignment' ? this.mcqCount : 0,
        mcq_marks: this.mcqEnabled && this.examType !== 'assignment' ? this.mcqMarks : 0,
        theory_questions: enrichedTheory
      }));
      this.generatedPrompt = response.prompt;
      this.hideLoading();
      this.goToStep(3);
      this.showToast('Prompt ready', 'success');
    } catch (error: any) {
      this.hideLoading();
      this.showToast(error?.error?.detail || error?.message || 'Failed to generate prompt', 'error');
    } finally {
      this.generatePromptBusy = false;
    }
  }

  copyPrompt(): void {
    if (!this.generatedPrompt.trim()) { return; }
    navigator.clipboard.writeText(this.generatedPrompt);
    this.showToast('Prompt copied to clipboard', 'success');
  }

  async generateExamNow(): Promise<void> {
    if (!this.sessionId) { return; }
    this.generateExamBusy = true;
    this.showLoading('Generating Exam Paper...', 'AI is analyzing your document and crafting questions');
    try {
      const response = await firstValueFrom(this.api.generatePromptGeneratorExam({ session_id: this.sessionId }));
      this.examContent = this.boldBloomsKeywords(response.exam_content);
      this.updatePreview();
      this.hideLoading();
      this.goToStep(4);
      this.showToast('Exam paper generated successfully', 'success');
      if (response.images_analyzed > 0) {
        this.showToast(response.llava_used ? `${response.images_analyzed} image(s) analyzed with vision AI` : `${response.images_analyzed} image(s) found`, 'info');
      }
    } catch (error: any) {
      this.hideLoading();
      this.showToast(error?.error?.detail || error?.message || 'Generation failed', 'error');
    } finally {
      this.generateExamBusy = false;
    }
  }

  async saveExam(): Promise<void> {
    if (!this.sessionId || !this.examContent.trim()) { this.showToast('Nothing to save.', 'error'); return; }
    try {
      await firstValueFrom(this.api.savePromptGeneratorExam({ session_id: this.sessionId, content: this.examContent }));
      this.showToast('Exam saved successfully', 'success');
    } catch (error: any) {
      this.showToast(error?.error?.detail || error?.message || 'Save failed', 'error');
    }
  }

  async downloadPdf(): Promise<void> {
    if (!this.sessionId || !this.examContent.trim() || this.downloadBusy) { return; }
    this.downloadBusy = true;
    this.showLoading('Creating PDF...', 'Formatting your exam paper for download');
    try {
      const blob = await firstValueFrom(this.api.downloadPromptGeneratorPdf({ session_id: this.sessionId, content: this.examContent }));
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'exam_paper.pdf';
      link.click();
      window.URL.revokeObjectURL(url);
      this.hideLoading();
      this.showToast('PDF downloaded successfully', 'success');
    } catch (error: any) {
      this.hideLoading();
      this.showToast(error?.error?.detail || error?.message || 'PDF generation failed', 'error');
    } finally {
      this.downloadBusy = false;
    }
  }

  togglePreview(): void { this.previewMode = !this.previewMode; this.updatePreview(); }
  updatePreview(): void { this.previewHtml = this.markdownToHtml(this.examContent); }

  showToast(message: string, type: ToastType): void {
    const id = ++this.toastId;
    this.toasts = [...this.toasts, { id, message, type }];
    setTimeout(() => { this.toasts = this.toasts.filter((toast) => toast.id !== id); }, 3500);
  }

  private handleFiles(files: File[]): void {
    const allowed = ['pdf', 'docx', 'ppt', 'pptx'];
    const existing = new Set(this.selectedFiles.map((file) => file.name));
    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!allowed.includes(extension)) { this.showToast(`"${file.name}" skipped - unsupported format.`, 'error'); continue; }
      if (!existing.has(file.name)) { this.selectedFiles.push(file); existing.add(file.name); }
    }
    this.selectedFiles = [...this.selectedFiles];
  }

  private initTheoryQuestions(): void {
    const allowed = this.getQuestionTypeOptions().map((item) => item.value);
    const next: TheoryQuestion[] = [];
    for (let index = 0; index < this.theoryCount; index += 1) {
      const existing = this.theoryQuestions[index];
      next.push({
        marks: existing?.marks ?? (this.examType === 'quiz' ? 5 : 10),
        question_type: existing && allowed.includes(existing.question_type) ? existing.question_type : allowed[0],
        blooms_level: existing?.blooms_level ?? 'understand'
      });
    }
    this.theoryQuestions = next;
  }

  private markdownToHtml(markdown: string): string {
    let html = this.escapeHtml(markdown || '');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^---+$/gm, '<hr>');
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = `<p>${html}</p>`;
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr>)<\/p>/g, '$1');
    return html;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private boldBloomsKeywords(markdown: string): string {
    const allKeywords = [...new Set(this.bloomsLevels.flatMap((level) => level.keywords))];
    let result = markdown;
    for (const keyword of allKeywords) {
      const regex = new RegExp(`(?<!\\*\\*)\\b(${keyword})\\b(?!\\*\\*)`, 'gi');
      result = result.replace(regex, '**$1**');
    }
    return result;
  }

  private showLoading(title: string, subtitle: string): void { this.loading = true; this.loadingTitle = title; this.loadingSubtitle = subtitle; }
  private hideLoading(): void { this.loading = false; }
}
