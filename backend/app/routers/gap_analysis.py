import asyncio
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse

from app.services.paper_parser import parse_question_paper
from app.services.excel_parser import parse_marksheet
from app.services.gap_analyzer import analyze_gaps
from app.services.question_generator import generate_personalized_questions
from app.services.cis_parser import parse_cis, parse_cis_full

router = APIRouter(
    prefix="/gap-analysis",
    tags=["Gap Analysis"]
)


@router.post("/")
async def gap_analysis(
    question_paper: UploadFile = File(...),
    marksheet: UploadFile = File(...)
):
    questions = await parse_question_paper(question_paper)
    students  = await parse_marksheet(marksheet)
    return analyze_gaps(questions, students, threshold_percentage=30)


@router.post("/with-recommendations")
async def gap_analysis_with_recommendations(
    question_paper:   UploadFile = File(...),
    marksheet:        UploadFile = File(...),
    cis_file:         Optional[UploadFile] = File(None),
    difficulty_level: str = Form("Moderate")
):
    questions  = await parse_question_paper(question_paper)
    students   = await parse_marksheet(marksheet)
    gap_result = analyze_gaps(questions, students, threshold_percentage=30)

    cis_weeks    = []
    clo_taxonomy = {}
    course_title = ""
    course_title = ""
    course_title = ""
    course_title = ""

    if cis_file and cis_file.filename:
        try:
            # parse_cis_full se BOTH weeks aur taxonomy lo
            cis_data     = await parse_cis_full(cis_file)
            cis_weeks    = cis_data["weeks"]
            clo_taxonomy = cis_data["clo_taxonomy"]
            course_title = cis_data.get("course_title", "")
            course_title = cis_data.get("course_title", "")
            course_title = cis_data.get("course_title", "")
            course_title = cis_data.get("course_title", "")
            course_title = cis_data.get("course_title", "")
            course_title = cis_data.get("course_title", "")
            print(f"✅ CIS loaded: {len(cis_weeks)} weeks, taxonomy: {clo_taxonomy}")
        except Exception as e:
            print(f"⚠️ CIS parse failed: {e}")

    student_weak_clos: dict[str, list[str]] = {}
    for clo_item in gap_result.get("clo_results", []):
        if clo_item["status"] == "Weak CLO":
            clo_label = clo_item["clo"]
            for name in clo_item.get("student_names", []):
                student_weak_clos.setdefault(name, []).append(clo_label)

    weak_students = []
    for student in students:
        name      = student["name"]
        weak_clos = student_weak_clos.get(name, [])
        weak_students.append({
            "student_name": name,
            "roll_no":      student.get("roll_no", ""),
            "weak_clos":    weak_clos,
            "has_weakness": len(weak_clos) > 0
        })

    return JSONResponse(content={
        "threshold_percentage": gap_result["threshold_percentage"],
        "summary":              gap_result["class_summary"],
        "clo_overview":         gap_result["clo_results"],
        "cis_loaded":           len(cis_weeks) > 0,
        "course_title":         course_title,
        "clo_taxonomy":         clo_taxonomy,   # ← frontend ko bhi de do
        "weak_students":        weak_students,
    })


@router.post("/generate-for-student")
async def generate_for_student(
    question_paper:   UploadFile = File(...),
    marksheet:        UploadFile = File(...),
    cis_file:         Optional[UploadFile] = File(None),
    student_name:     str = Form(...),
    weak_clos:        str = Form(...),
    clo_question_map: str = Form(...),
    difficulty_level: str = Form("Moderate")
):
    import json as jsonlib

    questions    = await parse_question_paper(question_paper)
    cis_weeks    = []
    clo_taxonomy = {}
    course_title = ""

    if cis_file and cis_file.filename:
        try:
            cis_data     = await parse_cis_full(cis_file)
            cis_weeks    = cis_data["weeks"]
            clo_taxonomy = cis_data["clo_taxonomy"]
            print(f"✅ CIS taxonomy for generation: {clo_taxonomy}")
        except Exception as e:
            print(f"⚠️ CIS parse failed: {e}")

    weak_clos_list = jsonlib.loads(weak_clos)
    clo_q_map      = jsonlib.loads(clo_question_map)

    generated = await generate_personalized_questions(
        student_name      = student_name,
        weak_clos         = weak_clos_list,
        all_questions     = questions,
        cis_weeks         = cis_weeks,
        clo_taxonomy      = clo_taxonomy,   # ← CIS se parsed taxonomy pass ho rahi hai
        clo_question_map  = clo_q_map,
        difficulty_level  = difficulty_level
    )

    return JSONResponse(content={
        "student_name": student_name,
        "weak_clos":    weak_clos_list,
        "assignment":   generated,
        "course_title": course_title
    })
