import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal
from app.services.column_mapping.config import get_mapping_config
from app.services.column_mapping.matching_service import ColumnMatchingService
from app.services.column_mapping.session_store import MappingSessionStore
from app.services.column_mapping.transformation_service import apply_mapping, validate_mappings
from app.services.column_mapping.workbook_service import (
    cleanup_paths,
    detect_data_start_row,
    detect_header_row,
    discover_sheets,
    extract_headers,
    get_sheet,
    load_any_workbook,
    save_upload,
)
from app.services.column_mapping.template_service import field_payload, get_template, materialize_template_file, template_payload


router = APIRouter(prefix="/api/transform/column-mapping", tags=["column-mapping"])
sessions = MappingSessionStore()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/upload")
async def upload_mapping_files(
    source_file: UploadFile = File(...),
    target_file: UploadFile = File(...),
):
    source = save_upload(source_file)
    target = save_upload(target_file)
    session = sessions.create(source, target)
    return {
        "session_id": session.id,
        "source_sheets": discover_sheets(source),
        "target_sheets": discover_sheets(target),
        "settings": {
            "allow_duplicate_target_mappings": get_mapping_config().get("allow_duplicate_target_mappings", False),
            "required_targets": get_mapping_config().get("required_targets", []),
        },
    }


@router.post("/upload-source")
async def upload_source_file(source_file: UploadFile = File(...)):
    source = save_upload(source_file)
    session = sessions.create(source)
    return {
        "session_id": session.id,
        "source_sheets": discover_sheets(source),
    }


@router.post("/analyze")
async def analyze_mapping(
    session_id: str = Form(...),
    source_sheet: str = Form(...),
    target_sheet: str = Form(...),
    source_header_row: int = Form(0),
    target_header_row: int = Form(0),
    source_data_start_row: int = Form(0),
    target_data_start_row: int = Form(0),
):
    session = sessions.get(session_id)
    source_workbook = load_any_workbook(session.source.path, session.source.original_name)
    if not session.target:
        raise HTTPException(status_code=400, detail="Target file is missing for this mapping session.")
    target_workbook = load_any_workbook(session.target.path, session.target.original_name)
    source_ws = get_sheet(source_workbook, source_sheet)
    target_ws = get_sheet(target_workbook, target_sheet)

    detected_source_header = detect_header_row(source_ws, source_header_row or None)
    detected_target_header = detect_header_row(target_ws, target_header_row or None)
    detected_source_start = detect_data_start_row(source_ws, detected_source_header, source_data_start_row or None)
    detected_target_start = detect_data_start_row(target_ws, detected_target_header, target_data_start_row or None)

    source_headers = extract_headers(source_ws, detected_source_header)
    target_headers = extract_headers(target_ws, detected_target_header)
    suggestions = ColumnMatchingService().suggest(source_headers, target_headers)

    duplicate_targets = {}
    for suggestion in suggestions:
        target = suggestion.get("suggested_target_column")
        if target:
            duplicate_targets[target] = duplicate_targets.get(target, 0) + 1

    for suggestion in suggestions:
        target = suggestion.get("suggested_target_column")
        if target and duplicate_targets.get(target, 0) > 1:
            suggestion["conflict"] = True
            suggestion["status"] = "Needs review"

    return {
        "source_headers": source_headers,
        "target_headers": target_headers,
        "suggestions": suggestions,
        "mappings": mapping_report(suggestions),
        "unmatched_source_columns": unmatched_source_columns(suggestions),
        "missing_target_columns": missing_target_columns(target_headers, suggestions),
        "detected": {
            "source_header_row": detected_source_header,
            "target_header_row": detected_target_header,
            "source_data_start_row": detected_source_start,
            "target_data_start_row": detected_target_start,
        },
        "settings": {
            "allow_duplicate_target_mappings": get_mapping_config().get("allow_duplicate_target_mappings", False),
            "required_targets": get_mapping_config().get("required_targets", []),
        },
    }


@router.post("/analyze-standard")
async def analyze_standard_mapping(
    session_id: str = Form(...),
    template_id: int = Form(...),
    source_sheet: str = Form(...),
    db: Session = Depends(get_db),
):
    session = sessions.get(session_id)
    template = get_template(db, template_id)
    if not template.is_active or template.archived:
        raise HTTPException(status_code=400, detail="This standard template is not active.")
    if not template.file_path and not template.file_content:
        raise HTTPException(status_code=400, detail="This template has no Excel file attached.")

    source_workbook = load_any_workbook(session.source.path, session.source.original_name)
    template_path = materialize_template_file(template)
    target_workbook = load_any_workbook(template_path, template.original_filename)
    source_ws = get_sheet(source_workbook, source_sheet)
    target_ws = get_sheet(target_workbook, template.sheet_name or target_workbook.sheetnames[0])

    detected_source_header = detect_header_row(source_ws, None)
    detected_source_start = detect_data_start_row(source_ws, detected_source_header, None)
    detected_target_header = detect_header_row(target_ws, None)
    detected_target_start = detect_data_start_row(target_ws, detected_target_header, None)
    source_headers = extract_headers(source_ws, detected_source_header)
    extracted_target_headers = extract_headers(target_ws, detected_target_header)

    fields = db.query(models.TransformationTemplateField).filter(
        models.TransformationTemplateField.template_id == template.id
    ).order_by(models.TransformationTemplateField.column_position).all()
    field_dicts = _fields_aligned_to_headers(fields, extracted_target_headers)
    target_headers = [
        {
            "name": field["display_name"],
            "column_index": field["column_position"],
            "duplicate_index": 1,
            "is_empty": False,
        }
        for field in field_dicts
        if not field.get("hidden")
    ]
    synonym_groups = [[field["display_name"]] + field.get("synonyms", []) for field in field_dicts]
    suggestions = ColumnMatchingService(synonym_groups=synonym_groups).suggest_by_target(source_headers, target_headers)
    mapped_targets = {item.get("suggested_target_column") for item in suggestions if item.get("suggested_target_column")}
    missing = []
    for field in field_dicts:
        if field["display_name"] not in mapped_targets:
            missing.append({
                "target_column": field["display_name"],
                "required": field["required"],
                "missing_value_rule": field["missing_value_rule"],
                "default_value": field["default_value"],
                "formula_definition": field["formula_definition"],
                "editable_by_teacher": field["editable_by_teacher"],
                "status": _missing_status_dict(field),
            })
    return {
        "template": template_payload(template, fields),
        "source_headers": source_headers,
        "target_headers": target_headers,
        "suggestions": suggestions,
        "mappings": mapping_report(suggestions),
        "unmatched_source_columns": unmatched_source_columns(suggestions),
        "missing_columns": missing,
        "missing_target_columns": missing,
        "detected": {
            "source_header_row": detected_source_header,
            "source_data_start_row": detected_source_start,
            "target_header_row": detected_target_header,
            "target_data_start_row": detected_target_start,
        },
        "settings": {
            "allow_duplicate_target_mappings": get_mapping_config().get("allow_duplicate_target_mappings", False),
            "required_targets": [field["display_name"] for field in field_dicts if field["required"]],
        },
    }


@router.post("/validate")
async def validate_confirmed_mapping(
    mappings_json: str = Form(...),
    required_targets_json: str = Form("[]"),
):
    mappings = _json_list(mappings_json, "Invalid mappings.")
    required_targets = _json_list(required_targets_json, "Invalid required target list.")
    validate_mappings(
        mappings,
        required_targets,
        bool(get_mapping_config().get("allow_duplicate_target_mappings", False)),
    )
    return {"valid": True}


@router.post("/transform")
async def transform_mapping(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    source_sheet: str = Form(...),
    target_sheet: str = Form(...),
    mappings_json: str = Form(...),
    required_targets_json: str = Form("[]"),
    source_header_row: int = Form(0),
    target_header_row: int = Form(0),
    source_data_start_row: int = Form(0),
    target_data_start_row: int = Form(0),
):
    session = sessions.get(session_id)
    mappings = _json_list(mappings_json, "Invalid mappings.")
    required_targets = _json_list(required_targets_json, "Invalid required target list.")
    output = apply_mapping(
        source_path=session.source.path,
        source_name=session.source.original_name,
        target_path=session.target.path,
        target_name=session.target.original_name,
        source_sheet_name=source_sheet,
        target_sheet_name=target_sheet,
        mappings=mappings,
        required_targets=required_targets,
        allow_duplicates=bool(get_mapping_config().get("allow_duplicate_target_mappings", False)),
        source_header_row=source_header_row or None,
        target_header_row=target_header_row or None,
        source_data_start_row=source_data_start_row or None,
        target_data_start_row=target_data_start_row or None,
    )
    background_tasks.add_task(cleanup_paths, [output])
    background_tasks.add_task(sessions.cleanup, session_id)
    return FileResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="intelligent-column-mapping.xlsx",
    )


@router.post("/transform-standard")
async def transform_standard_mapping(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    template_id: int = Form(...),
    source_sheet: str = Form(...),
    mappings_json: str = Form(...),
    manual_values_json: str = Form("{}"),
    teacher_name: str = Form(""),
    cleanup_session: bool = Form(True),
    source_header_row: int = Form(0),
    source_data_start_row: int = Form(0),
    db: Session = Depends(get_db),
):
    session = sessions.get(session_id)
    template = get_template(db, template_id)
    if not template.is_active or template.archived:
        raise HTTPException(status_code=400, detail="This standard template is not active.")
    if not template.file_path and not template.file_content:
        raise HTTPException(status_code=400, detail="This template has no Excel file attached.")
    mappings = _json_list(mappings_json, "Invalid mappings.")
    try:
        manual_values = json.loads(manual_values_json or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid manual values.") from exc
    fields = db.query(models.TransformationTemplateField).filter(
        models.TransformationTemplateField.template_id == template.id
    ).order_by(models.TransformationTemplateField.column_position).all()
    source_workbook = load_any_workbook(session.source.path, session.source.original_name)
    source_ws = get_sheet(source_workbook, source_sheet)
    detected_source_header = detect_header_row(source_ws, source_header_row or None)
    template_path = materialize_template_file(template)
    target_workbook = load_any_workbook(template_path, template.original_filename)
    target_ws = get_sheet(target_workbook, template.sheet_name or target_workbook.sheetnames[0])
    detected_target_header = detect_header_row(target_ws, None)
    detected_target_start = detect_data_start_row(target_ws, detected_target_header, None)
    target_headers = extract_headers(target_ws, detected_target_header)
    field_dicts = _fields_aligned_to_headers(fields, target_headers)
    required_targets: list[str] = []
    output = apply_mapping(
        source_path=session.source.path,
        source_name=session.source.original_name,
        target_path=template_path,
        target_name=template.original_filename or template.name,
        source_sheet_name=source_sheet,
        target_sheet_name=template.sheet_name or "",
        mappings=mappings,
        required_targets=required_targets,
        allow_duplicates=bool(get_mapping_config().get("allow_duplicate_target_mappings", False)),
        source_header_row=source_header_row or None,
        target_header_row=detected_target_header,
        source_data_start_row=source_data_start_row or None,
        target_data_start_row=detected_target_start,
        target_fields=field_dicts,
        manual_values=manual_values,
    )
    teacher = None
    saved_marksheet = None
    teacher_name = (teacher_name or "").strip()
    if teacher_name:
        teacher = db.query(models.Teacher).filter(models.Teacher.teacher_name == teacher_name).first()
    if teacher_name and not teacher:
        raise HTTPException(status_code=404, detail="Teacher session not found. Please log in again.")
    if teacher:
        record = db.query(models.TeacherCourse).filter(
            models.TeacherCourse.teacher_id == teacher.id
        ).order_by(models.TeacherCourse.created_at.desc(), models.TeacherCourse.id.desc()).first()
        if not record or not record.course_id:
            fallback_course = db.query(models.Course).filter(
                models.Course.course_code == "STANDARD-MAPPING"
            ).first()
            if not fallback_course:
                fallback_course = models.Course(
                    course_code="STANDARD-MAPPING",
                    course_name="Standardized Mapping Output",
                )
                db.add(fallback_course)
                db.flush()
            record = models.TeacherCourse(
                teacher_id=teacher.id,
                course_id=fallback_course.id,
                department=teacher.department or template.department,
                threshold_percentage=50,
            )
            db.add(record)
            db.flush()
        saved_marksheet = models.TransformMarksheet(
            teacher_id=teacher.id,
            teacher_course_id=record.id,
            course_id=record.course_id,
            semester=record.semester,
            section=record.section,
            batch=record.batch,
            department=record.department or teacher.department,
            exam_type="Standardized",
            total_marks=100,
            export_file_name=f"{template.name}-standardized-v{template.version}",
            selected_options=json.dumps({"Standard Template": template.name}),
            assessment_totals=json.dumps({"Standard Template": 100}),
            excel_file_path=str(output),
            source_kind="standard_mapping",
        )
        db.add(saved_marksheet)
        db.flush()

    db.add(models.TransformationJob(
        teacher_id=teacher.id if teacher else None,
        template_id=template.id,
        template_version=template.version,
        source_file_reference=session.source.original_name,
        selected_source_sheet=source_sheet,
        status="completed",
        mapping_summary=json.dumps({
            "mapped_count": len(mappings),
            "template_id": template.id,
            "saved_marksheet_id": saved_marksheet.id if saved_marksheet else None,
        }),
    ))
    db.commit()
    if not saved_marksheet:
        background_tasks.add_task(cleanup_paths, [output])
    if cleanup_session:
        background_tasks.add_task(sessions.cleanup, session_id)
    return FileResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"{template.name}-standardized-v{template.version}.xlsx",
    )


def _json_list(value: str, error_message: str) -> list:
    try:
        parsed = json.loads(value or "[]")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=error_message) from exc
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail=error_message)
    return parsed


def _missing_status(field) -> str:
    rule = field.missing_value_rule or "blank"
    if rule == "manual":
        return "Manual input required"
    if rule == "formula":
        return "Formula generated"
    if rule in {"zero", "fixed", "current_date", "sequence", "copy"}:
        return "Default applied"
    return "Auto-added"


def mapping_report(suggestions: list[dict]) -> list[dict]:
    report = []
    for item in suggestions:
        report.append({
            "source_header": item.get("source_column"),
            "matched_target_header": item.get("suggested_target_column"),
            "confidence_score": item.get("confidence_score", 0),
            "match_status": "auto_mapped" if item.get("status") == "Mapped" else item.get("status", "Unmapped").lower().replace(" ", "_"),
            "matching_reasons": item.get("matching_reasons", []),
            "source_tokens": item.get("source_tokens", {}),
            "target_tokens": item.get("target_tokens", {}),
            "alternative_candidates": item.get("alternatives", []),
        })
    return report


def unmatched_source_columns(suggestions: list[dict]) -> list[dict]:
    return [
        {
            "source_header": item.get("source_column"),
            "alternative_candidates": item.get("alternatives", []),
            "matching_reasons": item.get("matching_reasons", []),
        }
        for item in suggestions
        if not item.get("suggested_target_column")
    ]


def missing_target_columns(target_headers: list[dict], suggestions: list[dict]) -> list[str]:
    mapped = {item.get("suggested_target_column") for item in suggestions if item.get("suggested_target_column")}
    return [header["name"] for header in target_headers if header["name"] not in mapped]


def _missing_status_dict(field: dict) -> str:
    rule = field.get("missing_value_rule") or "blank"
    if rule == "manual":
        return "Manual input required"
    if rule == "formula":
        return "Formula generated"
    if rule in {"zero", "fixed", "current_date", "sequence", "copy"}:
        return "Default applied"
    return "Auto-added"


def _fields_aligned_to_headers(fields, headers: list[dict]) -> list[dict]:
    fields_by_position = {field.column_position: field for field in fields}
    aligned = []
    for header in headers:
        field = fields_by_position.get(header["column_index"])
        if field:
            data = field_payload(field)
            data["display_name"] = header["name"]
            data["column_position"] = header["column_index"]
        else:
            data = {
                "id": 0,
                "field_key": f"column_{header['column_index']}",
                "display_name": header["name"],
                "column_position": header["column_index"],
                "required": False,
                "data_type": "text",
                "missing_value_rule": "blank",
                "default_value": "",
                "formula_definition": "",
                "validation_definition": "",
                "editable_by_teacher": True,
                "allow_multiple_source_mapping": False,
                "synonyms": [],
                "description": "",
                "hidden": False,
                "blank_allowed": True,
            }
        aligned.append(data)
    return aligned
