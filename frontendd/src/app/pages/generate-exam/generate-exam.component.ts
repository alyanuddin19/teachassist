import { Component } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-generate-exam',
  templateUrl: './generate-exam.screen.html',
  styleUrls: ['./generate-exam.screen.css']
})
export class GenerateExamComponent {
  generatedExamId: number | null = null;

  teacherName: string = '';



  /* ================= UI ================= */
  sidebarOpen = true;
  loading = false;
  result: string | null = null;

  /* ================= EXAM TYPE ================= */
  examType: 'quiz' | 'assignment' | 'midfinal' = 'quiz';

  get backendExamType(): 'quiz' | 'assignment' | 'midterm' | 'final' {
    if (this.examType === 'midfinal') {
      return 'midterm';
    }
    return this.examType;
  }

  get isQuiz() { return this.examType === 'quiz'; }
  get isAssignment() { return this.examType === 'assignment'; }
  get isMidOrFinal() { return this.examType === 'midfinal'; }
  get assignmentMarksPerTask(): number {
    if (!this.assignmentTasks || this.assignmentTasks <= 0) {
      return 0;
    }
    return Math.round(this.assignmentTotalMarks / this.assignmentTasks);
  }


  isSectionValid(section: any): boolean {
    return (
      Number(section.mcqs) +
      Number(section.shorts) +
      Number(section.longs) +
      Number(section.scenario)
    ) > 0;
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  showComingSoon() {
    alert('Transform – Coming Soon 🚧');
  }

  logout() {
  // clear stored name (optional)
  localStorage.removeItem('teacherName');

  // go back to login page
  this.router.navigate(['/login']);
}

  /* ================= FILES ================= */
  selectedFiles: File[] = [];

  onFileSelected(e: any) {
    this.selectedFiles = Array.from(e.target.files);
    this.updatePrompt();
  }

  get selectedFile(): File | null {
    return this.selectedFiles.length > 0 ? this.selectedFiles[0] : null;
  }

  get canGenerate(): boolean {
    if (this.isQuiz) {
      return (
        this.mcqs +
        this.shorts +
        this.longs +
        this.scenarioQuestions
      ) > 0;
    }

    if (this.isAssignment) {
      return this.assignmentTasks > 0;
    }

    if (this.isMidOrFinal) {
      return this.sections.length > 0 && this.sections.every(s => this.isSectionValid(s));
    }

    return false;
  }

  /* ================= GLOBAL ================= */
  difficulty = 'Medium';

  /* ================= QUIZ ================= */
  mcqs = 0;
  shorts = 0;
  longs = 0;
  scenarioQuestions = 0;

  mcqMarks = 1;
  shortMarks = 5;
  longMarks = 10;
  scenarioMarks = 10;

  mcqBloom = 'Remember';
  shortBloom = 'Understand';
  longBloom = 'Analyze';
  scenarioBloom = 'Apply';

  /* ================= ASSIGNMENT ================= */
  assignmentTotalMarks = 20;
  assignmentTasks = 5;
  assignmentScenarios = 0;  // ✅ NEW: How many of the tasks should be scenarios
  assignmentBloom = 'Apply';

  /* ================= MID / FINAL ================= */
  sections: any[] = [];

  setSectionCount(count: number) {
  const n = Number(count);
  this.sections = [];

  for (let i = 0; i < n; i++) {
    this.sections.push({
      name: String.fromCharCode(65 + i),
      mcqs: 0,
      mcqMarks: 1,
      mcqBloom: 'Remember',
      shorts: 0,
      shortMarks: 5,
      shortBloom: 'Understand',
      longs: 0,
      longMarks: 10,
      longBloom: 'Analyze',
      scenario: 0,
      scenarioMarks: 10,
      scenarioBloom: 'Apply',
      marks: 0
    });
  }

  this.updatePrompt();
}


  /* ================= BLOOM ================= */
  blooms = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

  bloomVerbs: any = {
    Remember: 'define, list, recall, identify, name',
    Understand: 'explain, describe, summarize, interpret',
    Apply: 'apply, demonstrate, use, implement, solve',
    Analyze: 'analyze, compare, differentiate, examine',
    Evaluate: 'evaluate, justify, critique, argue',
    Create: 'design, create, formulate, propose, develop'
  };

  mcqAllowed = ['Remember', 'Understand'];
  shortAllowed = ['Remember', 'Understand', 'Apply', 'Analyze'];
  longAllowed = ['Apply', 'Analyze', 'Evaluate', 'Create'];
  scenarioAllowed = ['Apply', 'Analyze', 'Evaluate', 'Create'];

  isBloomDisabled(
    type: 'mcq' | 'short' | 'long' | 'scenario',
    bloom: string
  ): boolean {
    const map: Record<string, string[]> = {
      mcq: this.mcqAllowed,
      short: this.shortAllowed,
      long: this.longAllowed,
      scenario: this.scenarioAllowed
    };
    return !map[type].includes(bloom);
  }

  /* ================= PROMPT ================= */
  prompt = '';
  teacherPrompt: string = '';

  constructor(
  private api: ApiService,
  private router: Router
) {
  // read teacher name that login.component stored
  this.teacherName = localStorage.getItem('teacherName') || 'Teacher';
  this.updatePrompt();
}

  updatePrompt() {
    let p = '';

        /* =====================================================
       ASSIGNMENT
    ===================================================== */
    if (this.isAssignment) {
      const totalTasks = this.assignmentTasks || 0;

      // clamp scenario tasks
      let scenarioTasks = this.assignmentScenarios || 0;
      if (scenarioTasks < 0) scenarioTasks = 0;
      if (scenarioTasks > totalTasks) scenarioTasks = totalTasks;
      this.assignmentScenarios = scenarioTasks;

      const regularTasks = totalTasks - scenarioTasks;

      const totalMarks = this.assignmentTotalMarks || 0;
      const scenarioMarks = this.scenarioMarks || 0;

      const scenarioTotalMarks = scenarioTasks * scenarioMarks;
      const remainingMarks = Math.max(totalMarks - scenarioTotalMarks, 0);
      const avgRegularMarks =
        regularTasks > 0 ? remainingMarks / regularTasks : 0;

      p += `
EXAM TYPE: ASSIGNMENT
DIFFICULTY: ${this.difficulty}
GLOBAL_BLOOM_LEVEL: ${this.assignmentBloom} (${this.bloomVerbs[this.assignmentBloom]})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK & MARK CONFIGURATION (STRICT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL_TASKS: ${totalTasks}
SCENARIO_TASKS: ${scenarioTasks}
REGULAR_TASKS: ${regularTasks}
TOTAL_MARKS: ${totalMarks}

SCENARIO_MARKS_PER_TASK: ${scenarioMarks}
TOTAL_SCENARIO_MARKS: ${scenarioTotalMarks}
REMAINING_MARKS_FOR_REGULAR_TASKS: ${remainingMarks}
AVERAGE_REGULAR_TASK_MARKS: ${avgRegularMarks.toFixed(1)}

MARKING RULES:
- Each scenario task MUST be worth EXACTLY ${scenarioMarks} marks.
- All remaining ${remainingMarks} marks MUST be distributed across the ${regularTasks} regular tasks.
- Distribute as evenly as possible (some regular tasks may differ by 1 mark).
- The sum of all individual task marks MUST equal ${totalMarks}.

BLOOM RULES:
- EVERY task (regular and scenario) MUST use Bloom level "${this.assignmentBloom}".
- Use verbs like: ${this.bloomVerbs[this.assignmentBloom]}.

SCENARIO RULES:
- The LAST ${scenarioTasks} tasks (Task ${regularTasks + 1} .. Task ${totalTasks}) are SCENARIO tasks.
- Each scenario task MUST have:
  • "Scenario:" line (2–4 sentences, realistic workplace/project situation).
  • "Task:" line (what the student must do using ${this.assignmentBloom} level).

OUTPUT FORMAT (STRICT)
1. Heading "ASSIGNMENT"
2. Line "TOTAL MARKS: ${totalMarks}"
3. Then tasks in order:

   Task 1 (X marks): [Regular task using ${this.assignmentBloom} level verbs]
   ...
   Task ${regularTasks} (X marks): [Regular task]

   Task ${regularTasks + 1} (${scenarioMarks} marks):
     Scenario: [Real-world situation]
     Task: [Action]

   ...
   Task ${totalTasks} (${scenarioMarks} marks):
     Scenario: [Real-world situation]
     Task: [Action]

4. After the tasks, write:

=== ANSWER KEY ===
Task 1: [Answer]
Task 2: [Answer]
...
Task ${totalTasks}: [Answer]
`;
    }

    /* =====================================================
       QUIZ
    ===================================================== */
    /* =====================================================
   QUIZ
===================================================== */
    /* =====================================================
       QUIZ
    ===================================================== */
    else if (this.isQuiz) {
      // ---- marks + counts calculated on frontend ----
      const mcqTotalMarks =
        (this.mcqs || 0) * (this.mcqMarks || 0);
      const shortTotalMarks =
        (this.shorts || 0) * (this.shortMarks || 0);
      const longTotalMarks =
        (this.longs || 0) * (this.longMarks || 0);
      const scenarioTotalMarks =
        (this.scenarioQuestions || 0) * (this.scenarioMarks || 0);

      const totalMarks =
        mcqTotalMarks +
        shortTotalMarks +
        longTotalMarks +
        scenarioTotalMarks;

      let totalQuestions = 0;

      p += `EXAM TYPE: QUIZ

EXPECTED_TOTAL_MARKS: ${totalMarks}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXACT COUNT REQUIREMENTS (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

      // ---------- MCQs ----------
      if (this.mcqs > 0) {
        totalQuestions += this.mcqs;
        p += `
MCQs: EXACTLY ${this.mcqs} questions (Count: ${this.mcqs})
  - Bloom: ${this.mcqBloom} (${this.bloomVerbs[this.mcqBloom]})
  - Marks: ${this.mcqMarks} each
  - Format: Question + four options A)–D)
  - The MAIN verb of each MCQ stem MUST be one of:
    ${this.bloomVerbs[this.mcqBloom]}`;
      }

      // ---------- Shorts ----------
      if (this.shorts > 0) {
        totalQuestions += this.shorts;
        p += `

Short Questions: EXACTLY ${this.shorts} questions (Count: ${this.shorts})
  - Bloom: ${this.shortBloom} (${this.bloomVerbs[this.shortBloom]})
  - Marks: ${this.shortMarks} each
  - Format: Direct question, 2–4 line answer
  - The FIRST verb of each question MUST be one of:
    ${this.bloomVerbs[this.shortBloom]}`;
      }

      // ---------- Longs ----------
      if (this.longs > 0) {
        totalQuestions += this.longs;
        p += `

Long Questions: EXACTLY ${this.longs} questions (Count: ${this.longs})
  - Bloom: ${this.longBloom} (${this.bloomVerbs[this.longBloom]})
  - Marks: ${this.longMarks} each
  - Format: Detailed question, paragraph answer
  - The FIRST verb of each question MUST be one of:
    ${this.bloomVerbs[this.longBloom]}`;
      }

      // ---------- Scenarios ----------
      if (this.scenarioQuestions > 0) {
        totalQuestions += this.scenarioQuestions;
        p += `

Scenario Questions: EXACTLY ${this.scenarioQuestions} questions (Count: ${this.scenarioQuestions})
  - Bloom: ${this.scenarioBloom} (${this.bloomVerbs[this.scenarioBloom]})
  - Marks: ${this.scenarioMarks} each
  - Format: REAL-WORLD scenario (3–5 sentences) + Task line
  - For EACH scenario:
      • "Scenario:" line describes a realistic situation.
      • "Task:" line MUST start with a verb from:
        ${this.bloomVerbs[this.scenarioBloom]}`;
      }

      p += `

TOTAL QUESTIONS TO GENERATE: ${totalQuestions}

MARK & TOTAL RULES:
- You MUST use the line "TOTAL MARKS: ${totalMarks}" at the top of your output.
- Do NOT invent a different number or recalculate; COPY this exact value.

SCENARIO FORMAT (MANDATORY):
For each scenario question:
- Start with "Scenario:" followed by a realistic situation from workplace/industry/project.
- Then "Task:" with a specific action using ${this.scenarioBloom} level verbs.

OUTPUT FORMAT:
- Number questions continuously (1, 2, 3, ...) across ALL types.
- Order: MCQs → Shorts → Longs → Scenarios.

After all questions, write:

=== ANSWER KEY ===
1. [Answer]
2. [Answer]
...
`;
    }




    /* =====================================================
       MID / FINAL
    ===================================================== */
    else if (this.isMidOrFinal) {
      const validSections = this.sections.filter(s => this.isSectionValid(s));

      p += `EXAM TYPE: MID/FINAL (SECTIONED)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL: EXACT COUNT ENFORCEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NUMBER_OF_SECTIONS: ${validSections.length}

BEFORE GENERATING: Count each question type per section and verify exact numbers.
`;

      validSections.forEach((s) => {
  const sectionTotal =
    (Number(s.mcqs) * Number(s.mcqMarks || 1)) +
    (Number(s.shorts) * Number(s.shortMarks || 5)) +
    (Number(s.longs) * Number(s.longMarks || 10)) +
    (Number(s.scenario) * Number(s.scenarioMarks || 10));
    
      s.marks = sectionTotal;


        p += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION ${s.name}: TOTAL MARKS = ${sectionTotal}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        if (Number(s.mcqs) > 0) {
          p += `
  MCQs: EXACTLY ${s.mcqs} questions (Count: ${s.mcqs})
    - Bloom: ${s.mcqBloom} (${this.bloomVerbs[s.mcqBloom]})
    - Marks: ${s.mcqMarks || 1} each
    - Format: Question + A), B), C), D)`;
        }
        
        if (Number(s.shorts) > 0) {
          p += `
  Short Questions: EXACTLY ${s.shorts} questions (Count: ${s.shorts})
    - Bloom: ${s.shortBloom} (${this.bloomVerbs[s.shortBloom]})
    - Marks: ${s.shortMarks || 5} each`;
        }
        
        if (Number(s.longs) > 0) {
          p += `
  Long Questions: EXACTLY ${s.longs} questions (Count: ${s.longs})
    - Bloom: ${s.longBloom} (${this.bloomVerbs[s.longBloom]})
    - Marks: ${s.longMarks || 10} each`;
        }
        
        if (Number(s.scenario) > 0) {
          p += `
  Scenarios: EXACTLY ${s.scenario} questions (Count: ${s.scenario})
    - Bloom: ${s.scenarioBloom} (${this.bloomVerbs[s.scenarioBloom]})
    - Marks: ${s.scenarioMarks || 10} each
    - MUST be REAL-WORLD situations with practical tasks`;
        }
      });

      p += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (REFERENCE DOCUMENT STRUCTURE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

      validSections.forEach((s) => {
        const sectionTotal = 
          (Number(s.mcqs) * Number(s.mcqMarks || 1)) +
          (Number(s.shorts) * Number(s.shortMarks || 5)) +
          (Number(s.longs) * Number(s.longMarks || 10)) +
          (Number(s.scenario) * Number(s.scenarioMarks || 10));

        p += `SECTION ${s.name}: TOTAL MARKS: ${sectionTotal}

`;
        
        if (Number(s.mcqs) > 0) {
          p += `Multiple Choice Questions:

1) [Question] (${s.mcqMarks || 1} marks)
   A) [option]
   B) [option]
   C) [option]
   D) [option]

[Continue for ${s.mcqs} MCQs EXACTLY]

`;
        }
        
        if (Number(s.shorts) > 0) {
          p += `Short Answer Questions: (${s.shortMarks || 5} marks each)

1) [Question]

[Continue for ${s.shorts} questions EXACTLY]

`;
        }
        
        if (Number(s.longs) > 0) {
          p += `Long Answer Questions: (${s.longMarks || 10} marks each)

1) [Question]

[Continue for ${s.longs} questions EXACTLY]

`;
        }
        
        if (Number(s.scenario) > 0) {
          p += `Scenarios: (${s.scenarioMarks || 10} marks each)

1) Scenario: [Real-world situation 2-3 sentences]
   Task: [Specific action using ${s.scenarioBloom} verbs]

[Continue for ${s.scenario} scenarios EXACTLY]

`;
        }
      });

      p += `=== ANSWER KEY ===

`;

      validSections.forEach((s) => {
        p += `SECTION ${s.name}

`;
        
        if (Number(s.mcqs) > 0) {
          p += `Multiple Choice Questions:
1) [Answer]

`;
        }
        
        if (Number(s.shorts) > 0) {
          p += `Short Answer Questions:
1) [Answer]

`;
        }
        
        if (Number(s.longs) > 0) {
          p += `Long Answer Questions:
1) [Answer]

`;
        }
        
        if (Number(s.scenario) > 0) {
          p += `Scenarios:
1) [Answer]

`;
        }
      });

      p += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION CHECKLIST (MANDATORY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before finalizing output, verify:`;

      validSections.forEach((s) => {
        if (Number(s.mcqs) > 0) p += `\n- Section ${s.name}: Generated EXACTLY ${s.mcqs} MCQs?`;
        if (Number(s.shorts) > 0) p += `\n- Section ${s.name}: Generated EXACTLY ${s.shorts} Short questions?`;
        if (Number(s.longs) > 0) p += `\n- Section ${s.name}: Generated EXACTLY ${s.longs} Long questions?`;
        if (Number(s.scenario) > 0) p += `\n- Section ${s.name}: Generated EXACTLY ${s.scenario} Scenarios with REAL-WORLD contexts?`;
      });
    }

    /* =====================================================
       MULTI-DOCUMENT
    ===================================================== */
    if (this.selectedFiles.length > 1) {
      p += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MULTI-DOCUMENT DISTRIBUTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ${this.selectedFiles.length} documents uploaded
- Questions MUST be distributed approximately equally
- Do NOT concentrate on one document`;
    }

    /* =====================================================
       TEACHER NOTES
    ===================================================== */
    if (this.teacherPrompt && this.teacherPrompt.trim().length > 0) {
      p += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEACHER INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${this.teacherPrompt}

Note: Apply while maintaining exact counts and structure.`;
    }

    this.prompt = p.trim();
  }

  /* ================= GENERATE ================= */
  generate() {
    if (!this.selectedFiles || this.selectedFiles.length === 0) {
      alert('Please upload lecture files');
      return;
    }

    if (!this.canGenerate) {
      alert('Please configure at least one question type');
      return;
    }

    const form = new FormData();
    form.append('exam_type', this.backendExamType);
    form.append('prompt', this.prompt);
    form.append('teacher_prompt', this.teacherPrompt || '');

    this.selectedFiles.forEach(file => {
      form.append('files', file);
    });

    this.loading = true;
    this.result = null;

    this.api.generateExam(form).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.result = res.content;
        this.generatedExamId = res.id;
      },
      error: (err: any) => {
        this.loading = false;
        console.error(err);
        alert('Generation failed: ' + (err.error?.detail || 'Unknown error'));
      }
    });
  }

  /* ================= DOWNLOAD ================= */
  download(format: 'pdf' | 'docx') {
    if (!this.generatedExamId) {
      alert('Please generate an exam first');
      return;
    }

    const url = `http://127.0.0.1:8000/api/download/${this.generatedExamId}?format=${format}&include_answers=true`;
    window.open(url, '_blank');
  }
}
