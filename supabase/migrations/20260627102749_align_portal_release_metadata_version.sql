update public.portal_release_metadata
set
  schema_version = '20260627102608_session_instruction_blocks_policy_split',
  updated_at = timezone('utc'::text, now())
where id = 'global';
