# app/core/generation/assignment_generator.py

def build_assignment_prompt(
    lecture_context: str,
    ui_prompt: str,
    teacher_prompt: str,
    num_documents: int,
) -> str:
    """
    Build the final LLM prompt for ASSIGNMENT generation.

    - Uses ui_prompt (built by Angular) for exact counts, marks & Bloom level
    - Forces real-world scenarios
    - Forces equal-ish distribution across multiple lecture files
    """

    multi_doc_block = ""
    if num_documents > 1:
        multi_doc_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MULTI-DOCUMENT CONTENT USE (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- You have {num_documents} lecture documents in <LECTURE_CONTEXT>.
- Distribute tasks across ALL documents, do NOT base everything on just one.
- Each task's technical content must be traceable to some part of the lectures.
"""

    teacher_block = ""
    if teacher_prompt.strip():
        teacher_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEACHER INSTRUCTIONS (HIGH PRIORITY, BUT CANNOT BREAK COUNTS/MARKS):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{teacher_prompt.strip()}
"""

    return f"""You are an expert university teacher creating a graded ASSIGNMENT.

Follow ALL configuration rules from the UI EXACTLY:
- Exact number of TOTAL tasks and SCENARIO tasks
- TOTAL MARKS for the assignment
- Marks per scenario task
- Remaining marks distributed across NON-SCENARIO tasks
- Bloom level and difficulty from configuration

CONTENT RESTRICTIONS (ABSOLUTE)
- Use ONLY concepts and facts from <LECTURE_CONTEXT>.
- You MAY invent realistic company / project / team names for scenarios,
  but all technical work, methods and terminology must come from the lectures.

REAL-WORLD SCENARIOS (MANDATORY)
- Scenario tasks must describe a realistic workplace / project situation
  in 2–4 sentences.
- After the scenario description, you MUST add a line that starts with "Task:"
  describing what the student must do at the given Bloom level.

ASSIGNMENT HEADING & MARKS (STRICT)
- Start output with the heading: ASSIGNMENT
- Next line: TOTAL MARKS: <taken from configuration>
- Each task must show marks in parentheses, e.g. "Task 1 (8 marks): ..."
- The sum of all individual task marks MUST equal TOTAL MARKS.

LECTURE CONTEXT (ONLY SOURCE OF TECHNICAL CONTENT)
<LECTURE_CONTEXT>
{lecture_context}
</LECTURE_CONTEXT>

{multi_doc_block}

CONFIGURATION FROM UI (OBEY STRICTLY)
Below is a structured description of:
- number of tasks,
- number of scenario tasks,
- total marks,
- scenario marks,
- remaining marks for regular tasks,
- Bloom level and difficulty,
and example output structure.

{ui_prompt}

{teacher_block}

OUTPUT FORMAT (STRICT)
1. First line: ASSIGNMENT
2. Second line: TOTAL MARKS: <total marks>
3. Then list tasks in order:

   - Tasks 1..REGULAR_TASKS → REGULAR tasks
     Format:
       Task N (X marks): [direct task statement using required Bloom verbs]

   - Tasks REGULAR_TASKS+1..TOTAL_TASKS → SCENARIO tasks
     Format:
       Task N (SCENARIO_MARKS_PER_TASK marks):
         Scenario: [2–4 sentence real-world situation]
         Task: [what the student must do using the configured Bloom level]

4. After all tasks, write:
   === ANSWER KEY ===
   Then give model answers as:
   Task 1: [Answer]
   Task 2: [Answer]
   ...
   Task TOTAL_TASKS: [Answer]

BEFORE YOU OUTPUT, DOUBLE-CHECK:
- Number of tasks == TOTAL_TASKS from configuration.
- Number of scenario tasks == SCENARIO_TASKS.
- Sum of all task marks == TOTAL_MARKS.
- All tasks use the configured GLOBAL_BLOOM_LEVEL.
"""
