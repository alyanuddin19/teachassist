"""Gemini-backed generator utility for the prompt generator module."""

import os
from pathlib import Path

import google.generativeai as genai
from dotenv import load_dotenv

GEMINI_MODEL = "models/gemini-flash-latest"
GENERATION_CONFIG = {
    "temperature": 0.7,
    "top_p": 0.9,
    "max_output_tokens": 8192,
}
SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]


def _get_client():
    load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env as GEMINI_API_KEY=your_key_here."
        )
    genai.configure(api_key=gemini_api_key)
    return genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        generation_config=GENERATION_CONFIG,
        safety_settings=SAFETY_SETTINGS,
    )


def generate_exam(
    document_content: str,
    prompt: str,
    exam_type: str,
    mcq_count: int,
    mcq_marks: float,
    theory_questions: list,
    model: str = GEMINI_MODEL,
) -> str:
    del exam_type, mcq_count, mcq_marks, theory_questions, model

    client = _get_client()
    full_prompt = f"""{prompt}

=== DOCUMENT CONTENT ===
{document_content}
=== END OF DOCUMENT ===

Now generate the complete exam paper based on the above document and instructions.
Use proper markdown formatting with clear headings and question numbering.
If multiple source files are represented in the context, distribute the paper evenly across them instead of overusing one source.
"""

    try:
        response = client.generate_content(full_prompt)
        if not getattr(response, "parts", None):
            raise RuntimeError(f"Gemini blocked the response. Feedback: {getattr(response, 'prompt_feedback', None)}")

        generated = (response.text or "").strip()
        if not generated:
            raise RuntimeError("Gemini returned an empty response. Please try again.")
        return generated
    except Exception as exc:
        message = str(exc)
        if "API_KEY" in message or "api key" in message.lower():
            raise RuntimeError("Invalid or missing Gemini API key. Check GEMINI_API_KEY in backend/.env") from exc
        if "quota" in message.lower() or "429" in message:
            raise RuntimeError("Gemini free-tier rate limit hit. Wait a minute and try again.") from exc
        raise RuntimeError(f"Gemini generation failed: {message}") from exc


def chat_assistant(
    message: str,
    history: list[dict] | None = None,
    role: str = "teacher",
    page: str = "",
) -> str:
    client = _get_client()
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
    full_prompt = f"""You are the TeachAssist in-app AI helper.
You support a {role} inside an education portal.
Keep responses concise, practical, and easy to scan.
Prefer short paragraphs or flat bullets.
If the user asks about using the current system, answer based on the context you were given.
{page_context}

Conversation so far:
{chr(10).join(conversation) if conversation else "No prior conversation."}

User: {message}
Assistant:"""

    try:
        response = client.generate_content(full_prompt)
        if not getattr(response, "parts", None):
            raise RuntimeError(f"Gemini blocked the response. Feedback: {getattr(response, 'prompt_feedback', None)}")

        generated = (response.text or "").strip()
        if not generated:
            raise RuntimeError("Gemini returned an empty response. Please try again.")
        return generated
    except Exception as exc:
        message_text = str(exc)
        if "API_KEY" in message_text or "api key" in message_text.lower():
            raise RuntimeError("Invalid or missing Gemini API key. Check GEMINI_API_KEY in backend/.env") from exc
        if "quota" in message_text.lower() or "429" in message_text:
            raise RuntimeError("Gemini free-tier rate limit hit. Wait a minute and try again.") from exc
        raise RuntimeError(f"Gemini assistant failed: {message_text}") from exc


def list_available_models() -> list:
    try:
        load_dotenv(Path(__file__).resolve().parents[3] / ".env")
        gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        if not gemini_api_key:
            return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"]
        genai.configure(api_key=gemini_api_key)
        return [
            model.name.replace("models/", "")
            for model in genai.list_models()
            if "generateContent" in model.supported_generation_methods
        ]
    except Exception:
        return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"]
