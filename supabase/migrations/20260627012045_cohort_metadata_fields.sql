alter table public.cohorts
  add column if not exists cohort_mode text not null default 'In person',
  add column if not exists start_date date,
  add column if not exists end_date date;

update public.cohorts cohort
set
  start_date = coalesce(cohort.start_date, term.start_date),
  end_date = coalesce(cohort.end_date, term.end_date),
  cohort_mode = case
    when lower(cohort.room_label) like '%zoom%' then 'Zoom'
    when lower(cohort.room_label) like '%hybrid%' then 'Hybrid'
    else cohort.cohort_mode
  end
from public.terms term
where term.id = cohort.term_id;

create index if not exists idx_cohorts_demo_dates
  on public.cohorts (demo, start_date, end_date);
