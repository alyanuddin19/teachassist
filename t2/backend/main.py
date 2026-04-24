import datetime
import json
import threading
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session
import models
import schemas
from database import Base, SessionLocal, engine, get_db
from excel_handler import build_marksheet_excel


def ensure_schema_updates() -> None:
    inspector = inspect(engine)
    marksheet_columns = {column["name"] for column in inspector.get_columns("marksheets")}

    if "assessment_totals" not in marksheet_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE marksheets ADD COLUMN assessment_totals JSON"))
    if "export_file_name" not in marksheet_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE marksheets ADD COLUMN export_file_name VARCHAR(255)"))


def sanitize_export_file_name(file_name: str | None, fallback: str) -> str:
    raw_value = (file_name or "").strip()
    candidate = raw_value or fallback
    sanitized = "".join(char if char.isalnum() or char in (" ", "-", "_") else "_" for char in candidate)
    sanitized = "_".join(sanitized.split())
    sanitized = sanitized.strip("._-") or fallback
    return sanitized if sanitized.lower().endswith(".xlsx") else f"{sanitized}.xlsx"


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema_updates()
    yield
app = FastAPI(title="TeachAssist Marksheet Automation", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
def finalize_marksheet_artifacts(
    marksheet_id: int,
    teacher_name: str,
    teacher_email: str,
    department_name: str,
    section: str,
    total_marks: float,
    selected_options: dict[str, str],
    assessment_totals: dict[str, float],
    assessment_columns: list[str],
    excel_rows: list[dict],
) -> None:
    db = SessionLocal()
    try:
        marksheet = db.query(models.Marksheet).filter(models.Marksheet.id == marksheet_id).first()
        if not marksheet:
            return
        try:
            file_path = build_marksheet_excel(
                sheet_id=marksheet_id,
                teacher_name=teacher_name,
                teacher_email=teacher_email,
                department=department_name,
                section=section,
                total_marks=total_marks,
                selected_options=selected_options,
                assessment_totals=assessment_totals,
                assessment_columns=assessment_columns,
                students=excel_rows,
            )
            marksheet.excel_file_path = file_path
            db.commit()
        except Exception as exc:
            print("Excel generation error:", exc)
            marksheet.excel_file_path = ""
            db.commit()
    finally:
        db.close()
def build_marksheet_detail(marksheet: models.Marksheet) -> schemas.MarksheetDetail:
    grouped_rows: dict[int, schemas.MarksheetRowDetail] = {}
    for mark in marksheet.marks:
        if mark.student_id not in grouped_rows:
            grouped_rows[mark.student_id] = schemas.MarksheetRowDetail(
                student_id=mark.student_id,
                obtained_marks_by_assessment={},
                remarks=mark.remarks,
            )
        grouped_rows[mark.student_id].obtained_marks_by_assessment[mark.assessment_label] = float(mark.obtained_marks)
        if mark.remarks:
            grouped_rows[mark.student_id].remarks = mark.remarks
    return schemas.MarksheetDetail(
        id=marksheet.id,
        teacher_name=marksheet.teacher.name if marksheet.teacher else "",
        email=marksheet.teacher.email if marksheet.teacher else "",
        department_id=marksheet.department_id,
        department=marksheet.department.name if marksheet.department else None,
        batch=marksheet.batch,
        section=marksheet.section,
        course_id=marksheet.course_id,
        course=marksheet.course.course_name if marksheet.course else None,
        session_id=marksheet.session_id,
        session=marksheet.session.name if marksheet.session else None,
        exam_type=marksheet.exam_type,
        total_marks=float(marksheet.total_marks),
        export_file_name=marksheet.export_file_name,
        selected_options=marksheet.selected_options,
        assessment_totals=marksheet.assessment_totals or {},
        student_marks=list(grouped_rows.values()),
        created_at=marksheet.created_at,
        download_url=f"/marksheets/{marksheet.id}/download",
    )
@app.get("/health")
def health_check():
    return {"status": "ok"}
@app.get("/dropdown-options", response_model=list[schemas.DropdownOptionResponse])
def get_options(db: Session = Depends(get_db)):
    return db.query(models.DropdownOption).order_by(
        models.DropdownOption.category,
        models.DropdownOption.value,
    ).all()
@app.get("/form-config", response_model=schemas.FormConfigResponse)
def get_form_config(db: Session = Depends(get_db)):
    options = db.query(models.DropdownOption).order_by(
        models.DropdownOption.category,
        models.DropdownOption.value,
    ).all()
    students = db.query(models.Student).all()
    departments = db.query(models.Department).order_by(models.Department.name).all()
    courses = db.query(models.Course).order_by(models.Course.course_name).all()
    sessions = db.query(models.AcademicSession).order_by(models.AcademicSession.name).all()
    dropdowns: dict[str, list[str]] = {}
    for option in options:
        dropdowns.setdefault(option.category, []).append(option.value)
    return schemas.FormConfigResponse(
        departments=departments,
        batches=sorted({student.batch for student in students}),
        sections=sorted({student.section for student in students}),
        courses=courses,
        sessions=sessions,
        dropdowns=dropdowns,
    )
@app.get("/teacher-access", response_model=schemas.TeacherAccessResponse)
def get_teacher_access(
    teacher_name: str = Query(..., min_length=2),
    email: str = Query(..., min_length=5),
    db: Session = Depends(get_db),
):
    teacher = (
        db.query(models.Teacher)
        .filter(
            func.lower(models.Teacher.email) == email.strip().lower(),
            func.lower(models.Teacher.name).like(f"%{teacher_name.strip().lower()}%"),
        )
        .first()
    )
    if not teacher:
        return schemas.TeacherAccessResponse(
            found=False,
            teacher_name=teacher_name,
            email=email,
            assignments=[],
        )
    assignments = (
        db.query(models.TeacherAssignment)
        .filter(models.TeacherAssignment.teacher_id == teacher.id)
        .order_by(
            models.TeacherAssignment.department_id,
            models.TeacherAssignment.batch,
            models.TeacherAssignment.section,
        )
        .all()
    )
    return schemas.TeacherAccessResponse(
        found=True,
        teacher_name=teacher.name,
        email=teacher.email,
        assignments=assignments,)
@app.get("/students", response_model=list[schemas.StudentResponse])
def get_students(
    department_id: int = Query(...),
    batch: str = Query(...),
    section: str = Query(...),
    db: Session = Depends(get_db),
):
    students = (
        db.query(models.Student)
        .filter(
            models.Student.department_id == department_id,
            models.Student.batch == batch,
            models.Student.section == section,
        )
        .order_by(models.Student.roll_number)
        .all()
    )
    return students
@app.post("/marksheets")
async def create_marksheet(
    payload: schemas.MarksheetCreate,
    db: Session = Depends(get_db),
):
    teacher = (
        db.query(models.Teacher)
        .filter(func.lower(models.Teacher.email) == payload.email.strip().lower())
        .first()
    )
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher is not registered in the system.")
    if payload.teacher_name.strip().lower() not in teacher.name.strip().lower():
        raise HTTPException(status_code=400, detail="Teacher name and email do not match.")
    assignment = (
        db.query(models.TeacherAssignment)
        .filter(
            models.TeacherAssignment.teacher_id == teacher.id,
            models.TeacherAssignment.department_id == payload.department_id,
            models.TeacherAssignment.batch == payload.batch,
            models.TeacherAssignment.section == payload.section,
            models.TeacherAssignment.course_id == payload.course_id,
            models.TeacherAssignment.session_id == payload.session_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(
            status_code=403,
            detail="This teacher is not assigned to the selected class/course/session.",
        )
    students = (
        db.query(models.Student)
        .filter(
            models.Student.department_id == payload.department_id,
            models.Student.batch == payload.batch,
            models.Student.section == payload.section,
        )
        .all()
    )
    student_map = {student.id: student for student in students}
    if not student_map:
        raise HTTPException(status_code=404, detail="No students found for selected class.")
    missing_students = [
        row.student_id for row in payload.student_marks if row.student_id not in student_map
    ]
    if missing_students:
        raise HTTPException(status_code=400, detail="Some selected students do not belong to this class.")
    selected_labels = set(payload.selected_options.keys())
    if set(payload.assessment_totals.keys()) != selected_labels:
        raise HTTPException(status_code=400, detail="Assessment total marks are missing for one or more columns.")
    for row in payload.student_marks:
        for mark in row.marks:
            if mark.assessment_label not in selected_labels:
                raise HTTPException(
                    status_code=400,
                    detail="Submitted marks contain an unknown assessment column.",
                )
            assessment_total = payload.assessment_totals.get(mark.assessment_label, payload.total_marks)
            if mark.obtained_marks > assessment_total:
                raise HTTPException(
                    status_code=400,
                    detail="Obtained marks cannot be greater than assessment total marks.",
                )
    marksheet = models.Marksheet(
        teacher_id=teacher.id,
        department_id=payload.department_id,
        batch=payload.batch,
        section=payload.section,
        course_id=payload.course_id,
        session_id=payload.session_id,
        exam_type=payload.exam_type,
        total_marks=payload.total_marks,
        export_file_name=sanitize_export_file_name(payload.export_file_name, f"marksheet_{payload.batch}_{payload.section}"),
        selected_options=payload.selected_options,
        assessment_totals=payload.assessment_totals,
        excel_file_path="",
    )
    db.add(marksheet)
    db.commit()
    db.refresh(marksheet)
    assessment_columns = list(payload.selected_options.keys())
    excel_rows = []
    for student_row in payload.student_marks:
        marks_map: dict[str, float] = {}
        for mark in student_row.marks:
            entry = models.StudentAssessmentMark(
                marksheet_id=marksheet.id,
                student_id=student_row.student_id,
                assessment_label=mark.assessment_label,
                obtained_marks=mark.obtained_marks,
                remarks=mark.remarks or student_row.remarks,
            )
            db.add(entry)
            marks_map[mark.assessment_label] = mark.obtained_marks
        student = student_map[student_row.student_id]
        excel_rows.append(
            {
                "roll_number": student.roll_number,
                "full_name": student.full_name,
                "marks": marks_map,
                "remarks": student_row.remarks,
            }
        )
    audit_log = models.AuditLog(
        teacher_id=teacher.id,
        action="MARKSHEET_CREATED",
        new_value=json.dumps(
            {
                "marksheet_id": marksheet.id,
                "department_id": payload.department_id,
                "batch": payload.batch,
                "section": payload.section,
                "course_id": payload.course_id,
                "session_id": payload.session_id,
                "exam_type": payload.exam_type,
                "selected_options": payload.selected_options,
            }
        ),
        changed_at=datetime.datetime.utcnow(),
    )
    db.add(audit_log)
    db.commit()
    department = db.query(models.Department).filter(models.Department.id == payload.department_id).first()
    threading.Thread(
        target=finalize_marksheet_artifacts,
        args=(
            marksheet.id,
            teacher.name,
            teacher.email,
            department.name if department else str(payload.department_id),
            payload.section,
            payload.total_marks,
            payload.selected_options,
            payload.assessment_totals,
            assessment_columns,
            excel_rows,
        ),
        daemon=True,
    ).start()
    return {
        "message": "Marksheet saved successfully.",
        "marksheet_id": marksheet.id,
        "download_url": f"/marksheets/{marksheet.id}/download",
        "export_file_name": marksheet.export_file_name,
    }
@app.get("/marksheets/{marksheet_id}", response_model=schemas.MarksheetDetail)
def get_marksheet_detail(marksheet_id: int, db: Session = Depends(get_db)):
    marksheet = db.query(models.Marksheet).filter(models.Marksheet.id == marksheet_id).first()
    if not marksheet:
        raise HTTPException(status_code=404, detail="Marksheet not found.")
    return build_marksheet_detail(marksheet)
@app.put("/marksheets/{marksheet_id}")
async def update_marksheet(
    marksheet_id: int,
    payload: schemas.MarksheetCreate,
    db: Session = Depends(get_db),
):
    marksheet = db.query(models.Marksheet).filter(models.Marksheet.id == marksheet_id).first()
    if not marksheet:
        raise HTTPException(status_code=404, detail="Marksheet not found.")
    teacher = (
        db.query(models.Teacher)
        .filter(func.lower(models.Teacher.email) == payload.email.strip().lower())
        .first()
    )
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher is not registered in the system.")
    if payload.teacher_name.strip().lower() not in teacher.name.strip().lower():
        raise HTTPException(status_code=400, detail="Teacher name and email do not match.")
    assignment = (
        db.query(models.TeacherAssignment)
        .filter(
            models.TeacherAssignment.teacher_id == teacher.id,
            models.TeacherAssignment.department_id == payload.department_id,
            models.TeacherAssignment.batch == payload.batch,
            models.TeacherAssignment.section == payload.section,
            models.TeacherAssignment.course_id == payload.course_id,
            models.TeacherAssignment.session_id == payload.session_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="This teacher is not assigned to the selected class/course/session.")
    students = (
        db.query(models.Student)
        .filter(
            models.Student.department_id == payload.department_id,
            models.Student.batch == payload.batch,
            models.Student.section == payload.section,
        )
        .all()
    )
    student_map = {student.id: student for student in students}
    if not student_map:
        raise HTTPException(status_code=404, detail="No students found for selected class.")
    missing_students = [row.student_id for row in payload.student_marks if row.student_id not in student_map]
    if missing_students:
        raise HTTPException(status_code=400, detail="Some selected students do not belong to this class.")
    selected_labels = set(payload.selected_options.keys())
    if set(payload.assessment_totals.keys()) != selected_labels:
        raise HTTPException(status_code=400, detail="Assessment total marks are missing for one or more columns.")
    for row in payload.student_marks:
        for mark in row.marks:
            if mark.assessment_label not in selected_labels:
                raise HTTPException(status_code=400, detail="Submitted marks contain an unknown assessment column.")
            assessment_total = payload.assessment_totals.get(mark.assessment_label, payload.total_marks)
            if mark.obtained_marks > assessment_total:
                raise HTTPException(status_code=400, detail="Obtained marks cannot be greater than assessment total marks.")
    marksheet.teacher_id = teacher.id
    marksheet.department_id = payload.department_id
    marksheet.batch = payload.batch
    marksheet.section = payload.section
    marksheet.course_id = payload.course_id
    marksheet.session_id = payload.session_id
    marksheet.exam_type = payload.exam_type
    marksheet.total_marks = payload.total_marks
    marksheet.export_file_name = sanitize_export_file_name(payload.export_file_name, f"marksheet_{payload.batch}_{payload.section}")
    marksheet.selected_options = payload.selected_options
    marksheet.assessment_totals = payload.assessment_totals
    db.query(models.StudentAssessmentMark).filter(
        models.StudentAssessmentMark.marksheet_id == marksheet.id
    ).delete()
    assessment_columns = list(payload.selected_options.keys())
    excel_rows = []
    for student_row in payload.student_marks:
        marks_map: dict[str, float] = {}
        for mark in student_row.marks:
            entry = models.StudentAssessmentMark(
                marksheet_id=marksheet.id,
                student_id=student_row.student_id,
                assessment_label=mark.assessment_label,
                obtained_marks=mark.obtained_marks,
                remarks=mark.remarks or student_row.remarks,
            )
            db.add(entry)
            marks_map[mark.assessment_label] = mark.obtained_marks
        student = student_map[student_row.student_id]
        excel_rows.append(
            {
                "roll_number": student.roll_number,
                "full_name": student.full_name,
                "marks": marks_map,
                "remarks": student_row.remarks,
            }
        )
    db.add(
        models.AuditLog(
            teacher_id=teacher.id,
            action="MARKSHEET_UPDATED",
            new_value=json.dumps(
                {
                    "marksheet_id": marksheet.id,
                    "department_id": payload.department_id,
                    "batch": payload.batch,
                    "section": payload.section,
                    "course_id": payload.course_id,
                    "session_id": payload.session_id,
                    "exam_type": payload.exam_type,
                    "selected_options": payload.selected_options,
                }
            ),
            changed_at=datetime.datetime.utcnow(),
        )
    )
    db.commit()
    department = db.query(models.Department).filter(models.Department.id == payload.department_id).first()
    threading.Thread(
        target=finalize_marksheet_artifacts,
        args=(
            marksheet.id,
            teacher.name,
            teacher.email,
            department.name if department else str(payload.department_id),
            payload.section,
            payload.total_marks,
            payload.selected_options,
            payload.assessment_totals,
            assessment_columns,
            excel_rows,
        ),
        daemon=True,
    ).start()
    return {
        "message": "Marksheet updated successfully.",
        "marksheet_id": marksheet.id,
        "download_url": f"/marksheets/{marksheet.id}/download",
        "export_file_name": marksheet.export_file_name,
    }
@app.get("/marksheets", response_model=list[schemas.MarksheetSummary])
def list_marksheets(
    email: str | None = Query(default=None),
    teacher_name: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(models.Marksheet)
    if email or teacher_name:
        query = query.join(models.Teacher)
        if email:
            query = query.filter(
                func.lower(models.Teacher.email) == email.strip().lower()
            )
        if teacher_name:
            query = query.filter(
                func.lower(models.Teacher.name).like(f"%{teacher_name.strip().lower()}%")
            )
    marksheets = query.order_by(models.Marksheet.created_at.desc()).all()
    response = []
    for marksheet in marksheets:
        response.append(
            schemas.MarksheetSummary(
                id=marksheet.id,
                teacher_name=marksheet.teacher.name if marksheet.teacher else "",
                email=marksheet.teacher.email if marksheet.teacher else "",
                department=marksheet.department.name if marksheet.department else None,
                batch=marksheet.batch,
                section=marksheet.section,
                course=marksheet.course.course_name if marksheet.course else None,
                session=marksheet.session.name if marksheet.session else None,
                exam_type=marksheet.exam_type,
                total_marks=float(marksheet.total_marks),
                export_file_name=marksheet.export_file_name,
                selected_options=marksheet.selected_options,
                assessment_totals=marksheet.assessment_totals or {},
                student_count=len({mark.student_id for mark in marksheet.marks}),
                created_at=marksheet.created_at,
                download_url=f"/marksheets/{marksheet.id}/download",
            )
        )
    return response
@app.get("/marksheets/{marksheet_id}/download")
def download_marksheet(
    marksheet_id: int,
    filename: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    marksheet = db.query(models.Marksheet).filter(models.Marksheet.id == marksheet_id).first()
    if not marksheet:
        raise HTTPException(status_code=404, detail="Marksheet not found.")
    if not marksheet.excel_file_path:
        raise HTTPException(status_code=404, detail="Excel file not available.")
    download_name = sanitize_export_file_name(
        filename,
        marksheet.export_file_name or f"marksheet_{marksheet.id}",
    )
    return FileResponse(
        path=marksheet.excel_file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=download_name,
    )
