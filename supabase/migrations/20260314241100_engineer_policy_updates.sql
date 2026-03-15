create or replace function public.viewer_can_manage_role(target_role public.app_role)
returns boolean
language sql
stable
as $$
  select case
    when public.current_app_role() = 'engineer' then true
    when public.current_app_role() = 'admin' then target_role not in ('engineer', 'admin')
    else false
  end;
$$;

create or replace function public.viewer_can_self_update_profile(
  target_id uuid,
  desired_role public.app_role,
  desired_email text
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
    );
$$;

create or replace function public.viewer_has_cohort_access(target_cohort_id text)
returns boolean
language sql
stable
as $$
  select
    public.current_app_role() in ('engineer', 'admin', 'staff')
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
    public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
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
using (auth.uid() = id or public.current_app_role() in ('engineer', 'admin', 'staff'));

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles
for update
using (
  public.viewer_can_self_update_profile(id, role, email)
  or public.viewer_can_manage_role(role)
)
with check (
  public.viewer_can_self_update_profile(id, role, email)
  or public.viewer_can_manage_role(role)
);

drop policy if exists "templates_admin_only" on public.user_templates;
create policy "templates_admin_only"
on public.user_templates
for all
using (public.current_app_role() in ('engineer', 'admin'))
with check (public.current_app_role() in ('engineer', 'admin'));

drop policy if exists "students_role_scoped_read" on public.students;
create policy "students_role_scoped_read"
on public.students
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff')
  or exists (
    select 1
    from public.enrollments
    where enrollments.student_id = students.id
      and public.viewer_has_cohort_access(enrollments.cohort_id)
  )
);

drop policy if exists "cohort_assignments_scoped_read" on public.cohort_assignments;
create policy "cohort_assignments_scoped_read"
on public.cohort_assignments
for select
using (user_id = auth.uid() or public.current_app_role() in ('engineer', 'admin', 'staff'));

drop policy if exists "attendance_role_scoped_write" on public.attendance_records;
create policy "attendance_role_scoped_write"
on public.attendance_records
for all
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
  and exists (
    select 1
    from public.sessions
    where sessions.id = attendance_records.session_id
      and public.viewer_has_cohort_access(sessions.cohort_id)
  )
)
with check (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
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
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
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
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
);

drop policy if exists "invoices_role_scoped_read" on public.invoices;
create policy "invoices_role_scoped_read"
on public.invoices
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff')
  and public.viewer_has_family_access(family_id)
);

drop policy if exists "message_threads_role_scoped_read" on public.message_threads;
create policy "message_threads_role_scoped_read"
on public.message_threads
for select
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
);

drop policy if exists "leads_role_scoped_read" on public.leads;
create policy "leads_role_scoped_read"
on public.leads
for select
using (public.current_app_role() in ('engineer', 'admin', 'staff'));

drop policy if exists "intake_import_runs_role_scoped_read" on public.intake_import_runs;
create policy "intake_import_runs_role_scoped_read"
on public.intake_import_runs
for select
using (public.current_app_role() in ('engineer', 'admin', 'staff'));
