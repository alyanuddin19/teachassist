import json
from typing import Any

from sqlalchemy.orm import Session

from app import models


CS_DEPARTMENT_ALIASES = {"CS", "COMPUTER SCIENCE"}
SE_DEPARTMENT_ALIASES = {"SE", "SOFTWARE ENGINEERING"}


def normalize_department(value: str | None) -> str:
    return (value or "").strip().upper()


def departments_for_hod(hod_department: str) -> list[str]:
    department = normalize_department(hod_department)
    if department in CS_DEPARTMENT_ALIASES:
        return ["CS", "SE"]
    if department in SE_DEPARTMENT_ALIASES:
        return ["SE"]
    return [department] if department else []


def department_filter_values(department: str) -> set[str]:
    normalized = normalize_department(department)
    if normalized == "CS" or normalized in CS_DEPARTMENT_ALIASES:
        return CS_DEPARTMENT_ALIASES
    if normalized == "SE" or normalized in SE_DEPARTMENT_ALIASES:
        return SE_DEPARTMENT_ALIASES
    return {normalized}


def parse_json_object(raw: str | None, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}
    try:
        parsed = json.loads(raw or "")
        return parsed if parsed is not None else fallback
    except Exception:
        return fallback


def calculate_gap_summary(report_data: dict) -> dict:
    gap_results = report_data.get("gap_results") or []
    clo_results = report_data.get("clo_results") or report_data.get("clo_overview") or []
    heatmap = report_data.get("heatmap") or {}
    heatmap_students = heatmap.get("students") or []
    class_students = (report_data.get("class_summary") or {}).get("students") or []
    student_count = len(heatmap_students) or len(class_students)

    weak_clos = [
        item for item in clo_results
        if int(item.get("students_below_threshold") or 0) > 0
    ]
    strongest_clo = min(clo_results, key=lambda item: float(item.get("gap_percentage") or 0), default=None)
    weakest_clo = max(clo_results, key=lambda item: float(item.get("gap_percentage") or 0), default=None)
    most_problematic_question = max(gap_results, key=lambda item: float(item.get("gap_percentage") or 0), default=None)

    total_percentages = [float(item.get("total_percentage") or 0) for item in class_students]
    average_percentage = round(sum(total_percentages) / len(total_percentages), 2) if total_percentages else 0
    at_risk_students = len([item for item in class_students if item.get("below_total_threshold")])
    pass_count = max(student_count - at_risk_students, 0)
    pass_rate = round((pass_count / student_count) * 100, 2) if student_count else 0

    return {
        "student_count": student_count,
        "average_percentage": average_percentage,
        "pass_rate": pass_rate,
        "at_risk_students": at_risk_students,
        "weak_clo_count": len(weak_clos),
        "weakest_clo": weakest_clo.get("clo") if weakest_clo else "",
        "weakest_clo_gap_percentage": weakest_clo.get("gap_percentage") if weakest_clo else 0,
        "strongest_clo": strongest_clo.get("clo") if strongest_clo else "",
        "most_problematic_question": most_problematic_question.get("question") if most_problematic_question else "",
        "most_problematic_question_gap_percentage": most_problematic_question.get("gap_percentage") if most_problematic_question else 0,
    }


def build_gap_report_payload(report: models.GapAnalysisReport, teacher: models.Teacher | None = None) -> dict:
    report_data = parse_json_object(report.report_json, {})
    summary = calculate_gap_summary(report_data)
    return {
        "id": report.id,
        "teacher_id": report.teacher_id,
        "teacher_course_id": report.teacher_course_id,
        "course_id": report.course_id,
        "department": report.department or "",
        "semester": report.semester,
        "section": report.section or "",
        "batch": report.batch or "",
        "course_code": report.course_code_snapshot or "",
        "course_name": report.course_name_snapshot or "",
        "teacher_name": teacher.teacher_name if teacher else "",
        "assessment_type": report.assessment_type,
        "assessment_title": report.assessment_title or report.assessment_type,
        "question_paper_name": report.question_paper_name or "",
        "marksheet_name": report.marksheet_name or "",
        "cis_file_name": report.cis_file_name or "",
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "summary": summary,
        "report": report_data,
    }


def create_gap_analysis_report(
    db: Session,
    teacher: models.Teacher,
    teacher_course: models.TeacherCourse | None,
    course: models.Course | None,
    assessment_type: str,
    assessment_title: str,
    question_paper_name: str,
    marksheet_name: str,
    cis_file_name: str,
    report_data: dict,
) -> models.GapAnalysisReport:
    report = models.GapAnalysisReport(
        teacher_id=teacher.id,
        teacher_course_id=teacher_course.id if teacher_course else None,
        course_id=course.id if course else None,
        department=(teacher_course.department if teacher_course else teacher.department) or "",
        semester=teacher_course.semester if teacher_course else None,
        section=(teacher_course.section if teacher_course else "") or "",
        batch=(teacher_course.batch if teacher_course else "") or "",
        assessment_type=(assessment_type or "Assessment").strip() or "Assessment",
        assessment_title=(assessment_title or assessment_type or "Assessment").strip(),
        course_code_snapshot=course.course_code if course else report_data.get("course_code", ""),
        course_name_snapshot=course.course_name if course else report_data.get("course_name", ""),
        question_paper_name=question_paper_name or "",
        marksheet_name=marksheet_name or "",
        cis_file_name=cis_file_name or "",
        report_json=json.dumps(report_data),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
