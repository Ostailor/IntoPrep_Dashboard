create table if not exists public.intake_import_runs (
  id text primary key,
  source text not null,
  filename text not null,
  status text not null,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz not null default timezone('utc', now()),
  imported_count integer not null default 0,
  lead_count integer not null default 0,
  family_count integer not null default 0,
  student_count integer not null default 0,
  enrollment_count integer not null default 0,
  error_count integer not null default 0,
  summary text not null default '',
  error_samples jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null
);

create index if not exists intake_import_runs_started_at_idx
on public.intake_import_runs (started_at desc);

alter table public.intake_import_runs enable row level security;

drop policy if exists "intake_import_runs_role_scoped_read" on public.intake_import_runs;
create policy "intake_import_runs_role_scoped_read"
on public.intake_import_runs
for select
using (public.current_app_role() in ('admin', 'staff'));
