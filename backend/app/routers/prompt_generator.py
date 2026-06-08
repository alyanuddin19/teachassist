from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.services.prompt_generator.ai_generator import LLAMA_GENERATION_MODEL, chat_assistant, generate_exam, list_available_models
from app.services.prompt_generator.file_parser import parse_file
from app.services.prompt_generator.image_analyzer import analyze_all_images, is_llava_available
from app.services.prompt_generator.pdf_exporter import export_to_pdf
from app.services.prompt_generator.prompt_builder import build_prompt, get_constraints
from app.services.prompt_generator.rag_utils import build_balanced_context, chunk_text
from app.services.cis_parser import extract_clo_taxonomy, extract_course_code, extract_course_title


router = APIRouter(prefix="/api/prompt-generator", tags=["prompt-generator"])

UPLOAD_FOLDER = Path(__file__).resolve().parents[1] / "uploads" / "prompt_generator"
GENERATED_FOLDER = Path(__file__).resolve().parents[1] / "generated" / "prompt_generator"
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
GENERATED_FOLDER.mkdir(parents=True, exist_ok=True)
ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "ppt", "pptx", "txt", "tex", "latex"}
sessions: dict[str, dict] = {}

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "based", "be", "by", "for", "from", "in", "into",
    "is", "it", "of", "on", "or", "the", "their", "this", "to", "using", "with",
}

BLOOM_LEVEL_KEYWORDS = {
    "C1": {"define", "list", "memorize", "recall", "repeat", "state", "identify", "name", "fundamental", "basic", "uses"},
    "C2": {"explain", "summarize", "paraphrase", "describe", "interpret", "classify", "compare", "enhance", "technique"},
    "C3": {"execute", "implement", "solve", "use", "demonstrate", "calculate", "sketch", "analyze", "method", "attribute"},
    "C4": {"differentiate", "organize", "attribute", "deconstruct", "outline", "structure", "integrate", "analyze"},
    "C5": {"check", "critique", "judge", "defend", "appraise", "argue", "support", "conclude", "evaluate"},
    "C6": {"generate", "plan", "produce", "design", "assemble", "construct", "develop", "write", "create"},
}

OBE_TOPIC_HINTS = {
    "C1": {"fundamental", "fundamentals", "introduction", "basic", "basics", "uses", "overview", "definition"},
    "C2": {
        "enhance", "enhancement", "filter", "filters", "histogram", "contrast", "intensity", "transform",
        "transformation", "spatial", "frequency", "attribute", "attributes", "extract", "extraction",
    },
    "C3": {
        "analyze", "analysis", "method", "methods", "compare", "comparison", "segmentation", "segment",
        "region", "regions", "edge", "edges", "boundary", "boundaries", "graph", "representation",
        "relational", "object", "objects", "attribute", "attributes",
    },
}


def _bloom_to_cognitive_level(blooms_label: str) -> str:
    label = (blooms_label or "").lower()
    if "l1" in label or "remember" in label:
        return "C1"
    if "l2" in label or "understand" in label:
        return "C2"
    if "l3" in label or "apply" in label:
        return "C3"
    if "l4" in label or "analyze" in label:
        return "C4"
    if "l5" in label or "evaluate" in label:
        return "C5"
    if "l6" in label or "create" in label:
        return "C6"
    return "C2"


def _cognitive_rank(level: str) -> int:
    match = re.search(r"C([1-6])", level or "", re.IGNORECASE)
    return int(match.group(1)) if match else 0


def _is_meaningfully_higher(requested_level: str, matched_level: str) -> bool:
    requested_rank = _cognitive_rank(requested_level)
    matched_rank = _cognitive_rank(matched_level)
    if not requested_rank or not matched_rank:
        return False
    return requested_rank > matched_rank + 1


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    result: set[str] = set()
    for word in words:
        if len(word) < 3 or word in STOPWORDS:
            continue
        result.add(word)
        if word.endswith("ies") and len(word) > 4:
            result.add(f"{word[:-3]}y")
        elif word.endswith("s") and len(word) > 4:
            result.add(word[:-1])
    return result


def _token_sequence(text: str) -> list[str]:
    tokens = []
    for word in re.findall(r"[a-z0-9]+", (text or "").lower()):
        if len(word) < 3 or word in STOPWORDS:
            continue
        tokens.append(word[:-1] if word.endswith("s") and len(word) > 4 else word)
    return tokens


def _ngrams(tokens: list[str], min_size: int = 2, max_size: int = 4) -> set[str]:
    phrases: set[str] = set()
    for size in range(min_size, max_size + 1):
        if len(tokens) < size:
            continue
        for index in range(0, len(tokens) - size + 1):
            phrases.add(" ".join(tokens[index:index + size]))
    return phrases


def _cis_week_token_sets(cis_weeks: list[dict]) -> tuple[list[tuple[dict, set[str]]], set[str]]:
    week_tokens = [(item, _tokens(item.get("topics", ""))) for item in cis_weeks]
    frequency: dict[str, int] = {}
    for _, tokens in week_tokens:
        for token in tokens:
            frequency[token] = frequency.get(token, 0) + 1

    repeated_cutoff = max(2, len(week_tokens) // 3)
    generic_tokens = {
        token
        for token, count in frequency.items()
        if count >= repeated_cutoff or (len(week_tokens) > 1 and count == len(week_tokens))
    }
    return week_tokens, generic_tokens


def _clo_description_from_line(line: str, clo: str) -> str:
    parts = [part.strip() for part in line.split("|") if part.strip()]
    if len(parts) > 1:
        useful = []
        for part in parts:
            if re.fullmatch(r"(?:CLO[\s\-\.]*)?\d+", part, re.IGNORECASE):
                continue
            if re.fullmatch(r"C[1-6]", part, re.IGNORECASE):
                continue
            if re.search(r"\bPLO\b", part, re.IGNORECASE):
                continue
            useful.append(part)
        if useful:
            return " | ".join(useful)

    return re.sub(r"\bCLO[\s\-\.]*\d+\b", "", line, flags=re.IGNORECASE).strip(" -:|")


def _extract_cis_clos(text: str) -> list[dict]:
    taxonomy = extract_clo_taxonomy(text)
    clos: list[dict] = []
    seen: set[str] = set()

    for line in text.splitlines():
        clean = " ".join(line.strip().split())
        if not clean:
            continue
        match = re.search(r"\bCLO[\s\-\.]*(\d+)\b", clean, re.IGNORECASE)
        if not match:
            continue
        clo = f"CLO-{match.group(1)}"
        if clo in seen:
            continue
        seen.add(clo)
        clos.append({
            "clo": clo,
            "cognitive_level": taxonomy.get(clo, ""),
            "description": _clo_description_from_line(clean, clo)[:220],
        })

    for clo, cognitive_level in taxonomy.items():
        if clo not in seen:
            clos.append({"clo": clo, "cognitive_level": cognitive_level, "description": ""})

    clos.sort(key=lambda item: int(re.search(r"\d+", item["clo"]).group(0)) if re.search(r"\d+", item["clo"]) else 999)
    return clos


def _extract_cis_weeks(text: str) -> list[dict]:
    weeks: list[dict] = []
    for line in text.splitlines():
        clean = " ".join(line.strip().split())
        if not clean:
            continue
        match = re.search(r"\b(?:week\s*)?(\d{1,2})\b(?:\s*[\|\-:]\s*|\s+)(.{12,})", clean, re.IGNORECASE)
        if not match:
            continue
        week_no = int(match.group(1))
        if 1 <= week_no <= 18:
            weeks.append({"week": week_no, "topics": match.group(2)[:260]})
    return weeks


def _extract_cis_course_code(text: str) -> str:
    return extract_course_code(text)


def _extract_cis_course_title(text: str) -> str:
    return extract_course_title(text)


def _normalize_exam_header(exam_content: str, course_code: str, course_title: str) -> str:
    target = course_code or "Not specified"
    lines = (exam_content or "").splitlines()
    if not lines:
        return exam_content

    for index, line in enumerate(lines[:12]):
        title_match = re.match(r"^(#{1,6}\s+)([A-Z]{2,5}-\d{2,4}[A-Z]?)\s+(.+)$", line.strip())
        if title_match:
            prefix, _old_code, rest = title_match.groups()
            lines[index] = f"{prefix}{course_code} {rest}" if course_code else f"{prefix}{rest}"
            break

    course_code_line_index = None
    for index, line in enumerate(lines[:15]):
        if re.search(r"\bCourse\s*(?:Code|No|Number|ID)\b", line, re.IGNORECASE):
            course_code_line_index = index
            break

    replacement = f"### Course Code: {target}"
    if course_code_line_index is not None:
        lines[course_code_line_index] = replacement
    else:
        insert_at = 0
        for index, line in enumerate(lines[:8]):
            if line.strip().startswith("#"):
                insert_at = index + 1
                break
        lines.insert(insert_at, replacement)

    if course_title:
        course_name_line_index = None
        for index, line in enumerate(lines[:16]):
            if re.search(r"\bCourse\s*(?:Name|Title)\b", line, re.IGNORECASE):
                course_name_line_index = index
                break
        name_replacement = f"### Course Name: {course_title}"
        if course_name_line_index is not None:
            lines[course_name_line_index] = name_replacement
        else:
            insert_at = min((course_code_line_index or 0) + 1, len(lines))
            lines.insert(insert_at, name_replacement)

    return "\n".join(lines).strip()


def _read_session_text(session_ids: list[str]) -> str:
    chunks = []
    for current_id in session_ids:
        current = sessions.get(current_id)
        if not current:
            continue
        try:
            text, _ = parse_file(current["file_path"], current["file_type"])
        except Exception:
            continue
        if text:
            chunks.append(text)
    return "\n\n".join(chunks)


def _coverage_cutoff(exam_type: str) -> int | None:
    exam = (exam_type or "").lower()
    if exam == "mid":
        return 9
    if exam in {"final", "assignment"}:
        return 18
    return None


def _match_cis_weeks_to_source(cis_weeks: list[dict], source_text: str) -> list[dict]:
    week_tokens, generic_tokens = _cis_week_token_sets(cis_weeks)
    source_sequence = [token for token in _token_sequence(source_text) if token not in generic_tokens]
    source_tokens = set(source_sequence)
    source_phrases = _ngrams(source_sequence)
    matched = []
    for item, raw_topic_tokens in week_tokens:
        topic_tokens = raw_topic_tokens - generic_tokens
        topic_sequence = [token for token in _token_sequence(item.get("topics", "")) if token not in generic_tokens]
        topic_phrases = _ngrams(topic_sequence)
        overlap = source_tokens & topic_tokens
        phrase_overlap = source_phrases & topic_phrases
        topic_density = len(overlap) / max(len(topic_tokens), 1)
        has_strong_match = bool(phrase_overlap) or len(overlap) >= 4 or (len(overlap) >= 3 and topic_density >= 0.5)
        if has_strong_match:
            matched.append({
                **item,
                "matched_terms": sorted(overlap)[:8],
                "matched_phrases": sorted(phrase_overlap)[:5],
            })
    return matched


def _dominant_topic_text(source_text: str, matched_weeks: list[dict]) -> str:
    weekly_topics = " ".join(item.get("topics", "") for item in matched_weeks)
    return f"{weekly_topics}\n{source_text[:5000]}"


def _score_clo_for_obe(item: dict, cognitive_level: str, bloom_text: str, topic_text: str, fallback_index: int) -> int:
    clo_level = item.get("cognitive_level") or ""
    description = item.get("description") or ""
    clo_tokens = _tokens(description)
    topic_tokens = _tokens(topic_text)
    bloom_tokens = _tokens(bloom_text)
    level_tokens = BLOOM_LEVEL_KEYWORDS.get(cognitive_level, set())
    clo_intent_tokens = OBE_TOPIC_HINTS.get(clo_level, set()) | BLOOM_LEVEL_KEYWORDS.get(clo_level, set())

    score = 0
    score += len(topic_tokens & clo_tokens) * 8
    score += len(topic_tokens & clo_intent_tokens) * 10
    score += len(bloom_tokens & clo_tokens) * 4
    score += len(bloom_tokens & clo_intent_tokens) * 5
    score += len(level_tokens & clo_tokens) * 3

    if clo_level == cognitive_level:
        score += 6

    if topic_tokens & OBE_TOPIC_HINTS.get("C3", set()) and (clo_level == "C3" or "analy" in description.lower()):
        score += 30
    if topic_tokens & OBE_TOPIC_HINTS.get("C2", set()) and (clo_level == "C2" or "enhance" in description.lower()):
        score += 24
    if topic_tokens & OBE_TOPIC_HINTS.get("C1", set()) and (clo_level == "C1" or "fundamental" in description.lower()):
        score += 20

    return score - fallback_index


def _map_clo_for_obe(clos: list[dict], cognitive_level: str, bloom_text: str, topic_text: str, fallback_index: int = 0) -> dict | None:
    if not clos:
        return None
    return max(
        clos,
        key=lambda item: _score_clo_for_obe(item, cognitive_level, bloom_text, topic_text, fallback_index),
    )


def _build_clo_mapping(
    cis_session_id: str | None,
    mcq_blooms_label: str,
    theory_questions: list,
    source_session_ids: list[str],
    exam_type: str,
) -> dict:
    if not cis_session_id or cis_session_id not in sessions:
        return {"clos": [], "mcq_clo": "", "mcq_cognitive": "", "theory_questions": theory_questions}

    cis_session = sessions[cis_session_id]
    text, _ = parse_file(cis_session["file_path"], cis_session["file_type"])
    clos = _extract_cis_clos(text)
    cis_weeks = _extract_cis_weeks(text)
    course_code = _extract_cis_course_code(text)
    course_title = _extract_cis_course_title(text)
    source_text = _read_session_text(source_session_ids)
    matched_weeks = _match_cis_weeks_to_source(cis_weeks, source_text)
    topic_text = _dominant_topic_text(source_text, matched_weeks)
    cutoff = _coverage_cutoff(exam_type)
    out_of_scope_weeks = [item for item in matched_weeks if cutoff is not None and item["week"] > cutoff]
    mcq_level = _bloom_to_cognitive_level(mcq_blooms_label)
    mcq_clo = _map_clo_for_obe(clos, mcq_level, mcq_blooms_label, topic_text, 0)
    warnings = []
    if mcq_clo and _is_meaningfully_higher(mcq_level, mcq_clo.get("cognitive_level", "")):
        warnings.append(
            f"MCQ Bloom level {mcq_blooms_label} is higher than the matched {mcq_clo.get('clo')} "
            f"({mcq_clo.get('cognitive_level')}). The uploaded material/CIS appears to support a lower CLO for this topic."
        )

    mapped_questions = []
    for index, question in enumerate(theory_questions):
        level = _bloom_to_cognitive_level(question.get("blooms_label") or question.get("blooms_level") or "")
        blooms_keywords = question.get("blooms_keywords") or []
        if isinstance(blooms_keywords, str):
            blooms_keywords = [blooms_keywords]
        bloom_text = " ".join([
            question.get("blooms_label", ""),
            " ".join(str(keyword) for keyword in blooms_keywords),
            question.get("question_type", ""),
        ])
        mapped = _map_clo_for_obe(clos, level, bloom_text, topic_text, index)
        if mapped and _is_meaningfully_higher(level, mapped.get("cognitive_level", "")):
            warnings.append(
                f"Question {index + 1} Bloom level {question.get('blooms_label') or question.get('blooms_level')} "
                f"is higher than the matched {mapped.get('clo')} ({mapped.get('cognitive_level')}). "
                "Consider lowering the Bloom level or uploading material/CIS coverage for a higher-order CLO."
            )
        mapped_questions.append({
            **question,
            "clo": mapped.get("clo", "") if mapped else "",
            "clo_cognitive": mapped.get("cognitive_level", level) if mapped else level,
            "clo_description": mapped.get("description", "") if mapped else "",
        })

    return {
        "clos": clos,
        "mcq_clo": mcq_clo.get("clo", "") if mcq_clo else "",
        "mcq_cognitive": mcq_clo.get("cognitive_level", mcq_level) if mcq_clo else mcq_level,
        "mcq_description": mcq_clo.get("description", "") if mcq_clo else "",
        "theory_questions": mapped_questions,
        "matched_weeks": matched_weeks,
        "coverage_cutoff": cutoff,
        "out_of_scope_weeks": out_of_scope_weeks,
        "warnings": warnings,
        "course_code": course_code,
        "course_title": course_title,
    }


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@router.get("/models")
def get_models():
    return {"models": list_available_models(), "default": LLAMA_GENERATION_MODEL}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    if not allowed_file(file.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, DOC, DOCX, PPT, and PPTX files are allowed.")

    filename = Path(file.filename).name
    session_id = str(uuid4())
    save_path = UPLOAD_FOLDER / f"{session_id}_{filename}"
    save_path.write_bytes(await file.read())

    sessions[session_id] = {
        "file_path": str(save_path),
        "filename": filename,
        "file_type": filename.rsplit(".", 1)[1].lower(),
    }

    return {
        "session_id": session_id,
        "filename": filename,
        "message": "File uploaded successfully",
    }


@router.post("/generate-prompt")
def generate_prompt(data: dict):
    session_id = data.get("session_id")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=400, detail="Invalid session. Please upload a file first.")

    session_ids = data.get("session_ids", [session_id])
    exam_type = data.get("exam_type")
    mcq_count = data.get("mcq_count", 0)
    mcq_marks = data.get("mcq_marks", 1)
    mcq_blooms_label = data.get("mcq_blooms_label", "L1 - Remember")
    theory_questions = data.get("theory_questions", [])
    cis_session_id = data.get("cis_session_id")

    if not exam_type:
        raise HTTPException(status_code=400, detail="Exam type is required")

    for current_id in session_ids:
        if current_id not in sessions:
            raise HTTPException(status_code=400, detail=f"Invalid session ID: {current_id}. Please re-upload.")

    if cis_session_id and cis_session_id not in sessions:
        raise HTTPException(status_code=400, detail="Invalid CIS session. Please re-upload the CIS sheet.")

    constraints = get_constraints(exam_type)
    max_marks = constraints["max_marks"]
    time_allowed = constraints["time"]
    total_mcq = mcq_count * mcq_marks
    total_theory = sum(question.get("marks", 0) for question in theory_questions)
    grand_total = total_mcq + total_theory

    if max_marks is not None and grand_total > max_marks:
        exam_label = {
            "quiz": "Quiz",
            "mid": "Mid-Term",
            "final": "Final Exam",
            "assignment": "Assignment",
        }.get(exam_type.lower(), exam_type.title())
        raise HTTPException(
            status_code=400,
            detail=(
                f"{exam_label} total marks cannot exceed {max_marks}. "
                f"Your current configuration is {grand_total} marks. Please reduce the number or marks of questions."
            ),
        )

    all_filenames = [sessions[current_id]["filename"] for current_id in session_ids]
    try:
        clo_mapping = _build_clo_mapping(cis_session_id, mcq_blooms_label, theory_questions, session_ids, exam_type)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"CIS CLO mapping failed: {exc}") from exc
    mapped_theory_questions = clo_mapping.get("theory_questions", theory_questions)
    primary = sessions[session_id]
    primary.update(
        {
            "session_ids": session_ids,
            "all_filenames": all_filenames,
            "cis_session_id": cis_session_id,
            "clo_mapping": clo_mapping,
            "exam_type": exam_type,
            "mcq_count": mcq_count,
            "mcq_marks": mcq_marks,
            "theory_questions": mapped_theory_questions,
        }
    )

    prompt = build_prompt(
        filename=", ".join(all_filenames),
        exam_type=exam_type,
        mcq_count=mcq_count,
        mcq_marks=mcq_marks,
        theory_questions=mapped_theory_questions,
        clo_mapping=clo_mapping,
    )
    primary["prompt"] = prompt
    return {
        "prompt": prompt,
        "time_allowed": time_allowed,
        "max_marks": max_marks,
        "warnings": clo_mapping.get("warnings", []),
    }


@router.post("/generate-exam")
def generate_exam_route(data: dict):
    session_id = data.get("session_id")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=400, detail="Invalid session. Please upload a file first.")

    session = sessions[session_id]
    if "prompt" not in session:
        raise HTTPException(status_code=400, detail="Please generate a prompt first.")
    prompt_override = (data.get("prompt") or "").strip()

    try:
        max_images = 20
        all_documents: list[dict] = []
        all_images: list[tuple[bytes, str]] = []

        for doc_index, current_id in enumerate(session.get("session_ids", [session_id]), 1):
            current = sessions.get(current_id)
            if not current:
                continue
            try:
                text, images = parse_file(current["file_path"], current["file_type"])
            except Exception as exc:
                filename = current.get("filename", "uploaded file")
                raise HTTPException(status_code=400, detail=f'Could not read "{filename}": {exc}') from exc
            if text:
                all_documents.append({
                    "doc_id": doc_index,
                    "filename": current["filename"],
                    "content": text,
                    "chunks": chunk_text(text),
                })

            remaining = max_images - len(all_images)
            if remaining > 0 and images:
                all_images.extend(images[:remaining])

        combined_text = "\n\n".join(document["content"] for document in all_documents).strip()
        if len(combined_text) < 50:
            raise HTTPException(
                status_code=400,
                detail="Could not extract sufficient content from the uploaded file(s). Please ensure the files have readable text.",
            )

        image_descriptions = analyze_all_images(all_images) if all_images else ""
        query = f"{session['prompt']}\n\nGenerate a balanced exam from all uploaded files."
        combined_content = build_balanced_context(all_documents, query=query)
        if not combined_content.strip():
            combined_content = combined_text
        if image_descriptions:
            combined_content += (
                "\n\n=== DOCUMENT IMAGES (Vision-Analyzed for Question Generation) ==="
                + image_descriptions
                + "\n=== END OF IMAGE ANALYSIS ==="
            )

        exam_content = generate_exam(
            document_content=combined_content,
            prompt=prompt_override or session["prompt"],
            exam_type=session["exam_type"],
            mcq_count=session.get("mcq_count", 0),
            mcq_marks=session.get("mcq_marks", 1),
            theory_questions=session.get("theory_questions", []),
        )
        exam_content = _normalize_exam_header(
            exam_content,
            (session.get("clo_mapping") or {}).get("course_code", ""),
            (session.get("clo_mapping") or {}).get("course_title", "")
        )
        if prompt_override:
            session["prompt"] = prompt_override
        session["exam_content"] = exam_content
        return {
            "exam_content": exam_content,
            "images_analyzed": len(all_images),
            "llava_used": bool(image_descriptions and is_llava_available()),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate exam: {exc}") from exc


@router.post("/chat")
def prompt_generator_chat(data: dict):
    message = (data.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")

    try:
        reply = chat_assistant(
            message=message,
            history=data.get("history") or [],
            role=(data.get("role") or "teacher").strip().lower(),
            page=(data.get("page") or "").strip(),
            context=(data.get("context") or "").strip(),
        )
        return {"reply": reply, "model": LLAMA_GENERATION_MODEL}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/save-exam")
def save_exam(data: dict):
    session_id = data.get("session_id")
    content = data.get("content", "")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=400, detail="Invalid session.")

    sessions[session_id]["exam_content"] = content
    return {"message": "Exam saved successfully"}


@router.post("/download-pdf")
def download_pdf(data: dict):
    session_id = data.get("session_id")
    content = data.get("content", "")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=400, detail="Invalid session.")

    session = sessions[session_id]
    filename = Path(session.get("filename", "exam")).stem
    exam_type = session.get("exam_type", "exam")
    pdf_filename = f"{filename}_{exam_type}_paper.pdf"

    with NamedTemporaryFile(delete=False, suffix=".pdf", dir=GENERATED_FOLDER) as temp_file:
        temp_path = Path(temp_file.name)

    try:
        export_to_pdf(content, str(temp_path), exam_type=exam_type, filename=filename)
        return FileResponse(path=temp_path, filename=pdf_filename, media_type="application/pdf")
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {exc}") from exc
