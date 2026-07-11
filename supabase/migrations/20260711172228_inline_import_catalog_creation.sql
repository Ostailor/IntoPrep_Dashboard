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
