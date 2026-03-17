alter table public.leads
  add column if not exists owner_id uuid references public.profiles (id),
  add column if not exists follow_up_due_at timestamptz,
  add column if not exists notes text;

alter table public.message_threads
  add column if not exists family_id text references public.families (id) on delete set null;

create table if not exists public.task_activities (
  id text primary key,
  task_id text not null references public.admin_tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  note_type text not null check (note_type in ('progress', 'handoff', 'blocker')),
  status_from text check (status_from in ('open', 'in_progress', 'done')),
  status_to text check (status_to in ('open', 'in_progress', 'done')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.session_checklists (
  id text primary key,
  session_id text not null unique references public.sessions (id) on delete cascade,
  room_confirmed boolean not null default false,
  roster_reviewed boolean not null default false,
  materials_ready boolean not null default false,
  family_notice_sent_if_needed boolean not null default false,
  attendance_complete boolean not null default false,
  scores_logged_if_needed boolean not null default false,
  follow_up_sent_if_needed boolean not null default false,
  notes_closed_out boolean not null default false,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.approval_requests (
  id text primary key,
  request_type text not null check (request_type in ('bulk_cohort_move', 'staffing_change', 'archive_restore', 'billing_export', 'source_configuration')),
  target_type text not null check (target_type in ('cohort', 'session', 'invoice', 'family', 'integration_source')),
  target_id text not null,
  reason text not null,
  handoff_note text,
  requested_by uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.admin_escalations (
  id text primary key,
  source_type text not null check (source_type in ('task', 'lead', 'billing_follow_up', 'family', 'thread', 'cohort', 'session')),
  source_id text not null,
  reason text not null,
  handoff_note text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'closed'))
);

create table if not exists public.outreach_templates (
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  category text not null check (category in ('schedule_change', 'missed_attendance', 'score_follow_up', 'billing_handoff', 'general')),
  subject text not null,
  body text not null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists leads_owner_idx
  on public.leads (owner_id, follow_up_due_at);

create index if not exists message_threads_family_idx
  on public.message_threads (family_id, last_message_at desc);

create index if not exists task_activities_task_idx
  on public.task_activities (task_id, created_at desc);

create index if not exists session_checklists_session_idx
  on public.session_checklists (session_id);

create index if not exists approval_requests_requested_by_idx
  on public.approval_requests (requested_by, status, created_at desc);

create index if not exists admin_escalations_created_by_idx
  on public.admin_escalations (created_by, status, created_at desc);

create index if not exists outreach_templates_owner_idx
  on public.outreach_templates (owner_id, updated_at desc);

alter table public.task_activities enable row level security;
alter table public.session_checklists enable row level security;
alter table public.approval_requests enable row level security;
alter table public.admin_escalations enable row level security;
alter table public.outreach_templates enable row level security;

drop policy if exists "billing_follow_up_notes_admin_engineer" on public.billing_follow_up_notes;
create policy "billing_follow_up_notes_staff_scoped"
on public.billing_follow_up_notes
for select
using (
  public.current_app_role() in ('admin', 'engineer')
  or (
    public.current_app_role() = 'staff'
    and exists (
      select 1
      from public.admin_tasks
      where public.admin_tasks.status <> 'done'
        and public.admin_tasks.assigned_to = auth.uid()
        and public.admin_tasks.task_type = 'billing_follow_up'
        and (
          (public.admin_tasks.target_type = 'invoice' and public.admin_tasks.target_id = public.billing_follow_up_notes.invoice_id)
          or (public.admin_tasks.target_type = 'family' and public.admin_tasks.target_id = public.billing_follow_up_notes.family_id)
        )
    )
  )
);

drop policy if exists "billing_follow_up_notes_staff_write" on public.billing_follow_up_notes;
create policy "billing_follow_up_notes_staff_write"
on public.billing_follow_up_notes
for insert
with check (
  public.current_app_role() in ('admin', 'engineer')
  or (
    public.current_app_role() = 'staff'
    and author_id = auth.uid()
    and exists (
      select 1
      from public.admin_tasks
      where public.admin_tasks.status <> 'done'
        and public.admin_tasks.assigned_to = auth.uid()
        and public.admin_tasks.task_type = 'billing_follow_up'
        and (
          (public.admin_tasks.target_type = 'invoice' and public.admin_tasks.target_id = public.billing_follow_up_notes.invoice_id)
          or (public.admin_tasks.target_type = 'family' and public.admin_tasks.target_id = public.billing_follow_up_notes.family_id)
        )
    )
  )
);

drop policy if exists "admin_saved_views_admin_engineer" on public.admin_saved_views;
create policy "admin_saved_views_select"
on public.admin_saved_views
for select
using (
  public.current_app_role() in ('admin', 'engineer')
  or (public.current_app_role() = 'staff' and created_by = auth.uid())
);

drop policy if exists "admin_saved_views_admin_engineer_write" on public.admin_saved_views;
create policy "admin_saved_views_write"
on public.admin_saved_views
for all
using (
  public.current_app_role() in ('admin', 'engineer')
  or (public.current_app_role() = 'staff' and created_by = auth.uid())
)
with check (
  public.current_app_role() in ('admin', 'engineer')
  or (public.current_app_role() = 'staff' and created_by = auth.uid())
);

drop policy if exists "family_contact_events_admin_engineer" on public.family_contact_events;
create policy "family_contact_events_select"
on public.family_contact_events
for select
using (public.current_app_role() in ('admin', 'engineer', 'staff'));

drop policy if exists "family_contact_events_staff_write" on public.family_contact_events;
create policy "family_contact_events_staff_write"
on public.family_contact_events
for all
using (
  public.current_app_role() in ('admin', 'engineer')
  or (public.current_app_role() = 'staff' and actor_id = auth.uid())
)
with check (
  public.current_app_role() in ('admin', 'engineer')
  or (public.current_app_role() = 'staff' and actor_id = auth.uid())
);

drop policy if exists "task_activities_read_roles" on public.task_activities;
create policy "task_activities_read_roles"
on public.task_activities
for select
using (
  public.current_app_role() in ('admin', 'engineer')
  or exists (
    select 1
    from public.admin_tasks
    where public.admin_tasks.id = public.task_activities.task_id
      and public.admin_tasks.assigned_to = auth.uid()
  )
);

drop policy if exists "task_activities_write_roles" on public.task_activities;
create policy "task_activities_write_roles"
on public.task_activities
for all
using (
  public.current_app_role() in ('admin', 'engineer')
  or exists (
    select 1
    from public.admin_tasks
    where public.admin_tasks.id = public.task_activities.task_id
      and public.admin_tasks.assigned_to = auth.uid()
  )
)
with check (
  public.current_app_role() in ('admin', 'engineer')
  or (
    author_id = auth.uid()
    and exists (
      select 1
      from public.admin_tasks
      where public.admin_tasks.id = public.task_activities.task_id
        and public.admin_tasks.assigned_to = auth.uid()
    )
  )
);

drop policy if exists "session_checklists_read_roles" on public.session_checklists;
create policy "session_checklists_read_roles"
on public.session_checklists
for select
using (public.current_app_role() in ('admin', 'engineer', 'staff', 'ta', 'instructor'));

drop policy if exists "session_checklists_staff_admin_write" on public.session_checklists;
create policy "session_checklists_staff_admin_write"
on public.session_checklists
for all
using (public.current_app_role() in ('admin', 'engineer', 'staff'))
with check (
  public.current_app_role() in ('admin', 'engineer')
  or (public.current_app_role() = 'staff' and updated_by = auth.uid())
);

drop policy if exists "approval_requests_select" on public.approval_requests;
create policy "approval_requests_select"
on public.approval_requests
for select
using (
  public.current_app_role() in ('admin', 'engineer')
  or requested_by = auth.uid()
);

drop policy if exists "approval_requests_insert" on public.approval_requests;
create policy "approval_requests_insert"
on public.approval_requests
for insert
with check (
  public.current_app_role() in ('admin', 'engineer')
  or (public.current_app_role() = 'staff' and requested_by = auth.uid())
);

drop policy if exists "approval_requests_update" on public.approval_requests;
create policy "approval_requests_update"
on public.approval_requests
for update
using (
  public.current_app_role() in ('admin', 'engineer')
  or requested_by = auth.uid()
)
with check (
  public.current_app_role() in ('admin', 'engineer')
  or (requested_by = auth.uid() and status = 'withdrawn')
);

drop policy if exists "admin_escalations_select" on public.admin_escalations;
create policy "admin_escalations_select"
on public.admin_escalations
for select
using (
  public.current_app_role() in ('admin', 'engineer')
  or created_by = auth.uid()
);

drop policy if exists "admin_escalations_insert" on public.admin_escalations;
create policy "admin_escalations_insert"
on public.admin_escalations
for insert
with check (
  public.current_app_role() in ('admin', 'engineer')
  or (public.current_app_role() = 'staff' and created_by = auth.uid())
);

drop policy if exists "admin_escalations_update" on public.admin_escalations;
create policy "admin_escalations_update"
on public.admin_escalations
for update
using (public.current_app_role() in ('admin', 'engineer'))
with check (public.current_app_role() in ('admin', 'engineer'));

drop policy if exists "outreach_templates_select" on public.outreach_templates;
create policy "outreach_templates_select"
on public.outreach_templates
for select
using (
  public.current_app_role() in ('admin', 'engineer')
  or owner_id = auth.uid()
);

drop policy if exists "outreach_templates_write" on public.outreach_templates;
create policy "outreach_templates_write"
on public.outreach_templates
for all
using (
  public.current_app_role() in ('admin', 'engineer')
  or owner_id = auth.uid()
)
with check (
  public.current_app_role() in ('admin', 'engineer')
  or owner_id = auth.uid()
);

insert into public.task_activities (
  id,
  task_id,
  author_id,
  body,
  note_type,
  status_from,
  status_to,
  created_at
)
values
  (
    'task-activity-patel-open',
    'admin-task-billing-patel',
    (
      select id
      from public.profiles
      where email = 'staff@intoprep.dev' and deleted_at is null
      limit 1
    ),
    'Started billing follow-up and drafted the parent reminder.',
    'progress',
    'open',
    'in_progress',
    '2026-03-15T13:15:00+00:00'
  ),
  (
    'task-activity-park-handoff',
    'admin-task-attendance-park',
    (
      select id
      from public.profiles
      where email = 'ta@intoprep.dev' and deleted_at is null
      limit 1
    ),
    'Waiting on family callback before closing the tardy pattern follow-up.',
    'handoff',
    'in_progress',
    'in_progress',
    '2026-03-15T16:05:00+00:00'
  )
on conflict (id) do update
set
  task_id = excluded.task_id,
  author_id = excluded.author_id,
  body = excluded.body,
  note_type = excluded.note_type,
  status_from = excluded.status_from,
  status_to = excluded.status_to,
  created_at = excluded.created_at;

insert into public.session_checklists (
  id,
  session_id,
  room_confirmed,
  roster_reviewed,
  materials_ready,
  family_notice_sent_if_needed,
  attendance_complete,
  scores_logged_if_needed,
  follow_up_sent_if_needed,
  notes_closed_out,
  updated_by,
  updated_at
)
select
  'checklist-session-sat-mock',
  public.sessions.id,
  true,
  true,
  false,
  true,
  false,
  false,
  false,
  false,
  (
    select id
    from public.profiles
    where email = 'staff@intoprep.dev' and deleted_at is null
    limit 1
  ),
  '2026-03-16T11:15:00+00:00'
from public.sessions
where public.sessions.id = 'session-sat-mock'
on conflict (session_id) do update
set
  room_confirmed = excluded.room_confirmed,
  roster_reviewed = excluded.roster_reviewed,
  materials_ready = excluded.materials_ready,
  family_notice_sent_if_needed = excluded.family_notice_sent_if_needed,
  attendance_complete = excluded.attendance_complete,
  scores_logged_if_needed = excluded.scores_logged_if_needed,
  follow_up_sent_if_needed = excluded.follow_up_sent_if_needed,
  notes_closed_out = excluded.notes_closed_out,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at;

insert into public.outreach_templates (
  id,
  owner_id,
  title,
  category,
  subject,
  body,
  updated_at
)
values
  (
    'template-staff-schedule',
    (
      select id
      from public.profiles
      where email = 'staff@intoprep.dev' and deleted_at is null
      limit 1
    ),
    'Schedule change follow-up',
    'schedule_change',
    'Updated schedule details for this week',
    'Hi there, I wanted to share the updated class details for this week and confirm that the new time still works for your family.',
    '2026-03-16T10:45:00+00:00'
  )
on conflict (id) do update
set
  owner_id = excluded.owner_id,
  title = excluded.title,
  category = excluded.category,
  subject = excluded.subject,
  body = excluded.body,
  updated_at = excluded.updated_at;

insert into public.approval_requests (
  id,
  request_type,
  target_type,
  target_id,
  reason,
  handoff_note,
  requested_by,
  status,
  created_at
)
values
  (
    'approval-request-cohort-move',
    'bulk_cohort_move',
    'cohort',
    'cohort-sat-spring',
    'Need admin review before moving two students into the Tuesday PM block.',
    'Capacity looks available but the move affects another campus coverage plan.',
    (
      select id
      from public.profiles
      where email = 'staff@intoprep.dev' and deleted_at is null
      limit 1
    ),
    'pending',
    '2026-03-16T12:00:00+00:00'
  )
on conflict (id) do update
set
  request_type = excluded.request_type,
  target_type = excluded.target_type,
  target_id = excluded.target_id,
  reason = excluded.reason,
  handoff_note = excluded.handoff_note,
  requested_by = excluded.requested_by,
  status = excluded.status,
  created_at = excluded.created_at;

insert into public.admin_escalations (
  id,
  source_type,
  source_id,
  reason,
  handoff_note,
  created_by,
  status,
  created_at
)
values
  (
    'escalation-patel-billing',
    'billing_follow_up',
    'invoice-patel',
    'Billing follow-up needs admin review before the weekend class.',
    'Family requested a short extension and wants confirmation before Friday.',
    (
      select id
      from public.profiles
      where email = 'staff@intoprep.dev' and deleted_at is null
      limit 1
    ),
    'open',
    '2026-03-16T12:15:00+00:00'
  )
on conflict (id) do update
set
  source_type = excluded.source_type,
  source_id = excluded.source_id,
  reason = excluded.reason,
  handoff_note = excluded.handoff_note,
  created_by = excluded.created_by,
  status = excluded.status,
  created_at = excluded.created_at;

update public.leads
set
  owner_id = case id
    when 'lead-aria-bennett' then (
      select id
      from public.profiles
      where email = 'staff@intoprep.dev' and deleted_at is null
      limit 1
    )
    else owner_id
  end,
  follow_up_due_at = case id
    when 'lead-aria-bennett' then '2026-03-17T14:30:00+00:00'::timestamptz
    else follow_up_due_at
  end,
  notes = case id
    when 'lead-aria-bennett' then 'Waiting on updated school-transcript timing before confirming the assessment slot.'
    else notes
  end
where id in ('lead-aria-bennett');

update public.portal_release_metadata
set
  schema_version = '20260316193000_staff_operations',
  updated_at = timezone('utc'::text, now())
where id = 'global';
