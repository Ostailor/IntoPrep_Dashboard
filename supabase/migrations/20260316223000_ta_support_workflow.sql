alter table public.message_threads
  add column if not exists category text
  check (category in ('attendance', 'scheduling', 'academic_follow_up'));

create table if not exists public.session_handoff_notes (
  id text primary key,
  session_id text not null references public.sessions (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.attendance_exception_flags (
  id text primary key,
  session_id text not null references public.sessions (id) on delete cascade,
  student_id text not null references public.students (id) on delete cascade,
  flag_type text not null
    check (flag_type in ('late_pattern', 'missing_guardian_reply', 'needs_staff_follow_up')),
  note text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.session_coverage_flags (
  id text primary key,
  session_id text not null unique references public.sessions (id) on delete cascade,
  status text not null
    check (status in ('needs_substitute', 'availability_change', 'clear')),
  note text not null,
  updated_by uuid not null references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists session_handoff_notes_session_idx
  on public.session_handoff_notes (session_id, created_at desc);

create index if not exists attendance_exception_flags_session_idx
  on public.attendance_exception_flags (session_id, student_id, created_at desc);

create index if not exists session_coverage_flags_session_idx
  on public.session_coverage_flags (session_id, updated_at desc);

alter table public.session_handoff_notes enable row level security;
alter table public.attendance_exception_flags enable row level security;
alter table public.session_coverage_flags enable row level security;

drop policy if exists "session_checklists_staff_admin_write" on public.session_checklists;
create policy "session_checklists_staff_admin_write"
on public.session_checklists
for all
using (public.current_app_role() in ('admin', 'engineer', 'staff', 'ta'))
with check (
  public.current_app_role() in ('admin', 'engineer', 'staff')
  or (public.current_app_role() = 'ta' and updated_by = auth.uid())
);

drop policy if exists "session_handoff_notes_read_roles" on public.session_handoff_notes;
create policy "session_handoff_notes_read_roles"
on public.session_handoff_notes
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.session_handoff_notes.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
);

drop policy if exists "session_handoff_notes_write_roles" on public.session_handoff_notes;
create policy "session_handoff_notes_write_roles"
on public.session_handoff_notes
for all
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.session_handoff_notes.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
)
with check (
  public.current_app_role() in ('engineer', 'admin', 'staff')
  or (
    public.current_app_role() = 'ta'
    and author_id = auth.uid()
    and exists (
      select 1
      from public.sessions
      where public.sessions.id = public.session_handoff_notes.session_id
        and public.viewer_has_cohort_access(public.sessions.cohort_id)
    )
  )
);

drop policy if exists "attendance_exception_flags_read_roles" on public.attendance_exception_flags;
create policy "attendance_exception_flags_read_roles"
on public.attendance_exception_flags
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.attendance_exception_flags.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
);

drop policy if exists "attendance_exception_flags_write_roles" on public.attendance_exception_flags;
create policy "attendance_exception_flags_write_roles"
on public.attendance_exception_flags
for all
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.attendance_exception_flags.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
)
with check (
  public.current_app_role() in ('engineer', 'admin', 'staff')
  or (
    public.current_app_role() = 'ta'
    and created_by = auth.uid()
    and exists (
      select 1
      from public.sessions
      where public.sessions.id = public.attendance_exception_flags.session_id
        and public.viewer_has_cohort_access(public.sessions.cohort_id)
    )
  )
);

drop policy if exists "session_coverage_flags_read_roles" on public.session_coverage_flags;
create policy "session_coverage_flags_read_roles"
on public.session_coverage_flags
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.session_coverage_flags.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
);

drop policy if exists "session_coverage_flags_write_roles" on public.session_coverage_flags;
create policy "session_coverage_flags_write_roles"
on public.session_coverage_flags
for all
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.session_coverage_flags.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
)
with check (
  public.current_app_role() in ('engineer', 'admin', 'staff')
  or (
    public.current_app_role() = 'ta'
    and updated_by = auth.uid()
    and exists (
      select 1
      from public.sessions
      where public.sessions.id = public.session_coverage_flags.session_id
        and public.viewer_has_cohort_access(public.sessions.cohort_id)
    )
  )
);

update public.message_threads
set category = case id
  when 'thread-park' then 'attendance'
  when 'thread-bennett' then 'academic_follow_up'
  when 'thread-patel' then 'academic_follow_up'
  else category
end
where id in ('thread-park', 'thread-bennett', 'thread-patel');

insert into public.session_handoff_notes (
  id,
  session_id,
  author_id,
  body,
  created_at
)
select
  'handoff-session-sat-mock',
  public.sessions.id,
  public.profiles.id,
  'Lucas may need a warm start on pacing today, and Aria is ready for the harder RW follow-up set after the first block.',
  '2026-03-16T12:05:00+00:00'
from public.sessions
join public.profiles on public.profiles.email = 'ta@intoprep.dev' and public.profiles.deleted_at is null
where public.sessions.id = 'session-sat-mock'
on conflict (id) do update
set
  session_id = excluded.session_id,
  author_id = excluded.author_id,
  body = excluded.body,
  created_at = excluded.created_at;

insert into public.attendance_exception_flags (
  id,
  session_id,
  student_id,
  flag_type,
  note,
  created_by,
  created_at
)
select
  'attendance-flag-lucas-park',
  public.sessions.id,
  public.students.id,
  'late_pattern',
  'Family still expects a 10-minute-late arrival window on Saturdays.',
  public.profiles.id,
  '2026-03-16T12:10:00+00:00'
from public.sessions
join public.students on public.students.id = 'student-lucas-park'
join public.profiles on public.profiles.email = 'ta@intoprep.dev' and public.profiles.deleted_at is null
where public.sessions.id = 'session-sat-mock'
on conflict (id) do update
set
  session_id = excluded.session_id,
  student_id = excluded.student_id,
  flag_type = excluded.flag_type,
  note = excluded.note,
  created_by = excluded.created_by,
  created_at = excluded.created_at;

insert into public.session_coverage_flags (
  id,
  session_id,
  status,
  note,
  updated_by,
  created_at,
  updated_at
)
select
  'coverage-session-act-lab',
  public.sessions.id,
  'availability_change',
  'TA is available for the first half only and needs staff confirmation on late-block coverage.',
  public.profiles.id,
  '2026-03-16T12:20:00+00:00',
  '2026-03-16T12:20:00+00:00'
from public.sessions
join public.profiles on public.profiles.email = 'ta@intoprep.dev' and public.profiles.deleted_at is null
where public.sessions.id = 'session-act-lab'
on conflict (session_id) do update
set
  status = excluded.status,
  note = excluded.note,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at;

update public.portal_release_metadata
set
  schema_version = '20260316223000_ta_support_workflow',
  updated_at = timezone('utc'::text, now())
where id = 'global';
