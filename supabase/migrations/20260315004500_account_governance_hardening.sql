do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('active', 'suspended');
  end if;
end $$;

alter table public.profiles
add column if not exists account_status public.account_status not null default 'active',
add column if not exists must_change_password boolean not null default false;

alter table public.user_templates
add column if not exists account_status public.account_status not null default 'active',
add column if not exists must_change_password boolean not null default false;

create table if not exists public.account_audit_logs (
  id text primary key default encode(gen_random_bytes(12), 'hex'),
  actor_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  target_email text,
  action text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.account_audit_logs enable row level security;

create or replace function public.viewer_can_access_portal()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and account_status = 'active'
      and must_change_password = false
  );
$$;

create or replace function public.viewer_can_manage_role(target_role public.app_role)
returns boolean
language sql
stable
as $$
  select
    public.viewer_can_access_portal()
    and case
      when public.current_app_role() = 'engineer' then true
      when public.current_app_role() = 'admin' then target_role not in ('engineer', 'admin')
      else false
    end;
$$;

create or replace function public.viewer_can_self_update_profile(
  target_id uuid,
  desired_role public.app_role,
  desired_email text,
  desired_account_status public.account_status,
  desired_must_change_password boolean
)
returns boolean
language sql
stable
as $$
  select
    auth.uid() = target_id
    and exists (
      select 1
      from public.profiles
      where id = target_id
        and role = desired_role
        and coalesce(lower(email), '') = coalesce(lower(desired_email), '')
        and account_status = desired_account_status
        and must_change_password = desired_must_change_password
    );
$$;

create or replace function public.viewer_has_cohort_access(target_cohort_id text)
returns boolean
language sql
stable
as $$
  select
    public.viewer_can_access_portal()
    and (
      public.current_app_role() in ('engineer', 'admin', 'staff')
      or exists (
        select 1
        from public.cohort_assignments
        where user_id = auth.uid()
          and cohort_id = target_cohort_id
      )
    );
$$;

create or replace function public.viewer_has_family_access(target_family_id text)
returns boolean
language sql
stable
as $$
  select
    public.viewer_can_access_portal()
    and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
    and exists (
      select 1
      from public.students
      join public.enrollments on enrollments.student_id = students.id
      where students.family_id = target_family_id
        and public.viewer_has_cohort_access(enrollments.cohort_id)
    );
$$;

drop policy if exists "profiles_select_self_or_staff" on public.profiles;
create policy "profiles_select_self_or_staff"
on public.profiles
for select
using (
  auth.uid() = id
  or (
    public.viewer_can_access_portal()
    and public.current_app_role() in ('engineer', 'admin', 'staff')
  )
);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles
for update
using (
  public.viewer_can_self_update_profile(id, role, email, account_status, must_change_password)
  or public.viewer_can_manage_role(role)
)
with check (
  public.viewer_can_self_update_profile(id, role, email, account_status, must_change_password)
  or public.viewer_can_manage_role(role)
);

drop policy if exists "templates_admin_only" on public.user_templates;
create policy "templates_admin_only"
on public.user_templates
for all
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin')
)
with check (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin')
);

drop policy if exists "lookup_tables_authenticated_read" on public.campuses;
create policy "lookup_tables_authenticated_read"
on public.campuses
for select
using (public.viewer_can_access_portal());

drop policy if exists "programs_authenticated_read" on public.programs;
create policy "programs_authenticated_read"
on public.programs
for select
using (public.viewer_can_access_portal());

drop policy if exists "terms_authenticated_read" on public.terms;
create policy "terms_authenticated_read"
on public.terms
for select
using (public.viewer_can_access_portal());

drop policy if exists "students_role_scoped_read" on public.students;
create policy "students_role_scoped_read"
on public.students
for select
using (
  public.viewer_can_access_portal()
  and (
    public.current_app_role() in ('engineer', 'admin', 'staff')
    or exists (
      select 1
      from public.enrollments
      where enrollments.student_id = students.id
        and public.viewer_has_cohort_access(enrollments.cohort_id)
    )
  )
);

drop policy if exists "cohort_assignments_scoped_read" on public.cohort_assignments;
create policy "cohort_assignments_scoped_read"
on public.cohort_assignments
for select
using (
  (auth.uid() = user_id and public.viewer_can_access_portal())
  or (
    public.viewer_can_access_portal()
    and public.current_app_role() in ('engineer', 'admin', 'staff')
  )
);

drop policy if exists "attendance_role_scoped_write" on public.attendance_records;
create policy "attendance_role_scoped_write"
on public.attendance_records
for all
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where sessions.id = attendance_records.session_id
      and public.viewer_has_cohort_access(sessions.cohort_id)
  )
)
with check (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where sessions.id = attendance_records.session_id
      and public.viewer_has_cohort_access(sessions.cohort_id)
  )
);

drop policy if exists "academic_notes_role_scoped_read" on public.academic_notes;
create policy "academic_notes_role_scoped_read"
on public.academic_notes
for select
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
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
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
);

drop policy if exists "invoices_role_scoped_read" on public.invoices;
create policy "invoices_role_scoped_read"
on public.invoices
for select
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
  and public.viewer_has_family_access(family_id)
);

drop policy if exists "message_threads_role_scoped_read" on public.message_threads;
create policy "message_threads_role_scoped_read"
on public.message_threads
for select
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
);

drop policy if exists "leads_role_scoped_read" on public.leads;
create policy "leads_role_scoped_read"
on public.leads
for select
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
);

drop policy if exists "sync_jobs_authenticated_read" on public.sync_jobs;
create policy "sync_jobs_authenticated_read"
on public.sync_jobs
for select
using (public.viewer_can_access_portal());

drop policy if exists "intake_import_runs_role_scoped_read" on public.intake_import_runs;
create policy "intake_import_runs_role_scoped_read"
on public.intake_import_runs
for select
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
);

drop policy if exists "account_audit_logs_admin_only" on public.account_audit_logs;
create policy "account_audit_logs_admin_only"
on public.account_audit_logs
for select
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin')
);
