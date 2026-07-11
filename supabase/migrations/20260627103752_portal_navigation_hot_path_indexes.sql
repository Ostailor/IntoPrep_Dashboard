create index if not exists idx_sessions_start_at
  on public.sessions (start_at);

create index if not exists idx_sessions_cohort_start_at
  on public.sessions (cohort_id, start_at);

create index if not exists idx_enrollments_cohort_status_student
  on public.enrollments (cohort_id, status, student_id);

create index if not exists idx_enrollments_student_status_cohort
  on public.enrollments (student_id, status, cohort_id);

create index if not exists idx_assessments_cohort_date
  on public.assessments (cohort_id, date);

create index if not exists idx_assessment_results_assessment_student
  on public.assessment_results (assessment_id, student_id);

create index if not exists idx_assessment_results_student_assessment
  on public.assessment_results (student_id, assessment_id);

create index if not exists idx_academic_notes_student_created_at
  on public.academic_notes (student_id, created_at desc);

create index if not exists idx_session_instruction_blocks_instructor_start
  on public.session_instruction_blocks (instructor_id, start_at, session_id);

create index if not exists idx_session_instruction_blocks_session_start
  on public.session_instruction_blocks (session_id, start_at);

create index if not exists idx_attendance_records_session_student
  on public.attendance_records (session_id, student_id);

create index if not exists idx_attendance_records_student_updated_at
  on public.attendance_records (student_id, updated_at desc);

create index if not exists idx_family_contact_events_family_contact_at
  on public.family_contact_events (family_id, contact_at desc);

create index if not exists idx_admin_tasks_assigned_due
  on public.admin_tasks (assigned_to, due_at);

create index if not exists idx_cohort_assignments_user_cohort
  on public.cohort_assignments (user_id, cohort_id);

create index if not exists idx_cohort_assignments_cohort_user
  on public.cohort_assignments (cohort_id, user_id);
