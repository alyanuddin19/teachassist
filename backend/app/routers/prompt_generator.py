from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.services.prompt_generator.ai_generator import chat_assistant, generate_exam, list_available_models
from app.services.prompt_generator.file_parser import parse_file
from app.services.prompt_generator.image_analyzer import analyze_all_images, is_llava_available
from app.services.prompt_generator.pdf_exporter import export_to_pdf
from app.services.prompt_generator.prompt_builder import build_prompt, get_constraints
from app.services.prompt_generator.rag_utils import build_balanced_context, chunk_text


router = APIRouter(prefix="/api/prompt-generator", tags=["prompt-generator"])

UPLOAD_FOLDER = Path(__file__).resolve().parents[1] / "uploads" / "prompt_generator"
GENERATED_FOLDER = Path(__file__).resolve().parents[1] / "generated" / "prompt_generator"
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
GENERATED_FOLDER.mkdir(parents=True, exist_ok=True)
ALLOWED_EXTENSIONS = {"pdf", "docx", "pptx", "ppt", "txt", "tex", "latex"}
sessions: dict[str, dict] = {}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@router.get("/models")
def get_models():
    return {"models": list_available_models(), "default": "gemini-flash-latest"}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    if not allowed_file(file.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, DOCX, and PPT/PPTX files are allowed.")

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
    theory_questions = data.get("theory_questions", [])

    if not exam_type:
        raise HTTPException(status_code=400, detail="Exam type is required")

    for current_id in session_ids:
        if current_id not in sessions:
            raise HTTPException(status_code=400, detail=f"Invalid session ID: {current_id}. Please re-upload.")

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
    primary = sessions[session_id]
    primary.update(
        {
            "session_ids": session_ids,
            "all_filenames": all_filenames,
            "exam_type": exam_type,
            "mcq_count": mcq_count,
            "mcq_marks": mcq_marks,
            "theory_questions": theory_questions,
        }
    )

    prompt = build_prompt(
        filename=", ".join(all_filenames),
        exam_type=exam_type,
        mcq_count=mcq_count,
        mcq_marks=mcq_marks,
        theory_questions=theory_questions,
    )
    primary["prompt"] = prompt
    return {"prompt": prompt, "time_allowed": time_allowed, "max_marks": max_marks}


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
            text, images = parse_file(current["file_path"], current["file_type"])
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
        )
        return {"reply": reply, "model": "gemini-flash-latest"}
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
