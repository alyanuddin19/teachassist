import { Component, HostListener, OnInit } from '@angular/core';
import { GapAnalysisService } from '../services/gap-analysis.service';
import { Chart, registerables } from 'chart.js';
import jsPDF from 'jspdf';

Chart.register(...registerables);

@Component({
  selector: 'app-gap-analysis',
  templateUrl: './gap-analysis.component.html',
  styleUrls: ['./gap-analysis.screen.css']
})
export class GapAnalysisComponent implements OnInit {

  questionPaper!: File;
  marksheet!: File;
  cisFile!: File;
  result: any   = null;
  loading       = false;

  // Modal
  showModal        = false;
  difficultyLevel  = 'Moderate';
  cloQuestionMap:  { [clo: string]: number } = {};
  selectedStudent: any = null;

  // Per-student
  weakStudents:      any[] = [];
  generatedStudents: { [name: string]: any }     = {};
  loadingStudents:   { [name: string]: boolean } = {};
  studentRollNos:    { [name: string]: string }  = {};
  referenceFiles:    { [name: string]: File | null } = {};
  sendingTasks:      { [name: string]: boolean } = {};
  sentTasks:         { [name: string]: string }  = {};
  courseTitle = '';
  detectedCourseCode = '';
  thresholdPercentage: number | null = null;
  cloWarning = '';
  recoGenerated    = false;
  showAssignments  = false;
  isCompactPortrait = false;
  sectionState: Record<string, boolean> = {
    chart: true,
    questionTable: true,
    cloTable: true
  };

  chart: Chart | null = null;

  constructor(private service: GapAnalysisService) {}

  ngOnInit(): void {
    this.syncViewportState();
    this.loadTransformPrefill();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.syncViewportState();
  }

  onQuestionPaper(e: any) { this.questionPaper = e.target.files[0]; }
  onMarksheet(e: any)     { this.marksheet     = e.target.files[0]; }
  onCisFile(e: any)       { this.cisFile       = e.target.files[0]; }
  onReferenceFile(studentName: string, e: any) {
    this.referenceFiles[studentName] = e.target.files?.[0] || null;
  }

  analyze() {
    if (!this.questionPaper || !this.marksheet) {
      alert('Please upload both files');
      return;
    }
    this.loading          = true;
    this.weakStudents     = [];
    this.generatedStudents = {};
    this.recoGenerated    = false;
    this.showAssignments  = false;
    this.courseTitle = '';
    this.detectedCourseCode = '';
    this.thresholdPercentage = null;
    this.cloWarning = '';

    const teacherName = (localStorage.getItem('teacherName') || '').trim();
    if (!teacherName) {
      alert('Teacher session missing. Please log in again.');
      this.loading = false;
      return;
    }

    this.service.analyze(this.questionPaper, this.marksheet, teacherName).subscribe({
      next: (res) => {
        this.result  = res;
        this.courseTitle = res.course_name || '';
        this.detectedCourseCode = res.course_code || '';
        this.thresholdPercentage = this.extractThresholdPercentage(res);
        this.cloWarning = res.clo_warning || '';
        this.loading = false;
        this.resetSectionState();
        setTimeout(() => this.renderChart(), 300);
      },
      error: (err) => {
        alert('Backend error: ' + (err.error?.detail || 'Unknown error'));
        this.loading = false;
      }
    });
  }

  fetchWeakStudents() {
    if (!this.cisFile) { alert('Please upload CIS file first!'); return; }
    const teacherName = (localStorage.getItem('teacherName') || '').trim();
    if (!teacherName) {
      alert('Teacher session missing. Please log in again.');
      return;
    }
    this.loading = true;

    this.service.analyzeWithRecommendations(
      this.questionPaper,
      this.marksheet,
      this.cisFile,
      'Moderate',
      teacherName
    ).subscribe({
      next: (res) => {
        this.weakStudents    = res.weak_students || [];
        this.courseTitle     = res.course_title || this.courseTitle;
        this.detectedCourseCode = res.course_code || this.detectedCourseCode;
        this.thresholdPercentage = this.extractThresholdPercentage(res);
        this.cloWarning = res.clo_warning || this.cloWarning || '';
        for (const student of this.weakStudents) {
          this.studentRollNos[student.student_name] = student.roll_no || '';
        }
        this.recoGenerated   = true;
        this.showAssignments = true;
        this.loading         = false;
      },
      error: (err) => {
        alert('Error: ' + (err.error?.detail || 'Unknown error'));
        this.loading = false;
      }
    });
  }

  openGenerateModal(student: any) {
    this.selectedStudent = student;
    this.cloQuestionMap  = {};
    this.difficultyLevel = 'Moderate';
    for (const clo of student.weak_clos) {
      this.cloQuestionMap[clo] = 3;
    }
    this.showModal = true;
  }

  closeModal() { this.showModal = false; }

  getCloList(): string[] {
    return Object.keys(this.cloQuestionMap);
  }

  confirmGenerate() {
    this.showModal = false;
    this.loadingStudents[this.selectedStudent.student_name] = true;
    // ← Pehle clear karo taake regenerate ho sake
    delete this.generatedStudents[this.selectedStudent.student_name];

    this.service.generateForStudent(
      this.questionPaper,
      this.marksheet,
      this.cisFile,
      this.selectedStudent.student_name,
      this.selectedStudent.weak_clos,
      this.cloQuestionMap,
      this.difficultyLevel
    ).subscribe({
      next: (res) => {
        this.generatedStudents[this.selectedStudent.student_name] = res.assignment;
        if (res.course_title) {
          this.courseTitle = res.course_title;
        }
        this.loadingStudents[this.selectedStudent.student_name]   = false;
      },
      error: (err) => {
        alert('Error: ' + (err.error?.detail || 'Unknown error'));
        this.loadingStudents[this.selectedStudent.student_name] = false;
      }
    });
  }

  getCloKeys(assignment: any): string[] {
    if (!assignment) return [];
    return Object.keys(assignment);
  }

  get weakOnlyStudents(): any[] {
    return this.weakStudents.filter(s => s.has_weakness);
  }

  toggleSection(section: 'chart' | 'questionTable' | 'cloTable'): void {
    this.sectionState[section] = !this.sectionState[section];
  }

  isSectionOpen(section: 'chart' | 'questionTable' | 'cloTable'): boolean {
    return !this.isCompactPortrait || !!this.sectionState[section];
  }

  sendGeneratedTask(student: any) {
    const teacherName = (localStorage.getItem('teacherName') || '').trim();
    const rollNo = (this.studentRollNos[student.student_name] || '').trim().toUpperCase();
    const assignment = this.generatedStudents[student.student_name];

    if (!teacherName) {
      alert('Teacher session missing. Please log in again.');
      return;
    }

    if (!assignment) {
      alert('Generate a question set first.');
      return;
    }

    if (!rollNo) {
      alert('Student roll number was not found in the uploaded marksheet.');
      return;
    }

    this.sendingTasks[student.student_name] = true;
    this.sentTasks[student.student_name] = '';

    const formData = new FormData();
    formData.append('teacher_name', teacherName);
    formData.append('student_roll_no', rollNo);
    formData.append('title', this.courseTitle || `Practice Task for ${student.student_name}`);
    formData.append('description', `Personalized questions prepared for ${student.student_name}.`);
    formData.append('question_content', this.buildAssignmentText(assignment));
    formData.append('clo', (student.weak_clos || []).join(', '));
    formData.append('course_code', this.detectedCourseCode);
    formData.append('course_name', this.courseTitle);
    formData.append('source_module', 'gap_analysis');
    const referenceFile = this.referenceFiles[student.student_name];
    if (referenceFile) {
      formData.append('reference_file', referenceFile);
    }

    this.service.sendGeneratedTask(formData).subscribe({
      next: () => {
        this.sendingTasks[student.student_name] = false;
        this.sentTasks[student.student_name] = `Task sent to ${rollNo}`;
      },
      error: (err) => {
        this.sendingTasks[student.student_name] = false;
        alert('Could not send task: ' + (err.error?.detail || 'Unknown error'));
      }
    });
  }

  private buildAssignmentText(assignment: any): string {
    const lines: string[] = [];
    for (const clo of this.getCloKeys(assignment)) {
      lines.push(`${clo}`);
      for (const q of assignment[clo] || []) {
        lines.push(`${q.question_no}. ${q.question}`);
        if (q.hint) {
          lines.push(`Hint: ${q.hint}`);
        }
      }
      lines.push('');
    }
    return lines.join('\n').trim();
  }

  private extractThresholdPercentage(res: any): number {
    const explicit = Number(res?.teacher_threshold_percentage);
    if (!Number.isNaN(explicit) && explicit > 0) {
      return explicit;
    }

    const raw = res?.threshold_percentage?.threshold;
    const parsed = parseFloat(String(raw || '').replace('%', ''));
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }

    return 50;
  }

  private loadTransformPrefill(): void {
    const raw = sessionStorage.getItem('gapAnalysis:transformMarksheet');
    if (!raw) {
      return;
    }

    try {
      const prefill = JSON.parse(raw);
      if (!prefill?.marksheetId) {
        return;
      }

      this.service.downloadTransformMarksheet(prefill.marksheetId).subscribe({
        next: (blob) => {
          const fileName = prefill.fileName || `transform_marksheet_${prefill.marksheetId}.xlsx`;
          this.marksheet = new File([blob], fileName, {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          this.detectedCourseCode = prefill.courseCode || '';
          this.courseTitle = prefill.courseName || '';
          sessionStorage.removeItem('gapAnalysis:transformMarksheet');
        },
        error: () => {
          sessionStorage.removeItem('gapAnalysis:transformMarksheet');
        }
      });
    } catch {
      sessionStorage.removeItem('gapAnalysis:transformMarksheet');
    }
  }

  // ✅ Actual PDF file download — no print dialog
  downloadPDF() {
    const generated = Object.entries(this.generatedStudents);
    if (!generated.length) {
      alert('Pehle kuch students ke liye generate karo!');
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW   = doc.internal.pageSize.getWidth();
    const margin  = 14;
    const maxW    = pageW - margin * 2;
    let y         = 20;

    const addText = (text: string, size: number, bold = false, color = '#000000') => {
      doc.setFontSize(size);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0,2), 16);
      const g = parseInt(hex.substring(2,4), 16);
      const b = parseInt(hex.substring(4,6), 16);
      doc.setTextColor(r, g, b);
    };

    const checkPage = (needed: number) => {
      if (y + needed > 275) { doc.addPage(); y = 20; }
    };

    const wrapText = (text: string, x: number, maxWidth: number, lineH: number): number => {
      const lines = doc.splitTextToSize(text, maxWidth);
      checkPage(lines.length * lineH + 4);
      doc.text(lines, x, y);
      return lines.length * lineH;
    };

    // Title
    addText('Personalized Assignments Report', 18, true, '#1a237e');
    doc.text('Personalized Assignments Report', margin, y);
    y += 10;
    doc.setDrawColor(26, 35, 126);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 8;

    for (const [name, assignment] of generated) {
      const student = this.weakStudents.find(s => s.student_name === name);

      checkPage(20);
      addText(`Student: ${name}`, 14, true, '#283593');
      doc.text(`Student: ${name}`, margin, y);
      y += 6;

      // CLO badges
      addText(`Weak CLOs: ${(student?.weak_clos || []).join(', ')}`, 10, false, '#3949ab');
      doc.text(`Weak CLOs: ${(student?.weak_clos || []).join(', ')}`, margin, y);
      y += 8;

      for (const clo of this.getCloKeys(assignment)) {
        checkPage(16);
        addText(`${clo} — Practice Questions`, 12, true, '#1a73e8');
        doc.text(`${clo} — Practice Questions`, margin, y);
        y += 6;

        // Table header
        const colW = { no: 8, q: 90, marks: 16, cog: 28, hint: maxW - 8 - 90 - 16 - 28 };
        const rowH  = 7;

        checkPage(rowH + 4);
        doc.setFillColor(26, 35, 126);
        doc.rect(margin, y, maxW, rowH, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        let cx = margin + 2;
        doc.text('#',             cx, y + 5); cx += colW.no;
        doc.text('Question',      cx, y + 5); cx += colW.q;
        doc.text('Marks',         cx, y + 5); cx += colW.marks;
        doc.text('Cognitive',     cx, y + 5); cx += colW.cog;
        doc.text('Hint',          cx, y + 5);
        y += rowH;

        // Table rows
        for (const q of (assignment as any)[clo]) {
          const qLines   = doc.splitTextToSize(q.question || '', colW.q - 2);
          const hLines   = doc.splitTextToSize(q.hint     || '—', colW.hint - 2);
          const rowLines = Math.max(qLines.length, hLines.length, 1);
          const rH       = rowLines * 4.5 + 4;

          checkPage(rH);

          // Row background
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, y, maxW, rH, 'F');
          doc.setDrawColor(200, 200, 200);
          doc.rect(margin, y, maxW, rH, 'S');

          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 30, 30);

          cx = margin + 2;
          doc.text(String(q.question_no),      cx, y + 5); cx += colW.no;
          doc.text(qLines,                      cx, y + 5); cx += colW.q;
          doc.text(String(q.marks),             cx, y + 5); cx += colW.marks;

          doc.setTextColor(46, 125, 50);
          doc.text(q.cognitive_level || '—',   cx, y + 5); cx += colW.cog;

          doc.setTextColor(120, 120, 120);
          doc.text(hLines,                      cx, y + 5);

          y += rH;
        }
        y += 6;
      }

      // Page break between students
      doc.addPage();
      y = 20;
    }

    doc.save('personalized_assignments.pdf');
  }

  exportToCSV() {
    if (!this.result?.gap_results) return;
    let csv = 'Question,CLO,Max Marks,Threshold Marks,Students Below,Gap %,Student Names,Status\n';
    this.result.gap_results.forEach((r: any) => {
      csv += `${r.question},${r.clo},${r.max_marks},${r.threshold_marks},${r.students_below_threshold},${r.gap_percentage},"${(r.student_names||[]).join(' | ')}",${r.status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'gap_analysis.csv';
    link.click();
  }

  renderChart() {
    if (!this.result?.gap_results) return;
    if (this.chart) this.chart.destroy();
    const labels = this.result.gap_results.map((r: any) => `${r.question} (${r.clo})`);
    const failed = this.result.gap_results.map((r: any) => r.gap_percentage);
    const passed = failed.map((f: number) => 100 - f);
    const darkMode = typeof document !== 'undefined' && document.body.classList.contains('theme-dark');
    const axisColor = darkMode ? '#d7e3ff' : '#43546d';
    const gridColor = darkMode ? 'rgba(144, 173, 228, 0.14)' : 'rgba(103, 128, 173, 0.16)';
    const canvas = document.getElementById('classChart') as HTMLCanvasElement;
    if (!canvas) return;
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Passed (%)',          data: passed, backgroundColor: '#66bb6a' },
          { label: 'Below Threshold (%)', data: failed, backgroundColor: '#ef5350' }
        ]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, color: axisColor,
        scales: {
          x: {
            max: 100,
            stacked: true,
            title: { display: true, text: 'Class %', color: axisColor },
            ticks: { color: axisColor },
            grid: { color: gridColor }
          },
          y: {
            stacked: true,
            ticks: { color: axisColor },
            grid: { color: gridColor }
          }
        },
        plugins: { legend: { position: 'top', labels: { color: axisColor } } }
      }
    });
  }

  private syncViewportState(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const compact = window.innerWidth <= 820 || (window.innerWidth <= 1080 && window.innerHeight > window.innerWidth);
    const changed = compact !== this.isCompactPortrait;
    this.isCompactPortrait = compact;
    if (changed) {
      this.resetSectionState();
    }
  }

  private resetSectionState(): void {
    const expanded = !this.isCompactPortrait;
    this.sectionState = {
      chart: expanded,
      questionTable: expanded,
      cloTable: expanded
    };
  }
}
