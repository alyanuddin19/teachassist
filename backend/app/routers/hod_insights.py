import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.services.gap_report_service import (
    build_gap_report_payload,
    calculate_gap_summary,
    department_filter_values,
    departments_for_hod,
    normalize_department,
    parse_json_object,
)

router = APIRouter(prefix="/api/hod/academic-insights", tags=["HOD Academic Insights"])


def get_hod_by_name(hod_name: str, db: Session) -> models.HeadOfDepartment:
    hod = db.query(models.HeadOfDepartment).filter(
        models.HeadOfDepartment.full_name == (hod_name or "").strip()
    ).first()
    if not hod:
        raise HTTPException(status_code=404, detail="HOD not found")
    return hod


def ensure_department_allowed(hod: models.HeadOfDepartment, department: str) -> str:
    normalized = normalize_department(department)
    if normalized not in departments_for_hod(hod.department):
        raise HTTPException(status_code=403, detail="This department is not available for this HOD")
    return normalized


def teacher_course_is_allowed(
    record: models.TeacherCourse,
    hod: models.HeadOfDepartment,
    requested_department: str | None = None,
) -> bool:
    allowed = set()
    for department in departments_for_hod(hod.department):
        allowed.update(department_filter_values(department))
    if requested_department:
        allowed = department_filter_values(requested_department)
    return normalize_department(record.department) in allowed


@router.get("/departments")
def get_academic_insight_departments(hod_name: str, db: Session = Depends(get_db)):
    hod = get_hod_by_name(hod_name, db)
    return {
        "hod_name": hod.full_name,
        "hod_department": hod.department,
        "departments": departments_for_hod(hod.department),
        "semesters": list(range(1, 9)),
    }


@router.get("")
def get_semester_course_insights(
    hod_name: str,
    department: str,
    semester: int,
    db: Session = Depends(get_db),
):
    hod = get_hod_by_name(hod_name, db)
    selected_department = ensure_department_allowed(hod, department)
    if semester < 1 or semester > 8:
        raise HTTPException(status_code=400, detail="Semester must be between 1 and 8")

    records = db.query(models.TeacherCourse).filter(
        models.TeacherCourse.semester == semester
    ).order_by(models.TeacherCourse.created_at.desc(), models.TeacherCourse.id.desc()).all()
    records = [
        record for record in records
        if teacher_course_is_allowed(record, hod, selected_department)
    ]

    teacher_ids = [record.teacher_id for record in records]
    course_ids = [record.course_id for record in records]
    record_ids = [record.id for record in records]
    teachers = {
        teacher.id: teacher
        for teacher in db.query(models.Teacher).filter(models.Teacher.id.in_(teacher_ids)).all()
    } if teacher_ids else {}
    courses = {
        course.id: course
        for course in db.query(models.Course).filter(models.Course.id.in_(course_ids)).all()
    } if course_ids else {}
    reports_by_record: dict[int, list[models.GapAnalysisReport]] = {record_id: [] for record_id in record_ids}
    reports = db.query(models.GapAnalysisReport).filter(
        models.GapAnalysisReport.teacher_course_id.in_(record_ids)
    ).order_by(models.GapAnalysisReport.created_at.desc(), models.GapAnalysisReport.id.desc()).all() if record_ids else []

    for report in reports:
        if report.teacher_course_id in reports_by_record:
            reports_by_record[report.teacher_course_id].append(report)

    course_rows = []
    for record in records:
        course = courses.get(record.course_id)
        teacher = teachers.get(record.teacher_id)
        record_reports = reports_by_record.get(record.id, [])
        latest_report = record_reports[0] if record_reports else None
        latest_summary = calculate_gap_summary(parse_json_object(latest_report.report_json, {})) if latest_report else None
        course_rows.append({
            "teacher_course_id": record.id,
            "teacher_id": record.teacher_id,
            "teacher_name": teacher.teacher_name if teacher else "",
            "course_id": record.course_id,
            "course_code": course.course_code if course else "",
            "course_name": course.course_name if course else "",
            "department": record.department or "",
            "semester": record.semester,
            "section": record.section or "",
            "batch": record.batch or "",
            "threshold_percentage": record.threshold_percentage if record.threshold_percentage is not None else 50,
            "report_count": len(record_reports),
            "latest_report_id": latest_report.id if latest_report else None,
            "latest_assessment_title": latest_report.assessment_title if latest_report else "",
            "latest_assessment_type": latest_report.assessment_type if latest_report else "",
            "latest_report_created_at": latest_report.created_at.isoformat() if latest_report and latest_report.created_at else None,
            "latest_summary": latest_summary,
        })

    return {
        "department": selected_department,
        "semester": semester,
        "courses": course_rows,
    }


@router.get("/courses/{teacher_course_id}")
def get_course_gap_reports(
    teacher_course_id: int,
    hod_name: str,
    db: Session = Depends(get_db),
):
    hod = get_hod_by_name(hod_name, db)
    record = db.query(models.TeacherCourse).filter(models.TeacherCourse.id == teacher_course_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Teacher course not found")
    if not teacher_course_is_allowed(record, hod):
        raise HTTPException(status_code=403, detail="This course is not available for this HOD")

    teacher = db.query(models.Teacher).filter(models.Teacher.id == record.teacher_id).first()
    course = db.query(models.Course).filter(models.Course.id == record.course_id).first()
    reports = db.query(models.GapAnalysisReport).filter(
        models.GapAnalysisReport.teacher_course_id == teacher_course_id
    ).order_by(models.GapAnalysisReport.created_at.desc(), models.GapAnalysisReport.id.desc()).all()

    return {
        "course": {
            "teacher_course_id": record.id,
            "teacher_id": record.teacher_id,
            "teacher_name": teacher.teacher_name if teacher else "",
            "course_id": record.course_id,
            "course_code": course.course_code if course else "",
            "course_name": course.course_name if course else "",
            "department": record.department or "",
            "semester": record.semester,
            "section": record.section or "",
            "batch": record.batch or "",
            "threshold_percentage": record.threshold_percentage if record.threshold_percentage is not None else 50,
        },
        "reports": [build_gap_report_payload(report, teacher) for report in reports],
    }


@router.get("/reports/{report_id}")
def get_gap_report_detail(report_id: int, hod_name: str, db: Session = Depends(get_db)):
    hod = get_hod_by_name(hod_name, db)
    report = db.query(models.GapAnalysisReport).filter(models.GapAnalysisReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Gap analysis report not found")
    record = db.query(models.TeacherCourse).filter(models.TeacherCourse.id == report.teacher_course_id).first()
    if record and not teacher_course_is_allowed(record, hod):
        raise HTTPException(status_code=403, detail="This report is not available for this HOD")
    teacher = db.query(models.Teacher).filter(models.Teacher.id == report.teacher_id).first()
    return build_gap_report_payload(report, teacher)


@router.post("/reports/{report_id}/snapshot")
def save_gap_report_snapshot(report_id: int, data: dict, db: Session = Depends(get_db)):
    hod = get_hod_by_name(data.get("hod_name", ""), db)
    report = db.query(models.GapAnalysisReport).filter(models.GapAnalysisReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Gap analysis report not found")
    record = db.query(models.TeacherCourse).filter(models.TeacherCourse.id == report.teacher_course_id).first()
    if record and not teacher_course_is_allowed(record, hod):
        raise HTTPException(status_code=403, detail="This report is not available for this HOD")
    teacher = db.query(models.Teacher).filter(models.Teacher.id == report.teacher_id).first()
    payload = build_gap_report_payload(report, teacher)

    snapshot = models.HodInsightSnapshot(
        hod_id=hod.id,
        gap_report_id=report.id,
        teacher_id=report.teacher_id,
        teacher_course_id=report.teacher_course_id,
        department=report.department or "",
        semester=report.semester,
        course_code=report.course_code_snapshot or "",
        course_name=report.course_name_snapshot or "",
        teacher_name=teacher.teacher_name if teacher else "",
        snapshot_json=json.dumps(payload),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return {
        "status": "saved",
        "snapshot_id": snapshot.id,
        "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
    }
