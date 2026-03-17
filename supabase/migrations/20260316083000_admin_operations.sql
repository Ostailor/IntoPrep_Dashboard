alter table public.profiles
  add column if not exists last_signed_in_at timestamptz;

alter table public.invoices
  add column if not exists follow_up_state text not null default 'open' check (follow_up_state in ('open', 'in_progress', 'resolved')),
  add column if not exists last_follow_up_at timestamptz,
  add column if not exists last_follow_up_by uuid references public.profiles (id);

create table if not exists public.billing_follow_up_notes (
  id text primary key,
  invoice_id text not null references public.invoices (id) on delete cascade,
  family_id text not null references public.families (id) on delete cascade,
  author_id uuid references public.profiles (id),
  body text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.admin_tasks (
  id text primary key,
  task_type text not null check (task_type in ('billing_follow_up', 'family_communication', 'attendance_follow_up', 'score_cleanup', 'cohort_staffing')),
  target_type text not null check (target_type in ('invoice', 'family', 'cohort', 'student', 'user')),
  target_id text not null,
  title text not null,
  details text,
  assigned_to uuid references public.profiles (id),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.admin_saved_views (
  id text primary key,
  name text not null,
  section text not null check (section in ('dashboard', 'calendar', 'cohorts', 'attendance', 'students', 'families', 'programs', 'academics', 'messaging', 'billing', 'integrations', 'settings')),
  filter_state jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.family_contact_events (
  id text primary key,
  family_id text not null references public.families (id) on delete cascade,
  contact_source text not null check (contact_source in ('email', 'phone', 'sms', 'meeting', 'portal_message')),
  summary text not null,
  outcome text not null,
  actor_id uuid references public.profiles (id),
  contact_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.admin_announcements (
  id text primary key,
  title text not null,
  body text not null,
  tone text not null default 'info' check (tone in ('info', 'warning')),
  visible_roles public.app_role[] not null default '{admin,staff,ta}'::public.app_role[],
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  starts_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz
);

create index if not exists billing_follow_up_notes_invoice_idx
  on public.billing_follow_up_notes (invoice_id, created_at desc);

create index if not exists admin_tasks_assigned_to_idx
  on public.admin_tasks (assigned_to, status, due_at);

create index if not exists admin_tasks_target_idx
  on public.admin_tasks (target_type, target_id);

create index if not exists admin_saved_views_section_idx
  on public.admin_saved_views (section, updated_at desc);

create index if not exists family_contact_events_family_idx
  on public.family_contact_events (family_id, contact_at desc);

create index if not exists admin_announcements_active_idx
  on public.admin_announcements (is_active, starts_at, expires_at);

alter table public.billing_follow_up_notes enable row level security;
alter table public.admin_tasks enable row level security;
alter table public.admin_saved_views enable row level security;
alter table public.family_contact_events enable row level security;
alter table public.admin_announcements enable row level security;

drop policy if exists "billing_follow_up_notes_admin_engineer" on public.billing_follow_up_notes;
create policy "billing_follow_up_notes_admin_engineer"
on public.billing_follow_up_notes
for all
using (public.current_app_role() in ('admin', 'engineer'))
with check (public.current_app_role() in ('admin', 'engineer'));

drop policy if exists "admin_tasks_read_roles" on public.admin_tasks;
create policy "admin_tasks_read_roles"
on public.admin_tasks
for select
using (public.current_app_role() in ('admin', 'engineer', 'staff', 'ta'));

drop policy if exists "admin_tasks_admin_engineer_write" on public.admin_tasks;
create policy "admin_tasks_admin_engineer_write"
on public.admin_tasks
for all
using (public.current_app_role() in ('admin', 'engineer'))
with check (public.current_app_role() in ('admin', 'engineer'));

drop policy if exists "admin_saved_views_admin_engineer" on public.admin_saved_views;
create policy "admin_saved_views_admin_engineer"
on public.admin_saved_views
for all
using (public.current_app_role() in ('admin', 'engineer'))
with check (public.current_app_role() in ('admin', 'engineer'));

drop policy if exists "family_contact_events_admin_engineer" on public.family_contact_events;
create policy "family_contact_events_admin_engineer"
on public.family_contact_events
for all
using (public.current_app_role() in ('admin', 'engineer'))
with check (public.current_app_role() in ('admin', 'engineer'));

drop policy if exists "admin_announcements_visible_roles" on public.admin_announcements;
create policy "admin_announcements_visible_roles"
on public.admin_announcements
for select
using (public.current_app_role() in ('admin', 'engineer', 'staff', 'ta'));

drop policy if exists "admin_announcements_admin_engineer_write" on public.admin_announcements;
create policy "admin_announcements_admin_engineer_write"
on public.admin_announcements
for all
using (public.current_app_role() in ('admin', 'engineer'))
with check (public.current_app_role() in ('admin', 'engineer'));

update public.invoices
set
  follow_up_state = case
    when status = 'overdue' then 'in_progress'
    when status = 'pending' then 'open'
    else 'resolved'
  end
where follow_up_state is null or follow_up_state = 'open';

-- Demo workflow rows were removed from this migration.

insert into public.portal_release_metadata (
  id,
  app_version,
  schema_version
)
values (
  'global',
  '0.1.0',
  '20260316083000_admin_operations'
)
on conflict (id) do update
set
  app_version = excluded.app_version,
  schema_version = excluded.schema_version,
  updated_at = timezone('utc'::text, now());
