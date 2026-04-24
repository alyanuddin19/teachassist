import re
from io import BytesIO
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import UploadFile


def _read_excel_bytes(upload: UploadFile) -> pd.DataFrame:
    file_bytes = upload.file.read()
    if not file_bytes:
        raise ValueError("Empty marksheet file")
    return pd.read_excel(BytesIO(file_bytes), engine="openpyxl")


def _read_excel_raw(upload: UploadFile) -> pd.DataFrame:
    file_bytes = upload.file.read()
    if not file_bytes:
        raise ValueError("Empty marksheet file")
    return pd.read_excel(BytesIO(file_bytes), engine="openpyxl", header=None)


def _find_name_column(columns: List[str]) -> Optional[str]:
    # Accept: Student Name, Name, Full Name, Student, Learner Name, etc.
    lowered = {c: str(c).strip().lower() for c in columns}

    # priority list
    priority = [
        "student name", "student_name", "full name", "fullname", "name", "student"
    ]
    for p in priority:
        for col, cl in lowered.items():
            if p == cl:
                return col

    # fallback: any column containing "name"
    for col, cl in lowered.items():
        if "name" in cl:
            return col

    return None


def _find_roll_column(columns: List[str]) -> Optional[str]:
    lowered = {c: str(c).strip().lower() for c in columns}
    priority = ["roll_no", "roll no", "rollno", "registration no", "reg no"]
    for p in priority:
        for col, cl in lowered.items():
            if p == cl:
                return col

    for col, cl in lowered.items():
        if "roll" in cl:
            return col

    return None


def _normalize_qid(text: str) -> Optional[str]:
    """
    Accepts:
    Q1, Q 1, q01, Q1(5), Q1 Marks, Question 1, Question-1, Q-1, etc.
    Returns normalized "Q1"
    """
    s = str(text).strip()

    # common patterns
    patterns = [
        r"\bQ\s*[-:]?\s*0*(\d+)\b",
        r"\bQuestion\s*[-:]?\s*0*(\d+)\b",
    ]
    for pat in patterns:
        m = re.search(pat, s, flags=re.IGNORECASE)
        if m:
            return f"Q{int(m.group(1))}"
    return None


def _normalize_header_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def _build_simple_students(df: pd.DataFrame) -> List[Dict[str, Any]]:
    df.columns = [str(c).strip() for c in df.columns]
    cols = df.columns.tolist()

    name_col = _find_name_column(cols)
    roll_col = _find_roll_column(cols)
    if not name_col:
        raise ValueError(
            "Excel must contain a student name column (e.g., 'Student Name' or 'Name'). "
            f"Found columns: {cols}"
        )

    q_map: Dict[str, str] = {}
    for c in cols:
        qid = _normalize_qid(c)
        if qid:
            q_map[qid] = c

    if not q_map:
        raise ValueError(
            "No question columns found in Excel. Please include columns like Q1, Q2, Q3... "
            "or 'Question 1', 'Q1 Marks', etc."
        )

    students: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        nm = row.get(name_col, "")
        if pd.isna(nm) or str(nm).strip() == "":
            continue

        marks: Dict[str, float] = {}
        for qid, orig_col in q_map.items():
            val = row.get(orig_col, 0)
            if pd.isna(val):
                val = 0
            try:
                marks[qid] = float(val)
            except Exception:
                marks[qid] = 0.0

        student_payload = {"name": str(nm).strip(), "marks": marks}
        if roll_col:
            roll_no = row.get(roll_col, "")
            if not pd.isna(roll_no) and str(roll_no).strip():
                student_payload["roll_no"] = str(roll_no).strip().upper()

        students.append(student_payload)

    if not students:
        raise ValueError("No student rows detected in Excel")

    return students


def _find_transform_header_row(df: pd.DataFrame) -> Optional[int]:
    for index in range(len(df)):
        row_values = [_normalize_header_text(value).lower() for value in df.iloc[index].tolist()]
        has_roll = any("roll" in value for value in row_values)
        has_name = any("student name" in value or value == "name" for value in row_values)
        if has_roll and has_name:
            return index
    return None


def _build_transform_students(df: pd.DataFrame) -> List[Dict[str, Any]]:
    header_row = _find_transform_header_row(df)
    if header_row is None or header_row + 1 >= len(df):
        raise ValueError("Transform marksheet header row not found")

    top_headers = [_normalize_header_text(value) for value in df.iloc[header_row].tolist()]
    sub_headers = [_normalize_header_text(value) for value in df.iloc[header_row + 1].tolist()]

    propagated_top: List[str] = []
    last_value = ""
    for value in top_headers:
        if value:
            last_value = value
        propagated_top.append(last_value)

    columns: List[str] = []
    for top, sub in zip(propagated_top, sub_headers):
        top_clean = top.strip()
        sub_clean = sub.strip()
        top_lower = top_clean.lower()

        if top_lower in {"roll number", "student name", "department", "section", "total marks"}:
            columns.append(top_clean)
            continue

        if sub_clean:
            columns.append(f"{top_clean} - {sub_clean}")
        else:
            columns.append(top_clean)

    data = df.iloc[header_row + 2 :].copy()
    data.columns = columns

    cols = data.columns.tolist()
    name_col = _find_name_column(cols)
    roll_col = _find_roll_column(cols)
    if not name_col:
        raise ValueError("Transform marksheet is missing a student name column")

    q_map: Dict[str, str] = {}
    for column in cols:
        qid = _normalize_qid(column)
        if qid:
            q_map[qid] = column

    if not q_map:
        raise ValueError("Transform marksheet does not contain question columns")

    students: List[Dict[str, Any]] = []
    for _, row in data.iterrows():
        student_name = row.get(name_col, "")
        if pd.isna(student_name) or not str(student_name).strip():
            continue

        marks: Dict[str, float] = {}
        for qid, column in q_map.items():
            value = row.get(column, 0)
            if pd.isna(value):
                value = 0
            try:
                marks[qid] = float(value)
            except Exception:
                marks[qid] = 0.0

        payload = {
            "name": str(student_name).strip(),
            "marks": marks,
        }
        if roll_col:
            roll_no = row.get(roll_col, "")
            if not pd.isna(roll_no) and str(roll_no).strip():
                payload["roll_no"] = str(roll_no).strip().upper()

        students.append(payload)

    if not students:
        raise ValueError("No student rows detected in transform marksheet")

    return students


def _normalize_clo_label(value: str) -> str:
    match = re.search(r"(\d+)", str(value or ""))
    if not match:
        return ""
    return f"CLO-{int(match.group(1))}"


def _extract_transform_structure(df: pd.DataFrame) -> Dict[str, Any]:
    header_row = _find_transform_header_row(df)
    if header_row is None or header_row + 1 >= len(df):
        raise ValueError("Transform marksheet header row not found")

    top_headers = [_normalize_header_text(value) for value in df.iloc[header_row].tolist()]
    sub_headers = [_normalize_header_text(value) for value in df.iloc[header_row + 1].tolist()]

    propagated_top: List[str] = []
    last_value = ""
    for value in top_headers:
        if value:
            last_value = value
        propagated_top.append(last_value)

    question_clos: Dict[str, str] = {}
    clo_questions: Dict[str, List[str]] = {}
    question_labels: Dict[str, str] = {}

    for top, sub in zip(propagated_top, sub_headers):
        qid = _normalize_qid(sub)
        clo_label = _normalize_clo_label(top)
        if not qid or not clo_label:
            continue
        question_clos[qid] = clo_label
        question_labels[qid] = sub.strip()
        clo_questions.setdefault(clo_label, []).append(qid)

    return {
        "source": "transform",
        "question_clos": question_clos,
        "clo_questions": clo_questions,
        "question_labels": question_labels,
        "header_row": header_row,
    }


async def parse_marksheet(marksheet: UploadFile) -> List[Dict[str, Any]]:
    try:
        return _build_simple_students(_read_excel_bytes(marksheet))
    except Exception:
        marksheet.file.seek(0)
        return _build_transform_students(_read_excel_raw(marksheet))


async def parse_marksheet_structure(marksheet: UploadFile) -> Dict[str, Any]:
    try:
        df = _read_excel_raw(marksheet)
        return _extract_transform_structure(df)
    except Exception:
        marksheet.file.seek(0)
        return {
            "source": "simple",
            "question_clos": {},
            "clo_questions": {},
            "question_labels": {},
            "header_row": None,
        }
