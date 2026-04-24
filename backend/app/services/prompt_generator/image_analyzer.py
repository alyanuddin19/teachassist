"""Optional image analyzer using Ollama llava for embedded images."""

import base64

import requests


OLLAMA_BASE_URL = "http://localhost:11434"
VISION_MODEL = "llava"
MAX_IMAGES = 10
MIN_IMAGE_SIZE = 1024


def is_llava_available() -> bool:
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            names = [model["name"] for model in response.json().get("models", [])]
            return any("llava" in name.lower() for name in names)
    except Exception:
        pass
    return False


def get_llava_model() -> str:
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            for model in response.json().get("models", []):
                if "llava" in model["name"].lower():
                    return model["name"]
    except Exception:
        pass
    return VISION_MODEL


def analyze_image(image_bytes: bytes, context: str = "", model: str | None = None) -> str:
    model = model or get_llava_model()
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    prompt = (
        "You are analyzing an image extracted from an academic document. "
        "Describe this image thoroughly so that exam questions can be generated from it. "
        "Include the type of visual, visible text, labels, data, trends, and concepts."
    )
    if context:
        prompt = f"[Source: {context}]\n\n{prompt}"

    payload = {
        "model": model,
        "prompt": prompt,
        "images": [image_b64],
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 450},
    }

    try:
        response = requests.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload, timeout=(15, 120))
        response.raise_for_status()
        description = response.json().get("response", "").strip()
        return description or "[Image analyzed but no description returned]"
    except requests.exceptions.Timeout:
        return "[Image analysis timed out - skipped]"
    except requests.exceptions.ConnectionError:
        return "[Ollama not reachable for image analysis]"
    except Exception as exc:
        return f"[Image analysis error: {exc}]"


def analyze_all_images(images: list[tuple[bytes, str]]) -> str:
    if not images:
        return ""

    if not is_llava_available():
        return (
            "\n\n[IMAGE ANALYSIS NOTE: This document contains images, but the 'llava' vision model is not installed in Ollama. "
            "To enable image-based questions run: ollama pull llava]\n"
        )

    descriptions = []
    model = get_llava_model()
    total = min(len(images), MAX_IMAGES)
    for index, (image_bytes, hint) in enumerate(images[:total], 1):
        if not image_bytes or len(image_bytes) < MIN_IMAGE_SIZE:
            continue
        description = analyze_image(image_bytes, context=hint, model=model)
        descriptions.append(f"\n=== IMAGE {index} [{hint}] ===\n{description}\n=== END IMAGE {index} ===")

    skipped = len(images) - total
    result = "\n".join(descriptions)
    if skipped > 0:
        result += f"\n\n[Note: {skipped} additional image(s) in the document were not analyzed due to processing limits.]"
    return result
