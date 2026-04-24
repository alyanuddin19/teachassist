# app/core/generation/base_prompt.py

from typing import Optional


def build_base_prompt(
    *,
    exam_label: str,
    lecture_context: str,
    ui_config: str,
    teacher_prompt: str = "",
) -> str:
    """
    Base prompt used by all exam types.
    - exam_label: "QUIZ", "ASSIGNMENT", "MID/FINAL" (just for wording)
    - lecture_context: text pulled from RAG
    - ui_config: the big string you already build on the Angular side (prompt)
    - teacher_prompt: optional extra notes
    """

    teacher_block = ""
    if teacher_prompt.strip():
        teacher_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEACHER INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{teacher_prompt.strip()}
"""

    return f"""
You are a university exam generator for a {exam_label}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULE: EXACT QUESTION COUNTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When configuration says "MCQs: 5" → Generate EXACTLY 5 MCQs
When configuration says "TOTAL_TASKS: 5" → Generate EXACTLY 5 tasks
When configuration says "Count: 0" → Generate NOTHING for that type.
Always count questions carefully before outputting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT RESTRICTIONS (ABSOLUTE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Use ONLY information from <LECTURE_CONTEXT> for technical details,
   concepts, formulas, steps, & definitions.
2. You MAY invent generic workplace / classroom scenarios (company, team, client),
   but all technical content must match the lecture context.
3. DO NOT invent topics that are not in the lecture.
4. DO NOT reference "Document 1", "Document 2" etc. directly in questions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENARIO FORMAT (WHEN SCENARIOS ARE REQUESTED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 2–4 sentences describing a REAL-WORLD workplace / project / industry situation.
- Then a line starting with "Task:" telling exactly what the student must do.
Example:
"Scenario: You are a data analyst at a retail company...
 Task: Using the techniques from the lecture, design ..."

<LECTURE_CONTEXT>
{lecture_context}
</LECTURE_CONTEXT>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UI CONFIGURATION (FROM FRONTEND)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{ui_config}
{teacher_block}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. First generate ONLY the questions / tasks in the format requested.
2. Then add a blank line and the line:

=== ANSWER KEY ===

3. Then write the answers in the SAME ORDER as the questions.
""".strip()
