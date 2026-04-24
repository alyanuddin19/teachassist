import os
import json
import asyncio
import httpx
from typing import List, Dict, Any

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
MODEL        = "llama-3.3-70b-versatile"


def _get_taxonomy_from_cis(clo_label: str, clo_taxonomy: Dict[str, str]) -> str:
    """
    CIS se parse ki hui taxonomy return karo.
    Fallback: CLO-1→C1, CLO-2→C2, CLO-3→C3
    """
    if clo_taxonomy and clo_label in clo_taxonomy:
        return clo_taxonomy[clo_label]
    # Fallback — CLO number se map karo
    import re
    match = re.search(r'(\d+)', clo_label)
    return f"C{match.group(1)}" if match else "C1"


async def generate_personalized_questions(
    student_name: str,
    weak_clos: List[str],
    all_questions: List[Dict[str, Any]],
    cis_weeks: List[Dict[str, Any]] = None,
    clo_taxonomy: Dict[str, str] = None,   # ← NEW: CIS se parsed taxonomy
    clo_question_map: Dict[str, int] = None,
    num_questions_per_clo: int = 3,
    difficulty_level: str = "Moderate"
) -> Dict[str, Any]:

    relevant_questions = [q for q in all_questions if q.get("clo") in weak_clos]
    questions_context  = _format_questions_for_prompt(relevant_questions)
    clos_str           = ", ".join(weak_clos)

    # Har CLO ke liye: question count + CIS se taxonomy level
    clo_counts = ""
    if clo_question_map:
        clo_counts = "\n".join(
            f"  - {clo}: {count} question(s), cognitive_level MUST be \"{_get_taxonomy_from_cis(clo, clo_taxonomy or {})}\""
            for clo, count in clo_question_map.items()
        )
    else:
        clo_counts = "\n".join(
            f"  - {clo}: {num_questions_per_clo} question(s), cognitive_level MUST be \"{_get_taxonomy_from_cis(clo, clo_taxonomy or {})}\""
            for clo in weak_clos
        )

    cis_context = ""
    if cis_weeks:
        from app.services.cis_parser import format_cis_for_prompt
        cis_context = f"""
Course Information Sheet (CIS) Weekly Topics:
{format_cis_for_prompt(cis_weeks)}

Instructions:
- Identify relevant weeks/topics for each weak CLO
- Use topic-specific terminology from CIS
"""

    difficulty_map = {
        "High":     "Challenging — deep analysis, multi-step reasoning, higher-order thinking.",
        "Moderate": "Medium difficulty — application and understanding.",
        "Low":      "Straightforward — recall and basic understanding."
    }
    diff_instruction = difficulty_map.get(difficulty_level, difficulty_map["Moderate"])

    prompt = f"""You are an academic question generator helping a student improve.

Student name: {student_name}
Weak CLOs: {clos_str}
Difficulty Level: {difficulty_level} — {diff_instruction}

IMPORTANT — Generate EXACTLY this many questions per CLO:
{clo_counts}

Original exam questions for context:
{questions_context}
{cis_context}

Rules:
- Generate EXACTLY the number of questions specified for each CLO
- Match the requested difficulty level
- cognitive_level MUST be exactly as specified above (e.g. "C1", "C2", "C3") — do NOT use words like "Apply", "Understand", "Analyze"
- Make questions guided to help the student improve

Respond ONLY in this exact JSON (no markdown, no explanation, no backticks):
{{
  "CLO-2": [
    {{
      "question_no": 1,
      "question": "Full question text here",
      "marks": 5,
      "cognitive_level": "C2",
      "hint": "Short hint to guide the student"
    }}
  ]
}}
Use exact CLO labels provided."""

    return await _call_groq(prompt)


async def _call_groq(prompt: str) -> Dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":      MODEL,
        "max_tokens": 2048,
        "messages":   [{"role": "user", "content": prompt}]
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(GROQ_API_URL, headers=headers, json=payload)
            if response.status_code == 429:
                print("⚠️ Rate limit — 5 sec wait...")
                await asyncio.sleep(5)
                response = await client.post(GROQ_API_URL, headers=headers, json=payload)
            if response.status_code != 200:
                print(f"❌ Status: {response.status_code} | {response.text}")
            response.raise_for_status()
        data     = response.json()
        raw_text = data["choices"][0]["message"]["content"]
        clean    = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(clean)
    except json.JSONDecodeError:
        return {"error": "JSON parse failed", "raw_response": raw_text}
    except Exception as e:
        return {"error": str(e)}


def _format_questions_for_prompt(questions: List[Dict[str, Any]]) -> str:
    if not questions:
        return "  (No original questions available)"
    lines = []
    for q in questions:
        lines.append(f"  [{q.get('clo','?')}] {q.get('id','?')} ({q.get('max_marks',0)} marks): {q.get('text','')[:300]}")
    return "\n".join(lines)