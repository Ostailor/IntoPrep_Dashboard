alter table public.programs
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;

alter table public.cohorts
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;

create index if not exists programs_is_archived_idx
  on public.programs (is_archived, name);

create index if not exists cohorts_is_archived_idx
  on public.cohorts (is_archived, name);

update public.portal_release_metadata
set
  schema_version = '20260316170000_admin_archive_controls',
  updated_at = timezone('utc'::text, now())
where id = 'global';
