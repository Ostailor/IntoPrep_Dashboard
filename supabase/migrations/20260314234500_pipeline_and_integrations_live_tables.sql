create table if not exists public.leads (
  id text primary key,
  student_name text not null,
  guardian_name text not null,
  target_program text not null,
  stage text not null,
  submitted_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sync_jobs (
  id text primary key,
  label text not null,
  cadence text not null,
  status text not null,
  last_run_at timestamptz not null default timezone('utc', now()),
  summary text not null
);

alter table public.leads enable row level security;
alter table public.sync_jobs enable row level security;

drop policy if exists "leads_role_scoped_read" on public.leads;
create policy "leads_role_scoped_read"
on public.leads
for select
using (public.current_app_role() in ('admin', 'staff'));

drop policy if exists "sync_jobs_authenticated_read" on public.sync_jobs;
create policy "sync_jobs_authenticated_read"
on public.sync_jobs
for select
using (auth.uid() is not null);
