/* ============================================================
   ExamForge — Frontend JavaScript
   ============================================================ */

const API_BASE = 'http://localhost:5000/api';

// ── Bloom's Taxonomy Levels ────────────────────────────────
const BLOOMS_LEVELS = [
    { value: 'remember',  label: "L1 — Remember",  keywords: ["Define", "List", "Memorize", "Recall", "Repeat", "State", "Identify", "Name"] },
    { value: 'understand',label: "L2 — Understand", keywords: ["Explain", "Summarize", "Paraphrase", "Describe", "Interpret", "Classify", "Compare"] },
    { value: 'apply',     label: "L3 — Apply",      keywords: ["Execute", "Implement", "Solve", "Use", "Demonstrate", "Calculate", "Sketch"] },
    { value: 'analyze',   label: "L4 — Analyze",    keywords: ["Differentiate", "Organize", "Attribute", "Deconstruct", "Outline", "Structure", "Integrate"] },
    { value: 'evaluate',  label: "L5 — Evaluate",   keywords: ["Check", "Critique", "Judge", "Defend", "Appraise", "Argue", "Support", "Conclude"] },
    { value: 'create',    label: "L6 — Create",     keywords: ["Generate", "Plan", "Produce", "Design", "Assemble", "Construct", "Develop", "Write"] },
];

// ── Exam Constraints (marks cap + time) ───────────────────
const EXAM_CONSTRAINTS = {
    quiz:       { maxMarks: null, time: '60 minutes',  timeLabel: '1 hour' },
    mid:        { maxMarks: 20,   time: '90 minutes',  timeLabel: '90 mins' },
    final:      { maxMarks: 50,   time: '3 hours',     timeLabel: '3 hours' },
    assignment: { maxMarks: 20,   time: null,           timeLabel: '' },
};

// ── State ──────────────────────────────────────────────────
const state = {
    sessionId: null,
    currentStep: 1,
    selectedFile: null,
    examConfig: {
        examType: null,
        mcqEnabled: true,
        mcqCount: 10,
        mcqMarks: 1,
        theoryEnabled: true,
        theoryCount: 3,
        theoryQuestions: []
    },
    generatedPrompt: null,
    examContent: null
};

// ── DOM Helpers ────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');

// ── Toast Notifications ────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✕', info: '✦' };
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ── Loading Overlay ────────────────────────────────────────
function showLoading(title = 'Processing...', subtitle = 'Please wait') {
    $('loadingTitle').textContent = title;
    $('loadingSubtitle').textContent = subtitle;
    show($('loadingOverlay'));
}

function hideLoading() {
    hide($('loadingOverlay'));
}

// ── Step Navigation ────────────────────────────────────────
function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    // Show target
    $(`step${step}`).classList.add('active');

    // Update progress indicators
    for (let i = 1; i <= 4; i++) {
        const ind = $(`step-indicator-${i}`);
        ind.classList.remove('active', 'completed');
        if (i < step) ind.classList.add('completed');
        else if (i === step) ind.classList.add('active');
    }

    // Update progress lines
    for (let i = 1; i <= 3; i++) {
        const line = $(`line-${i}-${i + 1}`);
        if (line) {
            line.classList.toggle('active', i < step);
        }
    }

    state.currentStep = step;

    // Scroll to top of wizard
    document.querySelector('.wizard-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── File Upload Logic ──────────────────────────────────────
function initUpload() {
    const zone      = $('uploadZone');
    const fileInput = $('fileInput');

    zone.addEventListener('click', () => fileInput.click());

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) handleFilesSelect(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFilesSelect(fileInput.files);
    });

    $('uploadBtn').addEventListener('click', uploadFiles);
}

function handleFilesSelect(fileList) {
    const allowedExts = ['pdf', 'docx', 'ppt', 'pptx'];
    const newFiles = Array.from(fileList).filter(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        if (!allowedExts.includes(ext)) {
            showToast(`"${f.name}" skipped — unsupported format.`, 'error');
            return false;
        }
        return true;
    });
    if (!newFiles.length) return;

    // Merge with existing selection, avoid duplicates by name
    if (!state.selectedFiles) state.selectedFiles = [];
    const existingNames = new Set(state.selectedFiles.map(f => f.name));
    newFiles.forEach(f => { if (!existingNames.has(f.name)) state.selectedFiles.push(f); });

    renderFileList();
    $('uploadBtn').disabled = state.selectedFiles.length === 0;
}

function renderFileList() {
    const container = $('fileList');
    if (!state.selectedFiles || state.selectedFiles.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    container.innerHTML = state.selectedFiles.map((f, i) => `
        <div class="file-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span class="file-chip-name">${f.name}</span>
            <span class="file-chip-size">${formatFileSize(f.size)}</span>
            <button class="file-chip-remove" data-index="${i}" title="Remove">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.file-chip-remove').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            state.selectedFiles.splice(parseInt(btn.dataset.index), 1);
            renderFileList();
            $('uploadBtn').disabled = state.selectedFiles.length === 0;
        });
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024)    return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

async function uploadFiles() {
    if (!state.selectedFiles || state.selectedFiles.length === 0) return;

    const btn           = $('uploadBtn');
    const btnText       = btn.querySelector('.btn-text');
    const spinner       = btn.querySelector('.btn-spinner');
    const arrow         = btn.querySelector('.btn-arrow');
    const progressBar   = $('uploadProgressBar');
    const progressFill  = $('uploadProgressFill');
    const progressLabel = $('uploadProgressLabel');

    btn.disabled = true;
    show(spinner);
    hide(arrow);
    show(progressBar);

    const total      = state.selectedFiles.length;
    const sessionIds = [];
    const filenames  = [];

    try {
        for (let i = 0; i < total; i++) {
            const file = state.selectedFiles[i];
            btnText.textContent       = `Uploading ${i + 1} of ${total}...`;
            progressLabel.textContent = `Uploading "${file.name}"...`;
            progressFill.style.width  = ((i / total) * 100) + '%';

            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
            const data     = await response.json();

            if (!response.ok) throw new Error(`"${file.name}": ${data.error || 'Upload failed'}`);

            sessionIds.push(data.session_id);
            filenames.push(data.filename);
            progressFill.style.width = (((i + 1) / total) * 100) + '%';
        }

        // Store all session IDs — primary = first file
        state.sessionId  = sessionIds[0];
        state.sessionIds = sessionIds;
        state.filenames  = filenames;

        progressLabel.textContent = 'All files uploaded!';

        setTimeout(() => {
            hide(progressBar);
            const label = total > 1 ? `${total} files uploaded successfully! 🎉` : `"${filenames[0]}" uploaded successfully!`;
            showToast(label, 'success');
            goToStep(2);
            initTheoryQuestions();
        }, 400);

    } catch (err) {
        hide(progressBar);
        showToast(err.message, 'error');
        btnText.textContent = 'Upload & Continue';
        hide(spinner);
        show(arrow);
        btn.disabled = false;
    }
}

// ── Exam Configuration ─────────────────────────────────────
function initConfig() {
    // Exam type selection
    document.querySelectorAll('input[name="examType"]').forEach(radio => {
        radio.addEventListener('change', () => {
            state.examConfig.examType = radio.value;
            handleExamTypeChange(radio.value);
        });
    });

    // MCQ toggle
    $('enableMCQ').addEventListener('change', function () {
        state.examConfig.mcqEnabled = this.checked;
        $('mcqConfig').style.opacity = this.checked ? '1' : '0.4';
        $('mcqConfig').style.pointerEvents = this.checked ? 'auto' : 'none';
        updateTotals();
    });

    // Theory toggle
    $('enableTheory').addEventListener('change', function () {
        state.examConfig.theoryEnabled = this.checked;
        $('theoryConfig').style.opacity = this.checked ? '1' : '0.4';
        $('theoryConfig').style.pointerEvents = this.checked ? 'auto' : 'none';
        updateTotals();
    });

    // Number inputs
    initNumberInput('mcqCount', 1, 100, val => {
        state.examConfig.mcqCount = val;
        updateTotals();
    });
    initNumberInput('mcqMarks', 0.5, 10, val => {
        state.examConfig.mcqMarks = val;
        updateTotals();
    }, 0.5);
    initNumberInput('theoryCount', 1, 20, val => {
        state.examConfig.theoryCount = val;
        initTheoryQuestions();
        updateTotals();
    });

    updateTotals();
}

// ── Handle Exam Type Change ────────────────────────────────
function handleExamTypeChange(type) {
    const mcqSection  = $('enableMCQ').closest('.config-section');
    const isAssignment = type === 'assignment';

    if (isAssignment) {
        // Disable & hide MCQ section for assignments
        $('enableMCQ').checked = false;
        state.examConfig.mcqEnabled = false;
        $('mcqConfig').style.opacity = '0.4';
        $('mcqConfig').style.pointerEvents = 'none';
        mcqSection.style.opacity = '0.4';
        mcqSection.style.pointerEvents = 'none';
        // Add a subtle note
        if (!$('mcqAssignmentNote')) {
            const note = document.createElement('p');
            note.id = 'mcqAssignmentNote';
            note.style.cssText = 'font-size:0.8rem;color:var(--warning);margin-top:0.5rem;font-weight:600;';
            note.textContent = '⚠️ MCQs are not available for Assignments.';
            mcqSection.appendChild(note);
        }
    } else {
        // Restore MCQ section for non-assignments
        $('enableMCQ').checked = true;
        state.examConfig.mcqEnabled = true;
        $('mcqConfig').style.opacity = '1';
        $('mcqConfig').style.pointerEvents = 'auto';
        mcqSection.style.opacity = '1';
        mcqSection.style.pointerEvents = 'auto';
        const note = $('mcqAssignmentNote');
        if (note) note.remove();
    }

    // Re-render theory questions so Bloom's options update
    initTheoryQuestions();
    updateTotals();
}

function initNumberInput(id, min, max, onChange, step = 1) {
    const input = $(id);
    if (!input) return;

    const buttons = document.querySelectorAll(`.num-btn[data-target="${id}"]`);
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            let val = parseFloat(input.value) || 0;
            if (btn.dataset.action === 'inc') val = Math.min(max, val + step);
            else val = Math.max(min, val - step);
            input.value = step < 1 ? val.toFixed(1) : val;
            onChange(parseFloat(input.value));
        });
    });

    input.addEventListener('input', () => {
        let val = parseFloat(input.value) || min;
        val = Math.max(min, Math.min(max, val));
        onChange(val);
    });
}

function initTheoryQuestions() {
    const count = parseInt($('theoryCount').value) || 3;
    const container = $('theoryQuestionsList');
    container.innerHTML = '';

    const existing  = state.examConfig.theoryQuestions;
    const examType  = state.examConfig.examType;
    const isAssignment = examType === 'assignment';
    const isQuiz       = examType === 'quiz';

    // All exam types now get a Question Type dropdown
    const showQType = true;

    // Question type options vary by exam type
    const qtypeOptions = isAssignment
        ? [
            { value: 'descriptive', label: 'Descriptive' },
            { value: 'case_study',  label: 'Case Study'  },
          ]
        : isQuiz
        ? [
            { value: 'short',       label: 'Short'       },
            { value: 'case_study',  label: 'Case Study'  },
          ]
        : [
            { value: 'short',       label: 'Short'       },
            { value: 'descriptive', label: 'Descriptive' },
            { value: 'case_study',  label: 'Case Study'  },
          ];

    const defaultQType  = isAssignment ? 'descriptive' : 'short';
    const defaultBlooms = 'remember';

    state.examConfig.theoryQuestions = [];

    for (let i = 0; i < count; i++) {
        const marks = existing[i] ? existing[i].marks : 10;

        // Resolve question type (guard: assignment can't be 'short')
        let qType = existing[i]?.question_type || defaultQType;
        if (isAssignment && qType === 'short')       qType = 'descriptive';
        if (isQuiz && qType === 'descriptive')        qType = 'short'; // quiz has no descriptive

        // Resolve Bloom's level
        const levelsForType = getBloomsForQType(qType, examType);
        let bloomsVal = existing[i]?.blooms_level || levelsForType[0].value;
        if (!levelsForType.find(l => l.value === bloomsVal)) {
            bloomsVal = levelsForType[0].value;
        }

        state.examConfig.theoryQuestions.push({ marks, blooms_level: bloomsVal, question_type: qType });

        const bloomsOptions    = levelsForType.map(l => `<option value="${l.value}">${l.label}</option>`).join('');
        const qtypeOptionsHtml = qtypeOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join('');

        // All Bloom's levels are always available regardless of question type

        const qtypeHTML = `
            <div class="theory-qtype-input">
                <label>Type:</label>
                <select id="theoryQ${i}Type" class="qtype-select" data-index="${i}">
                    ${qtypeOptionsHtml}
                </select>
            </div>`;

        const item = document.createElement('div');
        item.className = 'theory-question-item';
        item.innerHTML = `
            <span class="theory-q-label">Question ${i + 1}</span>
            ${qtypeHTML}
            <div class="theory-marks-input">
                <label>Marks:</label>
                <input type="number" id="theoryQ${i}Marks"
                       class="theory-marks-field"
                       value="${marks}" min="1" max="100"
                       data-index="${i}">
            </div>
            <div class="theory-blooms-input">
                <label>Bloom's Level:</label>
                <select id="theoryQ${i}Blooms" class="blooms-select" data-index="${i}">
                    ${bloomsOptions}
                </select>
            </div>
        `;
        container.appendChild(item);

        // Set initial values
        const typeSel = item.querySelector(`#theoryQ${i}Type`);
        typeSel.value = qType;
        typeSel.addEventListener('change', function () {
            const idx = parseInt(this.dataset.index);
            state.examConfig.theoryQuestions[idx].question_type = this.value;
            updateBloomsForQuestion(idx, this.value, examType);
        });

        const bloomsSel = item.querySelector(`#theoryQ${i}Blooms`);
        bloomsSel.value = bloomsVal;

        item.querySelector('.theory-marks-field').addEventListener('input', function () {
            const idx = parseInt(this.dataset.index);
            const val = parseInt(this.value) || 1;
            state.examConfig.theoryQuestions[idx].marks = Math.max(1, Math.min(100, val));
            updateTotals();
        });

        bloomsSel.addEventListener('change', function () {
            const idx = parseInt(this.dataset.index);
            state.examConfig.theoryQuestions[idx].blooms_level = this.value;
        });
    }

    updateTotals();
}

// ── All Bloom's levels are always available ──────────────────────────
function getBloomsForQType(qType, examType) {
    // All 6 levels available for every question type and exam type
    return BLOOMS_LEVELS;
}

// ── Live-update Bloom's dropdown when question type changes ────────
function updateBloomsForQuestion(idx, qType, examType) {
    const availableLevels = getBloomsForQType(qType, examType);
    const bloomsSel = $(`theoryQ${idx}Blooms`);
    if (!bloomsSel) return;

    // Rebuild options (always all 6 levels)
    bloomsSel.innerHTML = availableLevels
        .map(l => `<option value="${l.value}">${l.label}</option>`)
        .join('');
    bloomsSel.disabled = false;
    bloomsSel.title    = '';

    // Preserve current selection if still valid (it always will be)
    const current = state.examConfig.theoryQuestions[idx].blooms_level;
    bloomsSel.value = availableLevels.find(l => l.value === current)
        ? current
        : availableLevels[0].value;
    state.examConfig.theoryQuestions[idx].blooms_level = bloomsSel.value;
}

function updateTotals() {
    const mcqTotal = state.examConfig.mcqEnabled
        ? (parseFloat($('mcqCount').value) || 0) * (parseFloat($('mcqMarks').value) || 0)
        : 0;

    const theoryTotal = state.examConfig.theoryEnabled
        ? state.examConfig.theoryQuestions.reduce((s, q) => s + (q.marks || 0), 0)
        : 0;

    const grandTotal = mcqTotal + theoryTotal;

    $('mcqTotalMarks').textContent    = `${mcqTotal} mark${mcqTotal !== 1 ? 's' : ''}`;
    $('theoryTotalMarks').textContent = `${theoryTotal} mark${theoryTotal !== 1 ? 's' : ''}`;

    // Live marks-limit + time indicator
    const ct       = state.examConfig.examType ? (EXAM_CONSTRAINTS[state.examConfig.examType] || {}) : {};
    const cap      = ct.maxMarks;
    const overLimit = cap !== null && cap !== undefined && grandTotal > cap;
    const limitStr  = cap ? ` / ${cap}` : '';
    const timeStr   = ct.timeLabel ? `  ⏱ ${ct.timeLabel}` : '';

    const grandEl = $('grandTotal');
    grandEl.textContent = `${grandTotal}${limitStr}${timeStr}`;
    grandEl.style.color = overLimit ? 'var(--danger, #f87171)' : '';
    grandEl.title       = overLimit
        ? `⚠️ Exceeds ${cap}-mark limit for ${state.examConfig.examType} exam!`
        : '';
}


// ── Generate Prompt ────────────────────────────────────────
async function generatePrompt() {
    if (!state.sessionId) {
        showToast('Please upload a file first.', 'error');
        return;
    }
    if (!state.examConfig.examType) {
        showToast('Please select an exam type.', 'error');
        return;
    }
    if (!state.examConfig.mcqEnabled && !state.examConfig.theoryEnabled) {
        showToast('Please enable at least one section (MCQ or Theory).', 'error');
        return;
    }

    // ── Client-side marks limit check ─────────────────────────────────
    const constraints = EXAM_CONSTRAINTS[state.examConfig.examType] || {};
    if (constraints.maxMarks !== null && constraints.maxMarks !== undefined) {
        const mcqT    = state.examConfig.mcqEnabled
            ? (parseInt($('mcqCount').value) || 0) * (parseFloat($('mcqMarks').value) || 0)
            : 0;
        const theoryT = state.examConfig.theoryEnabled
            ? state.examConfig.theoryQuestions.reduce((s, q) => s + (q.marks || 0), 0)
            : 0;
        const total = mcqT + theoryT;
        if (total > constraints.maxMarks) {
            showToast(
                `⚠️ Total marks (${total}) exceed the ${constraints.maxMarks}-mark limit for this exam type. Please reduce marks or questions.`,
                'error',
                6000
            );
            return;
        }
    }
    // Validate: assignment must have no MCQs (safety guard)
    if (state.examConfig.examType === 'assignment' && state.examConfig.mcqEnabled) {
        showToast('⚠️ Assignments do not support MCQs. MCQ section has been disabled.', 'error', 4000);
        $('enableMCQ').checked = false;
        state.examConfig.mcqEnabled = false;
        return;
    }
    // ─────────────────────────────────────────────────────────────

    showLoading('Building Prompt...', 'Crafting your exam configuration into an AI prompt');

    try {
        const mcqCount = state.examConfig.mcqEnabled ? parseInt($('mcqCount').value) || 0 : 0;
        const mcqMarks = state.examConfig.mcqEnabled ? parseFloat($('mcqMarks').value) || 1 : 0;
        const theoryQuestions = state.examConfig.theoryEnabled ? state.examConfig.theoryQuestions : [];

        // Enrich each theory question with Bloom's keywords before sending
        const enrichedTheory = theoryQuestions.map(q => {
            const level = BLOOMS_LEVELS.find(l => l.value === q.blooms_level) || BLOOMS_LEVELS[1];
            return { ...q, blooms_label: level.label, blooms_keywords: level.keywords };
        });

        const response = await fetch(`${API_BASE}/generate-prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id:  state.sessionId,
                session_ids: state.sessionIds || [state.sessionId],
                exam_type:        state.examConfig.examType,
                mcq_count:        mcqCount,
                mcq_marks:        mcqMarks,
                theory_questions: enrichedTheory
            })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to generate prompt');

        state.generatedPrompt = data.prompt;
        $('promptContent').textContent = data.prompt;

        hideLoading();
        goToStep(3);

        const ct = EXAM_CONSTRAINTS[state.examConfig.examType] || {};
        const timeInfo = ct.time ? ` | ⏱ ${ct.timeLabel}` : '';
        const markInfo = ct.maxMarks ? ` | Max ${ct.maxMarks} marks` : '';
        showToast(`Prompt ready!${markInfo}${timeInfo}`, 'success', 4000);

    } catch (err) {
        hideLoading();
        showToast(err.message, 'error');
    }
}

// ── Copy Prompt ────────────────────────────────────────────
function copyPrompt() {
    if (!state.generatedPrompt) return;
    navigator.clipboard.writeText(state.generatedPrompt).then(() => {
        const btn = $('copyPromptBtn');
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Copied!
        `;
        setTimeout(() => {
            btn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                Copy Prompt
            `;
        }, 1800);
        showToast('Prompt copied to clipboard!', 'success');
    });
}

// ── Generate Exam ──────────────────────────────────────────
async function generateExamNow() {
    const btn = $('generateNowBtn');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    const arrow = btn.querySelector('.btn-arrow');

    btnText.textContent = 'Generating...';
    show(spinner);
    hide(arrow);
    btn.disabled = true;

    showLoading('Generating Exam Paper...', 'AI is analyzing your document and crafting questions');

    try {
        const response = await fetch(`${API_BASE}/generate-exam`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: state.sessionId })
        });

        const data = await response.json();

        hideLoading();

        if (!response.ok) {
            throw new Error(data.error || 'Generation failed');
        }

        state.examContent = data.exam_content;
        const boldedContent = boldBloomsKeywords(data.exam_content);
        $('examEditor').value = boldedContent;
        state.examContent    = boldedContent;
        updatePreview();

        goToStep(4);
        showToast('Exam paper generated successfully! 🎉', 'success', 4000);

        // Notify user if images were found and analyzed
        if (data.images_analyzed > 0) {
            const verb = data.llava_used
                ? `analyzed with vision AI`
                : `found (install llava for image-based questions)`;
            setTimeout(() => {
                showToast(`🖼️ ${data.images_analyzed} image(s) ${verb}`, 'info', 5000);
            }, 1200);
        }

    } catch (err) {
        hideLoading();
        showToast(err.message, 'error', 5000);
    } finally {
        btnText.textContent = 'Generate Now';
        hide(spinner);
        show(arrow);
        btn.disabled = false;
    }
}

// ── Editor ────────────────────────────────────────────────
function initEditor() {
    const editor = $('examEditor');
    let isPreview = false;

    editor.addEventListener('input', () => {
        state.examContent = editor.value;
        if (isPreview) updatePreview();
    });

    $('previewToggle').addEventListener('click', () => {
        isPreview = !isPreview;
        if (isPreview) {
            hide($('editorPane'));
            show($('previewPane'));
            updatePreview();
            $('previewToggle').innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
            `;
        } else {
            show($('editorPane'));
            hide($('previewPane'));
            $('previewToggle').innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview
            `;
        }
    });

    // Bold / Italic formatting
    $('boldBtn').addEventListener('click', () => applyFormat(editor, '**'));
    $('italicBtn').addEventListener('click', () => applyFormat(editor, '*'));
}

function applyFormat(textarea, marker) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);

    textarea.value = `${before}${marker}${selected}${marker}${after}`;
    textarea.selectionStart = start + marker.length;
    textarea.selectionEnd = end + marker.length;
    textarea.focus();
    state.examContent = textarea.value;
}

function updatePreview() {
    const content = $('examEditor').value;
    $('previewContent').innerHTML = markdownToHtml(content);
}

function markdownToHtml(md) {
    let html = escapeHtml(md);

    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rule
    html = html.replace(/^---+$/gm, '<hr>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Code
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr>)<\/p>/g, '$1');

    return html;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── Bold Bloom's action verbs in generated markdown ────────
function boldBloomsKeywords(markdown) {
    // Collect every keyword from all Bloom's levels (de-duplicated)
    const allKeywords = [...new Set(
        BLOOMS_LEVELS.flatMap(l => l.keywords)
    )];

    let result = markdown;

    allKeywords.forEach(kw => {
        // Match the keyword as a whole word (case-insensitive),
        // but only when NOT already inside **...** markers
        // Strategy: replace word boundary matches that are not
        // preceded by ** and not followed by **
        const regex = new RegExp(
            `(?<!\\*\\*)\\b(${kw})\\b(?!\\*\\*)`,
            'gi'
        );
        result = result.replace(regex, '**$1**');
    });

    return result;
}

// ── Save Exam ──────────────────────────────────────────────
async function saveExam() {
    const content = $('examEditor').value;
    if (!content.trim()) {
        showToast('Nothing to save.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/save-exam`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: state.sessionId, content })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        showToast('Exam saved successfully!', 'success');
    } catch (err) {
        showToast(err.message || 'Save failed.', 'error');
    }
}

// ── Download PDF ───────────────────────────────────────────
async function downloadPDF() {
    const content = $('examEditor').value;
    if (!content.trim()) {
        showToast('No content to export.', 'error');
        return;
    }

    const btn = $('downloadPdfBtn');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    const arrow = btn.querySelector('.btn-arrow');

    btnText.textContent = 'Generating PDF...';
    show(spinner);
    hide(arrow);
    btn.disabled = true;

    showLoading('Creating PDF...', 'Formatting your exam paper for download');

    try {
        const response = await fetch(`${API_BASE}/download-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: state.sessionId, content })
        });

        hideLoading();

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'PDF generation failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'exam_paper.pdf';
        a.click();
        URL.revokeObjectURL(url);

        showToast('PDF downloaded successfully! 📄', 'success');

    } catch (err) {
        hideLoading();
        showToast(err.message, 'error');
    } finally {
        btnText.textContent = 'Download PDF';
        hide(spinner);
        show(arrow);
        btn.disabled = false;
    }
}

// ── Event Listeners ────────────────────────────────────────
function initEventListeners() {
    // Step 1
    $('uploadBtn').addEventListener('click', uploadFiles);

    // Step 2
    $('backToStep1').addEventListener('click', () => goToStep(1));
    $('generatePromptBtn').addEventListener('click', generatePrompt);

    // Step 3
    $('backToStep2').addEventListener('click', () => goToStep(2));
    $('copyPromptBtn').addEventListener('click', copyPrompt);
    $('generateNowBtn').addEventListener('click', generateExamNow);
    $('skipGenerateBtn').addEventListener('click', () => {
        // Just go back or show a note that the prompt is ready
        showToast('Prompt is ready. Use it in any AI tool of your choice.', 'info', 4000);
    });

    // Step 4
    $('backToStep3').addEventListener('click', () => goToStep(3));
    $('saveExamBtn').addEventListener('click', saveExam);
    $('downloadPdfBtn').addEventListener('click', downloadPDF);
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initUpload();
    initConfig();
    initEditor();
    initTheoryQuestions();
    initEventListeners();
});
