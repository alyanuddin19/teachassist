"""Prompt builder utility - constructs AI prompts for exam paper generation."""

EXAM_CONSTRAINTS = {
    "quiz": {"max_marks": None, "time": "60 minutes"},
    "mid": {"max_marks": 20, "time": "90 minutes"},
    "final": {"max_marks": 50, "time": "3 hours"},
    "assignment": {"max_marks": 20, "time": "N/A"},
}


def get_constraints(exam_type: str) -> dict:
    return EXAM_CONSTRAINTS.get(exam_type.lower(), {"max_marks": None, "time": "N/A"})


def build_prompt(
    filename: str,
    exam_type: str,
    mcq_count: int,
    mcq_marks: float,
    theory_questions: list,
) -> str:
    exam_label = {
        "quiz": "Quiz",
        "mid": "Mid-Term Examination",
        "final": "Final Examination",
        "assignment": "Assignment",
    }.get(exam_type.lower(), exam_type.title())

    constraints = get_constraints(exam_type)
    time_allowed = constraints["time"]

    total_mcq_marks = mcq_count * mcq_marks
    total_theory_marks = sum(question.get("marks", 0) for question in theory_questions)
    grand_total = total_mcq_marks + total_theory_marks

    lines = [
        f"You are an expert academic examiner. Generate a professional {exam_label} paper based on the provided document content.",
        "",
        f"Document     : {filename}",
        f"Exam Type    : {exam_label}",
        f"Total Marks  : {grand_total}",
        f"Time Allowed : {time_allowed}",
        "",
        "=== EXAM STRUCTURE ===",
    ]

    if mcq_count > 0:
        lines.extend([
            "",
            "Section A - Multiple Choice Questions (MCQs)",
            f"  * Total Questions : {mcq_count}",
            f"  * Marks per MCQ   : {mcq_marks}",
            f"  * Section Total   : {total_mcq_marks} marks",
            "  * Instructions    : Each MCQ must have 4 options (A, B, C, D). Mark the correct answer clearly.",
        ])

    if theory_questions:
        section_label = (
            "Section B - Theory / Descriptive Questions"
            if mcq_count > 0
            else "Section A - Questions"
        )
        lines.extend([
            "",
            section_label,
            f"  * Total Questions : {len(theory_questions)}",
        ])

        for index, question in enumerate(theory_questions, 1):
            marks = question.get("marks", 0)
            blooms_label = question.get("blooms_label", "L2 - Understand")
            blooms_keywords = question.get("blooms_keywords", ["Explain", "Describe"])
            question_type = question.get("question_type", "descriptive")

            type_label = {
                "short": "Short Answer",
                "descriptive": "Descriptive",
                "case_study": "Case Study",
            }.get(question_type, question_type.replace("_", " ").title())

            lines.append(
                f"  * Question {index}: {marks} mark{'s' if marks != 1 else ''}"
                f" | Type: {type_label}"
                f" | Bloom's Level: {blooms_label}"
                f" | Suggested action verbs (pick ONE): {', '.join(blooms_keywords)}"
            )

            if question_type == "case_study":
                lines.extend([
                    "    [CASE STUDY - AI AUTHORED SCENARIO]",
                    "    You MUST write this question in two clearly labelled parts:",
                    "",
                    "    PART 1 - Write the Scenario:",
                    "      - Create a realistic, self-contained case study scenario of 3 to 6 sentences.",
                    "      - The scenario MUST be grounded in the key topics of the provided document.",
                    f"      - Calibrate the complexity to Bloom's {blooms_label}.",
                    "      - Write the scenario under the label: **Case Study:**",
                    "",
                    "    PART 2 - Ask the Question:",
                    "      - After the scenario, pose one or more clear, focused question(s) under the label: **Question:**",
                    f"      - Begin the question with a verb from: {', '.join(blooms_keywords)}.",
                    "",
                    "    IMPORTANT: You write the scenario; the student only answers the question.",
                ])
            elif question_type == "short":
                lines.append(
                    "    [SHORT ANSWER] Write a concise, direct question. A complete answer should require no more than 2-3 sentences."
                )

        lines.append(f"  * Section Total   : {total_theory_marks} marks")

    lines.extend([
        "",
        "=== GENERATION RULES ===",
        "1. Base ALL questions strictly on the provided document content.",
        "2. Questions must be relevant, clear, and academically appropriate.",
        "3. Align each question's difficulty with its assigned Bloom's cognitive level.",
        "4. For MCQs: 4 distinct options (A, B, C, D), one correct answer.",
        "5. Match question depth to the marks allocated and Bloom's level assigned.",
        "6. Use ONE action verb from the suggested list for each theory question.",
        "7. For CASE STUDY questions, output **Case Study:** followed by **Question:**.",
        f"8. Include a proper exam header: Course Name (inferred from document), Exam Type ({exam_label}), Total Marks ({grand_total}), Time Allowed ({time_allowed}).",
        "9. Format output as a clean, print-ready exam paper.",
        "10. Do NOT include answer keys in the exam paper body.",
        "11. Separate sections with clear headings and number all questions sequentially.",
        "",
        "=== OUTPUT FORMAT ===",
        "Use markdown formatting:",
        "  - ## for section headings",
        "  - **bold** for question numbers and key instructions",
        "  - Q1, Q2, ... numbering within each section",
        "  - MCQ options: A) B) C) D)",
        "  - Horizontal rules (---) between sections",
        "",
        f"Generate the complete {exam_label} paper now based on the document content provided.",
    ])

    return "\n".join(lines)
