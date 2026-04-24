"""
Prompt builder utility - constructs AI prompts for exam paper generation.
"""

# ── Exam constraints (marks cap + time allowed) ─────────────────────────────
EXAM_CONSTRAINTS = {
    'quiz':       {'max_marks': None, 'time': '60 minutes'},
    'mid':        {'max_marks': 20,   'time': '90 minutes'},
    'final':      {'max_marks': 50,   'time': '3 hours'},
    'assignment': {'max_marks': 20,   'time': 'N/A'},
}


def get_constraints(exam_type: str) -> dict:
    """Return the marks cap and time allowed for a given exam type."""
    return EXAM_CONSTRAINTS.get(exam_type.lower(), {'max_marks': None, 'time': 'N/A'})


def build_prompt(
    filename: str,
    exam_type: str,
    mcq_count: int,
    mcq_marks: float,
    theory_questions: list,
) -> str:
    """
    Build a detailed prompt for exam paper generation.

    Args:
        filename         : Name of the uploaded document
        exam_type        : Type of exam (quiz, mid, final, assignment)
        mcq_count        : Number of MCQs (0 for assignments)
        mcq_marks        : Marks per MCQ
        theory_questions : List of dicts with keys:
                             'marks', 'blooms_level', 'blooms_label',
                             'blooms_keywords', 'question_type'

    Returns:
        Formatted prompt string
    """
    exam_label = {
        'quiz':       'Quiz',
        'mid':        'Mid-Term Examination',
        'final':      'Final Examination',
        'assignment': 'Assignment',
    }.get(exam_type.lower(), exam_type.title())

    constraints  = get_constraints(exam_type)
    time_allowed = constraints['time']
    max_marks    = constraints['max_marks']

    # Calculate totals
    total_mcq_marks    = mcq_count * mcq_marks
    total_theory_marks = sum(q.get('marks', 0) for q in theory_questions)
    grand_total        = total_mcq_marks + total_theory_marks

    lines = [
        f"You are an expert academic examiner. Generate a professional {exam_label} paper"
        f" based on the provided document content.",
        "",
        f"Document     : {filename}",
        f"Exam Type    : {exam_label}",
        f"Total Marks  : {grand_total}",
        f"Time Allowed : {time_allowed}",
        "",
        "=== EXAM STRUCTURE ===",
    ]

    # ── MCQ Section ────────────────────────────────────────────────────────────
    if mcq_count > 0:
        lines.append("\nSection A — Multiple Choice Questions (MCQs)")
        lines.append(f"  * Total Questions : {mcq_count}")
        lines.append(f"  * Marks per MCQ   : {mcq_marks}")
        lines.append(f"  * Section Total   : {total_mcq_marks} marks")
        lines.append("  * Instructions    : Each MCQ must have 4 options (A, B, C, D). Mark the correct answer clearly.")

    # ── Theory / Questions Section ──────────────────────────────────────────────
    if theory_questions:
        section_label = (
            "Section B — Theory / Descriptive Questions"
            if mcq_count > 0
            else "Section A — Questions"
        )
        lines.append(f"\n{section_label}")
        lines.append(f"  * Total Questions : {len(theory_questions)}")

        for i, q in enumerate(theory_questions, 1):
            marks        = q.get('marks', 0)
            blooms_label = q.get('blooms_label', 'L2 - Understand')
            blooms_kws   = q.get('blooms_keywords', ['Explain', 'Describe'])
            q_type       = q.get('question_type', 'descriptive')

            type_label = {
                'short':       'Short Answer',
                'descriptive': 'Descriptive',
                'case_study':  'Case Study',
            }.get(q_type, q_type.replace('_', ' ').title())

            base = (
                f"  * Question {i}: {marks} mark{'s' if marks != 1 else ''}"
                f" | Type: {type_label}"
                f" | Bloom's Level: {blooms_label}"
                f" | Suggested action verbs (pick ONE): {', '.join(blooms_kws)}"
            )

            # ── Case Study: AI must author the scenario itself ────────────────
            if q_type == 'case_study':
                base += (
                    "\n    [CASE STUDY - AI AUTHORED SCENARIO]"
                    "\n    You MUST write this question in two clearly labelled parts:"
                    "\n"
                    "\n    PART 1 - Write the Scenario:"
                    f"\n      - Create a realistic, self-contained case study scenario of 3 to 6 sentences."
                    f"\n      - The scenario MUST be grounded in the key topics of the provided document."
                    f"\n      - Calibrate the complexity to Bloom's {blooms_label}: the scenario should"
                    f" naturally demand {', '.join(blooms_kws[:3])} from the reader."
                    f"\n      - Synthesise and contextualise knowledge from the document — do NOT copy"
                    f" sentences verbatim."
                    f"\n      - Write the scenario under the label:  **Case Study:**"
                    "\n"
                    "\n    PART 2 - Ask the Question:"
                    f"\n      - After the scenario, pose one or more clear, focused question(s) under"
                    f" the label:  **Question:**"
                    f"\n      - The question(s) must reference specific details from the scenario you wrote."
                    f"\n      - Begin the question with a verb from: {', '.join(blooms_kws)}."
                    f"\n      - The question must require the student to engage with the scenario at"
                    f" {blooms_label} cognitive level."
                    "\n"
                    "\n    IMPORTANT: You write the scenario; the student only answers the question."
                    "\n    Do NOT ask the student to 'write', 'create', or 'design' a case study."
                )

            # ── Short Answer: keep it brief ────────────────────────────────────
            elif q_type == 'short':
                base += (
                    "\n    [SHORT ANSWER] Write a concise, direct question."
                    " A complete answer should require no more than 2-3 sentences."
                )

            lines.append(base)

        lines.append(f"  * Section Total   : {total_theory_marks} marks")

    # ── Generation Rules ────────────────────────────────────────────────────────
    lines += [
        "",
        "=== GENERATION RULES ===",
        "1. Base ALL questions strictly on the provided document content.",
        "2. Questions must be relevant, clear, and academically appropriate.",
        "3. Align each question's difficulty with its assigned Bloom's cognitive level.",
        "4. For MCQs: 4 distinct options (A, B, C, D), one correct answer.",
        "5. For theory questions:",
        "   - Match question depth to the marks allocated AND the Bloom's Level assigned.",
        "   - Use ONE action verb from the suggested list — do not use all of them.",
        "   - Incorporate the verb naturally into the question stem.",
        "   - Each question targets only its assigned Bloom's level — do not mix levels.",
        "6. For CASE STUDY questions (labelled [CASE STUDY - AI AUTHORED SCENARIO]):",
        "   - YOU are the author of the case study scenario — not the student.",
        "   - The scenario must be original, realistic, and topically grounded in the document.",
        "   - The scenario complexity must match the specified Bloom's level.",
        "   - Output format for each case study question:",
        "       **Case Study:**",
        "       <3-6 sentence scenario authored by you>",
        "       **Question:**",
        "       <Your question(s) that the student must answer>",
        "   - NEVER instruct the student to write/create/develop their own case study.",
        f"7. Include a proper exam header: Course Name (inferred from document),"
        f" Exam Type ({exam_label}), Total Marks ({grand_total}), Time Allowed ({time_allowed}).",
        "8. Format output as a clean, print-ready exam paper.",
        "9. Do NOT include answer keys in the exam paper body.",
        "10. Separate sections with clear headings; number all questions sequentially.",
        "11. Sections in the document marked '=== IMAGE N [...] ===' are AI-generated descriptions",
        "    of embedded images (diagrams, charts, figures). Treat them as real content and reference",
        "    them in questions where appropriate (e.g. 'Refer to the diagram showing ...').",
        "",
        "=== OUTPUT FORMAT ===",
        "Use markdown formatting:",
        "  - ## for section headings",
        "  - **bold** for question numbers and key instructions",
        "  - Q1, Q2, ... numbering within each section",
        "  - MCQ options: A) B) C) D)",
        "  - Case Study questions: **Case Study:** block, then **Question:**",
        "  - Horizontal rules (---) between sections",
        "",
        f"Generate the complete {exam_label} paper now based on the document content provided.",
    ]

    return "\n".join(lines)
