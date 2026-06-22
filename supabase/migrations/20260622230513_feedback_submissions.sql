create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  reporter_email text,
  reporter_name text not null,
  reporter_role public.app_role not null,
  category text not null default 'addition',
  priority text not null default 'normal',
  status text not null default 'new',
  subject text not null,
  body text not null,
  page_path text,
  user_agent text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_submissions_category_check
    check (category in ('addition', 'bug', 'confusing', 'other')),
  constraint feedback_submissions_priority_check
    check (priority in ('normal', 'urgent')),
  constraint feedback_submissions_status_check
    check (status in ('new', 'reviewed', 'planned', 'resolved', 'closed')),
  constraint feedback_submissions_subject_length_check
    check (char_length(btrim(subject)) between 3 and 140),
  constraint feedback_submissions_body_length_check
    check (char_length(btrim(body)) between 10 and 4000)
);

create index if not exists feedback_submissions_created_at_idx
  on public.feedback_submissions (created_at desc);

create index if not exists feedback_submissions_status_created_at_idx
  on public.feedback_submissions (status, created_at desc);

create index if not exists feedback_submissions_reporter_idx
  on public.feedback_submissions (reporter_id, created_at desc);

alter table public.feedback_submissions enable row level security;

drop policy if exists "feedback_insert_authenticated" on public.feedback_submissions;
create policy "feedback_insert_authenticated"
on public.feedback_submissions
for insert
with check (
  auth.uid() = reporter_id
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta', 'instructor')
);

drop policy if exists "feedback_select_own_or_admin" on public.feedback_submissions;
create policy "feedback_select_own_or_admin"
on public.feedback_submissions
for select
using (
  reporter_id = auth.uid()
  or public.current_app_role() in ('engineer', 'admin')
);

drop policy if exists "feedback_update_admin" on public.feedback_submissions;
create policy "feedback_update_admin"
on public.feedback_submissions
for update
using (public.current_app_role() in ('engineer', 'admin'))
with check (public.current_app_role() in ('engineer', 'admin'));

grant select, insert, update on public.feedback_submissions to authenticated;
