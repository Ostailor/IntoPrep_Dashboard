alter table public.students
  add column if not exists external_id text,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.students
  drop constraint if exists students_custom_fields_object;
alter table public.students
  add constraint students_custom_fields_object
  check (jsonb_typeof(custom_fields) = 'object');

create unique index if not exists students_demo_external_id_key
  on public.students (demo, lower(btrim(external_id)))
  where external_id is not null and btrim(external_id) <> '';

create table if not exists public.student_field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  label text not null,
  data_type text not null check (data_type in ('text', 'number', 'date', 'boolean')),
  header_aliases text[] not null default '{}',
  required boolean not null default false,
  sensitive boolean not null default true,
  sort_order integer not null default 0,
  demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  unique (demo, key)
);

create table if not exists public.student_import_runs (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_digest text not null,
  worksheet text not null,
  status text not null check (status in ('completed', 'failed')),
  mapping jsonb not null default '[]'::jsonb,
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  enrollment_count integer not null default 0,
  skipped_count integer not null default 0,
  warning_count integer not null default 0,
  error_samples jsonb not null default '[]'::jsonb,
  demo boolean not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists student_field_definitions_demo_active_order_idx
  on public.student_field_definitions (demo, sort_order, key)
  where archived_at is null;

create index if not exists student_import_runs_demo_created_at_idx
  on public.student_import_runs (demo, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.families'::regclass
      and conname = 'families_id_demo_key'
  ) then
    alter table public.families
      add constraint families_id_demo_key unique (id, demo);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass
      and conname = 'students_id_demo_key'
  ) then
    alter table public.students
      add constraint students_id_demo_key unique (id, demo);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cohorts'::regclass
      and conname = 'cohorts_id_demo_key'
  ) then
    alter table public.cohorts
      add constraint cohorts_id_demo_key unique (id, demo);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.enrollments'::regclass
      and conname = 'enrollments_student_cohort_demo_key'
  ) then
    alter table public.enrollments
      add constraint enrollments_student_cohort_demo_key
      unique (student_id, cohort_id, demo);
  end if;
end;
$$;

alter table public.students
  drop constraint if exists students_family_demo_fkey;
alter table public.students
  add constraint students_family_demo_fkey
  foreign key (family_id, demo)
  references public.families (id, demo)
  on delete cascade
  not valid;

alter table public.enrollments
  drop constraint if exists enrollments_student_demo_fkey;
alter table public.enrollments
  add constraint enrollments_student_demo_fkey
  foreign key (student_id, demo)
  references public.students (id, demo)
  on delete cascade
  not valid;

alter table public.enrollments
  drop constraint if exists enrollments_cohort_demo_fkey;
alter table public.enrollments
  add constraint enrollments_cohort_demo_fkey
  foreign key (cohort_id, demo)
  references public.cohorts (id, demo)
  on delete cascade
  not valid;

alter table public.students validate constraint students_family_demo_fkey;
alter table public.enrollments validate constraint enrollments_student_demo_fkey;
alter table public.enrollments validate constraint enrollments_cohort_demo_fkey;

alter table public.student_field_definitions enable row level security;
alter table public.student_import_runs enable row level security;

drop policy if exists "student_field_definitions_partition_read" on public.student_field_definitions;
create policy "student_field_definitions_partition_read"
on public.student_field_definitions
for select
to authenticated
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
  and (
    public.current_app_role() = 'engineer'
    or demo = coalesce(
      (select profile.demo from public.profiles profile where profile.id = auth.uid()),
      false
    )
  )
);

drop policy if exists "student_import_runs_partition_read" on public.student_import_runs;
create policy "student_import_runs_partition_read"
on public.student_import_runs
for select
to authenticated
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff')
  and (
    public.current_app_role() = 'engineer'
    or demo = coalesce(
      (select profile.demo from public.profiles profile where profile.id = auth.uid()),
      false
    )
  )
);

drop policy if exists "families_role_scoped_read" on public.families;
create policy "families_role_scoped_read"
on public.families
for select
to authenticated
using (
  public.viewer_has_family_access(id)
  and (
    public.current_app_role() = 'engineer'
    or demo = coalesce(
      (select profile.demo from public.profiles profile where profile.id = auth.uid()),
      false
    )
  )
);

drop policy if exists "students_role_scoped_read" on public.students;
create policy "students_role_scoped_read"
on public.students
for select
to authenticated
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
  and (
    public.current_app_role() = 'engineer'
    or demo = coalesce(
      (select profile.demo from public.profiles profile where profile.id = auth.uid()),
      false
    )
  )
);

drop policy if exists "enrollments_role_scoped_read" on public.enrollments;
create policy "enrollments_role_scoped_read"
on public.enrollments
for select
to authenticated
using (
  public.viewer_has_cohort_access(cohort_id)
  and (
    public.current_app_role() = 'engineer'
    or demo = coalesce(
      (select profile.demo from public.profiles profile where profile.id = auth.uid()),
      false
    )
  )
);

drop policy if exists "cohorts_role_scoped_read" on public.cohorts;
create policy "cohorts_role_scoped_read"
on public.cohorts
for select
to authenticated
using (
  public.viewer_has_cohort_access(id)
  and (
    public.current_app_role() = 'engineer'
    or demo = coalesce(
      (select profile.demo from public.profiles profile where profile.id = auth.uid()),
      false
    )
  )
);

revoke all privileges on table public.student_field_definitions from public, anon, authenticated;
revoke all privileges on table public.student_import_runs from public, anon, authenticated;
grant select on table public.student_field_definitions to authenticated;
grant select on table public.student_import_runs to authenticated;
grant all privileges on table public.student_field_definitions to service_role;
grant all privileges on table public.student_import_runs to service_role;

create or replace function public.commit_student_spreadsheet_import(
  p_actor_id uuid,
  p_actor_role text,
  p_actor_demo boolean,
  p_target_demo boolean,
  p_field_definitions jsonb,
  p_families jsonb,
  p_students jsonb,
  p_enrollments jsonb,
  p_import_run jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  run_id uuid;
  affected integer;
  total_rows integer;
  created_count integer;
  updated_count integer;
  enrollment_count integer;
  skipped_count integer;
  warning_count integer;
begin
  if p_actor_role is null
    or p_actor_role not in ('engineer', 'admin', 'staff') then
    raise exception 'This role cannot import students.';
  end if;
  if p_actor_demo is null or p_target_demo is null then
    raise exception 'The actor and target partitions are required.';
  end if;
  if p_actor_role <> 'engineer' and p_actor_demo is distinct from p_target_demo then
    raise exception 'The import target does not match the actor partition.';
  end if;
  if p_actor_id is null and (
    p_actor_role <> 'admin'
    or p_actor_demo is distinct from true
    or p_target_demo is distinct from true
  ) then
    raise exception 'Only the local demo admin may import without a persisted actor id.';
  end if;
  if p_actor_id is not null and not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_id
      and profile.role::text = p_actor_role
      and profile.demo is not distinct from p_actor_demo
      and profile.account_status = 'active'
      and profile.must_change_password = false
      and profile.deleted_at is null
  ) then
    raise exception 'The import actor is not active.';
  end if;

  if jsonb_typeof(p_field_definitions) is distinct from 'array'
    or jsonb_typeof(p_families) is distinct from 'array'
    or jsonb_typeof(p_students) is distinct from 'array'
    or jsonb_typeof(p_enrollments) is distinct from 'array' then
    raise exception 'Import payload collections must be JSON arrays.';
  end if;
  if jsonb_typeof(p_import_run) is distinct from 'object' then
    raise exception 'Import run metadata must be a JSON object.';
  end if;
  if exists (
    select 1
    from (
      select value from jsonb_array_elements(p_field_definitions)
      union all select value from jsonb_array_elements(p_families)
      union all select value from jsonb_array_elements(p_students)
      union all select value from jsonb_array_elements(p_enrollments)
    ) payload
    where jsonb_typeof(payload.value) is distinct from 'object'
  ) then
    raise exception 'Every import payload item must be a JSON object.';
  end if;

  if nullif(btrim(p_import_run->>'filename'), '') is null
    or nullif(btrim(p_import_run->>'fileDigest'), '') is null
    or nullif(btrim(p_import_run->>'worksheet'), '') is null
    or jsonb_typeof(p_import_run->'mapping') is distinct from 'array' then
    raise exception 'Import run metadata is incomplete.';
  end if;
  if coalesce(p_import_run->>'id', '') <> '' then
    begin
      run_id := (p_import_run->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Import run id must be a UUID.';
    end;
  else
    run_id := gen_random_uuid();
  end if;
  if exists (
    select 1
    from unnest(array[
      p_import_run->>'totalRows',
      p_import_run->>'createdCount',
      p_import_run->>'updatedCount',
      p_import_run->>'enrollmentCount',
      p_import_run->>'skippedCount',
      p_import_run->>'warningCount'
    ]) value
    where value is null or value !~ '^[0-9]+$'
  ) then
    raise exception 'Import run counts must be non-negative integers.';
  end if;

  total_rows := (p_import_run->>'totalRows')::integer;
  created_count := (p_import_run->>'createdCount')::integer;
  updated_count := (p_import_run->>'updatedCount')::integer;
  enrollment_count := (p_import_run->>'enrollmentCount')::integer;
  skipped_count := (p_import_run->>'skippedCount')::integer;
  warning_count := (p_import_run->>'warningCount')::integer;

  if created_count + updated_count + skipped_count > total_rows
    or warning_count > total_rows
    or jsonb_array_length(p_students) > total_rows
    or enrollment_count <> jsonb_array_length(p_enrollments) then
    raise exception 'Import run counts do not match the payload.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_field_definitions) as incoming(
      id uuid, key text, label text, data_type text, header_aliases text[],
      required boolean, sort_order integer
    )
    where incoming.id is null
      or nullif(btrim(incoming.key), '') is null
      or nullif(btrim(incoming.label), '') is null
      or incoming.data_type not in ('text', 'number', 'date', 'boolean')
      or incoming.header_aliases is null
      or incoming.required is null
      or incoming.sort_order is null
  ) then
    raise exception 'A field definition is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_field_definitions) as incoming(id uuid, key text)
    group by incoming.id
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_field_definitions) as incoming(key text)
    group by lower(btrim(incoming.key))
    having count(*) > 1
  ) then
    raise exception 'Field definition ids and keys must be unique in the payload.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_field_definitions) as incoming(id uuid, key text)
    join public.student_field_definitions existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
      or existing.key is distinct from incoming.key
  ) then
    raise exception 'A field definition id belongs to another field or partition.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_families) as incoming(
      id text, family_name text, guardian_names text[], email text, phone text,
      preferred_campus_id text, notes text, parent1_name text, parent1_email text,
      parent1_phone text, parent2_name text, parent2_email text, parent2_phone text
    )
    where nullif(btrim(incoming.id), '') is null
      or nullif(btrim(incoming.family_name), '') is null
      or incoming.guardian_names is null
      or incoming.email is null
      or incoming.phone is null
      or incoming.notes is null
  ) then
    raise exception 'A family payload is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_families) as incoming(id text)
    group by incoming.id
    having count(*) > 1
  ) then
    raise exception 'Family ids must be unique in the payload.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_families) as incoming(id text)
    join public.families existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
  ) then
    raise exception 'A family id belongs to another partition.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_students) as incoming(
      id text, family_id text, first_name text, last_name text,
      email text, phone text, grade_level text, school text,
      target_test text, focus text, external_id text, custom_fields jsonb
    )
    where nullif(btrim(incoming.id), '') is null
      or nullif(btrim(incoming.family_id), '') is null
      or nullif(btrim(incoming.first_name), '') is null
      or nullif(btrim(incoming.last_name), '') is null
      or incoming.grade_level is null
      or incoming.school is null
      or incoming.target_test is null
      or incoming.focus is null
      or jsonb_typeof(incoming.custom_fields) is distinct from 'object'
  ) then
    raise exception 'A student payload is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_students) as incoming(id text)
    group by incoming.id
    having count(*) > 1
  ) then
    raise exception 'Student ids must be unique in the payload.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_students) as incoming(id text)
    join public.students existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
  ) then
    raise exception 'A student id belongs to another partition.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_students) as incoming(custom_fields jsonb)
    cross join lateral jsonb_object_keys(incoming.custom_fields) custom_field(key)
    where not exists (
      select 1
      from public.student_field_definitions existing_definition
      where existing_definition.demo = p_target_demo
        and existing_definition.archived_at is null
        and lower(btrim(existing_definition.key)) = lower(btrim(custom_field.key))
    )
    and not exists (
      select 1
      from jsonb_to_recordset(p_field_definitions) as incoming_definition(key text)
      where lower(btrim(incoming_definition.key)) = lower(btrim(custom_field.key))
    )
  ) then
    raise exception 'A custom student field is not defined in the target partition.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_enrollments) as incoming(
      id text, student_id text, cohort_id text, status text, registered_at text
    )
    where nullif(btrim(incoming.id), '') is null
      or nullif(btrim(incoming.student_id), '') is null
      or nullif(btrim(incoming.cohort_id), '') is null
      or nullif(btrim(incoming.status), '') is null
      or nullif(btrim(incoming.registered_at), '') is null
  ) then
    raise exception 'An enrollment payload is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_enrollments) as incoming(id text)
    group by incoming.id
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_enrollments) as incoming(student_id text, cohort_id text)
    group by incoming.student_id, incoming.cohort_id
    having count(*) > 1
  ) then
    raise exception 'Enrollment ids and relationships must be unique in the payload.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_enrollments) as incoming(
      id text, student_id text, cohort_id text
    )
    join public.enrollments existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
      or existing.student_id is distinct from incoming.student_id
      or existing.cohort_id is distinct from incoming.cohort_id
  ) then
    raise exception 'An enrollment id belongs to another relationship or partition.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_enrollments) as incoming(cohort_id text)
    left join public.cohorts cohort
      on cohort.id = incoming.cohort_id and cohort.demo = p_target_demo
    where cohort.id is null
  ) then
    raise exception 'A cohort belongs to another partition or does not exist.';
  end if;

  insert into public.student_field_definitions (
    id, key, label, data_type, header_aliases, required, sensitive,
    sort_order, demo, created_by
  )
  select
    incoming.id, incoming.key, incoming.label, incoming.data_type,
    incoming.header_aliases, incoming.required, true,
    incoming.sort_order, p_target_demo, p_actor_id
  from jsonb_to_recordset(p_field_definitions) as incoming(
    id uuid, key text, label text, data_type text, header_aliases text[],
    required boolean, sort_order integer
  )
  on conflict (demo, key) do update set
    label = excluded.label,
    data_type = excluded.data_type,
    header_aliases = excluded.header_aliases,
    required = excluded.required,
    sensitive = true,
    sort_order = excluded.sort_order,
    updated_at = timezone('utc', now()),
    archived_at = null;
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(p_field_definitions) then
    raise exception 'Field definition import count mismatch.';
  end if;

  insert into public.families (
    id, family_name, guardian_names, email, phone, preferred_campus_id,
    notes, parent1_name, parent1_email, parent1_phone,
    parent2_name, parent2_email, parent2_phone, demo
  )
  select
    incoming.id, incoming.family_name, incoming.guardian_names,
    incoming.email, incoming.phone, incoming.preferred_campus_id,
    incoming.notes, incoming.parent1_name, incoming.parent1_email,
    incoming.parent1_phone, incoming.parent2_name, incoming.parent2_email,
    incoming.parent2_phone, p_target_demo
  from jsonb_to_recordset(p_families) as incoming(
    id text, family_name text, guardian_names text[], email text, phone text,
    preferred_campus_id text, notes text, parent1_name text, parent1_email text,
    parent1_phone text, parent2_name text, parent2_email text, parent2_phone text
  )
  on conflict (id) do update set
    family_name = excluded.family_name,
    guardian_names = excluded.guardian_names,
    email = excluded.email,
    phone = excluded.phone,
    preferred_campus_id = excluded.preferred_campus_id,
    notes = excluded.notes,
    parent1_name = excluded.parent1_name,
    parent1_email = excluded.parent1_email,
    parent1_phone = excluded.parent1_phone,
    parent2_name = excluded.parent2_name,
    parent2_email = excluded.parent2_email,
    parent2_phone = excluded.parent2_phone
  where public.families.demo is not distinct from p_target_demo;
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(p_families) then
    raise exception 'Family import count mismatch.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_students) as incoming(family_id text)
    left join public.families family
      on family.id = incoming.family_id and family.demo = p_target_demo
    where family.id is null
  ) then
    raise exception 'A student family is missing from the target partition.';
  end if;

  insert into public.students (
    id, family_id, first_name, last_name, email, phone, grade_level,
    school, target_test, focus, external_id, custom_fields, demo
  )
  select
    incoming.id, incoming.family_id, incoming.first_name, incoming.last_name,
    incoming.email, incoming.phone, incoming.grade_level, incoming.school,
    incoming.target_test, incoming.focus, incoming.external_id,
    incoming.custom_fields, p_target_demo
  from jsonb_to_recordset(p_students) as incoming(
    id text, family_id text, first_name text, last_name text,
    email text, phone text, grade_level text, school text,
    target_test text, focus text, external_id text, custom_fields jsonb
  )
  on conflict (id) do update set
    family_id = excluded.family_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone = excluded.phone,
    grade_level = excluded.grade_level,
    school = excluded.school,
    target_test = excluded.target_test,
    focus = excluded.focus,
    external_id = excluded.external_id,
    custom_fields = excluded.custom_fields
  where public.students.demo is not distinct from p_target_demo;
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(p_students) then
    raise exception 'Student import count mismatch.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_enrollments) as incoming(student_id text, cohort_id text)
    left join public.students student
      on student.id = incoming.student_id and student.demo = p_target_demo
    left join public.cohorts cohort
      on cohort.id = incoming.cohort_id and cohort.demo = p_target_demo
    where student.id is null or cohort.id is null
  ) then
    raise exception 'An enrollment crosses the target partition.';
  end if;

  insert into public.enrollments (
    id, student_id, cohort_id, status, registered_at, demo
  )
  select
    incoming.id, incoming.student_id, incoming.cohort_id,
    incoming.status, incoming.registered_at, p_target_demo
  from jsonb_to_recordset(p_enrollments) as incoming(
    id text, student_id text, cohort_id text, status text, registered_at date
  )
  on conflict (student_id, cohort_id, demo) do update set
    status = excluded.status,
    registered_at = excluded.registered_at;
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(p_enrollments) then
    raise exception 'Enrollment import count mismatch.';
  end if;

  update public.cohorts cohort
  set enrolled = (
    select count(*)::integer
    from public.enrollments enrollment
    where enrollment.cohort_id = cohort.id
      and enrollment.demo = cohort.demo
      and enrollment.status = 'active'
  )
  where cohort.demo = p_target_demo
    and cohort.id in (
      select incoming.cohort_id
      from jsonb_to_recordset(p_enrollments) as incoming(cohort_id text)
    );

  insert into public.student_import_runs (
    id, filename, file_digest, worksheet, status, mapping, total_rows,
    created_count, updated_count, enrollment_count, skipped_count,
    warning_count, error_samples, demo, created_by
  ) values (
    run_id, p_import_run->>'filename', p_import_run->>'fileDigest',
    p_import_run->>'worksheet', 'completed', p_import_run->'mapping',
    total_rows, created_count, updated_count, enrollment_count,
    skipped_count, warning_count, '[]'::jsonb, p_target_demo, p_actor_id
  );

  return jsonb_build_object(
    'runId', run_id,
    'created', created_count,
    'updated', updated_count,
    'enrolled', enrollment_count,
    'skipped', skipped_count
  );
end;
$$;

revoke all on function public.commit_student_spreadsheet_import(
  uuid, text, boolean, boolean, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.commit_student_spreadsheet_import(
  uuid, text, boolean, boolean, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
