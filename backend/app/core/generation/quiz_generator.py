# backend/app/core/generation/quiz_generator.py
from textwrap import dedent


def build_quiz_prompt(
    lecture_context: str,
    ui_prompt: str,
    teacher_prompt: str,
    num_documents: int,
) -> str:
    """
    Build a QUIZ-only prompt.

    - Uses the UI configuration string (ui_prompt)
    - Uses all lecture documents fairly
    - Forces clear sections + TOTAL MARKS line
    - **STRICT**: never generate question types that are not in ui_prompt
    """

    teacher_block = ""
    if teacher_prompt.strip():
        teacher_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEACHER INSTRUCTIONS (FOLLOW BUT DO NOT VIOLATE COUNTS / BLOOM):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{teacher_prompt.strip()}
"""

    # NOTE:
    # - ui_prompt already contains lines like:
    #   MCQs: EXACTLY N questions (Count: N)
    #   Short Questions: EXACTLY M questions (Count: M)
    #   ...
    #   and it only includes a block if N/M/... > 0
    #
    # We force the model to treat "Count: X" as the ONLY truth, and
    # to treat MISSING blocks as "0 → do not generate that type".

    return dedent(f"""
    You are a university-level QUIZ generator.

    ROLE:
    - You are generating a QUIZ only.
    - You are NOT generating an assignment, midterm, or final.
    - You MUST follow the UI configuration EXACTLY.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    LECTURE CONTENT (ONLY SOURCE OF FACTS)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {lecture_context}
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    END OF LECTURE CONTENT
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    QUIZ CONFIGURATION FROM UI (OBEY EXACTLY)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {ui_prompt}
    {teacher_block}

    STRICT INTERPRETATION OF CONFIG:
    - From the configuration text above, read the lines that start with:
        "MCQs:", "Short Questions:", "Long Questions:", "Scenario Questions:".
    - For EACH type:
        • If such a line exists, read "Count: X" and set that type's COUNT = X.
        • If there is NO line for that type at all, then COUNT = 0.
    - YOU ARE FORBIDDEN to invent or increase any counts.
      If COUNT = 0 → you MUST NOT:
        • create a section heading for that type,
        • create any questions of that type,
        • mention that type in the answer key.

    - Before writing the final answer, you MUST silently (in your head)
      compute and remember these four integers:
        MCQ_COUNT, SHORT_COUNT, LONG_COUNT, SCENARIO_COUNT
      using the rule above.
      Do NOT print this checklist in the output.

    TOTAL MARKS RULE:
    - Compute TOTAL_MARKS as:
        (MCQ_COUNT * marks_per_mcq)
      + (SHORT_COUNT * marks_per_short)
      + (LONG_COUNT * marks_per_long)
      + (SCENARIO_COUNT * marks_per_scenario)
      where the marks per type are taken from the configuration text.
    - At the VERY TOP of your output, write exactly one line:

        TOTAL MARKS: <number>

      with no extra commentary before or after on that line.

    OUTPUT STRUCTURE (AND NOTHING ELSE):
    After the TOTAL MARKS line, output ONLY:

    1) Sections for the **non-zero** types, in this fixed order:
       - SECTION A – Multiple Choice Questions
       - SECTION B – Short Answer Questions
       - SECTION C – Long Answer Questions
       - SECTION D – Scenario Based Questions

       For each section:
       - If its COUNT = 0, SKIP the entire section completely
         (no heading, no questions, nothing in the answer key).
       - If its COUNT > 0, include the heading and EXACTLY that many questions.

       Example formats (you must adapt marks / counts from config):

       SECTION A – Multiple Choice Questions (1 mark each)
       1. <question stem?>
          A) ...
          B) ...
          C) ...
          D) ...

       SECTION B – Short Answer Questions (5 marks each)
       1. <short question?>
       2. ...

       SECTION C – Long Answer Questions (10 marks each)
       1. <long question?>
       2. ...

       SECTION D – Scenario Based Questions (e.g. 10 marks each)
       For EVERY scenario question:
       - Start with "Scenario:" describing a realistic situation (3–5 sentences)
         connected to the lecture content.
       - On the next line start with "Task:" or "Question:" describing exactly
         what the student must do.

    2) After all questions, output the answer key in the same order.
       The answer key must only contain sections for the types with COUNT > 0.

       === ANSWER KEY ===

       SECTION A – Multiple Choice Questions
       1. <correct option letter>
       2. ...

       SECTION B – Short Answer Questions
       1. <short model answer>
       ...

       SECTION C – Long Answer Questions
       1. <main points that must appear>
       ...

       SECTION D – Scenario Based Questions
       1. <what an excellent answer should include>
       ...

    HARD RULES (DO NOT BREAK):
    - NEVER create a question type whose COUNT is 0 or whose block
      is missing from the configuration.
    - NEVER change the counts: each type must have EXACTLY its COUNT questions.
    - Do NOT write any explanations, comments, or meta-text outside the
      required exam sections and the answer key.
    - Use only the lecture content as the factual basis.
    - Use the Bloom levels and difficulty exactly as described in the configuration.
    """).strip()
