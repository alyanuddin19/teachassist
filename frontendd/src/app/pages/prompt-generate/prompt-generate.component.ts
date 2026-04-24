import { Component } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

type ExamType = 'quiz' | 'mid' | 'final' | 'assignment';
type QuestionType = 'short' | 'descriptive' | 'case_study';

interface BloomLevel {
  value: string;
  label: string;
  keywords: string[];
}

interface TheoryQuestion {
  marks: number;
  question_type: QuestionType;
  blooms_level: string;
}

@Component({
  selector: 'app-prompt-generate',
  templateUrl: './prompt-generate.component.html',
  styleUrls: ['./prompt-generate.component.css']
})
export class PromptGenerateComponent {
  generatedExamId: number | null = null;
  loading = false;
  result = '';
  selectedFiles: File[] = [];
  examType: ExamType = 'quiz';
  mcqEnabled = true;
  mcqCount = 10;
  mcqMarks = 1;
  theoryEnabled = true;
  theoryCount = 3;
  teacherPrompt = '';
  generatedPrompt = '';

  bloomsLevels: BloomLevel[] = [
    { value: 'remember', label: 'L1 - Remember', keywords: ['Define', 'List', 'Recall', 'Identify', 'Name'] },
    { value: 'understand', label: 'L2 - Understand', keywords: ['Explain', 'Summarize', 'Describe', 'Interpret', 'Compare'] },
    { value: 'apply', label: 'L3 - Apply', keywords: ['Apply', 'Use', 'Demonstrate', 'Solve', 'Implement'] },
    { value: 'analyze', label: 'L4 - Analyze', keywords: ['Analyze', 'Differentiate', 'Organize', 'Outline', 'Structure'] },
    { value: 'evaluate', label: 'L5 - Evaluate', keywords: ['Evaluate', 'Critique', 'Judge', 'Defend', 'Support'] },
    { value: 'create', label: 'L6 - Create', keywords: ['Generate', 'Design', 'Develop', 'Construct', 'Produce'] }
  ];

  theoryQuestions: TheoryQuestion[] = [];

  private examConstraints: Record<ExamType, { maxMarks: number | null; time: string }> = {
    quiz: { maxMarks: null, time: '60 minutes' },
    mid: { maxMarks: 20, time: '90 minutes' },
    final: { maxMarks: 50, time: '3 hours' },
    assignment: { maxMarks: 20, time: 'N/A' }
  };

  constructor(private api: ApiService) {
    this.resetTheoryQuestions();
    this.rebuildPrompt();
  }

  get examTypeLabel(): string {
    return this.examType === 'mid' ? 'Mid-Term' : this.examType === 'final' ? 'Final' : this.examType.charAt(0).toUpperCase() + this.examType.slice(1);
  }

  get timeAllowed(): string {
    return this.examConstraints[this.examType].time;
  }

  get totalMarks(): number {
    const mcqTotal = this.mcqEnabled && this.examType !== 'assignment' ? this.mcqCount * this.mcqMarks : 0;
    const theoryTotal = this.theoryEnabled ? this.theoryQuestions.reduce((sum, question) => sum + Number(question.marks || 0), 0) : 0;
    return mcqTotal + theoryTotal;
  }

  get maxMarksLabel(): string {
    const cap = this.examConstraints[this.examType].maxMarks;
    return cap === null ? 'No fixed cap' : `${cap} marks`;
  }

  getQuestionTypeOptions(): { value: QuestionType; label: string }[] {
    if (this.examType === 'assignment') {
      return [
        { value: 'descriptive', label: 'Descriptive' },
        { value: 'case_study', label: 'Case Study' }
      ];
    }

    if (this.examType === 'quiz') {
      return [
        { value: 'short', label: 'Short' },
        { value: 'case_study', label: 'Case Study' }
      ];
    }

    return [
      { value: 'short', label: 'Short' },
      { value: 'descriptive', label: 'Descriptive' },
      { value: 'case_study', label: 'Case Study' }
    ];
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFiles = Array.from(input.files || []);
    this.rebuildPrompt();
  }

  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.selectedFiles = [...this.selectedFiles];
    this.rebuildPrompt();
  }

  onExamTypeChange(): void {
    if (this.examType === 'assignment') {
      this.mcqEnabled = false;
    }
    this.onQuestionTypeChange();
    this.rebuildPrompt();
  }

  onTheoryCountChange(): void {
    this.theoryCount = Math.max(1, Math.min(20, Number(this.theoryCount || 1)));
    this.resetTheoryQuestions();
    this.rebuildPrompt();
  }

  onQuestionTypeChange(): void {
    const allowed = this.getQuestionTypeOptions().map((item) => item.value);
    this.theoryQuestions = this.theoryQuestions.map((question) => ({
      ...question,
      question_type: allowed.includes(question.question_type) ? question.question_type : allowed[0]
    }));
    this.rebuildPrompt();
  }

  rebuildPrompt(): void {
    this.generatedPrompt = this.buildPrompt();
  }

  copyPrompt(): void {
    if (this.generatedPrompt.trim()) {
      navigator.clipboard.writeText(this.generatedPrompt);
    }
  }

  generate(): void {
    if (!this.selectedFiles.length) {
      alert('Please upload lecture files first.');
      return;
    }

    const form = new FormData();
    form.append('exam_type', this.backendExamType());
    form.append('prompt', this.generatedPrompt || this.buildPrompt());
    form.append('teacher_prompt', this.teacherPrompt || '');

    for (const file of this.selectedFiles) {
      form.append('files', file);
    }

    this.loading = true;
    this.result = '';

    this.api.generateExam(form).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.result = res.content;
        this.generatedExamId = res.id;
      },
      error: (err: any) => {
        this.loading = false;
        alert('Generation failed: ' + (err.error?.detail || 'Unknown error'));
      }
    });
  }

  download(format: 'pdf' | 'docx'): void {
    if (!this.generatedExamId) {
      return;
    }

    this.api.downloadExam(this.generatedExamId, format, true).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `assessment.${format}`;
      link.click();
      window.URL.revokeObjectURL(url);
    });
  }

  private backendExamType(): 'quiz' | 'assignment' | 'midterm' | 'final' {
    return this.examType === 'mid' ? 'midterm' : this.examType;
  }

  private resetTheoryQuestions(): void {
    const next: TheoryQuestion[] = [];
    const allowed = this.getQuestionTypeOptions().map((item) => item.value);
    for (let i = 0; i < this.theoryCount; i++) {
      const existing = this.theoryQuestions[i];
      next.push({
        marks: existing?.marks ?? (this.examType === 'quiz' ? 5 : 10),
        question_type: existing && allowed.includes(existing.question_type) ? existing.question_type : allowed[0],
        blooms_level: existing?.blooms_level ?? 'understand'
      });
    }
    this.theoryQuestions = next;
  }

  private buildPrompt(): string {
    const theoryQuestions = this.theoryEnabled ? this.theoryQuestions : [];
    const mcqCount = this.mcqEnabled && this.examType !== 'assignment' ? this.mcqCount : 0;
    const mcqMarks = this.mcqEnabled && this.examType !== 'assignment' ? this.mcqMarks : 0;
    const examLabel = this.examTypeLabel;
    const theoryTotal = theoryQuestions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
    const totalMarks = mcqCount * mcqMarks + theoryTotal;

    const lines: string[] = [
      `You are an expert academic examiner. Generate a professional ${examLabel} paper based on the uploaded lecture files.`,
      '',
      `Exam Type: ${examLabel}`,
      `Total Marks: ${totalMarks}`,
      `Time Allowed: ${this.timeAllowed}`,
      '',
      '=== EXAM STRUCTURE ==='
    ];

    if (mcqCount > 0) {
      lines.push('');
      lines.push('Section A - Multiple Choice Questions');
      lines.push(`- Total Questions: ${mcqCount}`);
      lines.push(`- Marks per MCQ: ${mcqMarks}`);
      lines.push(`- Section Total: ${mcqCount * mcqMarks}`);
      lines.push('- Every MCQ must have 4 options: A, B, C, D.');
    }

    if (theoryQuestions.length > 0) {
      lines.push('');
      lines.push(mcqCount > 0 ? 'Section B - Theory Questions' : 'Section A - Questions');
      lines.push(`- Total Questions: ${theoryQuestions.length}`);

      theoryQuestions.forEach((question, index) => {
        const bloom = this.bloomsLevels.find((level) => level.value === question.blooms_level) || this.bloomsLevels[1];
        const typeLabel =
          question.question_type === 'case_study'
            ? 'Case Study'
            : question.question_type === 'descriptive'
              ? 'Descriptive'
              : 'Short Answer';

        lines.push(
          `- Question ${index + 1}: ${question.marks} marks | Type: ${typeLabel} | Bloom: ${bloom.label} | Suggested verbs: ${bloom.keywords.join(', ')}`
        );

        if (question.question_type === 'case_study') {
          lines.push('  * Write a realistic scenario first, then ask the question under a separate "Question:" line.');
        }
      });

      lines.push(`- Section Total: ${theoryTotal}`);
    }

    if (this.selectedFiles.length > 1) {
      lines.push('');
      lines.push('=== MULTI-DOCUMENT RULES ===');
      lines.push(`- ${this.selectedFiles.length} source files are uploaded.`);
      lines.push('- Distribute questions across the uploaded material instead of focusing on one file only.');
    }

    lines.push('');
    lines.push('=== GENERATION RULES ===');
    lines.push('1. Base all questions strictly on the uploaded lecture content.');
    lines.push('2. Keep the language professional, academic, and print-ready.');
    lines.push('3. Respect marks, Bloom levels, and question types exactly as configured.');
    lines.push('4. Do not include answer keys inside the question body.');
    lines.push('5. Use markdown headings and clean section separation.');

    return lines.join('\n');
  }
}
