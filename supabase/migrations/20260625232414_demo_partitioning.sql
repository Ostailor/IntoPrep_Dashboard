alter table public.profiles add column if not exists demo boolean not null default false;
alter table public.user_templates add column if not exists demo boolean not null default false;
alter table public.account_audit_logs add column if not exists demo boolean not null default false;
alter table public.cohort_assignments add column if not exists demo boolean not null default false;
alter table public.families add column if not exists demo boolean not null default false;
alter table public.students add column if not exists demo boolean not null default false;
alter table public.cohorts add column if not exists demo boolean not null default false;
alter table public.enrollments add column if not exists demo boolean not null default false;
alter table public.sessions add column if not exists demo boolean not null default false;
alter table public.attendance_records add column if not exists demo boolean not null default false;
alter table public.assessments add column if not exists demo boolean not null default false;
alter table public.assessment_results add column if not exists demo boolean not null default false;
alter table public.academic_notes add column if not exists demo boolean not null default false;
alter table public.session_instruction_notes add column if not exists demo boolean not null default false;
alter table public.instructional_accommodations add column if not exists demo boolean not null default false;
alter table public.instructor_follow_up_flags add column if not exists demo boolean not null default false;
alter table public.resources add column if not exists demo boolean not null default false;
alter table public.invoices add column if not exists demo boolean not null default false;
alter table public.billing_follow_up_notes add column if not exists demo boolean not null default false;
alter table public.admin_tasks add column if not exists demo boolean not null default false;
alter table public.admin_saved_views add column if not exists demo boolean not null default false;
alter table public.family_contact_events add column if not exists demo boolean not null default false;
alter table public.admin_announcements add column if not exists demo boolean not null default false;
alter table public.feedback_submissions add column if not exists demo boolean not null default false;
alter table public.message_threads add column if not exists demo boolean not null default false;
alter table public.message_posts add column if not exists demo boolean not null default false;
alter table public.leads add column if not exists demo boolean not null default false;
alter table public.task_activities add column if not exists demo boolean not null default false;
alter table public.session_checklists add column if not exists demo boolean not null default false;
alter table public.session_handoff_notes add column if not exists demo boolean not null default false;
alter table public.attendance_exception_flags add column if not exists demo boolean not null default false;
alter table public.session_coverage_flags add column if not exists demo boolean not null default false;
alter table public.approval_requests add column if not exists demo boolean not null default false;
alter table public.admin_escalations add column if not exists demo boolean not null default false;
alter table public.outreach_templates add column if not exists demo boolean not null default false;
alter table public.sync_job_runs add column if not exists demo boolean not null default false;
alter table public.intake_import_runs add column if not exists demo boolean not null default false;
alter table public.sensitive_access_grants add column if not exists demo boolean not null default false;
alter table public.engineer_support_notes add column if not exists demo boolean not null default false;

create index if not exists idx_profiles_demo on public.profiles (demo);
create index if not exists idx_user_templates_demo on public.user_templates (demo);
create index if not exists idx_cohorts_demo on public.cohorts (demo);
create index if not exists idx_families_demo on public.families (demo);
create index if not exists idx_students_demo on public.students (demo);
create index if not exists idx_admin_tasks_demo on public.admin_tasks (demo);
create index if not exists idx_feedback_submissions_demo on public.feedback_submissions (demo);

update public.profiles
set demo = true
where
  lower(coalesce(email, '')) like 'demo.%'
  or lower(coalesce(email, '')) like 'qa-%'
  or lower(coalesce(email, '')) like 'qa+%'
  or lower(coalesce(email, '')) like 'qa.%'
  or lower(coalesce(email, '')) like '%@intoprep.test';

update public.user_templates
set demo = true
where
  lower(email) like 'demo.%'
  or lower(email) like 'qa-%'
  or lower(email) like 'qa+%'
  or lower(email) like 'qa.%'
  or lower(email) like '%@intoprep.test';

update public.cohorts
set demo = true
where lower(id) like 'qa-%'
   or lower(id) like 'demo-%'
   or lower(name) like '%qa%'
   or lower(name) like '%demo%';

update public.cohort_assignments assignment
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = assignment.user_id and profile.demo
)
or exists (
  select 1 from public.cohorts cohort where cohort.id = assignment.cohort_id and cohort.demo
);

update public.enrollments enrollment
set demo = true
where exists (
  select 1 from public.cohorts cohort where cohort.id = enrollment.cohort_id and cohort.demo
);

update public.students student
set demo = true
where exists (
  select 1
  from public.enrollments enrollment
  where enrollment.student_id = student.id and enrollment.demo
);

update public.families family
set demo = true
where exists (
  select 1 from public.students student where student.family_id = family.id and student.demo
);

update public.sessions session
set demo = true
where exists (
  select 1 from public.cohorts cohort where cohort.id = session.cohort_id and cohort.demo
);

update public.assessments assessment
set demo = true
where exists (
  select 1 from public.cohorts cohort where cohort.id = assessment.cohort_id and cohort.demo
);

update public.attendance_records record
set demo = true
where exists (
  select 1 from public.sessions session where session.id = record.session_id and session.demo
)
or exists (
  select 1 from public.students student where student.id = record.student_id and student.demo
);

update public.assessment_results result
set demo = true
where exists (
  select 1 from public.assessments assessment where assessment.id = result.assessment_id and assessment.demo
)
or exists (
  select 1 from public.students student where student.id = result.student_id and student.demo
);

update public.academic_notes note
set demo = true
where exists (
  select 1 from public.students student where student.id = note.student_id and student.demo
);

update public.session_instruction_notes note
set demo = true
where exists (
  select 1 from public.sessions session where session.id = note.session_id and session.demo
);

update public.instructional_accommodations accommodation
set demo = true
where exists (
  select 1 from public.students student where student.id = accommodation.student_id and student.demo
);

update public.instructor_follow_up_flags flag
set demo = true
where exists (
  select 1 from public.cohorts cohort where cohort.id = flag.cohort_id and cohort.demo
);

update public.resources resource
set demo = true
where exists (
  select 1 from public.cohorts cohort where cohort.id = resource.cohort_id and cohort.demo
);

update public.invoices invoice
set demo = true
where exists (
  select 1 from public.families family where family.id = invoice.family_id and family.demo
);

update public.billing_follow_up_notes note
set demo = true
where exists (
  select 1 from public.families family where family.id = note.family_id and family.demo
)
or exists (
  select 1 from public.invoices invoice where invoice.id = note.invoice_id and invoice.demo
);

update public.message_threads thread
set demo = true
where exists (
  select 1 from public.cohorts cohort where cohort.id = thread.cohort_id and cohort.demo
)
or exists (
  select 1 from public.families family where family.id = thread.family_id and family.demo
);

update public.message_posts post
set demo = true
where exists (
  select 1 from public.message_threads thread where thread.id = post.thread_id and thread.demo
)
or exists (
  select 1 from public.profiles profile where profile.id = post.author_id and profile.demo
);

update public.admin_tasks task
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = task.assigned_to and profile.demo
)
or exists (
  select 1 from public.profiles profile where profile.id = task.created_by and profile.demo
)
or exists (
  select 1 from public.cohorts cohort where task.target_type = 'cohort' and cohort.id = task.target_id and cohort.demo
)
or exists (
  select 1 from public.students student where task.target_type = 'student' and student.id = task.target_id and student.demo
)
or exists (
  select 1 from public.families family where task.target_type = 'family' and family.id = task.target_id and family.demo
)
or exists (
  select 1 from public.invoices invoice where task.target_type = 'invoice' and invoice.id = task.target_id and invoice.demo
)
or exists (
  select 1 from public.profiles profile where task.target_type = 'user' and profile.id::text = task.target_id and profile.demo
);

update public.task_activities activity
set demo = true
where exists (
  select 1 from public.admin_tasks task where task.id = activity.task_id and task.demo
)
or exists (
  select 1 from public.profiles profile where profile.id = activity.author_id and profile.demo
);

update public.admin_saved_views saved_view
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = saved_view.created_by and profile.demo
);

update public.family_contact_events event
set demo = true
where exists (
  select 1 from public.families family where family.id = event.family_id and family.demo
)
or exists (
  select 1 from public.profiles profile where profile.id = event.actor_id and profile.demo
);

update public.admin_announcements announcement
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = announcement.created_by and profile.demo
);

update public.feedback_submissions feedback
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = feedback.reporter_id and profile.demo
)
or lower(coalesce(feedback.reporter_email, '')) like 'demo.%'
or lower(coalesce(feedback.reporter_email, '')) like 'qa-%'
or lower(coalesce(feedback.reporter_email, '')) like 'qa+%'
or lower(coalesce(feedback.reporter_email, '')) like 'qa.%'
or lower(coalesce(feedback.reporter_email, '')) like '%@intoprep.test';

update public.leads lead
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = lead.owner_id and profile.demo
)
or lower(lead.id) like 'qa-%'
or lower(lead.id) like 'demo-%';

update public.session_checklists checklist
set demo = true
where exists (
  select 1 from public.sessions session where session.id = checklist.session_id and session.demo
);

update public.session_handoff_notes note
set demo = true
where exists (
  select 1 from public.sessions session where session.id = note.session_id and session.demo
);

update public.attendance_exception_flags flag
set demo = true
where exists (
  select 1 from public.sessions session where session.id = flag.session_id and session.demo
)
or exists (
  select 1 from public.students student where student.id = flag.student_id and student.demo
)
or exists (
  select 1 from public.profiles profile where profile.id = flag.created_by and profile.demo
);

update public.session_coverage_flags flag
set demo = true
where exists (
  select 1 from public.sessions session where session.id = flag.session_id and session.demo
)
or exists (
  select 1 from public.profiles profile where profile.id = flag.updated_by and profile.demo
);

update public.approval_requests request
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = request.requested_by and profile.demo
)
or exists (
  select 1 from public.profiles profile where profile.id = request.reviewed_by and profile.demo
)
or exists (
  select 1 from public.cohorts cohort where request.target_type = 'cohort' and cohort.id = request.target_id and cohort.demo
)
or exists (
  select 1 from public.sessions session where request.target_type = 'session' and session.id = request.target_id and session.demo
)
or exists (
  select 1 from public.invoices invoice where request.target_type = 'invoice' and invoice.id = request.target_id and invoice.demo
)
or exists (
  select 1 from public.families family where request.target_type = 'family' and family.id = request.target_id and family.demo
);

update public.admin_escalations escalation
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = escalation.created_by and profile.demo
)
or exists (
  select 1 from public.admin_tasks task where escalation.source_type = 'task' and task.id = escalation.source_id and task.demo
)
or exists (
  select 1 from public.leads lead where escalation.source_type = 'lead' and lead.id = escalation.source_id and lead.demo
)
or exists (
  select 1 from public.billing_follow_up_notes note where escalation.source_type = 'billing_follow_up' and note.id = escalation.source_id and note.demo
)
or exists (
  select 1 from public.families family where escalation.source_type = 'family' and family.id = escalation.source_id and family.demo
)
or exists (
  select 1 from public.message_threads thread where escalation.source_type = 'thread' and thread.id = escalation.source_id and thread.demo
)
or exists (
  select 1 from public.cohorts cohort where escalation.source_type = 'cohort' and cohort.id = escalation.source_id and cohort.demo
)
or exists (
  select 1 from public.sessions session where escalation.source_type = 'session' and session.id = escalation.source_id and session.demo
);

update public.outreach_templates template
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = template.owner_id and profile.demo
);

update public.sync_job_runs run
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id::text = run.initiated_by and profile.demo
);

update public.intake_import_runs run
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = run.created_by and profile.demo
);

update public.sensitive_access_grants grant_row
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = grant_row.granted_by and profile.demo
)
or exists (
  select 1 from public.profiles profile where profile.id = grant_row.revoked_by and profile.demo
)
or exists (
  select 1 from public.students student where grant_row.scope_type = 'student' and student.id = grant_row.scope_id and student.demo
)
or exists (
  select 1 from public.families family where grant_row.scope_type = 'family' and family.id = grant_row.scope_id and family.demo
)
or exists (
  select 1 from public.invoices invoice where grant_row.scope_type = 'billing' and invoice.id = grant_row.scope_id and invoice.demo
);

update public.engineer_support_notes note
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = note.author_id and profile.demo
)
or exists (
  select 1 from public.students student where note.target_type = 'student' and student.id = note.target_id and student.demo
)
or exists (
  select 1 from public.families family where note.target_type = 'family' and family.id = note.target_id and family.demo
);

update public.account_audit_logs log
set demo = true
where exists (
  select 1 from public.profiles profile where profile.id = log.actor_id and profile.demo
)
or exists (
  select 1 from public.profiles profile where profile.id = log.target_user_id and profile.demo
)
or lower(coalesce(log.target_email, '')) like 'demo.%'
or lower(coalesce(log.target_email, '')) like 'qa-%'
or lower(coalesce(log.target_email, '')) like 'qa+%'
or lower(coalesce(log.target_email, '')) like 'qa.%'
or lower(coalesce(log.target_email, '')) like '%@intoprep.test';
