import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/* ===============================
   Response Model
================================ */
export interface GeneratedExam {
  id: number;
  exam_type: string;
  content: string;
}

export interface PromptGeneratorUploadResponse {
  session_id: string;
  filename: string;
  message: string;
}

export interface PromptGeneratorPromptResponse {
  prompt: string;
  time_allowed: string;
  max_marks: number | null;
  warnings?: string[];
}

export interface PromptGeneratorExamResponse {
  exam_content: string;
  images_analyzed: number;
  llava_used: boolean;
}

export interface AiAssistantResponse {
  reply: string;
  model: string;
}

export interface LoginResponse {
  status: 'found' | 'not_found' | 'invalid_password' | 'pending_setup';
  teacher_id?: number;
  teacher_name?: string;
  teacher_uid?: string;
  department?: string;
  username?: string;
}

export interface StudentLoginResponse {
  status: 'found' | 'not_found' | 'invalid_password';
  student_id?: number;
  student_code?: string;
  student_name?: string;
  username?: string;
}

export interface AdminLoginResponse {
  status: 'found' | 'invalid_credentials';
  admin_name?: string;
}

export interface HodLoginResponse {
  status: 'found' | 'not_found' | 'invalid_password';
  hod_id?: number;
  hod_name?: string;
  hod_uid?: string;
  department?: string;
  username?: string;
}

export interface StudentTask {
  id: number;
  title: string;
  description: string;
  question_content: string;
  status: string;
  source_module: string;
  teacher_name: string;
  assigned_roll_no: string;
  clo: string;
  course_name: string;
  task_attachment_name: string;
  task_attachment_url: string | null;
  answer_text: string;
  answer_attachment_name: string;
  answer_attachment_url: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  teacher_decision: string;
  teacher_feedback: string;
  teacher_score: string;
  created_at: string | null;
}

export interface TeacherSubmissionItem {
  task_id: number;
  title: string;
  status: string;
  student_id: number | null;
  student_name: string;
  student_roll_no: string;
  course_code: string;
  course_name: string;
  question_content: string;
  task_attachment_name: string;
  task_attachment_url: string;
  answer_text: string;
  answer_attachment_name: string;
  answer_attachment_url: string;
  teacher_feedback: string;
  teacher_score: string;
  teacher_decision: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  clo: string;
  source_module: string;
}

export interface RegisterResponse {
  status: 'registered' | 'already_exists';
  teacher_name?: string;
}

export interface TeacherStudentItem {
  id: number;
  student_name: string;
  roll_no: string;
  semester: number | null;
  section: string;
  batch: string;
  department: string;
}

export interface TeacherProfileRecord {
  id: number;
  semester: number | null;
  section: string;
  batch: string;
  department: string;
  threshold_percentage: number;
  course_code: string;
  course_name: string;
  students: TeacherStudentItem[];
}

export interface TeacherProfileRecordUpdate {
  teacher_name: string;
  semester: string;
  section?: string;
  batch: string;
  department: string;
  course_code: string;
  threshold_percentage: number;
}

export interface TeacherProfileResponse {
  teacher_id: number;
  teacher_uid?: string;
  teacher_name: string;
  department?: string;
  username?: string;
  setup_complete: boolean;
  records: TeacherProfileRecord[];
}

export interface TeacherNotificationsResponse {
  teacher_id: number;
  pending_count: number;
  submissions: TeacherSubmissionItem[];
}

export interface CourseSuggestion {
  course_code: string;
  course_name: string;
}

export interface AcademicOptionsResponse {
  semesters: number[];
  departments: string[];
  batches: string[];
  sections: string[];
}

export interface CreatedCourseResponse {
  status: 'created' | 'already_exists';
  course: {
    id: number;
    course_code: string;
    course_name: string;
  };
}

export interface CreatedHodResponse {
  status: 'created' | 'already_exists';
  hod: {
    id: number;
    full_name: string;
    username: string;
    password: string;
    hod_uid: string;
    department: string;
    contact_no?: string;
  };
}

export interface CreatedStudentResponse {
  status: 'created' | 'already_exists';
  email_sent?: boolean;
  student: {
    id: number;
    student_name: string;
    roll_no: string;
    username: string;
    password: string;
    email?: string;
    department?: string;
    program?: string;
  };
}

export interface ImportedStudentsResponse {
  status: 'imported';
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  auxiliary_tables: string[];
}

export interface StudentImportStartResponse {
  status: 'started';
  job_id: string;
}

export interface StudentImportJobResponse {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  error?: string;
  result?: ImportedStudentsResponse;
}

export interface CreatedTeacherResponse {
  status: 'assigned' | 'already_assigned' | 'updated';
  teacher: {
    id?: number;
    teacher_name: string;
    username: string;
    password: string;
    teacher_uid: string;
    department?: string;
    course_code?: string;
    course_name?: string;
  };
}

export interface HodGapSummary {
  student_count: number;
  average_percentage: number;
  pass_rate: number;
  at_risk_students: number;
  weak_clo_count: number;
  weakest_clo: string;
  weakest_clo_gap_percentage: number;
  strongest_clo: string;
  most_problematic_question: string;
  most_problematic_question_gap_percentage: number;
}

export interface HodInsightCourse {
  teacher_course_id: number;
  teacher_id: number;
  teacher_name: string;
  course_id: number;
  course_code: string;
  course_name: string;
  department: string;
  semester: number | null;
  section: string;
  batch: string;
  threshold_percentage: number;
  report_count: number;
  latest_report_id: number | null;
  latest_assessment_title: string;
  latest_assessment_type: string;
  latest_report_created_at: string | null;
  latest_summary: HodGapSummary | null;
}

export interface HodInsightReport {
  id: number;
  teacher_id: number;
  teacher_course_id: number;
  course_id: number;
  department: string;
  semester: number | null;
  section: string;
  batch: string;
  course_code: string;
  course_name: string;
  teacher_name: string;
  assessment_type: string;
  assessment_title: string;
  question_paper_name: string;
  marksheet_name: string;
  cis_file_name: string;
  created_at: string | null;
  summary: HodGapSummary;
  report: any;
}

export interface HodDepartmentsResponse {
  hod_name: string;
  hod_department: string;
  departments: string[];
  semesters: number[];
}

export interface HodSemesterInsightsResponse {
  department: string;
  semester: number;
  courses: HodInsightCourse[];
}

export interface HodCourseReportsResponse {
  course: HodInsightCourse;
  reports: HodInsightReport[];
}

export interface StandardTemplateField {
  id: number;
  field_key: string;
  display_name: string;
  column_position: number;
  required: boolean;
  data_type: string;
  missing_value_rule: string;
  default_value: string;
  formula_definition: string;
  editable_by_teacher: boolean;
  allow_multiple_source_mapping: boolean;
  synonyms: string[];
  description: string;
  hidden: boolean;
  blank_allowed: boolean;
}

export interface StandardTemplate {
  id: number;
  name: string;
  description: string;
  department: string;
  purpose: string;
  version: number;
  status: string;
  is_active: boolean;
  archived: boolean;
  original_filename: string;
  sheet_name: string;
  header_row: number | null;
  data_start_row: number | null;
  fields?: StandardTemplateField[];
}

/* ===============================
   API SERVICE
================================ */
@Injectable({
  providedIn: 'root'
})
export class ApiService {

  // ✅ Single source of truth
  private BASE_URL = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /* ===============================
     GENERATE EXAM
  ================================ */
  generateExam(form: FormData) {
  return this.http.post<any>(
    `${this.BASE_URL}/generate-exam`,
    form
  );
}

  uploadPromptGeneratorFile(form: FormData) {
    return this.http.post<PromptGeneratorUploadResponse>(
      `${this.BASE_URL}/prompt-generator/upload`,
      form
    );
  }

  generatePromptGeneratorPrompt(data: {
    session_id: string;
    session_ids: string[];
    exam_type: string;
    mcq_count: number;
    mcq_marks: number;
    mcq_blooms_label?: string;
    theory_questions: any[];
    cis_session_id?: string | null;
  }) {
    return this.http.post<PromptGeneratorPromptResponse>(
      `${this.BASE_URL}/prompt-generator/generate-prompt`,
      data
    );
  }

  generatePromptGeneratorExam(data: { session_id: string; prompt?: string }) {
    return this.http.post<PromptGeneratorExamResponse>(
      `${this.BASE_URL}/prompt-generator/generate-exam`,
      data
    );
  }

  chatWithPromptGeneratorAi(data: {
    message: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    role: string;
    page: string;
    context?: string;
  }) {
    return this.http.post<AiAssistantResponse>(
      `${this.BASE_URL}/prompt-generator/chat`,
      data
    );
  }

  savePromptGeneratorExam(data: { session_id: string; content: string }) {
    return this.http.post<{ message: string }>(
      `${this.BASE_URL}/prompt-generator/save-exam`,
      data
    );
  }

  downloadPromptGeneratorPdf(data: { session_id: string; content: string }) {
    return this.http.post(
      `${this.BASE_URL}/prompt-generator/download-pdf`,
      data,
      { responseType: 'blob' }
    );
  }



  /* ===============================
     DOWNLOAD EXAM (PDF / DOCX)
  ================================ */
  downloadExam(
    id: number,
    format: 'pdf' | 'docx',
    includeAnswers: boolean
  ) {
    return this.http.get(
      `${this.BASE_URL}/download/${id}?format=${format}&include_answers=${includeAnswers}`,
      { responseType: 'blob' }
    );
  }

  /* ===============================
     AUTH (OPTIONAL)
  ================================ */
  registerTeacher(data: {
    teacher_name: string;
    password: string;
    semester?: string;
    section?: string;
    batch?: string;
    course_code?: string;
  }) {
    return this.http.post<RegisterResponse>(
      `${this.BASE_URL}/register`,
      data
    );
  }

  loginTeacher(data: { teacher_name: string; password: string }) {
    return this.http.post<LoginResponse>(
      `${this.BASE_URL}/login`,
      data
    );
  }

  loginAdmin(data: { username: string; password: string }) {
    return this.http.post<AdminLoginResponse>(
      `${this.BASE_URL}/admin/login`,
      data
    );
  }

  loginHod(data: { username: string; password: string }) {
    return this.http.post<HodLoginResponse>(
      `${this.BASE_URL}/hod/login`,
      data
    );
  }

  getTeacherStatus(teacherName: string) {
    return this.http.get<{ status: string }>(
      `${this.BASE_URL}/teacher/status?teacher_name=${encodeURIComponent(teacherName)}`
    );
  }

  lookupCourse(courseCode: string) {
    return this.http.get<{ course_code: string; course_name: string }>(
      `${this.BASE_URL}/courses/lookup?course_code=${encodeURIComponent(courseCode)}`
    );
  }

  searchCourses(query: string) {
    return this.http.get<{ courses: CourseSuggestion[] }>(
      `${this.BASE_URL}/courses/search?q=${encodeURIComponent(query)}`
    );
  }

  getAcademicOptions(filters: {
    semester?: string;
    department?: string;
    batch?: string;
    section?: string;
  } = {}) {
    const params = new URLSearchParams();
    if (filters.semester) params.set('semester', filters.semester);
    if (filters.department) params.set('department', filters.department);
    if (filters.batch) params.set('batch', filters.batch);
    if (filters.section) params.set('section', filters.section);

    const query = params.toString();
    return this.http.get<AcademicOptionsResponse>(
      `${this.BASE_URL}/academic/options${query ? `?${query}` : ''}`
    );
  }

  getTeacherProfile(teacherName: string) {
    return this.http.get<TeacherProfileResponse>(
      `${this.BASE_URL}/teacher/profile?teacher_name=${encodeURIComponent(teacherName)}`
    );
  }

  addTeacherProfileRecord(data: TeacherProfileRecordUpdate) {
    return this.http.post<{ status: string }>(
      `${this.BASE_URL}/teacher/profile/records`,
      data
    );
  }

  updateTeacherProfileRecord(recordId: number, data: TeacherProfileRecordUpdate) {
    return this.http.post<{ status: string; assigned_students: number; record: TeacherProfileRecord }>(
      `${this.BASE_URL}/teacher/profile/records/${recordId}`,
      data
    );
  }

  deleteTeacherProfileRecord(recordId: number, teacherName: string) {
    return this.http.delete<{ status: string; record_id: number }>(
      `${this.BASE_URL}/teacher/profile/records/${recordId}?teacher_name=${encodeURIComponent(teacherName)}`
    );
  }

  updateTeacherProfileThreshold(recordId: number, data: {
    teacher_name: string;
    threshold_percentage: number;
  }) {
    return this.http.post<{ status: string; record: TeacherProfileRecord }>(
      `${this.BASE_URL}/teacher/profile/records/${recordId}/threshold`,
      data
    );
  }

  loginStudent(data: { student_code: string; password: string }) {
    return this.http.post<StudentLoginResponse>(
      `${this.BASE_URL}/student/login`,
      data
    );
  }

  changeStudentPassword(data: { student_id: number; current_password: string; new_password: string }) {
    return this.http.post<{ status: string }>(
      `${this.BASE_URL}/student/change-password`,
      data
    );
  }

  getStudentTasks(studentId: number) {
    return this.http.get<{ student_id: number; student_code: string; student_name: string; tasks: StudentTask[] }>(
      `${this.BASE_URL}/student/tasks?student_id=${studentId}`
    );
  }

  deleteStudentTask(taskId: number, studentId: number) {
    return this.http.delete<{ status: string; task_id: number }>(
      `${this.BASE_URL}/student/tasks/${taskId}?student_id=${studentId}`
    );
  }

  submitStudentTask(taskId: number, data: FormData) {
    return this.http.post<{ status: string; task: StudentTask }>(
      `${this.BASE_URL}/student/tasks/${taskId}/submit`,
      data
    );
  }

  assignTaskToStudent(data: FormData) {
    return this.http.post<{ status: string; task: StudentTask; student_name: string; student_roll_no: string }>(
      `${this.BASE_URL}/student/tasks/assign`,
      data
    );
  }

  getTeacherNotifications(teacherName: string) {
    return this.http.get<TeacherNotificationsResponse>(
      `${this.BASE_URL}/teacher/notifications?teacher_name=${encodeURIComponent(teacherName)}`
    );
  }

  reviewStudentTask(taskId: number, data: { teacher_name: string; decision: 'PASS' | 'FAIL'; feedback?: string; score?: string; }) {
    return this.http.post<{ status: string; task: StudentTask; auto_updated_latest_marksheet?: boolean; auto_applied_updates?: number; latest_marksheet_id?: number | null; latest_marksheet_download_url?: string }>(
        `${this.BASE_URL}/teacher/tasks/${taskId}/review`,
        data
      );
    }

  deleteTransformMarksheet(marksheetId: number, teacherName: string) {
    return this.http.delete<{ status: string; marksheet_id: number }>(
      `${this.BASE_URL}/transform/marksheets/${marksheetId}?teacher_name=${encodeURIComponent(teacherName)}`
    );
  }

  createHod(data: { full_name: string; contact_no: string; department: string }) {
    return this.http.post<CreatedHodResponse>(
      `${this.BASE_URL}/admin/hods`,
      data
    );
  }

  createStudent(data: {
    full_name: string;
    roll_no: string;
    contact_no: string;
    department: string;
    program: string;
    batch?: string;
    section?: string;
    semester?: string;
  }) {
    return this.http.post<CreatedStudentResponse>(
      `${this.BASE_URL}/admin/students`,
      data
    );
  }

  importStudentsFromExcel(form: FormData) {
    return this.http.post<StudentImportStartResponse>(
      `${this.BASE_URL}/admin/students/import`,
      form,
      {
        observe: 'events',
        reportProgress: true
      }
    );
  }

  getStudentImportJob(jobId: string) {
    return this.http.get<StudentImportJobResponse>(
      `${this.BASE_URL}/admin/students/import/${encodeURIComponent(jobId)}`
    );
  }

  createCourse(data: { course_code: string; course_name: string }) {
    return this.http.post<CreatedCourseResponse>(
      `${this.BASE_URL}/admin/courses`,
      data
    );
  }

  signupTeacher(data: { full_name: string; contact_no: string; email: string; password: string }) {
    return this.http.post<CreatedTeacherResponse>(
      `${this.BASE_URL}/teacher/signup`,
      data
    );
  }

  createTeacherByHod(data: { hod_name: string; teacher_username: string; department: string; course_code: string }) {
    return this.http.post<CreatedTeacherResponse>(
      `${this.BASE_URL}/hod/teachers`,
      data
    );
  }

  getHodInsightDepartments(hodName: string) {
    return this.http.get<HodDepartmentsResponse>(
      `${this.BASE_URL}/hod/academic-insights/departments?hod_name=${encodeURIComponent(hodName)}`
    );
  }

  getHodSemesterInsights(hodName: string, department: string, semester: number) {
    return this.http.get<HodSemesterInsightsResponse>(
      `${this.BASE_URL}/hod/academic-insights?hod_name=${encodeURIComponent(hodName)}&department=${encodeURIComponent(department)}&semester=${semester}`
    );
  }

  getHodCourseReports(hodName: string, teacherCourseId: number) {
    return this.http.get<HodCourseReportsResponse>(
      `${this.BASE_URL}/hod/academic-insights/courses/${teacherCourseId}?hod_name=${encodeURIComponent(hodName)}`
    );
  }

  saveHodInsightSnapshot(hodName: string, reportId: number) {
    return this.http.post<{ status: string; snapshot_id: number; created_at: string | null }>(
      `${this.BASE_URL}/hod/academic-insights/reports/${reportId}/snapshot`,
      { hod_name: hodName }
    );
  }

  getTemplateSettings() {
    return this.http.get<{ purposes: string[]; missing_value_rules: Array<{ key: string; label: string }>; data_types: string[] }>(
      `${this.BASE_URL}/transform/template-settings`
    );
  }

  getHodTemplates(department: string) {
    return this.http.get<{ templates: StandardTemplate[] }>(
      `${this.BASE_URL}/hod/transformation-templates?department=${encodeURIComponent(department)}`
    );
  }

  createHodTemplate(form: FormData) {
    return this.http.post<{ template: StandardTemplate }>(
      `${this.BASE_URL}/hod/transformation-templates`,
      form
    );
  }

  getHodTemplate(templateId: number) {
    return this.http.get<{ template: StandardTemplate }>(
      `${this.BASE_URL}/hod/transformation-templates/${templateId}`
    );
  }

  updateHodTemplateFields(templateId: number, fields: StandardTemplateField[]) {
    return this.http.post<{ fields: StandardTemplateField[] }>(
      `${this.BASE_URL}/hod/transformation-templates/${templateId}/fields`,
      { fields }
    );
  }

  activateHodTemplate(templateId: number) {
    return this.http.post<{ template: StandardTemplate }>(
      `${this.BASE_URL}/hod/transformation-templates/${templateId}/activate`,
      {}
    );
  }

  archiveHodTemplate(templateId: number) {
    return this.http.post<{ template: StandardTemplate }>(
      `${this.BASE_URL}/hod/transformation-templates/${templateId}/archive`,
      {}
    );
  }
}
