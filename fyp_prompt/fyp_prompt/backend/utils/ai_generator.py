"""
AI Generator utility - uses Google Gemini 1.5 Flash for exam generation.
Fast, high-quality, large context window (1M tokens) — no document truncation.

Setup:
    pip install google-generativeai
    Set your API key in backend/.env  →  GEMINI_API_KEY=your_key_here
    Get a free key at: https://aistudio.google.com/
"""

import os
import google.generativeai as genai

# ── Configuration ──────────────────────────────────────────────────────────────

# Load API key from environment variable (set in .env or system env)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Model: Using gemini-flash-latest as 1.5-flash specific tag is throwing a 404 for this API key.
GEMINI_MODEL = "models/gemini-flash-latest"

# Generation settings
GENERATION_CONFIG = {
    "temperature":      0.7,   # Balance creativity vs accuracy
    "top_p":            0.9,
    "max_output_tokens": 8192, # Enough for a full exam paper
}

# Safety settings — relaxed so academic content isn't blocked
SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]


def _get_client():
    """Initialise and return a configured Gemini GenerativeModel."""
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. "
            "Add it to backend/.env as:  GEMINI_API_KEY=your_key_here\n"
            "Get a free key at: https://aistudio.google.com/"
        )
    genai.configure(api_key=GEMINI_API_KEY)
    return genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        generation_config=GENERATION_CONFIG,
        safety_settings=SAFETY_SETTINGS,
    )


# ── Public API ─────────────────────────────────────────────────────────────────

def generate_exam(
    document_content: str,
    prompt: str,
    exam_type: str,
    mcq_count: int,
    mcq_marks: float,
    theory_questions: list,
    model: str = GEMINI_MODEL,   # kept for API compatibility; Gemini model is used
) -> str:
    """
    Generate an exam paper using Google Gemini 1.5 Flash.

    Args:
        document_content : Full extracted text from the uploaded document
                           (no truncation — Gemini handles up to 1M tokens)
        prompt           : Structured prompt built by prompt_builder
        exam_type        : Type of exam (quiz, mid, final, assignment)
        mcq_count        : Number of MCQs
        mcq_marks        : Marks per MCQ
        theory_questions : List of theory question configs
        model            : Ignored (Gemini model is used); kept for compatibility

    Returns:
        Generated exam paper as a markdown string
    """
    client = _get_client()

    full_prompt = f"""{prompt}

=== DOCUMENT CONTENT ===
{document_content}
=== END OF DOCUMENT ===

Now generate the complete exam paper based on the above document and instructions.
Use proper markdown formatting with clear headings and question numbering.
"""

    try:
        response = client.generate_content(full_prompt)

        # Check for blocked response
        if not response.parts:
            finish = getattr(response, "prompt_feedback", None)
            raise RuntimeError(
                f"Gemini blocked the response. Feedback: {finish}"
            )

        generated = response.text.strip()

        if not generated:
            raise RuntimeError("Gemini returned an empty response. Please try again.")

        return generated

    except Exception as e:
        err = str(e)
        # Re-raise with a user-friendly message
        if "API_KEY" in err or "api key" in err.lower():
            raise RuntimeError(
                "Invalid or missing Gemini API key. "
                "Check your GEMINI_API_KEY in backend/.env"
            )
        if "quota" in err.lower() or "429" in err:
            raise RuntimeError(
                "Gemini free-tier rate limit hit. "
                "Wait a minute and try again, or upgrade your quota at https://aistudio.google.com/"
            )
        raise RuntimeError(f"Gemini generation failed: {err}")


def list_available_models() -> list:
    """
    Return a list of available Gemini model names.
    Falls back to a static list if the API key is not set.
    """
    try:
        if not GEMINI_API_KEY:
            return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"]
        genai.configure(api_key=GEMINI_API_KEY)
        models = genai.list_models()
        return [
            m.name.replace("models/", "")
            for m in models
            if "generateContent" in m.supported_generation_methods
        ]
    except Exception:
        return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"]
