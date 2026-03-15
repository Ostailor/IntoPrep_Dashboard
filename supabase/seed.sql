insert into public.user_templates (
  email,
  full_name,
  role,
  title,
  assigned_cohort_ids,
  account_status,
  must_change_password
)
values
  ('engineer@intoprep.dev', 'Noah Mercer', 'engineer', 'Platform Engineer', '{}', 'active', false),
  ('admin@intoprep.dev', 'Avery Howard', 'admin', 'Operations Director', '{}', 'active', false),
  ('staff@intoprep.dev', 'Leila Kim', 'staff', 'Enrollment Manager', '{}', 'active', false),
  ('ta@intoprep.dev', 'Mina Chen', 'ta', 'Program TA', '{cohort-sat-spring,cohort-act-sprint}', 'active', false),
  ('instructor@intoprep.dev', 'Daniel Ruiz', 'instructor', 'Lead SAT Instructor', '{cohort-sat-spring}', 'active', false)
on conflict (email) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  title = excluded.title,
  assigned_cohort_ids = excluded.assigned_cohort_ids,
  account_status = excluded.account_status,
  must_change_password = excluded.must_change_password;

insert into public.campuses (id, name, location, modality)
values
  ('campus-malvern', 'Malvern Campus', '42 Lloyd Avenue, Malvern, PA', 'Hybrid'),
  ('campus-upenn', 'UPenn Campus', '3451 Walnut Street, Philadelphia, PA', 'In person'),
  ('campus-online', 'INTO Online', 'Zoom live delivery', 'Online')
on conflict (id) do update
set
  name = excluded.name,
  location = excluded.location,
  modality = excluded.modality;

insert into public.programs (id, name, track, format, tuition)
values
  ('program-dsat', 'Digital SAT Score Guarantee', 'SAT', 'Hybrid, 20 live class days', 4500),
  ('program-act', 'Digital ACT Intensive', 'ACT', 'In person + Zoom recap', 4500),
  ('program-admissions', 'College Admissions Lab', 'Admissions', 'Consulting seminars + 1:1 roadmap', 2200)
on conflict (id) do update
set
  name = excluded.name,
  track = excluded.track,
  format = excluded.format,
  tuition = excluded.tuition;

insert into public.terms (id, name, start_date, end_date)
values
  ('term-spring-2026', 'Spring 2026', '2026-01-12', '2026-05-30'),
  ('term-summer-2026', 'Summer 2026', '2026-06-15', '2026-08-21')
on conflict (id) do update
set
  name = excluded.name,
  start_date = excluded.start_date,
  end_date = excluded.end_date;

insert into public.families (id, family_name, guardian_names, email, phone, preferred_campus_id, notes)
values
  ('family-bennett', 'Bennett', array['Janelle Bennett', 'Marcus Bennett'], 'bennett.family@intoprep-demo.com', '(610) 201-4400', 'campus-malvern', 'Interested in UPenn summer residential option.'),
  ('family-park', 'Park', array['Yuna Park'], 'park.family@intoprep-demo.com', '(610) 221-7712', 'campus-online', 'Needs weekly pacing updates for math confidence.'),
  ('family-patel', 'Patel', array['Neel Patel', 'Asha Patel'], 'patel.family@intoprep-demo.com', '(484) 515-3208', 'campus-upenn', 'Prefers Saturday checkpoint summaries.'),
  ('family-liu', 'Liu', array['Grace Liu'], 'liu.family@intoprep-demo.com', '(610) 204-9192', 'campus-malvern', 'Watching schedule balance with robotics season.'),
  ('family-rivera', 'Rivera', array['Elena Rivera'], 'rivera.family@intoprep-demo.com', '(267) 333-8871', 'campus-upenn', 'Family requested closer visibility into reading pacing.')
on conflict (id) do update
set
  family_name = excluded.family_name,
  guardian_names = excluded.guardian_names,
  email = excluded.email,
  phone = excluded.phone,
  preferred_campus_id = excluded.preferred_campus_id,
  notes = excluded.notes;

insert into public.students (id, family_id, first_name, last_name, grade_level, school, target_test, focus)
values
  ('student-aria-bennett', 'family-bennett', 'Aria', 'Bennett', '11', 'Conestoga High School', 'SAT', 'Targeting 1540+ superscore'),
  ('student-lucas-park', 'family-park', 'Lucas', 'Park', '10', 'Radnor High School', 'SAT', 'Needs structured pacing in math timing'),
  ('student-ethan-liu', 'family-liu', 'Ethan', 'Liu', '10', 'Lower Merion High School', 'SAT', 'Improving reading endurance and annotation'),
  ('student-maya-patel', 'family-patel', 'Maya', 'Patel', '11', 'Harriton High School', 'ACT', 'Wants English section stability over 34'),
  ('student-sofia-rivera', 'family-rivera', 'Sofia', 'Rivera', '11', 'Haverford High School', 'ACT', 'Building science reasoning speed')
on conflict (id) do update
set
  family_id = excluded.family_id,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  grade_level = excluded.grade_level,
  school = excluded.school,
  target_test = excluded.target_test,
  focus = excluded.focus;

insert into public.cohorts (id, name, program_id, campus_id, term_id, capacity, enrolled, lead_instructor_id, cadence, room_label)
values
  ('cohort-sat-spring', 'SAT Spring Elite M/W/F', 'program-dsat', 'campus-malvern', 'term-spring-2026', 18, 14, null, 'Mon/Wed/Fri, plus Saturday full-test labs', 'Studio A + Zoom 3'),
  ('cohort-act-sprint', 'ACT Sprint Tue/Thu/Sat', 'program-act', 'campus-upenn', 'term-spring-2026', 16, 11, null, 'Tue/Thu/Sat, skills rotation', 'Walnut Seminar 2'),
  ('cohort-admissions-lab', 'Admissions Lab', 'program-admissions', 'campus-online', 'term-spring-2026', 22, 19, null, 'Wed evenings + roadmap workshops', 'Zoom Advisory Room')
on conflict (id) do update
set
  name = excluded.name,
  program_id = excluded.program_id,
  campus_id = excluded.campus_id,
  term_id = excluded.term_id,
  capacity = excluded.capacity,
  enrolled = excluded.enrolled,
  cadence = excluded.cadence,
  room_label = excluded.room_label;

insert into public.enrollments (id, student_id, cohort_id, status, registered_at)
values
  ('enroll-aria', 'student-aria-bennett', 'cohort-sat-spring', 'active', '2026-01-05'),
  ('enroll-lucas', 'student-lucas-park', 'cohort-sat-spring', 'active', '2026-01-09'),
  ('enroll-ethan', 'student-ethan-liu', 'cohort-sat-spring', 'active', '2026-01-12'),
  ('enroll-maya', 'student-maya-patel', 'cohort-act-sprint', 'active', '2026-01-07'),
  ('enroll-sofia', 'student-sofia-rivera', 'cohort-act-sprint', 'active', '2026-01-07')
on conflict (id) do update
set
  student_id = excluded.student_id,
  cohort_id = excluded.cohort_id,
  status = excluded.status,
  registered_at = excluded.registered_at;

insert into public.sessions (id, cohort_id, title, start_at, end_at, mode, room_label)
values
  ('session-sat-mock', 'cohort-sat-spring', 'Saturday DSAT Pulse Check', '2026-03-14T08:30:00-04:00', '2026-03-14T11:45:00-04:00', 'Hybrid', 'Studio A + Zoom 3'),
  ('session-sat-review', 'cohort-sat-spring', 'Math Repair Studio', '2026-03-14T13:00:00-04:00', '2026-03-14T15:00:00-04:00', 'Hybrid', 'Studio A breakout'),
  ('session-act-lab', 'cohort-act-sprint', 'ACT English and Science Lab', '2026-03-14T09:00:00-04:00', '2026-03-14T12:00:00-04:00', 'In person', 'Walnut Seminar 2'),
  ('session-admissions', 'cohort-admissions-lab', 'Essay Architecture Workshop', '2026-03-18T18:00:00-04:00', '2026-03-18T19:30:00-04:00', 'Zoom', 'Zoom Advisory Room')
on conflict (id) do update
set
  cohort_id = excluded.cohort_id,
  title = excluded.title,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  mode = excluded.mode,
  room_label = excluded.room_label;

insert into public.assessments (id, cohort_id, title, date, sections)
values
  ('assessment-sat-314', 'cohort-sat-spring', 'Saturday DSAT Pulse Check', '2026-03-14', '[{"label":"Reading & Writing","score":800},{"label":"Math","score":800}]'::jsonb),
  ('assessment-act-314', 'cohort-act-sprint', 'ACT Saturday Skill Check', '2026-03-14', '[{"label":"English","score":36},{"label":"Math","score":36},{"label":"Reading","score":36},{"label":"Science","score":36}]'::jsonb),
  ('assessment-sat-110', 'cohort-sat-spring', 'January SAT Benchmark', '2026-01-10', '[{"label":"Reading & Writing","score":800},{"label":"Math","score":800}]'::jsonb),
  ('assessment-sat-131', 'cohort-sat-spring', 'January Closing Benchmark', '2026-01-31', '[{"label":"Reading & Writing","score":800},{"label":"Math","score":800}]'::jsonb),
  ('assessment-sat-221', 'cohort-sat-spring', 'February Saturday Benchmark', '2026-02-21', '[{"label":"Reading & Writing","score":800},{"label":"Math","score":800}]'::jsonb)
on conflict (id) do update
set
  cohort_id = excluded.cohort_id,
  title = excluded.title,
  date = excluded.date,
  sections = excluded.sections;

insert into public.assessment_results (id, assessment_id, student_id, total_score, section_scores, delta_from_previous)
values
  ('result-aria-110', 'assessment-sat-110', 'student-aria-bennett', 1420, '[{"label":"Reading & Writing","score":700},{"label":"Math","score":720}]'::jsonb, 0),
  ('result-aria-131', 'assessment-sat-131', 'student-aria-bennett', 1450, '[{"label":"Reading & Writing","score":720},{"label":"Math","score":730}]'::jsonb, 30),
  ('result-aria-221', 'assessment-sat-221', 'student-aria-bennett', 1480, '[{"label":"Reading & Writing","score":730},{"label":"Math","score":750}]'::jsonb, 30),
  ('result-aria-314', 'assessment-sat-314', 'student-aria-bennett', 1510, '[{"label":"Reading & Writing","score":740},{"label":"Math","score":770}]'::jsonb, 30),
  ('result-lucas-110', 'assessment-sat-110', 'student-lucas-park', 1310, '[{"label":"Reading & Writing","score":640},{"label":"Math","score":670}]'::jsonb, 0),
  ('result-lucas-131', 'assessment-sat-131', 'student-lucas-park', 1350, '[{"label":"Reading & Writing","score":660},{"label":"Math","score":690}]'::jsonb, 40),
  ('result-lucas-221', 'assessment-sat-221', 'student-lucas-park', 1360, '[{"label":"Reading & Writing","score":670},{"label":"Math","score":690}]'::jsonb, 10),
  ('result-lucas-314', 'assessment-sat-314', 'student-lucas-park', 1420, '[{"label":"Reading & Writing","score":690},{"label":"Math","score":730}]'::jsonb, 60),
  ('result-ethan-110', 'assessment-sat-110', 'student-ethan-liu', 1380, '[{"label":"Reading & Writing","score":680},{"label":"Math","score":700}]'::jsonb, 0),
  ('result-ethan-131', 'assessment-sat-131', 'student-ethan-liu', 1410, '[{"label":"Reading & Writing","score":690},{"label":"Math","score":720}]'::jsonb, 30),
  ('result-ethan-221', 'assessment-sat-221', 'student-ethan-liu', 1440, '[{"label":"Reading & Writing","score":700},{"label":"Math","score":740}]'::jsonb, 30),
  ('result-ethan-314', 'assessment-sat-314', 'student-ethan-liu', 1460, '[{"label":"Reading & Writing","score":710},{"label":"Math","score":750}]'::jsonb, 20),
  ('result-maya-314', 'assessment-act-314', 'student-maya-patel', 33, '[{"label":"English","score":35},{"label":"Math","score":31},{"label":"Reading","score":34},{"label":"Science","score":33}]'::jsonb, 1),
  ('result-sofia-314', 'assessment-act-314', 'student-sofia-rivera', 31, '[{"label":"English","score":32},{"label":"Math","score":29},{"label":"Reading","score":31},{"label":"Science","score":32}]'::jsonb, 2)
on conflict (id) do update
set
  assessment_id = excluded.assessment_id,
  student_id = excluded.student_id,
  total_score = excluded.total_score,
  section_scores = excluded.section_scores,
  delta_from_previous = excluded.delta_from_previous;

insert into public.academic_notes (id, student_id, author_id, visibility, summary, created_at)
values
  ('note-aria', 'student-aria-bennett', null, 'internal', 'Ready for more difficult RW passage timing; recommend pushing blended inference sets.', '2026-03-13T17:15:00-04:00'),
  ('note-lucas', 'student-lucas-park', null, 'internal', 'Recovered well after pacing intervention, but needs calculator discipline.', '2026-03-13T18:05:00-04:00')
on conflict (id) do update
set
  student_id = excluded.student_id,
  author_id = excluded.author_id,
  visibility = excluded.visibility,
  summary = excluded.summary,
  created_at = excluded.created_at;

insert into public.resources (id, cohort_id, title, kind, published_at)
values
  ('resource-math-repair', 'cohort-sat-spring', 'Math Repair Sprint Packet', 'Worksheet', '2026-03-13T20:00:00-04:00'),
  ('resource-act-science', 'cohort-act-sprint', 'ACT Science Speed Framework', 'Deck', '2026-03-12T14:10:00-04:00'),
  ('resource-orientation', 'cohort-sat-spring', 'Saturday replay: pacing reset', 'Replay', '2026-03-10T09:00:00-04:00')
on conflict (id) do update
set
  cohort_id = excluded.cohort_id,
  title = excluded.title,
  kind = excluded.kind,
  published_at = excluded.published_at;

insert into public.invoices (id, family_id, amount_due, due_date, status, source)
values
  ('invoice-bennett', 'family-bennett', 2250, '2026-03-20', 'pending', 'QuickBooks'),
  ('invoice-park', 'family-park', 0, '2026-03-01', 'paid', 'QuickBooks'),
  ('invoice-patel', 'family-patel', 850, '2026-03-08', 'overdue', 'Manual'),
  ('invoice-liu', 'family-liu', 1200, '2026-03-18', 'pending', 'QuickBooks')
on conflict (id) do update
set
  family_id = excluded.family_id,
  amount_due = excluded.amount_due,
  due_date = excluded.due_date,
  status = excluded.status,
  source = excluded.source;

insert into public.message_threads (id, cohort_id, subject, participants, last_message_preview, last_message_at, unread_count)
values
  ('thread-bennett', 'cohort-sat-spring', 'Aria pacing check-in', array['Janelle Bennett', 'Mina Chen'], 'Could we confirm whether Aria should repeat the full math packet tomorrow?', '2026-03-14T11:50:00+00:00', 2),
  ('thread-park', 'cohort-sat-spring', 'Lucas arrival timing', array['Yuna Park', 'Mina Chen'], 'Traffic may make Lucas 10 minutes late to the March 14 session.', '2026-03-14T12:02:00+00:00', 1),
  ('thread-patel', 'cohort-act-sprint', 'Maya English trend', array['Asha Patel', 'Leila Kim'], 'The English trend is strong. We are planning an extra math block next week.', '2026-03-13T22:40:00+00:00', 0)
on conflict (id) do update
set
  cohort_id = excluded.cohort_id,
  subject = excluded.subject,
  participants = excluded.participants,
  last_message_preview = excluded.last_message_preview,
  last_message_at = excluded.last_message_at,
  unread_count = excluded.unread_count;

insert into public.message_posts (id, thread_id, author_id, body, created_at)
values
  ('post-bennett-1', 'thread-bennett', null, 'Could we confirm whether Aria should repeat the full math packet tomorrow?', '2026-03-14T11:50:00+00:00'),
  ('post-bennett-2', 'thread-bennett', null, 'Yes, and we will shift her into the harder inference set after the first section.', '2026-03-14T12:05:00+00:00'),
  ('post-park-1', 'thread-park', null, 'Traffic may make Lucas 10 minutes late to the March 14 session.', '2026-03-14T12:02:00+00:00'),
  ('post-patel-1', 'thread-patel', null, 'The English trend is strong. We are planning an extra math block next week.', '2026-03-13T22:40:00+00:00')
on conflict (id) do update
set
  thread_id = excluded.thread_id,
  author_id = excluded.author_id,
  body = excluded.body,
  created_at = excluded.created_at;

insert into public.leads (id, student_name, guardian_name, target_program, stage, submitted_at)
values
  ('lead-cho', 'Nora Cho', 'Sung Cho', 'Summer 2026 Digital SAT', 'assessment', '2026-03-13T13:20:00+00:00'),
  ('lead-williams', 'Theo Williams', 'Marina Williams', 'ACT Intensive', 'inquiry', '2026-03-14T12:05:00+00:00'),
  ('lead-ghosh', 'Aanya Ghosh', 'Rima Ghosh', 'Admissions Lab', 'waitlist', '2026-03-10T16:10:00+00:00')
on conflict (id) do update
set
  student_name = excluded.student_name,
  guardian_name = excluded.guardian_name,
  target_program = excluded.target_program,
  stage = excluded.stage,
  submitted_at = excluded.submitted_at;

insert into public.sync_jobs (id, label, cadence, status, last_run_at, summary)
values
  ('sync-forms', 'Google Forms registration import', 'Daily around 7:00 AM ET + manual', 'healthy', '2026-03-14T12:00:00+00:00', '3 new registrations landed and mapped cleanly.'),
  ('sync-quickbooks', 'QuickBooks invoice snapshot', 'Daily around 7:00 AM ET + manual', 'warning', '2026-03-14T10:00:00+00:00', '1 overdue invoice could not auto-match to a family record.'),
  ('sync-legacy', 'Legacy 2024 portal export', 'Nightly', 'healthy', '2026-03-14T06:15:00+00:00', 'Student roster and historical score imports completed.'),
  ('sync-scheduling', 'Scheduling bridge fallback', 'Nightly CSV', 'error', '2026-03-14T07:15:00+00:00', 'Source hostname still unavailable; using last successful export from March 13, 2026.'),
  ('sync-morning-ops', 'Morning linked sync bundle', 'Daily around 7:00 AM ET', 'healthy', '2026-03-14T11:05:00+00:00', 'Morning automation is ready to run linked Google Forms and QuickBooks sync sources.')
on conflict (id) do update
set
  label = excluded.label,
  cadence = excluded.cadence,
  status = excluded.status,
  last_run_at = excluded.last_run_at,
  summary = excluded.summary;

insert into public.intake_import_runs (
  id,
  source,
  filename,
  status,
  started_at,
  finished_at,
  imported_count,
  lead_count,
  family_count,
  student_count,
  enrollment_count,
  error_count,
  summary,
  error_samples,
  created_by
)
values
  (
    'import-run-0314-am',
    'Google Forms CSV',
    'google-forms-intake-2026-03-14-0800.csv',
    'completed',
    '2026-03-14T12:00:00+00:00',
    '2026-03-14T12:01:12+00:00',
    3,
    3,
    3,
    3,
    1,
    0,
    'Imported 3 rows from the morning Google Forms registration export.',
    '[]'::jsonb,
    null
  )
on conflict (id) do update
set
  source = excluded.source,
  filename = excluded.filename,
  status = excluded.status,
  started_at = excluded.started_at,
  finished_at = excluded.finished_at,
  imported_count = excluded.imported_count,
  lead_count = excluded.lead_count,
  family_count = excluded.family_count,
  student_count = excluded.student_count,
  enrollment_count = excluded.enrollment_count,
  error_count = excluded.error_count,
  summary = excluded.summary,
  error_samples = excluded.error_samples,
  created_by = excluded.created_by;

insert into public.attendance_records (id, session_id, student_id, status, updated_by)
values
  ('session-sat-mock:student-aria-bennett', 'session-sat-mock', 'student-aria-bennett', 'present', null),
  ('session-sat-mock:student-lucas-park', 'session-sat-mock', 'student-lucas-park', 'tardy', null),
  ('session-sat-mock:student-ethan-liu', 'session-sat-mock', 'student-ethan-liu', 'present', null),
  ('session-act-lab:student-maya-patel', 'session-act-lab', 'student-maya-patel', 'present', null),
  ('session-act-lab:student-sofia-rivera', 'session-act-lab', 'student-sofia-rivera', 'absent', null)
on conflict (session_id, student_id) do update
set
  status = excluded.status,
  updated_by = excluded.updated_by;
