import json
from io import BytesIO
from typing import Any
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from app import models


GAP_REPORT_RETENTION_DAYS = 28
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


def expires_at(created_at: datetime | None) -> datetime | None:
    if not created_at:
        return None
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at + timedelta(days=GAP_REPORT_RETENTION_DAYS)


def is_expired(created_at: datetime | None) -> bool:
    expiry = expires_at(created_at)
    return bool(expiry and datetime.now(timezone.utc) >= expiry)


def delete_gap_report(report: models.GapAnalysisReport, db: Session, commit: bool = True) -> None:
    db.query(models.HodInsightSnapshot).filter(
        models.HodInsightSnapshot.gap_report_id == report.id
    ).delete(synchronize_session=False)
    db.delete(report)
    if commit:
        db.commit()


def delete_hod_snapshot(snapshot: models.HodInsightSnapshot, db: Session, commit: bool = True) -> None:
    db.delete(snapshot)
    if commit:
        db.commit()


def cleanup_expired_gap_reports(db: Session, teacher_id: int | None = None) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=GAP_REPORT_RETENTION_DAYS)
    query = db.query(models.GapAnalysisReport).filter(
        models.GapAnalysisReport.created_at.isnot(None),
        models.GapAnalysisReport.created_at < cutoff,
    )
    if teacher_id is not None:
        query = query.filter(models.GapAnalysisReport.teacher_id == teacher_id)

    expired_reports = query.all()
    for report in expired_reports:
        delete_gap_report(report, db, commit=False)
    if expired_reports:
        db.commit()


def cleanup_expired_hod_snapshots(db: Session, hod_id: int | None = None) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=GAP_REPORT_RETENTION_DAYS)
    query = db.query(models.HodInsightSnapshot).filter(
        models.HodInsightSnapshot.created_at.isnot(None),
        models.HodInsightSnapshot.created_at < cutoff,
    )
    if hod_id is not None:
        query = query.filter(models.HodInsightSnapshot.hod_id == hod_id)

    expired_snapshots = query.all()
    for snapshot in expired_snapshots:
        delete_hod_snapshot(snapshot, db, commit=False)
    if expired_snapshots:
        db.commit()


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
    expiry = expires_at(report.created_at)
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
        "expires_at": expiry.isoformat() if expiry else None,
        "download_url": f"/gap-analysis/reports/{report.id}/download",
        "summary": summary,
        "report": report_data,
    }


def build_hod_snapshot_payload(snapshot: models.HodInsightSnapshot) -> dict:
    snapshot_data = parse_json_object(snapshot.snapshot_json, {})
    expiry = expires_at(snapshot.created_at)
    return {
        "id": snapshot.id,
        "gap_report_id": snapshot.gap_report_id,
        "teacher_id": snapshot.teacher_id,
        "teacher_course_id": snapshot.teacher_course_id,
        "department": snapshot.department or "",
        "semester": snapshot.semester,
        "course_code": snapshot.course_code or "",
        "course_name": snapshot.course_name or "",
        "teacher_name": snapshot.teacher_name or "",
        "assessment_type": snapshot_data.get("assessment_type", ""),
        "assessment_title": snapshot_data.get("assessment_title", ""),
        "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
        "expires_at": expiry.isoformat() if expiry else None,
        "download_url": f"/api/hod/academic-insights/snapshots/{snapshot.id}/download",
        "snapshot": snapshot_data,
    }


def build_gap_report_pdf(payload: dict) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=34, leftMargin=34, topMargin=34, bottomMargin=34)
    styles = getSampleStyleSheet()
    story = []
    summary = payload.get("summary") or {}
    report = payload.get("report") or payload.get("snapshot", {}).get("report", {}) or {}
    gap_results = report.get("gap_results") or []
    clo_results = report.get("clo_results") or report.get("clo_overview") or []

    title = payload.get("assessment_title") or payload.get("assessment_type") or "Gap Analysis Report"
    story.append(Paragraph(str(title), styles["Title"]))
    story.append(Paragraph(
        f"{payload.get('course_code', '')} - {payload.get('course_name', '')}",
        styles["Heading3"]
    ))
    story.append(Paragraph(
        f"Teacher: {payload.get('teacher_name', '-')} | Semester: {payload.get('semester', '-')} | "
        f"Assessment: {payload.get('assessment_type', '-')}",
        styles["Normal"]
    ))
    story.append(Spacer(1, 14))

    metric_rows = [
        ["Average", f"{summary.get('average_percentage', 0)}%"],
        ["Pass Rate", f"{summary.get('pass_rate', 0)}%"],
        ["At Risk Students", str(summary.get("at_risk_students", 0))],
        ["Weak CLOs", str(summary.get("weak_clo_count", 0))],
        ["Weakest CLO", str(summary.get("weakest_clo", "-") or "-")],
        ["Problem Question", str(summary.get("most_problematic_question", "-") or "-")],
    ]
    metric_table = Table(metric_rows, colWidths=[170, 310])
    metric_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef4ff")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cfd8ea")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(metric_table)
    story.append(Spacer(1, 16))

    chart_drawings = build_gap_report_chart_drawings(summary, gap_results, clo_results)
    if chart_drawings:
        story.append(Paragraph("Quick Charts", styles["Heading2"]))
        for drawing in chart_drawings:
            story.append(drawing)
            story.append(Spacer(1, 12))

    if clo_results:
        story.append(Paragraph("CLO-wise Gap", styles["Heading2"]))
        rows = [["CLO", "Questions", "Students Below", "Gap %", "Status"]]
        for item in clo_results:
            rows.append([
                str(item.get("clo", "")),
                ", ".join(item.get("questions") or []),
                str(item.get("students_below_threshold", 0)),
                f"{item.get('gap_percentage', 0)}%",
                str(item.get("status", "")),
            ])
        table = Table(rows, repeatRows=1, colWidths=[55, 190, 90, 60, 85])
        table.setStyle(_report_table_style())
        story.append(table)
        story.append(Spacer(1, 16))

    if gap_results:
        story.append(Paragraph("Question-wise Gap", styles["Heading2"]))
        rows = [["Question", "CLO", "Students Below", "Gap %", "Status"]]
        for item in gap_results:
            rows.append([
                str(item.get("question", "")),
                str(item.get("clo", "")),
                str(item.get("students_below_threshold", 0)),
                f"{item.get('gap_percentage', 0)}%",
                str(item.get("status", "")),
            ])
        table = Table(rows, repeatRows=1, colWidths=[110, 70, 100, 70, 130])
        table.setStyle(_report_table_style())
        story.append(table)

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        f"Source files: Paper: {payload.get('question_paper_name', '-') or '-'} | "
        f"Marksheet: {payload.get('marksheet_name', '-') or '-'} | CIS: {payload.get('cis_file_name', '-') or '-'}",
        styles["Normal"]
    ))
    doc.build(story)
    return buffer.getvalue()


def build_gap_report_chart_drawings(summary: dict, gap_results: list[dict], clo_results: list[dict]) -> list[Drawing]:
    drawings: list[Drawing] = []
    pass_rate = _safe_float(summary.get("pass_rate"))
    if pass_rate or summary.get("student_count"):
        drawings.append(_stacked_percentage_chart(
            "Pass vs At Risk",
            [("Pass", pass_rate, colors.HexColor("#1d7f62")), ("At Risk", max(100 - pass_rate, 0), colors.HexColor("#ef5350"))],
        ))

    clo_items = [
        (str(item.get("clo") or f"CLO {index + 1}"), _safe_float(item.get("gap_percentage")))
        for index, item in enumerate(clo_results[:8])
    ]
    if clo_items:
        drawings.append(_horizontal_bar_chart("CLO Gap %", clo_items, colors.HexColor("#ef5350")))

    question_items = [
        (str(item.get("question") or f"Q{index + 1}"), _safe_float(item.get("gap_percentage")))
        for index, item in enumerate(gap_results[:10])
    ]
    if question_items:
        drawings.append(_horizontal_bar_chart("Question-wise Gap %", question_items, colors.HexColor("#4069d9")))

    return drawings


def _stacked_percentage_chart(title: str, segments: list[tuple[str, float, colors.Color]]) -> Drawing:
    width = 480
    height = 86
    drawing = Drawing(width, height)
    drawing.add(String(0, height - 14, title, fontName="Helvetica-Bold", fontSize=11, fillColor=colors.HexColor("#16345c")))
    x = 0
    y = 38
    bar_width = 360
    bar_height = 18
    drawing.add(Rect(x, y, bar_width, bar_height, fillColor=colors.HexColor("#edf2ff"), strokeColor=colors.HexColor("#cfd8ea")))
    offset = 0
    legend_x = 0
    for label, value, color in segments:
        value = max(min(value, 100), 0)
        segment_width = (value / 100) * bar_width
        if segment_width:
            drawing.add(Rect(x + offset, y, segment_width, bar_height, fillColor=color, strokeColor=None))
        drawing.add(Rect(legend_x, 12, 10, 10, fillColor=color, strokeColor=None))
        drawing.add(String(legend_x + 14, 12, f"{label}: {round(value, 1)}%", fontSize=8, fillColor=colors.HexColor("#52637f")))
        legend_x += 110
        offset += segment_width
    drawing.add(String(bar_width + 12, y + 4, "100%", fontSize=8, fillColor=colors.HexColor("#52637f")))
    return drawing


def _horizontal_bar_chart(title: str, items: list[tuple[str, float]], color: colors.Color) -> Drawing:
    row_height = 18
    width = 480
    height = max(74, 38 + len(items) * row_height)
    drawing = Drawing(width, height)
    drawing.add(String(0, height - 14, title, fontName="Helvetica-Bold", fontSize=11, fillColor=colors.HexColor("#16345c")))
    label_width = 92
    bar_width = 320
    base_y = height - 34
    drawing.add(Line(label_width, 16, label_width + bar_width, 16, strokeColor=colors.HexColor("#cfd8ea"), strokeWidth=0.5))
    for index, (label, value) in enumerate(items):
        y = base_y - index * row_height
        value = max(min(value, 100), 0)
        safe_label = label if len(label) <= 18 else f"{label[:15]}..."
        drawing.add(String(0, y, safe_label, fontSize=8, fillColor=colors.HexColor("#52637f")))
        drawing.add(Rect(label_width, y - 3, bar_width, 10, fillColor=colors.HexColor("#edf2ff"), strokeColor=None))
        drawing.add(Rect(label_width, y - 3, (value / 100) * bar_width, 10, fillColor=color, strokeColor=None))
        drawing.add(String(label_width + bar_width + 8, y - 1, f"{round(value, 1)}%", fontSize=8, fillColor=colors.HexColor("#52637f")))
    return drawing


def _safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _report_table_style() -> TableStyle:
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#183d82")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cfd8ea")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ])


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
