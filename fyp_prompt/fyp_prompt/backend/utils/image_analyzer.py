"""
Image Analyzer utility - uses llava (vision model) via Ollama to describe
images extracted from uploaded documents, enabling image-based exam questions.
"""
import base64
import requests

OLLAMA_BASE_URL = "http://localhost:11434"
VISION_MODEL    = "llava"
MAX_IMAGES      = 10        # Max images analyzed per document (to keep generation fast)
MIN_IMAGE_SIZE  = 1024      # Skip images smaller than 1 KB (icons, bullets, decorators)


# ── Model Discovery ────────────────────────────────────────────────────────────

def is_llava_available() -> bool:
    """Return True if any llava-family model is installed in Ollama."""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if resp.status_code == 200:
            names = [m["name"] for m in resp.json().get("models", [])]
            return any("llava" in n.lower() for n in names)
    except Exception:
        pass
    return False


def get_llava_model() -> str:
    """Return the first available llava model name, or the default."""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if resp.status_code == 200:
            for m in resp.json().get("models", []):
                if "llava" in m["name"].lower():
                    return m["name"]
    except Exception:
        pass
    return VISION_MODEL


# ── Single Image Analysis ──────────────────────────────────────────────────────

def analyze_image(image_bytes: bytes, context: str = "", model: str = None) -> str:
    """
    Analyze a single image using a llava vision model.

    Args:
        image_bytes : Raw image bytes (PNG, JPEG, etc.)
        context     : Human-readable hint about the image's origin (e.g. "PDF page 3")
        model       : Ollama model name; auto-detected from installed models if None

    Returns:
        Educational text description of the image, suitable for exam question generation.
    """
    if model is None:
        model = get_llava_model()

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    prompt = (
        "You are analyzing an image extracted from an academic document. "
        "Describe this image thoroughly so that exam questions can be generated from it. "
        "Include the following in your description:\n"
        "- Type of visual (diagram, flowchart, graph, table, photograph, illustration, etc.)\n"
        "- Any visible text, labels, titles, axes, legends, or annotations\n"
        "- Key data, values, or trends (especially for charts/graphs)\n"
        "- Processes, relationships, or concepts illustrated\n"
        "- Any domain-specific terminology visible\n"
        "Be factual, clear, and thorough — your description will be used to write academic exam questions."
    )
    if context:
        prompt = f"[Source: {context}]\n\n" + prompt

    payload = {
        "model": model,
        "prompt": prompt,
        "images": [image_b64],
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_predict": 450,
        },
    }

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=(15, 120),
        )
        resp.raise_for_status()
        description = resp.json().get("response", "").strip()
        return description if description else "[Image analyzed but no description returned]"

    except requests.exceptions.Timeout:
        return "[Image analysis timed out — skipped]"
    except requests.exceptions.ConnectionError:
        return "[Ollama not reachable for image analysis]"
    except Exception as exc:
        return f"[Image analysis error: {exc}]"


# ── Batch Image Analysis ───────────────────────────────────────────────────────

def analyze_all_images(images: list) -> str:
    """
    Analyze a batch of images and return a formatted multi-image description block.

    Args:
        images: List of (image_bytes: bytes, location_hint: str) tuples

    Returns:
        Formatted string containing all image descriptions, ready to be appended
        to the document text before sending to the exam-generation AI.
        Returns an empty string if no images are provided.
        Returns a warning note if llava is not installed.
    """
    if not images:
        return ""

    if not is_llava_available():
        return (
            "\n\n[IMAGE ANALYSIS NOTE: This document contains images, but the 'llava' "
            "vision model is not installed in Ollama. "
            "To enable image-based questions run:  ollama pull llava]\n"
        )

    model = get_llava_model()
    descriptions = []
    total = min(len(images), MAX_IMAGES)

    for i, (img_bytes, hint) in enumerate(images[:total], 1):
        # Skip empty or suspiciously small images (icons, bullets, decorators)
        if not img_bytes or len(img_bytes) < MIN_IMAGE_SIZE:
            continue
        desc = analyze_image(img_bytes, context=hint, model=model)
        descriptions.append(
            f"\n=== IMAGE {i} [{hint}] ===\n{desc}\n=== END IMAGE {i} ==="
        )

    skipped = len(images) - total
    result   = "\n".join(descriptions)

    if skipped > 0:
        result += (
            f"\n\n[Note: {skipped} additional image(s) in the document were not analyzed "
            "due to processing limits.]"
        )

    return result
