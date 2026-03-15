alter table public.resources
add column if not exists link_url text,
add column if not exists file_name text,
add column if not exists storage_path text;

create unique index if not exists assessment_results_assessment_student_idx
on public.assessment_results (assessment_id, student_id);

create table if not exists public.message_posts (
  id text primary key default encode(gen_random_bytes(12), 'hex'),
  thread_id text not null references public.message_threads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.message_posts enable row level security;

drop policy if exists "assessment_results_role_scoped_write" on public.assessment_results;
create policy "assessment_results_role_scoped_write"
on public.assessment_results
for all
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.assessments
    where assessments.id = assessment_results.assessment_id
      and public.viewer_has_cohort_access(assessments.cohort_id)
  )
)
with check (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.assessments
    where assessments.id = assessment_results.assessment_id
      and public.viewer_has_cohort_access(assessments.cohort_id)
  )
);

drop policy if exists "academic_notes_role_scoped_write" on public.academic_notes;
create policy "academic_notes_role_scoped_write"
on public.academic_notes
for all
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.enrollments
    where enrollments.student_id = academic_notes.student_id
      and public.viewer_has_cohort_access(enrollments.cohort_id)
  )
)
with check (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.enrollments
    where enrollments.student_id = academic_notes.student_id
      and public.viewer_has_cohort_access(enrollments.cohort_id)
  )
);

drop policy if exists "resources_role_scoped_write" on public.resources;
create policy "resources_role_scoped_write"
on public.resources
for all
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
)
with check (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
);

drop policy if exists "message_threads_role_scoped_write" on public.message_threads;
create policy "message_threads_role_scoped_write"
on public.message_threads
for update
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
)
with check (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and public.viewer_has_cohort_access(cohort_id)
);

drop policy if exists "message_posts_role_scoped_read" on public.message_posts;
create policy "message_posts_role_scoped_read"
on public.message_posts
for select
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.message_threads
    where message_threads.id = message_posts.thread_id
      and public.viewer_has_cohort_access(message_threads.cohort_id)
  )
);

drop policy if exists "message_posts_role_scoped_write" on public.message_posts;
create policy "message_posts_role_scoped_write"
on public.message_posts
for all
using (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.message_threads
    where message_threads.id = message_posts.thread_id
      and public.viewer_has_cohort_access(message_threads.cohort_id)
  )
)
with check (
  public.viewer_can_access_portal()
  and public.current_app_role() in ('engineer', 'admin', 'staff', 'ta')
  and exists (
    select 1
    from public.message_threads
    where message_threads.id = message_posts.thread_id
      and public.viewer_has_cohort_access(message_threads.cohort_id)
  )
);

drop policy if exists "cohort_assignments_admin_write" on public.cohort_assignments;
create policy "cohort_assignments_admin_write"
on public.cohort_assignments
for all
using (
  public.viewer_can_access_portal()
  and (
    public.current_app_role() = 'engineer'
    or (
      public.current_app_role() = 'admin'
      and role in ('staff', 'ta', 'instructor')
    )
  )
)
with check (
  public.viewer_can_access_portal()
  and (
    public.current_app_role() = 'engineer'
    or (
      public.current_app_role() = 'admin'
      and role in ('staff', 'ta', 'instructor')
    )
  )
);
