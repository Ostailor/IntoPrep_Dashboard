create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'staff', 'ta', 'instructor');
  end if;
  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type public.attendance_status as enum ('present', 'absent', 'tardy');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.app_role not null default 'instructor',
  title text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create table if not exists public.user_templates (
  email text primary key,
  full_name text not null,
  role public.app_role not null,
  title text not null,
  assigned_cohort_ids text[] not null default '{}'
);

create table if not exists public.campuses (
  id text primary key,
  name text not null,
  location text not null,
  modality text not null
);

create table if not exists public.programs (
  id text primary key,
  name text not null,
  track text not null,
  format text not null,
  tuition integer not null
);

create table if not exists public.terms (
  id text primary key,
  name text not null,
  start_date date not null,
  end_date date not null
);

create table if not exists public.families (
  id text primary key,
  family_name text not null,
  guardian_names text[] not null default '{}',
  email text not null,
  phone text not null,
  preferred_campus_id text references public.campuses (id),
  notes text not null default ''
);

create table if not exists public.students (
  id text primary key,
  family_id text not null references public.families (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  grade_level text not null,
  school text not null,
  target_test text not null,
  focus text not null
);

create table if not exists public.cohorts (
  id text primary key,
  name text not null,
  program_id text not null references public.programs (id),
  campus_id text not null references public.campuses (id),
  term_id text not null references public.terms (id),
  capacity integer not null,
  enrolled integer not null default 0,
  lead_instructor_id uuid references public.profiles (id),
  cadence text not null,
  room_label text not null
);

create table if not exists public.cohort_assignments (
  id text primary key default encode(gen_random_bytes(12), 'hex'),
  cohort_id text not null references public.cohorts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, cohort_id)
);

create table if not exists public.enrollments (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  cohort_id text not null references public.cohorts (id) on delete cascade,
  status text not null default 'active',
  registered_at date not null
);

create table if not exists public.sessions (
  id text primary key,
  cohort_id text not null references public.cohorts (id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  mode text not null,
  room_label text not null
);

create table if not exists public.attendance_records (
  id text primary key default encode(gen_random_bytes(12), 'hex'),
  session_id text not null references public.sessions (id) on delete cascade,
  student_id text not null references public.students (id) on delete cascade,
  status public.attendance_status not null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (session_id, student_id)
);

create trigger set_attendance_records_updated_at
before update on public.attendance_records
for each row
execute function public.set_updated_at();

create table if not exists public.assessments (
  id text primary key,
  cohort_id text not null references public.cohorts (id) on delete cascade,
  title text not null,
  date date not null,
  sections jsonb not null default '[]'::jsonb
);

create table if not exists public.assessment_results (
  id text primary key,
  assessment_id text not null references public.assessments (id) on delete cascade,
  student_id text not null references public.students (id) on delete cascade,
  total_score integer not null,
  section_scores jsonb not null default '[]'::jsonb,
  delta_from_previous integer not null default 0
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'instructor'::public.app_role
  );
$$;

create or replace function public.viewer_has_cohort_access(target_cohort_id text)
returns boolean
language sql
stable
as $$
  select
    public.current_app_role() in ('admin', 'staff')
    or exists (
      select 1
      from public.cohort_assignments
      where user_id = auth.uid()
        and cohort_id = target_cohort_id
    );
$$;

create or replace function public.viewer_has_family_access(target_family_id text)
returns boolean
language sql
stable
as $$
  select
    public.current_app_role() in ('admin', 'staff', 'ta')
    and exists (
      select 1
      from public.students
      join public.enrollments on enrollments.student_id = students.id
      where students.family_id = target_family_id
        and public.viewer_has_cohort_access(enrollments.cohort_id)
    );
$$;

alter table public.profiles enable row level security;
alter table public.user_templates enable row level security;
alter table public.campuses enable row level security;
alter table public.programs enable row level security;
alter table public.terms enable row level security;
alter table public.families enable row level security;
alter table public.students enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_assignments enable row level security;
alter table public.enrollments enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_results enable row level security;

drop policy if exists "profiles_select_self_or_staff" on public.profiles;
create policy "profiles_select_self_or_staff"
on public.profiles
for select
using (auth.uid() = id or public.current_app_role() in ('admin', 'staff'));

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles
for update
using (auth.uid() = id or public.current_app_role() = 'admin')
with check (auth.uid() = id or public.current_app_role() = 'admin');

drop policy if exists "templates_admin_only" on public.user_templates;
create policy "templates_admin_only"
on public.user_templates
for all
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists "lookup_tables_authenticated_read" on public.campuses;
create policy "lookup_tables_authenticated_read"
on public.campuses
for select
using (auth.uid() is not null);

drop policy if exists "programs_authenticated_read" on public.programs;
create policy "programs_authenticated_read"
on public.programs
for select
using (auth.uid() is not null);

drop policy if exists "terms_authenticated_read" on public.terms;
create policy "terms_authenticated_read"
on public.terms
for select
using (auth.uid() is not null);

drop policy if exists "families_role_scoped_read" on public.families;
create policy "families_role_scoped_read"
on public.families
for select
using (public.viewer_has_family_access(id));

drop policy if exists "students_role_scoped_read" on public.students;
create policy "students_role_scoped_read"
on public.students
for select
using (
  public.current_app_role() in ('admin', 'staff')
  or exists (
    select 1
    from public.enrollments
    where enrollments.student_id = students.id
      and public.viewer_has_cohort_access(enrollments.cohort_id)
  )
);

drop policy if exists "cohorts_role_scoped_read" on public.cohorts;
create policy "cohorts_role_scoped_read"
on public.cohorts
for select
using (public.viewer_has_cohort_access(id));

drop policy if exists "cohort_assignments_scoped_read" on public.cohort_assignments;
create policy "cohort_assignments_scoped_read"
on public.cohort_assignments
for select
using (user_id = auth.uid() or public.current_app_role() in ('admin', 'staff'));

drop policy if exists "enrollments_role_scoped_read" on public.enrollments;
create policy "enrollments_role_scoped_read"
on public.enrollments
for select
using (public.viewer_has_cohort_access(cohort_id));

drop policy if exists "sessions_role_scoped_read" on public.sessions;
create policy "sessions_role_scoped_read"
on public.sessions
for select
using (public.viewer_has_cohort_access(cohort_id));

drop policy if exists "attendance_role_scoped_read" on public.attendance_records;
create policy "attendance_role_scoped_read"
on public.attendance_records
for select
using (
  exists (
    select 1
    from public.sessions
    where sessions.id = attendance_records.session_id
      and public.viewer_has_cohort_access(sessions.cohort_id)
  )
);

drop policy if exists "attendance_role_scoped_write" on public.attendance_records;
create policy "attendance_role_scoped_write"
on public.attendance_records
for all
using (
  public.current_app_role() in ('admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where sessions.id = attendance_records.session_id
      and public.viewer_has_cohort_access(sessions.cohort_id)
  )
)
with check (
  public.current_app_role() in ('admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where sessions.id = attendance_records.session_id
      and public.viewer_has_cohort_access(sessions.cohort_id)
  )
);

drop policy if exists "assessments_role_scoped_read" on public.assessments;
create policy "assessments_role_scoped_read"
on public.assessments
for select
using (public.viewer_has_cohort_access(cohort_id));

drop policy if exists "assessment_results_role_scoped_read" on public.assessment_results;
create policy "assessment_results_role_scoped_read"
on public.assessment_results
for select
using (
  exists (
    select 1
    from public.assessments
    where assessments.id = assessment_results.assessment_id
      and public.viewer_has_cohort_access(assessments.cohort_id)
  )
);
