create table if not exists public.intake_sync_sources (
  id text primary key,
  label text not null,
  source_type text not null default 'google_forms_csv_url',
  source_url text not null,
  cadence text not null default 'Manual run',
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_summary text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_intake_sync_sources_updated_at on public.intake_sync_sources;
create trigger set_intake_sync_sources_updated_at
before update on public.intake_sync_sources
for each row
execute function public.set_updated_at();

alter table public.intake_sync_sources enable row level security;

drop policy if exists "intake_sync_sources_import_runner_access" on public.intake_sync_sources;
create policy "intake_sync_sources_import_runner_access"
on public.intake_sync_sources
for all
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
)
with check (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
);
