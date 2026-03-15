create table if not exists public.academic_notes (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  visibility text not null default 'internal',
  summary text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.resources (
  id text primary key,
  cohort_id text not null references public.cohorts (id) on delete cascade,
  title text not null,
  kind text not null,
  published_at timestamptz not null default timezone('utc', now())
);

alter table public.academic_notes enable row level security;
alter table public.resources enable row level security;

drop policy if exists "academic_notes_role_scoped_read" on public.academic_notes;
create policy "academic_notes_role_scoped_read"
on public.academic_notes
for select
using (
  public.current_app_role() in ('admin', 'staff', 'ta')
  and exists (
    select 1
    from public.enrollments
    where enrollments.student_id = academic_notes.student_id
      and public.viewer_has_cohort_access(enrollments.cohort_id)
  )
);

drop policy if exists "resources_role_scoped_read" on public.resources;
create policy "resources_role_scoped_read"
on public.resources
for select
using (
  public.current_app_role() in ('admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
);
