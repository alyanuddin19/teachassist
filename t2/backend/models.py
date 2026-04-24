from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Numeric, Text, func
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON

from database import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    code = Column(String(20), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    courses = relationship("Course", back_populates="department")
    students = relationship("Student", back_populates="department")
    teacher_assignments = relationship("TeacherAssignment", back_populates="department")
    marksheets = relationship("Marksheet", back_populates="department")


class AcademicSession(Base):
    __tablename__ = "academic_sessions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher_assignments = relationship("TeacherAssignment", back_populates="session")
    marksheets = relationship("Marksheet", back_populates="session")


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    course_code = Column(String(20), nullable=False, unique=True)
    course_name = Column(String(150), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    semester = Column(String(30), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    department = relationship("Department", back_populates="courses")
    teacher_assignments = relationship("TeacherAssignment", back_populates="course")
    marksheets = relationship("Marksheet", back_populates="course")


class Teacher(Base):
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(120), nullable=False, unique=True, index=True)
    password = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    assignments = relationship("TeacherAssignment", back_populates="teacher", cascade="all, delete-orphan")
    marksheets = relationship("Marksheet", back_populates="teacher")
    audit_logs = relationship("AuditLog", back_populates="teacher")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    roll_number = Column(String(30), nullable=False, unique=True, index=True)
    full_name = Column(String(120), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    batch = Column(String(20), nullable=False, index=True)
    section = Column(String(10), nullable=False, index=True)
    semester = Column(String(30), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    department = relationship("Department", back_populates="students")
    marks = relationship("StudentAssessmentMark", back_populates="student")


class TeacherAssignment(Base):
    __tablename__ = "teacher_assignments"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=True)
    batch = Column(String(20), nullable=False)
    section = Column(String(10), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    session_id = Column(Integer, ForeignKey("academic_sessions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher = relationship("Teacher", back_populates="assignments")
    department = relationship("Department", back_populates="teacher_assignments")
    course = relationship("Course", back_populates="teacher_assignments")
    session = relationship("AcademicSession", back_populates="teacher_assignments")


class DropdownOption(Base):
    __tablename__ = "dropdown_options"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=False, index=True)
    value = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Marksheet(Base):
    __tablename__ = "marksheets"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    batch = Column(String(20), nullable=False)
    section = Column(String(10), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    session_id = Column(Integer, ForeignKey("academic_sessions.id", ondelete="SET NULL"), nullable=True)
    exam_type = Column(String(50), nullable=True)
    total_marks = Column(Numeric(10, 2), nullable=False)
    export_file_name = Column(String(255), nullable=True)
    selected_options = Column(JSON, nullable=False)
    assessment_totals = Column(JSON, nullable=False, default=dict)
    excel_file_path = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher = relationship("Teacher", back_populates="marksheets")
    department = relationship("Department", back_populates="marksheets")
    course = relationship("Course", back_populates="marksheets")
    session = relationship("AcademicSession", back_populates="marksheets")
    marks = relationship("StudentAssessmentMark", back_populates="marksheet", cascade="all, delete-orphan")


class StudentAssessmentMark(Base):
    __tablename__ = "student_assessment_marks"

    id = Column(Integer, primary_key=True, index=True)
    marksheet_id = Column(Integer, ForeignKey("marksheets.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    assessment_label = Column(String(100), nullable=False)
    obtained_marks = Column(Numeric(10, 2), nullable=False)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    marksheet = relationship("Marksheet", back_populates="marks")
    student = relationship("Student", back_populates="marks")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher = relationship("Teacher", back_populates="audit_logs")
