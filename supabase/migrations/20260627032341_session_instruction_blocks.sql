create table if not exists public.session_instruction_blocks (
  id text primary key,
  session_id text not null references public.sessions(id) on delete cascade,
  instructor_id uuid not null references public.profiles(id),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_by uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  demo boolean not null default false,
  constraint session_instruction_blocks_time_order check (start_at < end_at)
);

create index if not exists session_instruction_blocks_session_id_idx
  on public.session_instruction_blocks(session_id, start_at);

create index if not exists session_instruction_blocks_instructor_id_idx
  on public.session_instruction_blocks(instructor_id);
