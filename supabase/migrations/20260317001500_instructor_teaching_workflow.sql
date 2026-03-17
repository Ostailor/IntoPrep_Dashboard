drop policy if exists "academic_notes_role_scoped_read" on public.academic_notes;
create policy "academic_notes_role_scoped_read"
on public.academic_notes
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.enrollments
    where public.enrollments.student_id = public.academic_notes.student_id
      and public.viewer_has_cohort_access(public.enrollments.cohort_id)
  )
);

create table if not exists public.session_instruction_notes (
  id text primary key,
  session_id text not null references public.sessions (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.instructional_accommodations (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  title text not null,
  detail text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.instructor_follow_up_flags (
  id text primary key,
  target_type text not null check (target_type in ('student', 'session')),
  target_id text not null,
  cohort_id text not null references public.cohorts (id) on delete cascade,
  summary text not null,
  note text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved'))
);

create index if not exists session_instruction_notes_session_idx
  on public.session_instruction_notes (session_id, updated_at desc);

create index if not exists instructional_accommodations_student_idx
  on public.instructional_accommodations (student_id, updated_at desc);

create index if not exists instructor_follow_up_flags_cohort_idx
  on public.instructor_follow_up_flags (cohort_id, created_at desc);

alter table public.session_instruction_notes enable row level security;
alter table public.instructional_accommodations enable row level security;
alter table public.instructor_follow_up_flags enable row level security;

drop policy if exists "session_instruction_notes_read_roles" on public.session_instruction_notes;
create policy "session_instruction_notes_read_roles"
on public.session_instruction_notes
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.session_instruction_notes.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
);

drop policy if exists "session_instruction_notes_write_roles" on public.session_instruction_notes;
create policy "session_instruction_notes_write_roles"
on public.session_instruction_notes
for all
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.session_instruction_notes.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
)
with check (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  or (
    public.current_app_role() = 'instructor'
    and author_id = auth.uid()
    and exists (
      select 1
      from public.sessions
      where public.sessions.id = public.session_instruction_notes.session_id
        and public.viewer_has_cohort_access(public.sessions.cohort_id)
    )
  )
);

drop policy if exists "instructional_accommodations_read_roles" on public.instructional_accommodations;
create policy "instructional_accommodations_read_roles"
on public.instructional_accommodations
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.enrollments
    where public.enrollments.student_id = public.instructional_accommodations.student_id
      and public.viewer_has_cohort_access(public.enrollments.cohort_id)
  )
);

drop policy if exists "instructional_accommodations_write_roles" on public.instructional_accommodations;
create policy "instructional_accommodations_write_roles"
on public.instructional_accommodations
for all
using (public.current_app_role() in ('engineer', 'admin', 'staff'))
with check (public.current_app_role() in ('engineer', 'admin', 'staff'));

drop policy if exists "instructor_follow_up_flags_read_roles" on public.instructor_follow_up_flags;
create policy "instructor_follow_up_flags_read_roles"
on public.instructor_follow_up_flags
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and public.viewer_has_cohort_access(public.instructor_follow_up_flags.cohort_id)
);

drop policy if exists "instructor_follow_up_flags_write_roles" on public.instructor_follow_up_flags;
create policy "instructor_follow_up_flags_write_roles"
on public.instructor_follow_up_flags
for all
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'instructor')
  and public.viewer_has_cohort_access(public.instructor_follow_up_flags.cohort_id)
)
with check (
  public.current_app_role() in ('engineer', 'admin', 'staff')
  or (
    public.current_app_role() = 'instructor'
    and created_by = auth.uid()
    and public.viewer_has_cohort_access(public.instructor_follow_up_flags.cohort_id)
  )
);

insert into public.session_instruction_notes (
  id,
  session_id,
  author_id,
  body,
  created_at,
  updated_at
)
select
  'session-note-sat-mock-instructor',
  public.sessions.id,
  public.profiles.id,
  'Reading pacing held up, but Lucas will need a slower first pass on the harder module next session.',
  '2026-03-16T13:05:00+00:00',
  '2026-03-16T13:05:00+00:00'
from public.sessions
join public.profiles on public.profiles.email = 'instructor@intoprep.dev' and public.profiles.deleted_at is null
where public.sessions.id = 'session-sat-mock'
on conflict (id) do update
set
  session_id = excluded.session_id,
  author_id = excluded.author_id,
  body = excluded.body,
  updated_at = excluded.updated_at;

insert into public.instructional_accommodations (
  id,
  student_id,
  title,
  detail,
  created_by,
  created_at,
  updated_at
)
select
  'accommodation-lucas-park',
  public.students.id,
  'Pacing support',
  'Start with one guided question before independent work, then check for timing drift after the first section.',
  public.profiles.id,
  '2026-03-16T13:10:00+00:00',
  '2026-03-16T13:10:00+00:00'
from public.students
join public.profiles on public.profiles.email = 'staff@intoprep.dev' and public.profiles.deleted_at is null
where public.students.id = 'student-lucas-park'
on conflict (id) do update
set
  student_id = excluded.student_id,
  title = excluded.title,
  detail = excluded.detail,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at;

insert into public.instructor_follow_up_flags (
  id,
  target_type,
  target_id,
  cohort_id,
  summary,
  note,
  created_by,
  created_at,
  status
)
select
  'instructor-flag-lucas-park',
  'student',
  public.students.id,
  'cohort-sat-spring',
  'Check pacing support next session',
  'Lucas responded better after a guided first question. TA should reinforce timing setup at the start of class.',
  public.profiles.id,
  '2026-03-16T13:20:00+00:00',
  'open'
from public.students
join public.profiles on public.profiles.email = 'instructor@intoprep.dev' and public.profiles.deleted_at is null
where public.students.id = 'student-lucas-park'
on conflict (id) do update
set
  summary = excluded.summary,
  note = excluded.note,
  created_by = excluded.created_by,
  status = excluded.status;

update public.portal_release_metadata
set
  schema_version = '20260317001500_instructor_teaching_workflow',
  updated_at = timezone('utc'::text, now())
where id = 'global';
