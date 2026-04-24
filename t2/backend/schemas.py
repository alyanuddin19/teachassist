from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DropdownOptionResponse(BaseModel):
    id: int
    category: str
    value: str

    model_config = ConfigDict(from_attributes=True)


class DepartmentResponse(BaseModel):
    id: int
    name: str
    code: str

    model_config = ConfigDict(from_attributes=True)


class CourseResponse(BaseModel):
    id: int
    course_code: str
    course_name: str
    semester: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AcademicSessionResponse(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class StudentResponse(BaseModel):
    id: int
    roll_number: str
    full_name: str
    batch: str
    section: str
    semester: str | None = None
    department_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class StudentMarkInput(BaseModel):
    assessment_label: str = Field(min_length=1, max_length=255)
    obtained_marks: float = Field(ge=0)
    remarks: str | None = None


class StudentMarksRowInput(BaseModel):
    student_id: int
    marks: list[StudentMarkInput]
    remarks: str | None = None


class MarksheetCreate(BaseModel):
    teacher_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=100)
    department_id: int
    batch: str = Field(min_length=1, max_length=20)
    section: str = Field(min_length=1, max_length=20)
    course_id: int
    session_id: int
    exam_type: str = Field(min_length=1, max_length=50)
    total_marks: float = Field(gt=0)
    export_file_name: str = Field(min_length=1, max_length=255)
    selected_options: dict[str, str]
    assessment_totals: dict[str, float]
    student_marks: list[StudentMarksRowInput]


class MarksheetSummary(BaseModel):
    id: int
    teacher_name: str
    email: str
    department: str | None = None
    batch: str
    section: str
    course: str | None = None
    session: str | None = None
    exam_type: str | None = None
    total_marks: float
    export_file_name: str | None = None
    selected_options: dict[str, Any]
    assessment_totals: dict[str, float] = {}
    student_count: int
    created_at: datetime
    download_url: str


class MarksheetRowDetail(BaseModel):
    student_id: int
    obtained_marks_by_assessment: dict[str, float]
    remarks: str | None = None


class MarksheetDetail(BaseModel):
    id: int
    teacher_name: str
    email: str
    department_id: int | None = None
    department: str | None = None
    batch: str
    section: str
    course_id: int | None = None
    course: str | None = None
    session_id: int | None = None
    session: str | None = None
    exam_type: str | None = None
    total_marks: float
    export_file_name: str | None = None
    selected_options: dict[str, Any]
    assessment_totals: dict[str, float] = {}
    student_marks: list[MarksheetRowDetail]
    created_at: datetime
    download_url: str


class FormConfigResponse(BaseModel):
    departments: list[DepartmentResponse]
    batches: list[str]
    sections: list[str]
    courses: list[CourseResponse]
    sessions: list[AcademicSessionResponse]
    dropdowns: dict[str, list[str]]


class TeacherAssignmentResponse(BaseModel):
    id: int
    teacher_id: int
    department_id: int | None = None
    batch: str
    section: str
    course_id: int | None = None
    session_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class TeacherAccessResponse(BaseModel):
    found: bool
    teacher_name: str
    email: str
    assignments: list[TeacherAssignmentResponse]


class SheetLiveUpdate(BaseModel):
    teacher: str
    batch: str
    section: str
    total_marks: float
    student_count: int
    selected_options: dict[str, str]
    time: str
