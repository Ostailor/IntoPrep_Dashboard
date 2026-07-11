drop policy if exists "session_instruction_blocks_write_roles"
  on public.session_instruction_blocks;

drop policy if exists "session_instruction_blocks_insert_roles"
  on public.session_instruction_blocks;

create policy "session_instruction_blocks_insert_roles"
on public.session_instruction_blocks
for insert
with check (
  public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.sessions
    where public.sessions.id = public.session_instruction_blocks.session_id
      and public.viewer_has_cohort_access(public.sessions.cohort_id)
  )
);

drop policy if exists "session_instruction_blocks_update_roles"
  on public.session_instruction_blocks;

create policy "session_instruction_blocks_update_roles"
on public.session_instruction_blocks
for update
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

drop policy if exists "session_instruction_blocks_delete_roles"
  on public.session_instruction_blocks;

create policy "session_instruction_blocks_delete_roles"
on public.session_instruction_blocks
for delete
using (
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
  schema_version = '20260627102542_session_instruction_blocks_policy_split',
  updated_at = timezone('utc'::text, now())
where id = 'global';
