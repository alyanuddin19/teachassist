import json
import os
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import models
from .config import get_mapping_config
from .workbook_service import detect_data_start_row, detect_header_row, extract_headers, get_sheet, load_any_workbook


TEMPLATE_DIR = Path(os.getenv("TRANSFORMATION_TEMPLATE_DIR", Path("uploads") / "standard_templates"))
TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)


def template_purpose_options() -> list[str]:
    return get_mapping_config().get("template_purposes", [
        "Marksheet",
        "Attendance sheet",
        "CLO attainment sheet",
        "Student result",
        "Assessment record",
        "Course file",
    ])


def missing_value_rules() -> list[dict]:
    return get_mapping_config().get("missing_value_rules", [
        {"key": "blank", "label": "Leave blank"},
        {"key": "zero", "label": "Fill with zero"},
        {"key": "fixed", "label": "Use fixed value"},
        {"key": "manual", "label": "Teacher enters value"},
        {"key": "formula", "label": "Use formula"},
        {"key": "sequence", "label": "Generate sequence"},
        {"key": "current_date", "label": "Use current date"},
        {"key": "copy", "label": "Copy from another mapped column"},
    ])


def save_template_file(upload: UploadFile | None) -> tuple[str | None, str | None]:
    if upload is None:
        return None, None
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in set(get_mapping_config().get("supported_extensions", [])):
        raise HTTPException(status_code=400, detail="Please upload a supported Excel template.")
    path = TEMPLATE_DIR / f"{uuid4().hex}{suffix}"
    with path.open("wb") as target:
        shutil.copyfileobj(upload.file, target)
    if path.stat().st_size == 0:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Template file is empty.")
    return str(path), upload.filename or path.name


def create_template(
    db: Session,
    name: str,
    description: str,
    department: str,
    purpose: str,
    version: int,
    hod_id: int | None,
    upload: UploadFile | None,
    is_active: bool,
) -> models.TransformationTemplate:
    file_path, original_name = save_template_file(upload)
    parent = db.query(models.TransformationTemplate).filter(
        models.TransformationTemplate.name == name,
        models.TransformationTemplate.department == department,
        models.TransformationTemplate.archived == False,  # noqa: E712
    ).order_by(models.TransformationTemplate.version.desc()).first()
    if parent:
        version = max(version, (parent.version or 1) + 1)
    template = models.TransformationTemplate(
        name=name,
        description=description or None,
        department=department,
        purpose=purpose,
        version=version or 1,
        status="active" if is_active else "draft",
        original_filename=original_name,
        file_path=file_path,
        created_by_hod_id=hod_id,
        parent_template_id=parent.id if parent else None,
        is_active=is_active,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    if file_path:
        extract_and_save_fields(db, template)
    if is_active:
        activate_template(db, template.id)
    return template


def extract_and_save_fields(db: Session, template: models.TransformationTemplate) -> list[models.TransformationTemplateField]:
    if not template.file_path:
        return []
    workbook = load_any_workbook(Path(template.file_path), template.original_filename)
    sheet_name = template.sheet_name or workbook.sheetnames[0]
    sheet = get_sheet(workbook, sheet_name)
    header_row = detect_header_row(sheet, template.header_row)
    data_start = detect_data_start_row(sheet, header_row, template.data_start_row)
    headers = extract_headers(sheet, header_row)
    template.sheet_name = sheet_name
    template.header_row = header_row
    template.data_start_row = data_start
    db.query(models.TransformationTemplateField).filter(
        models.TransformationTemplateField.template_id == template.id
    ).delete()
    fields = []
    for header in headers:
        field = models.TransformationTemplateField(
            template_id=template.id,
            field_key=_field_key(header["name"], header["column_index"]),
            display_name=header["name"],
            column_position=header["column_index"],
            required=False,
            data_type="text",
            missing_value_rule="blank",
            editable_by_teacher=True,
            synonyms="[]",
        )
        db.add(field)
        fields.append(field)
    db.commit()
    return fields


def activate_template(db: Session, template_id: int) -> models.TransformationTemplate:
    template = get_template(db, template_id)
    db.query(models.TransformationTemplate).filter(
        models.TransformationTemplate.name == template.name,
        models.TransformationTemplate.department == template.department,
    ).update({"is_active": False, "status": "inactive"})
    template.is_active = True
    template.status = "active"
    db.commit()
    db.refresh(template)
    return template


def get_template(db: Session, template_id: int) -> models.TransformationTemplate:
    template = db.query(models.TransformationTemplate).filter(models.TransformationTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template


def template_payload(template: models.TransformationTemplate, fields: list[models.TransformationTemplateField] | None = None) -> dict:
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description or "",
        "department": template.department,
        "purpose": template.purpose,
        "version": template.version,
        "status": template.status,
        "is_active": template.is_active,
        "archived": template.archived,
        "original_filename": template.original_filename or "",
        "sheet_name": template.sheet_name or "",
        "header_row": template.header_row,
        "data_start_row": template.data_start_row,
        "fields": [field_payload(field) for field in (fields or [])],
    }


def field_payload(field: models.TransformationTemplateField) -> dict:
    return {
        "id": field.id,
        "field_key": field.field_key,
        "display_name": field.display_name,
        "column_position": field.column_position,
        "required": field.required,
        "data_type": field.data_type,
        "missing_value_rule": field.missing_value_rule,
        "default_value": field.default_value or "",
        "formula_definition": field.formula_definition or "",
        "validation_definition": field.validation_definition or "",
        "editable_by_teacher": field.editable_by_teacher,
        "allow_multiple_source_mapping": field.allow_multiple_source_mapping,
        "synonyms": _json_load(field.synonyms, []),
        "description": field.description or "",
        "hidden": field.hidden,
        "blank_allowed": field.blank_allowed,
    }


def update_fields(db: Session, template_id: int, fields: list[dict]) -> list[models.TransformationTemplateField]:
    get_template(db, template_id)
    current = {
        field.id: field
        for field in db.query(models.TransformationTemplateField).filter(
            models.TransformationTemplateField.template_id == template_id
        ).all()
    }
    for item in fields:
        field_id = int(item.get("id") or 0)
        field = current.get(field_id)
        if not field:
            continue
        field.display_name = item.get("display_name") or field.display_name
        field.field_key = item.get("field_key") or field.field_key
        field.column_position = int(item.get("column_position") or field.column_position)
        field.required = bool(item.get("required", field.required))
        field.data_type = item.get("data_type") or field.data_type
        field.missing_value_rule = item.get("missing_value_rule") or field.missing_value_rule
        field.default_value = item.get("default_value") or None
        field.formula_definition = item.get("formula_definition") or None
        field.validation_definition = item.get("validation_definition") or None
        field.editable_by_teacher = bool(item.get("editable_by_teacher", field.editable_by_teacher))
        field.allow_multiple_source_mapping = bool(item.get("allow_multiple_source_mapping", field.allow_multiple_source_mapping))
        field.synonyms = json.dumps(item.get("synonyms") or [])
        field.description = item.get("description") or None
        field.hidden = bool(item.get("hidden", field.hidden))
        field.blank_allowed = bool(item.get("blank_allowed", field.blank_allowed))
    db.commit()
    return db.query(models.TransformationTemplateField).filter(
        models.TransformationTemplateField.template_id == template_id
    ).order_by(models.TransformationTemplateField.column_position).all()


def _field_key(value: str, position: int) -> str:
    key = "".join(ch.lower() if ch.isalnum() else "_" for ch in value).strip("_")
    return key or f"column_{position}"


def _json_load(value: str, fallback):
    try:
        return json.loads(value or "")
    except Exception:
        return fallback
