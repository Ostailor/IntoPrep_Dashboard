alter table public.assessment_results
  add column if not exists notes text;
