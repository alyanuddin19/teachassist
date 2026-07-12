import re
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.services.paper_parser import parse_question_paper, extract_text_from_document
from app.services.excel_parser import parse_marksheet, parse_marksheet_structure
from app.services.gap_analyzer import analyze_gaps
from app.services.question_generator import generate_personalized_questions
from app.services.cis_parser import parse_cis_full

router = APIRouter(prefix="/gap-analysis", tags=["Gap Analysis"])


def normalize_clo_label(value: str) -> str:
    match = re.search(r"(\d+)", str(value or ""))
    if not match:
        return ""
    return f"CLO-{int(match.group(1))}"


def reconcile_question_clos(questions: list[dict], marksheet_structure: dict) -> tuple[list[dict], str]:
    marksheet_map = marksheet_structure.get("question_clos") or {}
    if not marksheet_map:
        return questions, ""

    paper_clos = {
        normalize_clo_label(question.get("clo", ""))
        for question in questions
        if question.get("id")
    }
    paper_clos.discard("")
    marksheet_clos = {normalize_clo_label(value) for value in marksheet_map.values() if value}
    marksheet_clos.discard("")

    should_use_marksheet_fallback = len(paper_clos) <= 1 and len(marksheet_clos) > 1
    mismatched_questions: list[str] = []
    reconciled_questions: list[dict] = []

    for question in questions:
        qid = question.get("id")
        parsed_clo = normalize_clo_label(question.get("clo", ""))
        sheet_clo = normalize_clo_label(marksheet_map.get(qid, ""))

        next_question = dict(question)
        if sheet_clo:
            if should_use_marksheet_fallback or not parsed_clo or parsed_clo == "CLO-UNKNOWN":
                next_question["clo"] = sheet_clo
            elif parsed_clo != sheet_clo:
                mismatched_questions.append(f"{qid} ({parsed_clo} vs {sheet_clo})")
                next_question["clo"] = sheet_clo
        reconciled_questions.append(next_question)

    if mismatched_questions:
        warning = (
            "Question paper CLO labels did not fully match the uploaded marksheet. "
            f"Gap analysis used the marksheet CLO mapping for: {', '.join(mismatched_questions)}."
        )
        return reconciled_questions, warning

    if should_use_marksheet_fallback:
        return (
            reconciled_questions,
            "Question paper CLO labels were incomplete, so gap analysis used the CLO mapping from the uploaded marksheet."
        )

    return reconciled_questions, ""


async def resolve_teacher_threshold(
    question_paper: UploadFile,
    teacher_name: str,
    db: Session
) -> tuple[str, str, int]:
    if not teacher_name:
        raise HTTPException(status_code=400, detail="Teacher session is required for gap analysis")

    teacher = db.query(models.Teacher).filter(
        models.Teacher.teacher_name == teacher_name
    ).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    document_text = (await extract_text_from_document(question_paper)).upper()
    await question_paper.seek(0)
    teacher_records = db.query(models.TeacherCourse).filter(
        models.TeacherCourse.teacher_id == teacher.id
    ).all()
    if not teacher_records:
        raise HTTPException(status_code=404, detail="No saved teacher records found for this teacher")

    course_map: dict[int, models.Course] = {
        course.id: course
        for course in db.query(models.Course).all()
    }

    normalized_text = re.sub(r"[^A-Z0-9]+", "", document_text)
    matched_record = None
    matched_course = None
    for record in teacher_records:
        course = course_map.get(record.course_id)
        if not course or not course.course_code:
            continue
        normalized_code = re.sub(r"[^A-Z0-9]+", "", course.course_code.upper())
        if normalized_code and normalized_code in normalized_text:
            matched_record = record
            matched_course = course
            break

    if not matched_record or not matched_course:
        raise HTTPException(
            status_code=404,
            detail="Could not match the exam paper course code with your saved course records"
        )

    threshold_percentage = matched_record.threshold_percentage if matched_record.threshold_percentage is not None else 50
    return matched_course.course_code, matched_course.course_name, threshold_percentage


@router.post("/")
async def gap_analysis(
    question_paper: UploadFile = File(...),
    marksheet: UploadFile = File(...),
    teacher_name: str = Form(...),
    db: Session = Depends(get_db)
):
    course_code, course_name, threshold_percentage = await resolve_teacher_threshold(question_paper, teacher_name, db)
    questions = await parse_question_paper(question_paper)
    await marksheet.seek(0)
    marksheet_structure = await parse_marksheet_structure(marksheet)
    await marksheet.seek(0)
    students = await parse_marksheet(marksheet)
    questions, clo_warning = reconcile_question_clos(questions, marksheet_structure)
    result = analyze_gaps(questions, students, threshold_percentage=threshold_percentage)
    result["course_code"] = course_code
    result["course_name"] = course_name
    result["teacher_threshold_percentage"] = threshold_percentage
    result["clo_warning"] = clo_warning
    return result


@router.post("/with-recommendations")
async def gap_analysis_with_recommendations(
    question_paper: UploadFile = File(...),
    marksheet: UploadFile = File(...),
    cis_file: Optional[UploadFile] = File(None),
    difficulty_level: str = Form("Moderate"),
    teacher_name: str = Form(...),
    db: Session = Depends(get_db)
):
    course_code, detected_course_name, threshold_percentage = await resolve_teacher_threshold(question_paper, teacher_name, db)
    questions = await parse_question_paper(question_paper)
    await marksheet.seek(0)
    marksheet_structure = await parse_marksheet_structure(marksheet)
    await marksheet.seek(0)
    students = await parse_marksheet(marksheet)
    questions, clo_warning = reconcile_question_clos(questions, marksheet_structure)
    gap_result = analyze_gaps(questions, students, threshold_percentage=threshold_percentage)

    cis_weeks = []
    clo_taxonomy = {}
    course_title = detected_course_name

    if cis_file and cis_file.filename:
        try:
            cis_data = await parse_cis_full(cis_file)
            cis_weeks = cis_data["weeks"]
            clo_taxonomy = cis_data["clo_taxonomy"]
            course_title = cis_data.get("course_title", "")
        except Exception as e:
            print(f"CIS parse failed: {e}")

    student_weak_clos: dict[str, list[str]] = {}
    for clo_item in gap_result.get("clo_results", []):
        if clo_item["status"] == "Weak CLO":
            clo_label = clo_item["clo"]
            for name in clo_item.get("student_names", []):
                student_weak_clos.setdefault(name, []).append(clo_label)

    weak_students = []
    for student in students:
        name = student["name"]
        weak_clos = student_weak_clos.get(name, [])
        weak_students.append({
            "student_name": name,
            "roll_no": student.get("roll_no", ""),
            "weak_clos": weak_clos,
            "has_weakness": len(weak_clos) > 0
        })

    return JSONResponse(content={
        "threshold_percentage": gap_result["threshold_percentage"],
        "teacher_threshold_percentage": threshold_percentage,
        "gap_results": gap_result["gap_results"],
        "clo_results": gap_result["clo_results"],
        "weak_clos": gap_result["weak_clos"],
        "class_summary": gap_result["class_summary"],
        "heatmap": gap_result.get("heatmap", {"questions": [], "students": []}),
        "summary": gap_result["class_summary"],
        "clo_overview": gap_result["clo_results"],
        "cis_loaded": len(cis_weeks) > 0,
        "course_code": course_code,
        "course_name": detected_course_name,
        "course_title": course_title,
        "clo_taxonomy": clo_taxonomy,
        "weak_students": weak_students,
        "clo_warning": clo_warning,
    })


@router.post("/generate-for-student")
async def generate_for_student(
    question_paper: UploadFile = File(...),
    marksheet: UploadFile = File(...),
    cis_file: Optional[UploadFile] = File(None),
    student_name: str = Form(...),
    weak_clos: str = Form(...),
    clo_question_map: str = Form(...),
    difficulty_level: str = Form("Moderate")
):
    import json as jsonlib

    questions = await parse_question_paper(question_paper)
    cis_weeks = []
    clo_taxonomy = {}
    course_title = ""

    if cis_file and cis_file.filename:
        try:
            cis_data = await parse_cis_full(cis_file)
            cis_weeks = cis_data["weeks"]
            clo_taxonomy = cis_data["clo_taxonomy"]
            course_title = cis_data.get("course_title", "")
        except Exception as e:
            print(f"CIS parse failed: {e}")

    weak_clos_list = jsonlib.loads(weak_clos)
    clo_q_map = jsonlib.loads(clo_question_map)

    generated = await generate_personalized_questions(
        student_name=student_name,
        weak_clos=weak_clos_list,
        all_questions=questions,
        cis_weeks=cis_weeks,
        clo_taxonomy=clo_taxonomy,
        clo_question_map=clo_q_map,
        difficulty_level=difficulty_level
    )

    return JSONResponse(content={
        "student_name": student_name,
        "weak_clos": weak_clos_list,
        "assignment": generated,
        "course_title": course_title
    })
