# app/core/generation/midfinal_generator.py

def build_midfinal_prompt(
    ui_prompt: str,
    lecture_context: str,
    teacher_prompt: str = ""
) -> str:
    """
    Build the FINAL LLM prompt for MID / FINAL exams.

    - Uses SECTION A / B / C...
    - Inside each section:
        Multiple Choice Questions (<total MCQ marks> marks)
        Short Answer Questions (<total short marks> marks)
        Long Answer Questions (<total long marks> marks)
        Scenarios (<total scenario marks> marks)
      (skip the block completely if that type has 0 questions)

    - NO marks after individual questions, only in the headings.
    """

    prompt = f"""
You are a precise university MID/FINAL exam generator. Follow EVERY rule exactly.

──────────────── GLOBAL RULES ────────────────
1. Use ONLY the lecture content given in <LECTURE_CONTEXT> for concepts, formulas and facts.
2. Respect Bloom's levels from the configuration for EACH question type and use matching action verbs.
3. If multiple documents are provided, distribute questions fairly across them.
   Do NOT base all questions on only one document.

──────────────── MID / FINAL STRUCTURE RULES ────────────────
For each SECTION:

- Start with: "SECTION X" (for example: "SECTION A", "SECTION B", ...)

- Inside a section, the order of blocks MUST be:

  1) "Multiple Choice Questions (<total MCQ marks> marks)"
     - Generate EXACTLY the number of MCQs given in the config.
     - Do NOT write marks after each question. Marks are ONLY in this heading.

  2) "Short Answer Questions (<total short marks> marks)"
     - Only include this block if short questions > 0.
     - Generate EXACTLY that many short questions.
     - No marks after individual questions.

  3) "Long Answer Questions (<total long marks> marks)"
     - Only include this block if long questions > 0.
     - Generate EXACTLY that many long questions.

  4) "Scenarios (<total scenario marks> marks)"
     - Only include if scenario questions > 0.
     - Each scenario MUST:
         • Describe a realistic, detailed real-world situation (2–4 sentences).
         • Include a line starting with "Task:" describing what the student must do.
         • Use the Bloom level verbs for scenarios from the config.

- For each question type:
    total_marks_for_type = (number_of_questions) × (marks_per_question from config)
  Use this TOTAL in the heading text, not per question.

- Within each block:
    Number questions starting from 1 again:
    1.
    2.
    3.
    ...

──────────────── LECTURE CONTEXT (ONLY SOURCE OF CONTENT) ────────────────
{lecture_context}
──────────────── END CONTEXT ─────────────────────────────────────────────

──────────────── UI CONFIG FROM TEACHER ────────────────
The following text is the raw configuration sent from the frontend
(counts, blooms, marks per question, and section info).
Use it EXACTLY as specification of how many questions to generate
and what marks/Bloom level each type has:

{ui_prompt}
──────────────── END CONFIG ────────────────────────────
"""

    if teacher_prompt.strip():
        prompt += f"""

ADDITIONAL TEACHER INSTRUCTIONS
(Apply these as long as they do NOT break the rules above):
{teacher_prompt}
"""

    prompt += """

Before you output, mentally verify FOR EACH SECTION:
- MCQ count exactly matches config.
- Short, Long, Scenario counts exactly match config.
- Heading marks = question_count × marks_per_question for that type.
- No marks are written after individual questions.
- Scenarios are realistic, detailed, and align with the configured Bloom level.

OUTPUT FORMAT:
- Follow the exact structure:

SECTION A
Multiple Choice Questions (<total MCQ marks> marks)
1. ...
2. ...
[continue]

Short Answer Questions (<total short marks> marks)
1. ...
[continue, if any]

Long Answer Questions (<total long marks> marks)
1. ...
[continue, if any]

Scenarios (<total scenario marks> marks)
1. Scenario: ...
   Task: ...
[continue, if any]

SECTION B
[repeat same pattern for each section]

=== ANSWER KEY ===
SECTION A
Multiple Choice Questions
1. [Answer]
2. [Answer]
...

Short Answer Questions
1. [Answer]
...

[Continue for all sections and types in correct order]

Now generate the complete mid/final exam.
""".lstrip()

    return prompt
