import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal
from app.services.column_mapping.template_service import (
    activate_template,
    create_template,
    extract_and_save_fields,
    field_payload,
    get_template,
    missing_value_rules,
    template_payload,
    template_purpose_options,
    update_fields,
)


router = APIRouter(tags=["standard-transformation-templates"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/api/transform/template-settings")
def transformation_template_settings():
    return {
        "purposes": template_purpose_options(),
        "missing_value_rules": missing_value_rules(),
        "data_types": ["text", "number", "date", "percentage", "boolean"],
        "statuses": ["draft", "active", "inactive", "archived"],
    }


@router.get("/api/hod/transformation-templates")
def list_hod_templates(department: str, include_archived: bool = False, db: Session = Depends(get_db)):
    query = db.query(models.TransformationTemplate).filter(
        models.TransformationTemplate.department == department
    )
    if not include_archived:
        query = query.filter(models.TransformationTemplate.archived == False)  # noqa: E712
    templates = query.order_by(models.TransformationTemplate.created_at.desc()).all()
    return {"templates": [template_payload(template) for template in templates]}


@router.post("/api/hod/transformation-templates")
def create_hod_template(
    name: str = Form(...),
    description: str = Form(""),
    department: str = Form(...),
    purpose: str = Form(...),
    version: int = Form(1),
    hod_id: int = Form(0),
    is_active: bool = Form(False),
    template_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    purpose = purpose.strip()
    if not purpose:
        raise HTTPException(status_code=400, detail="Academic purpose is required.")
    template = create_template(
        db,
        name=name.strip(),
        description=description.strip(),
        department=department.strip().upper(),
        purpose=purpose,
        version=version,
        hod_id=hod_id or None,
        upload=template_file,
        is_active=is_active,
    )
    fields = db.query(models.TransformationTemplateField).filter(
        models.TransformationTemplateField.template_id == template.id
    ).order_by(models.TransformationTemplateField.column_position).all()
    return {"template": template_payload(template, fields)}


@router.get("/api/hod/transformation-templates/{template_id}")
def get_hod_template(template_id: int, db: Session = Depends(get_db)):
    template = get_template(db, template_id)
    fields = db.query(models.TransformationTemplateField).filter(
        models.TransformationTemplateField.template_id == template.id
    ).order_by(models.TransformationTemplateField.column_position).all()
    return {"template": template_payload(template, fields)}


@router.post("/api/hod/transformation-templates/{template_id}/fields")
def configure_template_fields(template_id: int, data: dict, db: Session = Depends(get_db)):
    fields = update_fields(db, template_id, data.get("fields") or [])
    return {"fields": [field_payload(field) for field in fields]}


@router.post("/api/hod/transformation-templates/{template_id}/activate")
def activate_hod_template(template_id: int, db: Session = Depends(get_db)):
    template = activate_template(db, template_id)
    return {"template": template_payload(template)}


@router.post("/api/hod/transformation-templates/{template_id}/archive")
def archive_hod_template(template_id: int, db: Session = Depends(get_db)):
    template = get_template(db, template_id)
    template.archived = True
    template.is_active = False
    template.status = "archived"
    db.commit()
    return {"template": template_payload(template)}


@router.post("/api/hod/transformation-templates/{template_id}/duplicate")
def duplicate_hod_template(template_id: int, db: Session = Depends(get_db)):
    template = get_template(db, template_id)
    duplicate = models.TransformationTemplate(
        name=template.name,
        description=template.description,
        department=template.department,
        purpose=template.purpose,
        version=(template.version or 1) + 1,
        status="draft",
        original_filename=template.original_filename,
        file_path=template.file_path,
        sheet_name=template.sheet_name,
        header_row=template.header_row,
        data_start_row=template.data_start_row,
        created_by_hod_id=template.created_by_hod_id,
        parent_template_id=template.id,
        is_active=False,
        allowed_rules=template.allowed_rules,
    )
    db.add(duplicate)
    db.commit()
    db.refresh(duplicate)
    fields = db.query(models.TransformationTemplateField).filter(
        models.TransformationTemplateField.template_id == template.id
    ).all()
    for field in fields:
        db.add(models.TransformationTemplateField(
            template_id=duplicate.id,
            field_key=field.field_key,
            display_name=field.display_name,
            column_position=field.column_position,
            required=field.required,
            data_type=field.data_type,
            missing_value_rule=field.missing_value_rule,
            default_value=field.default_value,
            formula_definition=field.formula_definition,
            validation_definition=field.validation_definition,
            editable_by_teacher=field.editable_by_teacher,
            allow_multiple_source_mapping=field.allow_multiple_source_mapping,
            synonyms=field.synonyms,
            formatting_metadata=field.formatting_metadata,
            description=field.description,
            hidden=field.hidden,
            blank_allowed=field.blank_allowed,
        ))
    db.commit()
    return {"template": template_payload(duplicate)}


@router.get("/api/transform/standard-templates")
def list_teacher_standard_templates(department: str = "", purpose: str = "", db: Session = Depends(get_db)):
    query = db.query(models.TransformationTemplate).filter(
        models.TransformationTemplate.is_active == True,  # noqa: E712
        models.TransformationTemplate.archived == False,  # noqa: E712
    )
    if department:
        query = query.filter(models.TransformationTemplate.department == department.strip().upper())
    if purpose:
        query = query.filter(models.TransformationTemplate.purpose == purpose)
    templates = query.order_by(models.TransformationTemplate.name.asc(), models.TransformationTemplate.version.desc()).all()
    return {"templates": [template_payload(template) for template in templates]}
