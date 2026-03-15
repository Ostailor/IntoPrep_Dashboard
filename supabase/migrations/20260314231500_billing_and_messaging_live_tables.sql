create table if not exists public.invoices (
  id text primary key,
  family_id text not null references public.families (id) on delete cascade,
  amount_due integer not null,
  due_date date not null,
  status text not null,
  source text not null
);

create table if not exists public.message_threads (
  id text primary key,
  cohort_id text not null references public.cohorts (id) on delete cascade,
  subject text not null,
  participants text[] not null default '{}',
  last_message_preview text not null,
  last_message_at timestamptz not null default timezone('utc', now()),
  unread_count integer not null default 0
);

alter table public.invoices enable row level security;
alter table public.message_threads enable row level security;

drop policy if exists "invoices_role_scoped_read" on public.invoices;
create policy "invoices_role_scoped_read"
on public.invoices
for select
using (
  public.current_app_role() in ('admin', 'staff')
  and public.viewer_has_family_access(family_id)
);

drop policy if exists "message_threads_role_scoped_read" on public.message_threads;
create policy "message_threads_role_scoped_read"
on public.message_threads
for select
using (
  public.current_app_role() in ('admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
);
