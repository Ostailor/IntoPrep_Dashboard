alter table public.profiles
  add column if not exists session_revoked_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id);

alter table public.user_templates
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id);

alter table public.account_audit_logs
  add column if not exists issue_reference text,
  add column if not exists target_type text;

alter table public.sync_jobs
  add column if not exists owner_id uuid references public.profiles (id),
  add column if not exists acknowledged_by uuid references public.profiles (id),
  add column if not exists acknowledged_at timestamptz,
  add column if not exists muted_until timestamptz,
  add column if not exists handoff_notes text,
  add column if not exists runbook_url text;

alter table public.intake_sync_sources
  add column if not exists control_state text not null default 'active' check (control_state in ('active', 'paused', 'maintenance')),
  add column if not exists owner_id uuid references public.profiles (id),
  add column if not exists handoff_notes text,
  add column if not exists changed_by uuid references public.profiles (id),
  add column if not exists changed_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists runbook_url text;

alter table public.billing_sync_sources
  add column if not exists control_state text not null default 'active' check (control_state in ('active', 'paused', 'maintenance')),
  add column if not exists owner_id uuid references public.profiles (id),
  add column if not exists handoff_notes text,
  add column if not exists changed_by uuid references public.profiles (id),
  add column if not exists changed_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists runbook_url text;

create table if not exists public.sensitive_access_grants (
  id text primary key,
  scope_type text not null check (scope_type in ('student', 'family', 'billing', 'support_case')),
  scope_id text not null,
  reason text not null,
  issue_reference text not null,
  granted_by uuid not null references public.profiles (id),
  revoked_by uuid references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists public.engineer_support_notes (
  id text primary key,
  target_type text not null check (target_type in ('sync_job', 'integration_source', 'account', 'cohort', 'family', 'support_case')),
  target_id text not null,
  issue_reference text not null,
  body text not null,
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.feature_flags (
  key text primary key,
  description text not null,
  enabled_roles public.app_role[] not null default '{}'::public.app_role[],
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.portal_change_freezes (
  id text primary key,
  enabled boolean not null default false,
  scope text not null default 'operational_writes',
  reason text,
  issue_reference text,
  set_by uuid references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz
);

create table if not exists public.portal_maintenance_banners (
  id text primary key,
  message text not null,
  tone text not null default 'warning' check (tone in ('info', 'warning', 'error')),
  issue_reference text,
  owner_id uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  starts_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz
);

create table if not exists public.portal_release_metadata (
  id text primary key,
  app_version text not null,
  schema_version text not null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists sensitive_access_grants_scope_idx
  on public.sensitive_access_grants (scope_type, scope_id);

create index if not exists sensitive_access_grants_active_idx
  on public.sensitive_access_grants (expires_at, revoked_at);

create index if not exists engineer_support_notes_target_idx
  on public.engineer_support_notes (target_type, target_id, created_at desc);

create index if not exists account_audit_logs_issue_reference_idx
  on public.account_audit_logs (issue_reference);

create index if not exists account_audit_logs_target_type_idx
  on public.account_audit_logs (target_type);

alter table public.sensitive_access_grants enable row level security;
alter table public.engineer_support_notes enable row level security;
alter table public.feature_flags enable row level security;
alter table public.portal_change_freezes enable row level security;
alter table public.portal_maintenance_banners enable row level security;
alter table public.portal_release_metadata enable row level security;

drop policy if exists "sensitive_access_grants_engineer_only" on public.sensitive_access_grants;
create policy "sensitive_access_grants_engineer_only"
on public.sensitive_access_grants
for all
using (public.current_app_role() = 'engineer')
with check (public.current_app_role() = 'engineer');

drop policy if exists "engineer_support_notes_engineer_only" on public.engineer_support_notes;
create policy "engineer_support_notes_engineer_only"
on public.engineer_support_notes
for all
using (public.current_app_role() = 'engineer')
with check (public.current_app_role() = 'engineer');

drop policy if exists "feature_flags_engineer_only" on public.feature_flags;
create policy "feature_flags_engineer_only"
on public.feature_flags
for all
using (public.current_app_role() = 'engineer')
with check (public.current_app_role() = 'engineer');

drop policy if exists "portal_change_freezes_engineer_only" on public.portal_change_freezes;
create policy "portal_change_freezes_engineer_only"
on public.portal_change_freezes
for all
using (public.current_app_role() = 'engineer')
with check (public.current_app_role() = 'engineer');

drop policy if exists "portal_maintenance_banners_engineer_only" on public.portal_maintenance_banners;
create policy "portal_maintenance_banners_engineer_only"
on public.portal_maintenance_banners
for all
using (public.current_app_role() = 'engineer')
with check (public.current_app_role() = 'engineer');

drop policy if exists "portal_release_metadata_engineer_admin_read" on public.portal_release_metadata;
create policy "portal_release_metadata_engineer_admin_read"
on public.portal_release_metadata
for select
using (public.current_app_role() in ('engineer', 'admin'));

drop policy if exists "portal_release_metadata_engineer_write" on public.portal_release_metadata;
create policy "portal_release_metadata_engineer_write"
on public.portal_release_metadata
for all
using (public.current_app_role() = 'engineer')
with check (public.current_app_role() = 'engineer');

insert into public.portal_change_freezes (
  id,
  enabled,
  scope
)
values (
  'global',
  false,
  'operational_writes'
)
on conflict (id) do nothing;

insert into public.portal_release_metadata (
  id,
  app_version,
  schema_version
)
values (
  'global',
  '0.1.0',
  '20260315140000_engineer_controls'
)
on conflict (id) do update
set
  app_version = excluded.app_version,
  schema_version = excluded.schema_version,
  updated_at = timezone('utc'::text, now());

update public.sync_jobs
set runbook_url = case id
  when 'sync-forms' then 'https://intoprep.local/runbooks/google-forms-sync'
  when 'sync-quickbooks' then 'https://intoprep.local/runbooks/quickbooks-sync'
  when 'sync-legacy' then 'https://intoprep.local/runbooks/legacy-export-sync'
  when 'sync-scheduling' then 'https://intoprep.local/runbooks/scheduling-bridge'
  when 'sync-morning-ops' then 'https://intoprep.local/runbooks/morning-ops'
  else runbook_url
end
where runbook_url is null;

update public.intake_sync_sources
set
  runbook_url = coalesce(runbook_url, 'https://intoprep.local/runbooks/google-forms-sync'),
  changed_at = coalesce(changed_at, timezone('utc'::text, now()))
where id = 'google-forms-primary';

update public.billing_sync_sources
set
  runbook_url = coalesce(runbook_url, 'https://intoprep.local/runbooks/quickbooks-sync'),
  changed_at = coalesce(changed_at, timezone('utc'::text, now()))
where id = 'quickbooks-primary';
