create index if not exists idx_cohorts_demo_archived_name
  on public.cohorts (demo, is_archived, name);

create index if not exists idx_sessions_demo_cohort_start
  on public.sessions (demo, cohort_id, start_at);

create index if not exists idx_enrollments_demo_cohort_status
  on public.enrollments (demo, cohort_id, status);

create index if not exists idx_enrollments_demo_student
  on public.enrollments (demo, student_id);

create index if not exists idx_students_demo_family
  on public.students (demo, family_id);

create index if not exists idx_assessments_demo_cohort_date
  on public.assessments (demo, cohort_id, date);

create index if not exists idx_assessment_results_demo_assessment
  on public.assessment_results (demo, assessment_id);

create index if not exists idx_assessment_results_demo_student
  on public.assessment_results (demo, student_id);

create index if not exists idx_academic_notes_demo_student_created
  on public.academic_notes (demo, student_id, created_at desc);

create index if not exists idx_session_instruction_notes_demo_session_updated
  on public.session_instruction_notes (demo, session_id, updated_at desc);

create index if not exists idx_instructional_accommodations_demo_student_updated
  on public.instructional_accommodations (demo, student_id, updated_at desc);

create index if not exists idx_instructor_follow_up_flags_demo_cohort_created
  on public.instructor_follow_up_flags (demo, cohort_id, created_at desc);

create index if not exists idx_resources_demo_cohort_published
  on public.resources (demo, cohort_id, published_at desc);

create index if not exists idx_invoices_demo_family_due
  on public.invoices (demo, family_id, due_date);

create index if not exists idx_message_threads_demo_cohort_last
  on public.message_threads (demo, cohort_id, last_message_at desc);

create index if not exists idx_message_posts_demo_thread_created
  on public.message_posts (demo, thread_id, created_at);

create index if not exists idx_leads_demo_submitted
  on public.leads (demo, submitted_at desc);

create index if not exists idx_profiles_demo_full_name
  on public.profiles (demo, full_name);

create index if not exists idx_cohort_assignments_demo_cohort_user
  on public.cohort_assignments (demo, cohort_id, user_id);

create index if not exists idx_cohort_assignments_demo_user_cohort
  on public.cohort_assignments (demo, user_id, cohort_id);

create index if not exists idx_user_templates_demo_email
  on public.user_templates (demo, email);

create index if not exists idx_account_audit_logs_demo_created
  on public.account_audit_logs (demo, created_at desc);

create index if not exists idx_billing_follow_up_notes_demo_family_created
  on public.billing_follow_up_notes (demo, family_id, created_at desc);

create index if not exists idx_admin_tasks_demo_assignee_due
  on public.admin_tasks (demo, assigned_to, due_at);

create index if not exists idx_admin_tasks_demo_due
  on public.admin_tasks (demo, due_at);

create index if not exists idx_task_activities_demo_task_created
  on public.task_activities (demo, task_id, created_at desc);

create index if not exists idx_admin_saved_views_demo_creator_updated
  on public.admin_saved_views (demo, created_by, updated_at desc);

create index if not exists idx_family_contact_events_demo_family_contact
  on public.family_contact_events (demo, family_id, contact_at desc);

create index if not exists idx_admin_announcements_demo_active_start
  on public.admin_announcements (demo, is_active, starts_at desc);

create index if not exists idx_session_checklists_demo_session
  on public.session_checklists (demo, session_id);

create index if not exists idx_session_handoff_notes_demo_session_created
  on public.session_handoff_notes (demo, session_id, created_at desc);

create index if not exists idx_attendance_exception_flags_demo_session_created
  on public.attendance_exception_flags (demo, session_id, created_at desc);

create index if not exists idx_session_coverage_flags_demo_session_updated
  on public.session_coverage_flags (demo, session_id, updated_at desc);

create index if not exists idx_attendance_records_demo_session_student
  on public.attendance_records (demo, session_id, student_id);

create index if not exists idx_approval_requests_demo_requested_created
  on public.approval_requests (demo, requested_by, created_at desc);

create index if not exists idx_admin_escalations_demo_created
  on public.admin_escalations (demo, created_at desc);

create index if not exists idx_admin_escalations_demo_creator_created
  on public.admin_escalations (demo, created_by, created_at desc);

create index if not exists idx_outreach_templates_demo_owner_updated
  on public.outreach_templates (demo, owner_id, updated_at desc);

create index if not exists idx_feedback_submissions_demo_created
  on public.feedback_submissions (demo, created_at desc);
