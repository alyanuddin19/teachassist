from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean, LargeBinary
from sqlalchemy.sql import func
from .database import Base

class Teacher(Base):
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, index=True)
    teacher_uid = Column(String(50), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    teacher_name = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)
    department = Column(String(100), nullable=True)
    roll_no = Column(String(100), nullable=True)
    contact_no = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    signup_source = Column(String(50), nullable=True)


class HeadOfDepartment(Base):
    __tablename__ = "heads_of_department"

    id = Column(Integer, primary_key=True, index=True)
    hod_uid = Column(String(50), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)
    contact_no = Column(String(50), nullable=True)
    department = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TeacherSignupRequest(Base):
    __tablename__ = "teacher_signup_requests"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    roll_no = Column(String(100), nullable=True)
    contact_no = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    generated_username = Column(String(100), nullable=False, unique=True, index=True)
    generated_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GeneratedExam(Base):
    __tablename__ = "generated_exams"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"))
    exam_type = Column(String(50))
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    program_id = Column(Integer, nullable=True)
    course_code = Column(String(50), unique=True, nullable=False)
    course_name = Column(String(200), nullable=False)


class TeacherCourse(Base):
    __tablename__ = "teacher_courses"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    semester = Column(Integer, nullable=True)
    section = Column(String(50), nullable=True)
    batch = Column(String(50), nullable=True)
    department = Column(String(100), nullable=True)
    threshold_percentage = Column(Integer, nullable=False, default=50)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    student_name = Column(String(100), nullable=False, index=True)
    roll_no = Column(String(50), unique=True, nullable=True, index=True)
    username = Column(String(100), unique=True, nullable=True, index=True)
    password = Column(String(255), nullable=False)
    contact_no = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    program = Column(String(100), nullable=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    semester = Column(Integer, nullable=True)
    section = Column(String(50), nullable=True)
    batch = Column(String(50), nullable=True)
    department = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TeacherStudentAssignment(Base):
    __tablename__ = "teacher_student_assignments"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    teacher_course_id = Column(Integer, ForeignKey("teacher_courses.id"), nullable=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    semester = Column(Integer, nullable=True)
    section = Column(String(50), nullable=True)
    batch = Column(String(50), nullable=True)
    department = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class StudentTask(Base):
    __tablename__ = "student_tasks"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    course_name_snapshot = Column(String(200), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    question_content = Column(Text, nullable=True)
    clo = Column(String(50), nullable=True)
    assigned_roll_no = Column(String(50), nullable=True)
    task_attachment_name = Column(String(255), nullable=True)
    task_attachment_path = Column(Text, nullable=True)
    answer_text = Column(Text, nullable=True)
    answer_attachment_name = Column(String(255), nullable=True)
    answer_attachment_path = Column(Text, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    teacher_decision = Column(String(50), nullable=True)
    teacher_feedback = Column(Text, nullable=True)
    teacher_score = Column(String(50), nullable=True)
    status = Column(String(50), nullable=False, default="assigned")
    source_module = Column(String(50), nullable=False, default="gap_analysis")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TransformMarksheet(Base):
    __tablename__ = "transform_marksheets"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False, index=True)
    teacher_course_id = Column(Integer, ForeignKey("teacher_courses.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    semester = Column(Integer, nullable=True)
    section = Column(String(50), nullable=True)
    batch = Column(String(50), nullable=True)
    department = Column(String(100), nullable=True)
    exam_type = Column(String(50), nullable=True)
    total_marks = Column(Integer, nullable=False, default=100)
    export_file_name = Column(String(255), nullable=True)
    selected_options = Column(Text, nullable=False, default="{}")
    assessment_totals = Column(Text, nullable=False, default="{}")
    excel_file_path = Column(Text, nullable=True)
    source_kind = Column(String(50), nullable=False, default="initial")
    source_marksheet_id = Column(Integer, ForeignKey("transform_marksheets.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TransformStudentAssessmentMark(Base):
    __tablename__ = "transform_student_assessment_marks"

    id = Column(Integer, primary_key=True, index=True)
    marksheet_id = Column(Integer, ForeignKey("transform_marksheets.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    assessment_label = Column(String(150), nullable=False)
    obtained_marks = Column(Float, nullable=False, default=0)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GapAnalysisReport(Base):
    __tablename__ = "gap_analysis_reports"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False, index=True)
    teacher_course_id = Column(Integer, ForeignKey("teacher_courses.id"), nullable=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    department = Column(String(100), nullable=True, index=True)
    semester = Column(Integer, nullable=True, index=True)
    section = Column(String(50), nullable=True)
    batch = Column(String(50), nullable=True)
    assessment_type = Column(String(50), nullable=False, default="Assessment")
    assessment_title = Column(String(150), nullable=True)
    course_code_snapshot = Column(String(50), nullable=True)
    course_name_snapshot = Column(String(200), nullable=True)
    question_paper_name = Column(String(255), nullable=True)
    marksheet_name = Column(String(255), nullable=True)
    cis_file_name = Column(String(255), nullable=True)
    report_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HodInsightSnapshot(Base):
    __tablename__ = "hod_insight_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    hod_id = Column(Integer, ForeignKey("heads_of_department.id"), nullable=False, index=True)
    gap_report_id = Column(Integer, ForeignKey("gap_analysis_reports.id"), nullable=False, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False, index=True)
    teacher_course_id = Column(Integer, ForeignKey("teacher_courses.id"), nullable=True, index=True)
    department = Column(String(100), nullable=True, index=True)
    semester = Column(Integer, nullable=True, index=True)
    course_code = Column(String(50), nullable=True)
    course_name = Column(String(200), nullable=True)
    teacher_name = Column(String(100), nullable=True)
    snapshot_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TransformationTemplate(Base):
    __tablename__ = "transformation_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    department = Column(String(100), nullable=False, index=True)
    purpose = Column(String(100), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(50), nullable=False, default="draft")
    original_filename = Column(String(255), nullable=True)
    file_path = Column(Text, nullable=True)
    file_content = Column(LargeBinary, nullable=True)
    file_content_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    sheet_name = Column(String(200), nullable=True)
    header_row = Column(Integer, nullable=True)
    data_start_row = Column(Integer, nullable=True)
    created_by_hod_id = Column(Integer, ForeignKey("heads_of_department.id"), nullable=True, index=True)
    parent_template_id = Column(Integer, ForeignKey("transformation_templates.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=False)
    archived = Column(Boolean, nullable=False, default=False)
    allowed_rules = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TransformationTemplateField(Base):
    __tablename__ = "transformation_template_fields"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("transformation_templates.id"), nullable=False, index=True)
    field_key = Column(String(200), nullable=False, index=True)
    display_name = Column(String(200), nullable=False)
    column_position = Column(Integer, nullable=False)
    required = Column(Boolean, nullable=False, default=False)
    data_type = Column(String(50), nullable=False, default="text")
    missing_value_rule = Column(String(50), nullable=False, default="blank")
    default_value = Column(Text, nullable=True)
    formula_definition = Column(Text, nullable=True)
    validation_definition = Column(Text, nullable=True)
    editable_by_teacher = Column(Boolean, nullable=False, default=True)
    allow_multiple_source_mapping = Column(Boolean, nullable=False, default=False)
    synonyms = Column(Text, nullable=False, default="[]")
    formatting_metadata = Column(Text, nullable=False, default="{}")
    description = Column(Text, nullable=True)
    hidden = Column(Boolean, nullable=False, default=False)
    blank_allowed = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TransformationJob(Base):
    __tablename__ = "transformation_jobs"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True, index=True)
    template_id = Column(Integer, ForeignKey("transformation_templates.id"), nullable=False, index=True)
    template_version = Column(Integer, nullable=False)
    source_file_reference = Column(Text, nullable=True)
    selected_source_sheet = Column(String(200), nullable=True)
    status = Column(String(50), nullable=False, default="created")
    mapping_summary = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
