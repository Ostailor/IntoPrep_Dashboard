alter table public.student_import_runs
  add column if not exists workbook_profile text not null default 'simple',
  add column if not exists workbook_mapping jsonb not null default '{}'::jsonb,
  add column if not exists workbook_setup jsonb not null default '{}'::jsonb,
  add column if not exists cohort_count integer not null default 0,
  add column if not exists session_count integer not null default 0,
  add column if not exists assessment_count integer not null default 0,
  add column if not exists result_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_import_runs'::regclass
      and conname = 'student_import_runs_workbook_profile_check'
  ) then
    alter table public.student_import_runs
      add constraint student_import_runs_workbook_profile_check
      check (workbook_profile in ('simple', 'wide', 'normalized'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_import_runs'::regclass
      and conname = 'student_import_runs_workbook_mapping_object'
  ) then
    alter table public.student_import_runs
      add constraint student_import_runs_workbook_mapping_object
      check (jsonb_typeof(workbook_mapping) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_import_runs'::regclass
      and conname = 'student_import_runs_workbook_setup_object'
  ) then
    alter table public.student_import_runs
      add constraint student_import_runs_workbook_setup_object
      check (jsonb_typeof(workbook_setup) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_import_runs'::regclass
      and conname = 'student_import_runs_workbook_counts_nonnegative'
  ) then
    alter table public.student_import_runs
      add constraint student_import_runs_workbook_counts_nonnegative
      check (
        cohort_count >= 0 and session_count >= 0
        and assessment_count >= 0 and result_count >= 0
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and conname = 'sessions_id_demo_key'
  ) then
    alter table public.sessions
      add constraint sessions_id_demo_key unique (id, demo);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assessments'::regclass
      and conname = 'assessments_id_demo_key'
  ) then
    alter table public.assessments
      add constraint assessments_id_demo_key unique (id, demo);
  end if;
end;
$$;

create unique index if not exists cohorts_import_natural_key
  on public.cohorts (
    demo, program_id, campus_id, term_id, lower(btrim(name))
  ) where is_archived = false;

create unique index if not exists sessions_import_natural_key
  on public.sessions (
    demo, cohort_id, lower(btrim(title)), start_at, end_at, lower(btrim(room_label))
  );

create unique index if not exists assessments_import_natural_key
  on public.assessments (
    demo, cohort_id, lower(btrim(title)), date
  );

alter table public.sessions
  drop constraint if exists sessions_cohort_demo_fkey;
alter table public.sessions
  add constraint sessions_cohort_demo_fkey
  foreign key (cohort_id, demo) references public.cohorts (id, demo)
  on delete cascade not valid;

alter table public.assessments
  drop constraint if exists assessments_cohort_demo_fkey;
alter table public.assessments
  add constraint assessments_cohort_demo_fkey
  foreign key (cohort_id, demo) references public.cohorts (id, demo)
  on delete cascade not valid;

alter table public.assessment_results
  drop constraint if exists assessment_results_assessment_demo_fkey;
alter table public.assessment_results
  add constraint assessment_results_assessment_demo_fkey
  foreign key (assessment_id, demo) references public.assessments (id, demo)
  on delete cascade not valid;

alter table public.assessment_results
  drop constraint if exists assessment_results_student_demo_fkey;
alter table public.assessment_results
  add constraint assessment_results_student_demo_fkey
  foreign key (student_id, demo) references public.students (id, demo)
  on delete cascade not valid;

alter table public.sessions validate constraint sessions_cohort_demo_fkey;
alter table public.assessments validate constraint assessments_cohort_demo_fkey;
alter table public.assessment_results validate constraint assessment_results_assessment_demo_fkey;
alter table public.assessment_results validate constraint assessment_results_student_demo_fkey;

create or replace function public.commit_student_workbook_import(
  p_actor_id uuid,
  p_actor_role text,
  p_actor_demo boolean,
  p_target_demo boolean,
  p_field_definitions jsonb,
  p_families jsonb,
  p_students jsonb,
  p_enrollments jsonb,
  p_cohorts jsonb,
  p_sessions jsonb,
  p_assessments jsonb,
  p_results jsonb,
  p_import_run jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  directory_result jsonb;
  affected integer;
  expected_cohort_count integer;
  expected_session_count integer;
  expected_assessment_count integer;
  expected_result_count integer;
begin
  if p_actor_role is null
    or p_actor_role not in ('engineer', 'admin', 'staff') then
    raise exception 'This role cannot import students.';
  end if;
  if p_actor_demo is null or p_target_demo is null then
    raise exception 'The actor and target partitions are required.';
  end if;
  if p_actor_role <> 'engineer' and p_actor_demo is distinct from p_target_demo then
    raise exception 'The import target does not match the actor partition.';
  end if;
  if p_actor_id is null and (
    p_actor_role <> 'admin'
    or p_actor_demo is distinct from true
    or p_target_demo is distinct from true
  ) then
    raise exception 'Only the local demo admin may import without a persisted actor id.';
  end if;
  if p_actor_id is not null and not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_id
      and profile.role::text = p_actor_role
      and profile.demo is not distinct from p_actor_demo
      and profile.account_status = 'active'
      and profile.must_change_password = false
      and profile.deleted_at is null
  ) then
    raise exception 'The import actor is not active.';
  end if;

  if jsonb_typeof(p_field_definitions) is distinct from 'array'
    or jsonb_typeof(p_families) is distinct from 'array'
    or jsonb_typeof(p_students) is distinct from 'array'
    or jsonb_typeof(p_enrollments) is distinct from 'array'
    or jsonb_typeof(p_cohorts) is distinct from 'array'
    or jsonb_typeof(p_sessions) is distinct from 'array'
    or jsonb_typeof(p_assessments) is distinct from 'array'
    or jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'Import payload collections must be JSON arrays.';
  end if;
  if jsonb_typeof(p_import_run) is distinct from 'object' then
    raise exception 'Import run metadata must be a JSON object.';
  end if;
  if jsonb_array_length(p_field_definitions) > 200
    or jsonb_array_length(p_families) > 2000
    or jsonb_array_length(p_students) > 2000
    or jsonb_array_length(p_enrollments) > 2000
    or jsonb_array_length(p_cohorts) > 2000
    or jsonb_array_length(p_sessions) > 1000
    or jsonb_array_length(p_assessments) > 2000
    or jsonb_array_length(p_results) > 2000 then
    raise exception 'Import payload exceeds server bounds.';
  end if;
  if exists (
    select 1
    from (
      select value from jsonb_array_elements(p_field_definitions)
      union all select value from jsonb_array_elements(p_families)
      union all select value from jsonb_array_elements(p_students)
      union all select value from jsonb_array_elements(p_enrollments)
      union all select value from jsonb_array_elements(p_cohorts)
      union all select value from jsonb_array_elements(p_sessions)
      union all select value from jsonb_array_elements(p_assessments)
      union all select value from jsonb_array_elements(p_results)
    ) payload
    where jsonb_typeof(payload.value) is distinct from 'object'
  ) then
    raise exception 'Every import payload item must be a JSON object.';
  end if;

  if nullif(btrim(p_import_run->>'filename'), '') is null
    or length(p_import_run->>'filename') > 255
    or coalesce(p_import_run->>'fileDigest', '') !~ '^[a-f0-9]{64}$'
    or nullif(btrim(p_import_run->>'worksheet'), '') is null
    or length(p_import_run->>'worksheet') > 200
    or jsonb_typeof(p_import_run->'mapping') is distinct from 'array'
    or coalesce(p_import_run->>'profile', '') not in ('simple', 'wide', 'normalized')
    or jsonb_typeof(p_import_run->'workbookMapping') is distinct from 'object'
    or jsonb_typeof(p_import_run->'workbookSetup') is distinct from 'object' then
    raise exception 'Import run metadata is incomplete.';
  end if;
  if exists (
    select 1
    from unnest(array[
      p_import_run->>'totalRows',
      p_import_run->>'createdCount',
      p_import_run->>'updatedCount',
      p_import_run->>'enrollmentCount',
      p_import_run->>'skippedCount',
      p_import_run->>'warningCount',
      p_import_run->>'cohortCount',
      p_import_run->>'sessionCount',
      p_import_run->>'assessmentCount',
      p_import_run->>'resultCount'
    ]) value
    where value is null or value !~ '^[0-9]+$'
  ) then
    raise exception 'Import run counts must be non-negative integers.';
  end if;

  expected_cohort_count := (p_import_run->>'cohortCount')::integer;
  expected_session_count := (p_import_run->>'sessionCount')::integer;
  expected_assessment_count := (p_import_run->>'assessmentCount')::integer;
  expected_result_count := (p_import_run->>'resultCount')::integer;
  if (p_import_run->>'createdCount')::integer
      + (p_import_run->>'updatedCount')::integer
      + (p_import_run->>'skippedCount')::integer
      > (p_import_run->>'totalRows')::integer
    or (p_import_run->>'warningCount')::integer
      > (p_import_run->>'totalRows')::integer
    or jsonb_array_length(p_students) > (p_import_run->>'totalRows')::integer
    or (p_import_run->>'enrollmentCount')::integer <> jsonb_array_length(p_enrollments)
    or expected_cohort_count <> jsonb_array_length(p_cohorts)
    or expected_session_count <> jsonb_array_length(p_sessions)
    or expected_assessment_count <> jsonb_array_length(p_assessments)
    or expected_result_count <> jsonb_array_length(p_results) then
    raise exception 'Import run counts do not match the payload.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_cohorts) as incoming(
      id text, name text, program_id text, campus_id text, term_id text,
      capacity integer, cadence text, cohort_mode text, start_date date,
      end_date date, room_label text, is_archived boolean, demo boolean
    )
    where nullif(btrim(incoming.id), '') is null
      or nullif(btrim(incoming.name), '') is null
      or nullif(btrim(incoming.program_id), '') is null
      or nullif(btrim(incoming.campus_id), '') is null
      or nullif(btrim(incoming.term_id), '') is null
      or incoming.capacity is null or incoming.capacity <= 0
      or nullif(btrim(incoming.cadence), '') is null
      or incoming.cohort_mode is distinct from 'In person'
      or incoming.start_date is null or incoming.end_date is null
      or not isfinite(incoming.start_date) or not isfinite(incoming.end_date)
      or incoming.end_date < incoming.start_date
      or nullif(btrim(incoming.room_label), '') is null
      or incoming.is_archived is distinct from false
      or incoming.demo is distinct from p_target_demo
  ) then
    raise exception 'A cohort payload is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_cohorts) as incoming(id text)
    group by incoming.id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_cohorts) as incoming(
      name text, program_id text, campus_id text, term_id text
    )
    group by incoming.program_id, incoming.campus_id, incoming.term_id,
      lower(btrim(incoming.name))
    having count(*) > 1
  ) then
    raise exception 'Cohort ids and natural keys must be unique in the payload.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_cohorts) as incoming(
      id text, program_id text, campus_id text, term_id text
    )
    left join public.programs program on program.id = incoming.program_id
    left join public.campuses campus on campus.id = incoming.campus_id
    left join public.terms term on term.id = incoming.term_id
    left join public.cohorts existing on existing.id = incoming.id
    where program.id is null or campus.id is null or term.id is null
      or program.is_archived
      or (existing.id is not null and existing.demo is distinct from p_target_demo)
  ) then
    raise exception 'A cohort references unavailable metadata or another partition.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_students) as incoming(id text, demo boolean)
    where nullif(btrim(incoming.id), '') is null
      or incoming.demo is distinct from p_target_demo
  ) or exists (
    select 1 from jsonb_to_recordset(p_students) as incoming(id text)
    group by incoming.id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_students) as incoming(id text)
    join public.students existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
  ) then
    raise exception 'A student id is invalid, duplicated, or belongs to another partition.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_enrollments) as incoming(
      id text, student_id text, cohort_id text, demo boolean
    )
    left join public.students existing_student
      on existing_student.id = incoming.student_id
      and existing_student.demo = p_target_demo
    left join public.cohorts existing_cohort
      on existing_cohort.id = incoming.cohort_id
      and existing_cohort.demo = p_target_demo
    left join jsonb_to_recordset(p_students) as planned_student(id text)
      on planned_student.id = incoming.student_id
    left join jsonb_to_recordset(p_cohorts) as planned_cohort(id text)
      on planned_cohort.id = incoming.cohort_id
    where nullif(btrim(incoming.id), '') is null
      or nullif(btrim(incoming.student_id), '') is null
      or nullif(btrim(incoming.cohort_id), '') is null
      or incoming.demo is distinct from p_target_demo
      or (existing_student.id is null and planned_student.id is null)
      or (existing_cohort.id is null and planned_cohort.id is null)
  ) then
    raise exception 'An enrollment crosses the target partition.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_sessions) as incoming(
      id text, cohort_id text, title text, start_at timestamptz,
      end_at timestamptz, mode text, room_label text, demo boolean
    )
    where nullif(btrim(incoming.id), '') is null
      or nullif(btrim(incoming.cohort_id), '') is null
      or nullif(btrim(incoming.title), '') is null
      or incoming.start_at is null or incoming.end_at is null
      or not isfinite(incoming.start_at) or not isfinite(incoming.end_at)
      or incoming.end_at <= incoming.start_at
      or incoming.mode is distinct from 'In person'
      or nullif(btrim(incoming.room_label), '') is null
      or incoming.demo is distinct from p_target_demo
  ) then
    raise exception 'A session payload is invalid.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_sessions) as incoming(id text)
    group by incoming.id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_sessions) as incoming(
      cohort_id text, title text, start_at timestamptz,
      end_at timestamptz, room_label text
    )
    group by incoming.cohort_id, lower(btrim(incoming.title)),
      incoming.start_at, incoming.end_at, lower(btrim(incoming.room_label))
    having count(*) > 1
  ) then
    raise exception 'Session ids and natural keys must be unique in the payload.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_sessions) as incoming(id text, cohort_id text)
    left join public.sessions existing on existing.id = incoming.id
    left join public.cohorts target_cohort
      on target_cohort.id = incoming.cohort_id and target_cohort.demo = p_target_demo
    left join jsonb_to_recordset(p_cohorts) as planned_cohort(id text)
      on planned_cohort.id = incoming.cohort_id
    where (existing.id is not null and existing.demo is distinct from p_target_demo)
      or (target_cohort.id is null and planned_cohort.id is null)
  ) then
    raise exception 'A session references a cohort or id outside the target partition.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assessments) as incoming(
      id text, cohort_id text, title text, date date, sections jsonb, demo boolean
    )
    where nullif(btrim(incoming.id), '') is null
      or nullif(btrim(incoming.cohort_id), '') is null
      or nullif(btrim(incoming.title), '') is null
      or incoming.date is null
      or not isfinite(incoming.date)
      or jsonb_typeof(incoming.sections) is distinct from 'array'
      or jsonb_array_length(incoming.sections) = 0
      or jsonb_array_length(incoming.sections) > 20
      or incoming.demo is distinct from p_target_demo
  ) then
    raise exception 'An assessment payload is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_assessments) as incoming(sections jsonb)
    cross join lateral jsonb_array_elements(incoming.sections) section
    where jsonb_typeof(section) is distinct from 'object'
      or nullif(btrim(section->>'label'), '') is null
      or jsonb_typeof(section->'score') is distinct from 'number'
      or coalesce(section->>'score', '') !~ '^[0-9]+$'
  ) then
    raise exception 'Assessment sections are invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_assessments) as incoming(sections jsonb)
    where jsonb_array_length(incoming.sections) <> (
      select count(distinct lower(btrim(section->>'label')))
      from jsonb_array_elements(incoming.sections) section
    )
  ) then
    raise exception 'Assessment section labels must be unique.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_assessments) as incoming(id text)
    group by incoming.id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_assessments) as incoming(
      cohort_id text, title text, date date
    )
    group by incoming.cohort_id, lower(btrim(incoming.title)), incoming.date
    having count(*) > 1
  ) then
    raise exception 'Assessment ids and natural keys must be unique in the payload.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_assessments) as incoming(id text, cohort_id text)
    left join public.assessments existing on existing.id = incoming.id
    left join public.cohorts target_cohort
      on target_cohort.id = incoming.cohort_id and target_cohort.demo = p_target_demo
    left join jsonb_to_recordset(p_cohorts) as planned_cohort(id text)
      on planned_cohort.id = incoming.cohort_id
    where (existing.id is not null and existing.demo is distinct from p_target_demo)
      or (target_cohort.id is null and planned_cohort.id is null)
  ) then
    raise exception 'An assessment references a cohort or id outside the target partition.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_results) as incoming(
      id text, assessment_id text, student_id text, total_score integer,
      section_scores jsonb, delta_from_previous integer, demo boolean
    )
    where nullif(btrim(incoming.id), '') is null
      or nullif(btrim(incoming.assessment_id), '') is null
      or nullif(btrim(incoming.student_id), '') is null
      or incoming.total_score is null
      or incoming.delta_from_previous is null
      or jsonb_typeof(incoming.section_scores) is distinct from 'array'
      or jsonb_array_length(incoming.section_scores) <> 2
      or incoming.demo is distinct from p_target_demo
  ) then
    raise exception 'An assessment result payload is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_results) as incoming(section_scores jsonb)
    cross join lateral jsonb_array_elements(incoming.section_scores) section
    where jsonb_typeof(section) is distinct from 'object'
      or regexp_replace(lower(btrim(section->>'label')), '[^a-z]', '', 'g')
        not in ('rw', 'math')
      or jsonb_typeof(section->'score') is distinct from 'number'
      or coalesce(section->>'score', '') !~ '^[0-9]+$'
  ) or exists (
    select 1
    from jsonb_to_recordset(p_results) as incoming(section_scores jsonb)
    where 1 <> (
      select count(*)
      from jsonb_array_elements(incoming.section_scores) section
      where regexp_replace(lower(btrim(section->>'label')), '[^a-z]', '', 'g') = 'rw'
    ) or 1 <> (
      select count(*)
      from jsonb_array_elements(incoming.section_scores) section
      where regexp_replace(lower(btrim(section->>'label')), '[^a-z]', '', 'g') = 'math'
    )
  ) then
    raise exception 'Assessment result RW and Math scores are invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_results) as incoming(
      total_score integer, section_scores jsonb
    )
    where incoming.total_score <> (
      select sum((section->>'score')::integer)
      from jsonb_array_elements(incoming.section_scores) section
    )
  ) then
    raise exception 'Assessment result Total must equal RW plus Math.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_results) as incoming(id text)
    group by incoming.id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_results) as incoming(assessment_id text, student_id text)
    group by incoming.assessment_id, incoming.student_id having count(*) > 1
  ) then
    raise exception 'Assessment result ids and relationships must be unique in the payload.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_results) as incoming(
      id text, assessment_id text, student_id text
    )
    left join public.assessment_results existing on existing.id = incoming.id
    left join public.assessments target_assessment
      on target_assessment.id = incoming.assessment_id
      and target_assessment.demo = p_target_demo
    left join jsonb_to_recordset(p_assessments) as planned_assessment(id text)
      on planned_assessment.id = incoming.assessment_id
    left join public.students target_student
      on target_student.id = incoming.student_id
      and target_student.demo = p_target_demo
    left join jsonb_to_recordset(p_students) as planned_student(id text)
      on planned_student.id = incoming.student_id
    where (existing.id is not null and (
        existing.demo is distinct from p_target_demo
        or existing.assessment_id is distinct from incoming.assessment_id
        or existing.student_id is distinct from incoming.student_id
      ))
      or (target_assessment.id is null and planned_assessment.id is null)
      or (target_student.id is null and planned_student.id is null)
  ) then
    raise exception 'An assessment result crosses the target partition.';
  end if;

  insert into public.cohorts (
    id, name, program_id, campus_id, term_id, capacity, enrolled,
    cadence, cohort_mode, start_date, end_date, room_label,
    is_archived, archived_at, demo
  )
  select
    incoming.id, incoming.name, incoming.program_id, incoming.campus_id,
    incoming.term_id, incoming.capacity, 0, incoming.cadence,
    incoming.cohort_mode, incoming.start_date, incoming.end_date,
    incoming.room_label, false, null, p_target_demo
  from jsonb_to_recordset(p_cohorts) as incoming(
    id text, name text, program_id text, campus_id text, term_id text,
    capacity integer, cadence text, cohort_mode text, start_date date,
    end_date date, room_label text
  );
  get diagnostics affected = row_count;
  if affected <> expected_cohort_count then
    raise exception 'Cohort import count mismatch.';
  end if;

  directory_result := public.commit_student_spreadsheet_import(
    p_actor_id,
    p_actor_role,
    p_actor_demo,
    p_target_demo,
    p_field_definitions,
    p_families,
    p_students,
    p_enrollments,
    p_import_run
  );

  insert into public.sessions (
    id, cohort_id, title, start_at, end_at, mode, room_label, demo
  )
  select
    incoming.id, incoming.cohort_id, incoming.title, incoming.start_at,
    incoming.end_at, incoming.mode, incoming.room_label, p_target_demo
  from jsonb_to_recordset(p_sessions) as incoming(
    id text, cohort_id text, title text, start_at timestamptz,
    end_at timestamptz, mode text, room_label text
  );
  get diagnostics affected = row_count;
  if affected <> expected_session_count then
    raise exception 'Session import count mismatch.';
  end if;

  insert into public.assessments (
    id, cohort_id, title, date, sections, demo
  )
  select
    incoming.id, incoming.cohort_id, incoming.title,
    incoming.date, incoming.sections, p_target_demo
  from jsonb_to_recordset(p_assessments) as incoming(
    id text, cohort_id text, title text, date date, sections jsonb
  );
  get diagnostics affected = row_count;
  if affected <> expected_assessment_count then
    raise exception 'Assessment import count mismatch.';
  end if;

  insert into public.assessment_results (
    id, assessment_id, student_id, total_score,
    section_scores, delta_from_previous, demo
  )
  select
    incoming.id, incoming.assessment_id, incoming.student_id,
    incoming.total_score, incoming.section_scores,
    incoming.delta_from_previous, p_target_demo
  from jsonb_to_recordset(p_results) as incoming(
    id text, assessment_id text, student_id text, total_score integer,
    section_scores jsonb, delta_from_previous integer
  )
  on conflict (assessment_id, student_id) do update set
    total_score = excluded.total_score,
    section_scores = excluded.section_scores,
    delta_from_previous = excluded.delta_from_previous
  where public.assessment_results.demo is not distinct from p_target_demo;
  get diagnostics affected = row_count;
  if affected <> expected_result_count then
    raise exception 'Assessment result import count mismatch.';
  end if;

  update public.student_import_runs
  set workbook_profile = p_import_run->>'profile',
    workbook_mapping = p_import_run->'workbookMapping',
    workbook_setup = p_import_run->'workbookSetup',
    cohort_count = expected_cohort_count,
    session_count = expected_session_count,
    assessment_count = expected_assessment_count,
    result_count = expected_result_count
  where id = (directory_result->>'runId')::uuid
    and demo = p_target_demo;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Workbook import audit update mismatch.';
  end if;

  return directory_result || jsonb_build_object(
    'cohorts', expected_cohort_count,
    'sessions', expected_session_count,
    'assessments', expected_assessment_count,
    'results', expected_result_count
  );
end;
$$;

revoke all on function public.commit_student_workbook_import(
  uuid, text, boolean, boolean,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.commit_student_workbook_import(
  uuid, text, boolean, boolean,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
