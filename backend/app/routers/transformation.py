import os, shutil, uuid
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import FileResponse

from app.services.transformation.extractors.excel_extractor import extract_excel
from app.services.transformation.template_engine.template_scanner import scan_template
from app.services.transformation.template_engine.injector import inject_into_template
from app.services.transformation.mappers.semantic_mapper import semantic_map
from app.services.transformation.exporters.word_writer import excel_to_word
from app.services.transformation.exporters.pdf_writer import excel_to_pdf

router = APIRouter(prefix="/transform", tags=["Transformation"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/")
async def transform(
    source_file: UploadFile = File(...),
    template_file: UploadFile = File(...),
    output_type: str = Form(...)
):
    uid = uuid.uuid4().hex

    src_path = os.path.join(UPLOAD_DIR, f"src_{uid}_{source_file.filename}")
    tmp_path = os.path.join(UPLOAD_DIR, f"tmp_{uid}_{template_file.filename}")

    with open(src_path, "wb") as f:
        shutil.copyfileobj(source_file.file, f)
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(template_file.file, f)

    source_df = extract_excel(src_path)
    template = scan_template(tmp_path)

    mapping = semantic_map(source_df, template["fields"])
    if not mapping:
        raise Exception("No mapping found")

    temp_excel = os.path.join(UPLOAD_DIR, f"temp_{uid}.xlsx")

    inject_into_template(
        source_df, mapping, tmp_path, temp_excel, "xlsx"
    )

    if output_type == "word":
        final = os.path.join(UPLOAD_DIR, f"output_{uid}.docx")
        excel_to_word(temp_excel, final)
    elif output_type == "pdf":
        final = os.path.join(UPLOAD_DIR, f"output_{uid}.pdf")
        excel_to_pdf(temp_excel, final)
    else:
        final = temp_excel

    return {"file": os.path.basename(final)}

@router.get("/uploads/{filename}")
def download(filename: str):
    return FileResponse(os.path.join(UPLOAD_DIR, filename))
