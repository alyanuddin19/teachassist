"""AI generator utility for the prompt generator module."""

import os
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

LLAMA_GENERATION_MODEL = "llama-3.3-70b-versatile"
LLAMA_GENERATION_CONFIG = {
    "temperature": 0.2,
    "top_p": 0.85,
    "max_tokens": 8192,
    "seed": 42,
}
LLAMA_ASSISTANT_CONFIG = {
    "temperature": 0.3,
    "top_p": 0.85,
    "max_tokens": 1200,
    "seed": 42,
}


def clean_exam_markdown(text: str) -> str:
    replacements = {
        r"\leq": "<=",
        r"\le": "<=",
        r"\geq": ">=",
        r"\ge": ">=",
        r"\neq": "!=",
        r"\times": "x",
        r"\cdot": "*",
        r"\in": "in",
        r"\{": "{",
        r"\}": "}",
        r"\(": "(",
        r"\)": ")",
        r"\[": "[",
        r"\]": "]",
    }
    cleaned = text or ""
    for source, target in replacements.items():
        cleaned = cleaned.replace(source, target)

    cleaned = cleaned.replace("$$", "")
    cleaned = cleaned.replace("$", "")
    cleaned = cleaned.replace("\\", "")
    return cleaned.strip()


def _get_groq_client():
    load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    groq_api_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add it to backend/.env as GROQ_API_KEY=your_key_here."
        )
    return Groq(api_key=groq_api_key)


def generate_exam(
    document_content: str,
    prompt: str,
    exam_type: str,
    mcq_count: int,
    mcq_marks: float,
    theory_questions: list,
    model: str = LLAMA_GENERATION_MODEL,
) -> str:
    del exam_type, mcq_count, mcq_marks, theory_questions

    full_prompt = f"""{prompt}

=== DOCUMENT CONTENT ===
{document_content}
=== END OF DOCUMENT ===

Now generate the complete exam paper based on the above document and instructions.
Use proper markdown formatting with clear headings and question numbering.
Do not use LaTeX delimiters or dollar signs for formulas; write math in plain text such as T = 3, I <= T, and r in {0, 1, 2}.
If multiple source files are represented in the context, distribute the paper evenly across them instead of overusing one source.
"""

    try:
        client = _get_groq_client()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a precise university exam generator. Follow the provided structure exactly. "
                        "Use only the uploaded document context. Keep CLO tags, marks, Bloom levels, and section counts consistent."
                    ),
                },
                {"role": "user", "content": full_prompt},
            ],
            **LLAMA_GENERATION_CONFIG,
        )
        generated = clean_exam_markdown(response.choices[0].message.content or "")
        if not generated:
            raise RuntimeError("LLaMA returned an empty response. Please try again.")
        return generated
    except Exception as exc:
        message = str(exc)
        if "API_KEY" in message or "api key" in message.lower():
            raise RuntimeError("Invalid or missing Groq API key. Check GROQ_API_KEY in backend/.env") from exc
        if "quota" in message.lower() or "429" in message:
            raise RuntimeError("Groq rate limit hit. Wait a minute and try again.") from exc
        raise RuntimeError(f"LLaMA 3.3 70B generation failed: {message}") from exc


def chat_assistant(
    message: str,
    history: list[dict] | None = None,
    role: str = "teacher",
    page: str = "",
    context: str = "",
) -> str:
    conversation = []

    if history:
        for item in history[-8:]:
            speaker = (item.get("role") or "user").strip().lower()
            text = (item.get("content") or "").strip()
            if not text:
                continue
            label = "Assistant" if speaker == "assistant" else "User"
            conversation.append(f"{label}: {text}")

    page_context = f"Current dashboard: {page}." if page else ""
    live_context = f"\nCurrent visible page state:\n{context}\n" if context else ""
    full_prompt = f"""You are the TeachAssist in-app assistant powered by LLaMA 3.3 70B.
The user is a {role} in an education portal.
Answer naturally and helpfully, but stay grounded in the current app screen when the user asks about what is visible or what to do on this page.
Use the current dashboard name, visible page state, and conversation history to understand context before answering.
Do not invent buttons, tabs, fields, records, workflows, or system behavior that are not present in the provided page state.
If the current screen does not show the control or record the user asked about, clearly say it is not visible on this page and answer using only what is actually shown.
If the user asks about TeachAssist behavior beyond the current page, answer from the known app modules only: Profile, Generate, Transform, Gap Analysis, student tasks, marksheets, CLO/CIS mapping, and reports.
Avoid markdown heading symbols, asterisks, bold markers, or decorative formatting. Return clean readable text.
{page_context}
{live_context}

Conversation so far:
{chr(10).join(conversation) if conversation else "No prior conversation."}

User: {message}
Assistant:"""

    try:
        client = _get_groq_client()
        response = client.chat.completions.create(
            model=LLAMA_GENERATION_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a page-aware assistant inside TeachAssist. "
                        "Use supplied page context first, be concise, and do not hallucinate UI controls."
                    ),
                },
                {"role": "user", "content": full_prompt},
            ],
            **LLAMA_ASSISTANT_CONFIG,
        )
        generated = (response.choices[0].message.content or "").strip()
        if not generated:
            raise RuntimeError("LLaMA returned an empty response. Please try again.")
        return generated
    except Exception as exc:
        message_text = str(exc)
        if "API_KEY" in message_text or "api key" in message_text.lower():
            raise RuntimeError("Invalid or missing Groq API key. Check GROQ_API_KEY in backend/.env") from exc
        if "quota" in message_text.lower() or "429" in message_text:
            raise RuntimeError("Groq rate limit hit. Wait a minute and try again.") from exc
        raise RuntimeError(f"LLaMA 3.3 70B assistant failed: {message_text}") from exc


def list_available_models() -> list:
    return [
        LLAMA_GENERATION_MODEL,
        "llama-3.1-70b-versatile",
        "llama-3.1-8b-instant",
    ]
