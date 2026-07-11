alter table public.families
  add column if not exists parent1_name text,
  add column if not exists parent1_email text,
  add column if not exists parent1_phone text,
  add column if not exists parent2_name text,
  add column if not exists parent2_email text,
  add column if not exists parent2_phone text;

alter table public.students
  add column if not exists email text,
  add column if not exists phone text;

update public.families
set
  parent1_name = coalesce(parent1_name, guardian_names[1]),
  parent1_email = coalesce(parent1_email, email),
  parent1_phone = coalesce(parent1_phone, phone),
  parent2_name = coalesce(parent2_name, guardian_names[2])
where parent1_name is null
  or parent1_email is null
  or parent1_phone is null
  or parent2_name is null;
