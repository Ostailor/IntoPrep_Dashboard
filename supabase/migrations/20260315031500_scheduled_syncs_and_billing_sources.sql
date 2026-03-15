create table if not exists public.billing_sync_sources (
  id text primary key,
  label text not null,
  source_type text not null default 'quickbooks_csv_url',
  source_url text not null,
  cadence text not null default 'Daily around 7:00 AM ET',
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_summary text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_billing_sync_sources_updated_at on public.billing_sync_sources;
create trigger set_billing_sync_sources_updated_at
before update on public.billing_sync_sources
for each row
execute function public.set_updated_at();

alter table public.billing_sync_sources enable row level security;

drop policy if exists "billing_sync_sources_runner_access" on public.billing_sync_sources;
create policy "billing_sync_sources_runner_access"
on public.billing_sync_sources
for all
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
)
with check (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
);

create table if not exists public.sync_job_runs (
  id text primary key,
  job_id text not null references public.sync_jobs (id) on delete cascade,
  run_key text,
  initiated_by text not null,
  status text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  notification_sent boolean not null default false,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create unique index if not exists sync_job_runs_job_id_run_key_idx
on public.sync_job_runs (job_id, run_key)
where run_key is not null;

create index if not exists sync_job_runs_job_id_started_at_idx
on public.sync_job_runs (job_id, started_at desc);

alter table public.sync_job_runs enable row level security;

drop policy if exists "sync_job_runs_authenticated_read" on public.sync_job_runs;
create policy "sync_job_runs_authenticated_read"
on public.sync_job_runs
for select
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
);

insert into public.sync_jobs (id, label, cadence, status, last_run_at, summary)
values (
  'sync-morning-ops',
  'Morning linked sync bundle',
  'Daily around 7:00 AM ET',
  'healthy',
  '2026-03-14T11:05:00+00:00',
  'Morning automation is ready to run linked Google Forms and QuickBooks sync sources.'
)
on conflict (id) do update
set
  label = excluded.label,
  cadence = excluded.cadence,
  status = excluded.status,
  last_run_at = excluded.last_run_at,
  summary = excluded.summary;
