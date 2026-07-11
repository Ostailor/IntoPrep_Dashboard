alter table public.session_instruction_blocks enable row level security;

drop policy if exists "session_instruction_blocks_read_roles"
  on public.session_instruction_blocks;

create policy "session_instruction_blocks_read_roles"
on public.session_instruction_blocks
for select
using (
  (
    public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
    and exists (
      select 1
      from public.sessions
      where public.sessions.id = public.session_instruction_blocks.session_id
        and public.viewer_has_cohort_access(public.sessions.cohort_id)
    )
  )
  or (
    public.current_app_role() = 'instructor'
    and public.session_instruction_blocks.instructor_id = auth.uid()
  )
);

drop policy if exists "session_instruction_blocks_write_roles"
  on public.session_instruction_blocks;

create policy "session_instruction_blocks_write_roles"
on public.session_instruction_blocks
for all
using (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.session_instruction_blocks.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
)
with check (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.session_instruction_blocks.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
);

update public.portal_release_metadata
set
  schema_version = '20260627102401_session_instruction_blocks_rls',
  updated_at = timezone('utc'::text, now())
where id = 'global';
