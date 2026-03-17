do $cleanup$
declare
  demo_emails text[] := array[
    'engineer@intoprep.dev',
    'admin@intoprep.dev',
    'staff@intoprep.dev',
    'ta@intoprep.dev',
    'instructor@intoprep.dev'
  ];
  demo_family_ids text[] := array[
    'family-bennett',
    'family-park',
    'family-patel',
    'family-liu',
    'family-rivera'
  ];
  demo_student_ids text[] := array[
    'student-aria-bennett',
    'student-lucas-park',
    'student-ethan-liu',
    'student-maya-patel',
    'student-sofia-rivera'
  ];
  demo_program_ids text[] := array[
    'program-dsat',
    'program-act',
    'program-admissions'
  ];
  demo_campus_ids text[] := array[
    'campus-malvern',
    'campus-upenn',
    'campus-online'
  ];
  demo_term_ids text[] := array[
    'term-spring-2026',
    'term-summer-2026'
  ];
  demo_cohort_ids text[] := array[
    'cohort-sat-spring',
    'cohort-act-sprint',
    'cohort-admissions-lab'
  ];
  demo_session_ids text[] := array[
    'session-sat-mock',
    'session-sat-review',
    'session-act-lab',
    'session-admissions'
  ];
  demo_assessment_ids text[] := array[
    'assessment-sat-314',
    'assessment-act-314',
    'assessment-sat-110',
    'assessment-sat-131',
    'assessment-sat-221'
  ];
  demo_invoice_ids text[] := array[
    'invoice-bennett',
    'invoice-park',
    'invoice-patel',
    'invoice-liu'
  ];
  demo_thread_ids text[] := array[
    'thread-bennett',
    'thread-park',
    'thread-patel'
  ];
  demo_lead_ids text[] := array[
    'lead-cho',
    'lead-williams',
    'lead-ghosh',
    'lead-aria-bennett'
  ];
  demo_sync_job_ids text[] := array[
    'sync-forms',
    'sync-quickbooks',
    'sync-legacy',
    'sync-scheduling',
    'sync-morning-ops'
  ];
  demo_admin_task_ids text[] := array[
    'admin-task-billing-patel',
    'admin-task-attendance-park'
  ];
  demo_admin_saved_view_ids text[] := array[
    'admin-view-overdue-billing',
    'admin-view-missing-scores',
    'admin-view-underfilled-cohorts'
  ];
  demo_task_activity_ids text[] := array[
    'task-activity-patel-open',
    'task-activity-park-handoff'
  ];
  demo_outreach_template_ids text[] := array[
    'template-staff-schedule'
  ];
  demo_approval_request_ids text[] := array[
    'approval-request-cohort-move'
  ];
  demo_admin_escalation_ids text[] := array[
    'escalation-patel-billing'
  ];
  demo_contact_event_ids text[] := array[
    'contact-bennett-0314',
    'contact-park-0314'
  ];
  demo_note_ids text[] := array[
    'note-aria',
    'note-lucas'
  ];
  demo_resource_ids text[] := array[
    'resource-math-repair',
    'resource-act-science',
    'resource-orientation'
  ];
  demo_message_post_ids text[] := array[
    'post-bennett-1',
    'post-bennett-2',
    'post-park-1',
    'post-patel-1'
  ];
  demo_import_run_ids text[] := array[
    'import-run-0314-am'
  ];
  demo_billing_note_ids text[] := array[
    'billing-note-bennett',
    'billing-note-patel'
  ];
  demo_announcement_ids text[] := array[
    'admin-announcement-ops'
  ];
  demo_checklist_ids text[] := array[
    'checklist-session-sat-mock'
  ];
  demo_handoff_ids text[] := array[
    'handoff-sat-mock',
    'handoff-session-sat-mock'
  ];
  demo_exception_flag_ids text[] := array[
    'attendance-flag-lucas',
    'attendance-flag-lucas-park'
  ];
  demo_coverage_flag_ids text[] := array[
    'coverage-flag-act-lab',
    'coverage-session-act-lab'
  ];
  demo_session_note_ids text[] := array[
    'session-note-sat-mock-instructor'
  ];
  demo_accommodation_ids text[] := array[
    'accommodation-lucas-park'
  ];
  demo_follow_up_flag_ids text[] := array[
    'instructor-flag-lucas-park'
  ];
begin
  delete from public.sensitive_access_grants
  where granted_by in (select id from public.profiles where lower(email) = any(demo_emails))
     or revoked_by in (select id from public.profiles where lower(email) = any(demo_emails))
     or (scope_type = 'family' and scope_id = any(demo_family_ids))
     or (scope_type = 'student' and scope_id = any(demo_student_ids))
     or (scope_type = 'invoice' and scope_id = any(demo_invoice_ids));

  delete from public.engineer_support_notes
  where author_id in (select id from public.profiles where lower(email) = any(demo_emails))
     or target_id = any(demo_family_ids)
     or target_id = any(demo_student_ids)
     or target_id = any(demo_invoice_ids)
     or target_id = any(demo_cohort_ids)
     or target_id = any(demo_session_ids);

  delete from public.portal_maintenance_banners
  where created_by in (select id from public.profiles where lower(email) = any(demo_emails))
     or owner_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.portal_change_freezes
  where set_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.feature_flags
  where updated_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.task_activities
  where id = any(demo_task_activity_ids)
     or task_id = any(demo_admin_task_ids)
     or author_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.session_instruction_notes
  where id = any(demo_session_note_ids)
     or session_id = any(demo_session_ids)
     or author_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.instructional_accommodations
  where id = any(demo_accommodation_ids)
     or student_id = any(demo_student_ids)
     or created_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.instructor_follow_up_flags
  where id = any(demo_follow_up_flag_ids)
     or target_id = any(demo_student_ids)
     or target_id = any(demo_session_ids)
     or cohort_id = any(demo_cohort_ids)
     or created_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.attendance_exception_flags
  where id = any(demo_exception_flag_ids)
     or session_id = any(demo_session_ids)
     or student_id = any(demo_student_ids)
     or created_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.session_coverage_flags
  where id = any(demo_coverage_flag_ids)
     or session_id = any(demo_session_ids)
     or updated_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.session_handoff_notes
  where id = any(demo_handoff_ids)
     or session_id = any(demo_session_ids)
     or author_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.session_checklists
  where id = any(demo_checklist_ids)
     or session_id = any(demo_session_ids)
     or updated_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.approval_requests
  where id = any(demo_approval_request_ids)
     or requested_by in (select id from public.profiles where lower(email) = any(demo_emails))
     or target_id = any(demo_cohort_ids);

  delete from public.admin_escalations
  where id = any(demo_admin_escalation_ids)
     or created_by in (select id from public.profiles where lower(email) = any(demo_emails))
     or source_id = any(demo_invoice_ids)
     or source_id = any(demo_student_ids)
     or source_id = any(demo_family_ids)
     or source_id = any(demo_session_ids);

  delete from public.outreach_templates
  where id = any(demo_outreach_template_ids)
     or owner_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.admin_tasks
  where id = any(demo_admin_task_ids)
     or assigned_to in (select id from public.profiles where lower(email) = any(demo_emails))
     or created_by in (select id from public.profiles where lower(email) = any(demo_emails))
     or target_id = any(demo_invoice_ids)
     or target_id = any(demo_student_ids)
     or target_id = any(demo_family_ids)
     or target_id = any(demo_cohort_ids)
     or target_id = any(demo_session_ids);

  delete from public.admin_saved_views
  where id = any(demo_admin_saved_view_ids)
     or created_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.admin_announcements
  where id = any(demo_announcement_ids)
     or created_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.family_contact_events
  where id = any(demo_contact_event_ids)
     or family_id = any(demo_family_ids)
     or actor_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.billing_follow_up_notes
  where id = any(demo_billing_note_ids)
     or invoice_id = any(demo_invoice_ids)
     or family_id = any(demo_family_ids)
     or author_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.message_posts
  where id = any(demo_message_post_ids)
     or thread_id = any(demo_thread_ids)
     or author_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.message_threads
  where id = any(demo_thread_ids)
     or family_id = any(demo_family_ids)
     or cohort_id = any(demo_cohort_ids);

  delete from public.attendance_records
  where session_id = any(demo_session_ids)
     or student_id = any(demo_student_ids)
     or updated_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.assessment_results
  where assessment_id = any(demo_assessment_ids)
     or student_id = any(demo_student_ids);

  delete from public.academic_notes
  where id = any(demo_note_ids)
     or student_id = any(demo_student_ids)
     or author_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.resources
  where id = any(demo_resource_ids)
     or cohort_id = any(demo_cohort_ids);

  delete from public.assessments
  where id = any(demo_assessment_ids)
     or cohort_id = any(demo_cohort_ids);

  delete from public.intake_import_runs
  where id = any(demo_import_run_ids)
     or created_by in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.leads
  where id = any(demo_lead_ids)
     or owner_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.sync_jobs
  where id = any(demo_sync_job_ids);

  delete from public.cohort_assignments
  where cohort_id = any(demo_cohort_ids)
     or user_id in (select id from public.profiles where lower(email) = any(demo_emails));

  delete from public.enrollments
  where student_id = any(demo_student_ids)
     or cohort_id = any(demo_cohort_ids);

  delete from public.sessions
  where id = any(demo_session_ids)
     or cohort_id = any(demo_cohort_ids);

  delete from public.invoices
  where id = any(demo_invoice_ids)
     or family_id = any(demo_family_ids);

  delete from public.students
  where id = any(demo_student_ids)
     or family_id = any(demo_family_ids);

  delete from public.families
  where id = any(demo_family_ids)
     or lower(email) like '%@intoprep-demo.com';

  delete from public.cohorts
  where id = any(demo_cohort_ids);

  delete from public.programs
  where id = any(demo_program_ids)
    and not exists (
      select 1
      from public.cohorts
      where public.cohorts.program_id = public.programs.id
    );

  delete from public.campuses
  where id = any(demo_campus_ids)
    and not exists (
      select 1
      from public.cohorts
      where public.cohorts.campus_id = public.campuses.id
    )
    and not exists (
      select 1
      from public.families
      where public.families.preferred_campus_id = public.campuses.id
    );

  delete from public.terms
  where id = any(demo_term_ids)
    and not exists (
      select 1
      from public.cohorts
      where public.cohorts.term_id = public.terms.id
    );

  delete from public.user_templates
  where lower(email) = any(demo_emails);

  delete from public.profiles
  where lower(email) = any(demo_emails);

  delete from auth.users
  where lower(email) = any(demo_emails);
end
$cleanup$;

update public.portal_release_metadata
set
  schema_version = '20260317123000_remove_demo_seed_data',
  updated_at = timezone('utc'::text, now())
where id = 'global';
