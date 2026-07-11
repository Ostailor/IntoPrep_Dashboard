alter table public.programs add column if not exists demo boolean;
alter table public.campuses add column if not exists demo boolean;
alter table public.terms add column if not exists demo boolean;

create temporary table program_demo_clones (
  original_id text primary key,
  demo_id text not null unique
);

insert into program_demo_clones (original_id, demo_id)
select program.id, gen_random_uuid()::text
from public.programs program
where exists (
  select 1 from public.cohorts cohort
  where cohort.program_id = program.id and cohort.demo
)
and exists (
  select 1 from public.cohorts cohort
  where cohort.program_id = program.id and not cohort.demo
);

insert into public.programs (
  id, name, track, format, tuition, is_archived, archived_at, demo
)
select
  clone.demo_id,
  program.name,
  program.track,
  program.format,
  program.tuition,
  program.is_archived,
  program.archived_at,
  true
from program_demo_clones clone
join public.programs program on program.id = clone.original_id;

update public.cohorts cohort
set program_id = clone.demo_id
from program_demo_clones clone
where cohort.demo
  and cohort.program_id = clone.original_id;

update public.programs program
set demo = exists (
  select 1
  from public.cohorts cohort
  where cohort.program_id = program.id
    and cohort.demo
);

create temporary table campus_demo_clones (
  original_id text primary key,
  demo_id text not null unique
);

insert into campus_demo_clones (original_id, demo_id)
select campus.id, gen_random_uuid()::text
from public.campuses campus
where (
  exists (
    select 1 from public.cohorts cohort
    where cohort.campus_id = campus.id and cohort.demo
  )
  or exists (
    select 1 from public.families family
    where family.preferred_campus_id = campus.id and family.demo
  )
)
and (
  exists (
    select 1 from public.cohorts cohort
    where cohort.campus_id = campus.id and not cohort.demo
  )
  or exists (
    select 1 from public.families family
    where family.preferred_campus_id = campus.id and not family.demo
  )
);

insert into public.campuses (id, name, location, modality, demo)
select clone.demo_id, campus.name, campus.location, campus.modality, true
from campus_demo_clones clone
join public.campuses campus on campus.id = clone.original_id;

update public.cohorts cohort
set campus_id = clone.demo_id
from campus_demo_clones clone
where cohort.demo
  and cohort.campus_id = clone.original_id;

update public.families family
set preferred_campus_id = clone.demo_id
from campus_demo_clones clone
where family.demo
  and family.preferred_campus_id = clone.original_id;

update public.campuses campus
set demo = (
  exists (
    select 1
    from public.cohorts cohort
    where cohort.campus_id = campus.id
      and cohort.demo
  )
  or exists (
    select 1
    from public.families family
    where family.preferred_campus_id = campus.id
      and family.demo
  )
);

create temporary table term_demo_clones (
  original_id text primary key,
  demo_id text not null unique
);

insert into term_demo_clones (original_id, demo_id)
select term.id, gen_random_uuid()::text
from public.terms term
where exists (
  select 1 from public.cohorts cohort
  where cohort.term_id = term.id and cohort.demo
)
and exists (
  select 1 from public.cohorts cohort
  where cohort.term_id = term.id and not cohort.demo
);

insert into public.terms (id, name, start_date, end_date, demo)
select clone.demo_id, term.name, term.start_date, term.end_date, true
from term_demo_clones clone
join public.terms term on term.id = clone.original_id;

update public.cohorts cohort
set term_id = clone.demo_id
from term_demo_clones clone
where cohort.demo
  and cohort.term_id = clone.original_id;

update public.terms term
set demo = exists (
  select 1
  from public.cohorts cohort
  where cohort.term_id = term.id
    and cohort.demo
);

do $$
declare
  conflict_name text;
  conflict_demo boolean;
begin
  select min(program.name), program.demo
  into conflict_name, conflict_demo
  from public.programs program
  group by
    program.demo,
    lower(regexp_replace(btrim(program.name), '[[:space:]]+', ' ', 'g'))
  having count(*) > 1
    and count(distinct row(
      program.track,
      program.format,
      program.is_archived,
      program.archived_at
    )) > 1
  limit 1;

  if found then
    raise exception 'Catalog migration conflict: Program name "%" in the % partition has conflicting material fields.',
      conflict_name,
      case when conflict_demo then 'Demo' else 'Main' end
      using errcode = '23505';
  end if;
end;
$$;

create temporary table program_duplicate_merges as
select duplicate_id, keeper_id
from (
  select
    program.id as duplicate_id,
    min(program.id) over (
      partition by
        program.demo,
        lower(regexp_replace(btrim(program.name), '[[:space:]]+', ' ', 'g'))
    ) as keeper_id
  from public.programs program
) ranked
where duplicate_id <> keeper_id;

update public.cohorts cohort
set program_id = merge.keeper_id
from program_duplicate_merges merge
where cohort.program_id = merge.duplicate_id;

delete from public.programs program
using program_duplicate_merges merge
where program.id = merge.duplicate_id;

do $$
declare
  conflict_name text;
  conflict_demo boolean;
begin
  select min(campus.name), campus.demo
  into conflict_name, conflict_demo
  from public.campuses campus
  group by
    campus.demo,
    lower(regexp_replace(btrim(campus.name), '[[:space:]]+', ' ', 'g'))
  having count(*) > 1
    and count(distinct row(campus.location, campus.modality)) > 1
  limit 1;

  if found then
    raise exception 'Catalog migration conflict: Campus name "%" in the % partition has conflicting material fields.',
      conflict_name,
      case when conflict_demo then 'Demo' else 'Main' end
      using errcode = '23505';
  end if;
end;
$$;

create temporary table campus_duplicate_merges as
select duplicate_id, keeper_id
from (
  select
    campus.id as duplicate_id,
    min(campus.id) over (
      partition by
        campus.demo,
        lower(regexp_replace(btrim(campus.name), '[[:space:]]+', ' ', 'g'))
    ) as keeper_id
  from public.campuses campus
) ranked
where duplicate_id <> keeper_id;

update public.cohorts cohort
set campus_id = merge.keeper_id
from campus_duplicate_merges merge
where cohort.campus_id = merge.duplicate_id;

update public.families family
set preferred_campus_id = merge.keeper_id
from campus_duplicate_merges merge
where family.preferred_campus_id = merge.duplicate_id;

delete from public.campuses campus
using campus_duplicate_merges merge
where campus.id = merge.duplicate_id;

do $$
declare
  conflict_name text;
  conflict_demo boolean;
begin
  select min(term.name), term.demo
  into conflict_name, conflict_demo
  from public.terms term
  group by
    term.demo,
    lower(regexp_replace(btrim(term.name), '[[:space:]]+', ' ', 'g'))
  having count(*) > 1
    and count(distinct row(term.start_date, term.end_date)) > 1
  limit 1;

  if found then
    raise exception 'Catalog migration conflict: Term name "%" in the % partition has conflicting material fields.',
      conflict_name,
      case when conflict_demo then 'Demo' else 'Main' end
      using errcode = '23505';
  end if;
end;
$$;

create temporary table term_duplicate_merges as
select duplicate_id, keeper_id
from (
  select
    term.id as duplicate_id,
    min(term.id) over (
      partition by
        term.demo,
        lower(regexp_replace(btrim(term.name), '[[:space:]]+', ' ', 'g'))
    ) as keeper_id
  from public.terms term
) ranked
where duplicate_id <> keeper_id;

update public.cohorts cohort
set term_id = merge.keeper_id
from term_duplicate_merges merge
where cohort.term_id = merge.duplicate_id;

delete from public.terms term
using term_duplicate_merges merge
where term.id = merge.duplicate_id;

alter table public.programs alter column demo set not null;
alter table public.campuses alter column demo set not null;
alter table public.terms alter column demo set not null;

alter table public.programs
  add constraint programs_id_demo_key unique (id, demo);
alter table public.campuses
  add constraint campuses_id_demo_key unique (id, demo);
alter table public.terms
  add constraint terms_id_demo_key unique (id, demo);

alter table public.cohorts drop constraint if exists cohorts_program_id_fkey;
alter table public.cohorts drop constraint if exists cohorts_campus_id_fkey;
alter table public.cohorts drop constraint if exists cohorts_term_id_fkey;
alter table public.families drop constraint if exists families_preferred_campus_id_fkey;

alter table public.cohorts
  add constraint cohorts_program_demo_fkey
  foreign key (program_id, demo)
  references public.programs (id, demo)
  not valid;
alter table public.cohorts
  add constraint cohorts_campus_demo_fkey
  foreign key (campus_id, demo)
  references public.campuses (id, demo)
  not valid;
alter table public.cohorts
  add constraint cohorts_term_demo_fkey
  foreign key (term_id, demo)
  references public.terms (id, demo)
  not valid;
alter table public.families
  add constraint families_preferred_campus_demo_fkey
  foreign key (preferred_campus_id, demo)
  references public.campuses (id, demo)
  not valid;

alter table public.cohorts validate constraint cohorts_program_demo_fkey;
alter table public.cohorts validate constraint cohorts_campus_demo_fkey;
alter table public.cohorts validate constraint cohorts_term_demo_fkey;
alter table public.families validate constraint families_preferred_campus_demo_fkey;

create unique index programs_demo_normalized_name_key
  on public.programs (
    demo,
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  );
create unique index campuses_demo_normalized_name_key
  on public.campuses (
    demo,
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  );
create unique index terms_demo_normalized_name_key
  on public.terms (
    demo,
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  );

alter table public.programs enable row level security;
alter table public.campuses enable row level security;
alter table public.terms enable row level security;

drop policy if exists "programs_authenticated_read" on public.programs;
drop policy if exists "programs_partition_read" on public.programs;
create policy "programs_partition_read"
on public.programs
for select
to authenticated
using (
  (select public.viewer_can_access_portal())
  and (
    (select public.current_app_role()) = 'engineer'
    or demo = coalesce(
      (select profile.demo from public.profiles profile where profile.id = (select auth.uid())),
      false
    )
  )
);

drop policy if exists "lookup_tables_authenticated_read" on public.campuses;
drop policy if exists "campuses_partition_read" on public.campuses;
create policy "campuses_partition_read"
on public.campuses
for select
to authenticated
using (
  (select public.viewer_can_access_portal())
  and (
    (select public.current_app_role()) = 'engineer'
    or demo = coalesce(
      (select profile.demo from public.profiles profile where profile.id = (select auth.uid())),
      false
    )
  )
);

drop policy if exists "terms_authenticated_read" on public.terms;
drop policy if exists "terms_partition_read" on public.terms;
create policy "terms_partition_read"
on public.terms
for select
to authenticated
using (
  (select public.viewer_can_access_portal())
  and (
    (select public.current_app_role()) = 'engineer'
    or demo = coalesce(
      (select profile.demo from public.profiles profile where profile.id = (select auth.uid())),
      false
    )
  )
);

alter table public.programs drop column tuition;

grant select, insert on table public.programs to service_role;
grant select, insert on table public.campuses to service_role;
grant select, insert on table public.terms to service_role;
grant select on table public.profiles to service_role;
grant select, insert, update on table public.cohorts to service_role;
grant select, insert, update on table public.families to service_role;
grant select, insert, update on table public.students to service_role;
grant select, insert, update on table public.enrollments to service_role;
grant select, insert on table public.sessions to service_role;
grant select, insert on table public.assessments to service_role;
grant select, insert, update on table public.assessment_results to service_role;

create or replace function public.commit_student_workbook_import(
  p_actor_id uuid,
  p_actor_role text,
  p_actor_demo boolean,
  p_target_demo boolean,
  p_field_definitions jsonb,
  p_families jsonb,
  p_students jsonb,
  p_enrollments jsonb,
  p_programs jsonb,
  p_campuses jsonb,
  p_terms jsonb,
  p_cohorts jsonb,
  p_sessions jsonb,
  p_assessments jsonb,
  p_results jsonb,
  p_import_run jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  workbook_result jsonb;
  programs_created integer := 0;
  campuses_created integer := 0;
  terms_created integer := 0;
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

  if jsonb_typeof(p_programs) is distinct from 'array'
    or jsonb_typeof(p_campuses) is distinct from 'array'
    or jsonb_typeof(p_terms) is distinct from 'array'
    or jsonb_typeof(p_cohorts) is distinct from 'array' then
    raise exception 'Catalog and cohort payloads must be JSON arrays.';
  end if;
  if jsonb_array_length(p_programs) > 100
    or jsonb_array_length(p_campuses) > 100
    or jsonb_array_length(p_terms) > 100 then
    raise exception 'Catalog payload exceeds server bounds.';
  end if;
  if exists (
    select 1
    from (
      select value from jsonb_array_elements(p_programs)
      union all select value from jsonb_array_elements(p_campuses)
      union all select value from jsonb_array_elements(p_terms)
    ) payload
    where jsonb_typeof(payload.value) is distinct from 'object'
  ) then
    raise exception 'Every catalog payload item must be a JSON object.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_programs) item
    where jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'track') is distinct from 'string'
      or jsonb_typeof(item->'format') is distinct from 'string'
      or jsonb_typeof(item->'demo') is distinct from 'boolean'
      or exists (
        select 1 from jsonb_object_keys(item) key
        where key not in ('id', 'name', 'track', 'format', 'demo')
      )
  ) then
    raise exception 'A Program payload has invalid field types.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_campuses) item
    where jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'location') is distinct from 'string'
      or jsonb_typeof(item->'modality') is distinct from 'string'
      or jsonb_typeof(item->'demo') is distinct from 'boolean'
      or exists (
        select 1 from jsonb_object_keys(item) key
        where key not in ('id', 'name', 'location', 'modality', 'demo')
      )
  ) then
    raise exception 'A Campus payload has invalid field types.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_terms) item
    where jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'start_date') is distinct from 'string'
      or jsonb_typeof(item->'end_date') is distinct from 'string'
      or jsonb_typeof(item->'demo') is distinct from 'boolean'
      or exists (
        select 1 from jsonb_object_keys(item) key
        where key not in ('id', 'name', 'start_date', 'end_date', 'demo')
      )
  ) then
    raise exception 'A Term payload has invalid field types.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_programs) as incoming(
      id text, name text, track text, format text, demo boolean
    )
    where nullif(btrim(incoming.id), '') is null
      or length(incoming.id) > 200
      or nullif(btrim(incoming.name), '') is null
      or length(incoming.name) > 200
      or incoming.track is null
      or incoming.track not in ('SAT', 'ACT', 'Admissions', 'Support')
      or nullif(btrim(incoming.format), '') is null
      or length(incoming.format) > 200
      or incoming.demo is distinct from p_target_demo
  ) then
    raise exception 'A Program payload is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_programs) as incoming(id text)
    group by incoming.id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_programs) as incoming(name text)
    group by lower(regexp_replace(btrim(incoming.name), '[[:space:]]+', ' ', 'g'))
    having count(*) > 1
  ) then
    raise exception 'Program ids and normalized names must be unique in the payload.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_campuses) as incoming(
      id text, name text, location text, modality text, demo boolean
    )
    where nullif(btrim(incoming.id), '') is null
      or length(incoming.id) > 200
      or nullif(btrim(incoming.name), '') is null
      or length(incoming.name) > 200
      or nullif(btrim(incoming.location), '') is null
      or length(incoming.location) > 200
      or incoming.modality is null
      or incoming.modality not in ('In person', 'Hybrid', 'Online')
      or incoming.demo is distinct from p_target_demo
  ) then
    raise exception 'A Campus payload is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_campuses) as incoming(id text)
    group by incoming.id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_campuses) as incoming(name text)
    group by lower(regexp_replace(btrim(incoming.name), '[[:space:]]+', ' ', 'g'))
    having count(*) > 1
  ) then
    raise exception 'Campus ids and normalized names must be unique in the payload.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_terms) as incoming(
      id text, name text, start_date date, end_date date, demo boolean
    )
    where nullif(btrim(incoming.id), '') is null
      or length(incoming.id) > 200
      or nullif(btrim(incoming.name), '') is null
      or length(incoming.name) > 200
      or incoming.start_date is null
      or incoming.end_date is null
      or not isfinite(incoming.start_date)
      or not isfinite(incoming.end_date)
      or incoming.end_date < incoming.start_date
      or incoming.demo is distinct from p_target_demo
  ) then
    raise exception 'A Term payload is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_terms) as incoming(id text)
    group by incoming.id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_terms) as incoming(name text)
    group by lower(regexp_replace(btrim(incoming.name), '[[:space:]]+', ' ', 'g'))
    having count(*) > 1
  ) then
    raise exception 'Term ids and normalized names must be unique in the payload.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_programs) as incoming(
      id text, name text, track text, format text
    )
    join public.programs existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
      or existing.is_archived
      or lower(regexp_replace(btrim(existing.name), '[[:space:]]+', ' ', 'g'))
        is distinct from lower(regexp_replace(btrim(incoming.name), '[[:space:]]+', ' ', 'g'))
      or existing.track is distinct from incoming.track
      or lower(regexp_replace(btrim(existing.format), '[[:space:]]+', ' ', 'g'))
        is distinct from lower(regexp_replace(btrim(incoming.format), '[[:space:]]+', ' ', 'g'))
  ) then
    raise exception 'A Program id belongs to another partition or has conflicting fields.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_programs) as incoming(id text, name text)
    join public.programs existing
      on existing.demo = p_target_demo
      and lower(regexp_replace(btrim(existing.name), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(incoming.name), '[[:space:]]+', ' ', 'g'))
      and existing.id <> incoming.id
  ) then
    raise exception 'A Program normalized name conflicts with another id.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_campuses) as incoming(
      id text, name text, location text, modality text
    )
    join public.campuses existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
      or lower(regexp_replace(btrim(existing.name), '[[:space:]]+', ' ', 'g'))
        is distinct from lower(regexp_replace(btrim(incoming.name), '[[:space:]]+', ' ', 'g'))
      or lower(regexp_replace(btrim(existing.location), '[[:space:]]+', ' ', 'g'))
        is distinct from lower(regexp_replace(btrim(incoming.location), '[[:space:]]+', ' ', 'g'))
      or existing.modality is distinct from incoming.modality
  ) then
    raise exception 'A Campus id belongs to another partition or has conflicting fields.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_campuses) as incoming(id text, name text)
    join public.campuses existing
      on existing.demo = p_target_demo
      and lower(regexp_replace(btrim(existing.name), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(incoming.name), '[[:space:]]+', ' ', 'g'))
      and existing.id <> incoming.id
  ) then
    raise exception 'A Campus normalized name conflicts with another id.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_terms) as incoming(
      id text, name text, start_date date, end_date date
    )
    join public.terms existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
      or lower(regexp_replace(btrim(existing.name), '[[:space:]]+', ' ', 'g'))
        is distinct from lower(regexp_replace(btrim(incoming.name), '[[:space:]]+', ' ', 'g'))
      or existing.start_date is distinct from incoming.start_date
      or existing.end_date is distinct from incoming.end_date
  ) then
    raise exception 'A Term id belongs to another partition or has conflicting fields.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_terms) as incoming(id text, name text)
    join public.terms existing
      on existing.demo = p_target_demo
      and lower(regexp_replace(btrim(existing.name), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(incoming.name), '[[:space:]]+', ' ', 'g'))
      and existing.id <> incoming.id
  ) then
    raise exception 'A Term normalized name conflicts with another id.';
  end if;

  insert into public.programs (id, name, track, format, is_archived, archived_at, demo)
  select
    incoming.id,
    btrim(incoming.name),
    incoming.track,
    btrim(incoming.format),
    false,
    null,
    p_target_demo
  from jsonb_to_recordset(p_programs) as incoming(
    id text, name text, track text, format text
  )
  where not exists (
    select 1 from public.programs existing where existing.id = incoming.id
  );
  get diagnostics programs_created = row_count;

  insert into public.campuses (id, name, location, modality, demo)
  select
    incoming.id,
    btrim(incoming.name),
    btrim(incoming.location),
    incoming.modality,
    p_target_demo
  from jsonb_to_recordset(p_campuses) as incoming(
    id text, name text, location text, modality text
  )
  where not exists (
    select 1 from public.campuses existing where existing.id = incoming.id
  );
  get diagnostics campuses_created = row_count;

  insert into public.terms (id, name, start_date, end_date, demo)
  select
    incoming.id,
    btrim(incoming.name),
    incoming.start_date,
    incoming.end_date,
    p_target_demo
  from jsonb_to_recordset(p_terms) as incoming(
    id text, name text, start_date date, end_date date
  )
  where not exists (
    select 1 from public.terms existing where existing.id = incoming.id
  );
  get diagnostics terms_created = row_count;

  if exists (
    select 1
    from jsonb_to_recordset(p_cohorts) as incoming(
      program_id text, campus_id text, term_id text
    )
    left join public.programs program
      on program.id = incoming.program_id
      and program.demo = p_target_demo
      and not program.is_archived
    left join public.campuses campus
      on campus.id = incoming.campus_id
      and campus.demo = p_target_demo
    left join public.terms term
      on term.id = incoming.term_id
      and term.demo = p_target_demo
    where program.id is null or campus.id is null or term.id is null
  ) then
    raise exception 'A cohort references catalog metadata outside the target partition.';
  end if;

  workbook_result := public.commit_student_workbook_import(
    p_actor_id,
    p_actor_role,
    p_actor_demo,
    p_target_demo,
    p_field_definitions,
    p_families,
    p_students,
    p_enrollments,
    p_cohorts,
    p_sessions,
    p_assessments,
    p_results,
    p_import_run
  );

  return workbook_result || jsonb_build_object(
    'programsCreated', programs_created,
    'campusesCreated', campuses_created,
    'termsCreated', terms_created
  );
end;
$$;

revoke all on function public.commit_student_workbook_import(
  uuid, text, boolean, boolean,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.commit_student_workbook_import(
  uuid, text, boolean, boolean,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
