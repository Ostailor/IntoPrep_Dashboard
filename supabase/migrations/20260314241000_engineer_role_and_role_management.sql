do $$
begin
  if not exists (
    select 1
    from pg_enum
    join pg_type on pg_type.oid = pg_enum.enumtypid
    where pg_type.typname = 'app_role'
      and pg_enum.enumlabel = 'engineer'
  ) then
    alter type public.app_role add value 'engineer';
  end if;
end $$;

alter table public.profiles
add column if not exists email text;

update public.profiles
set email = lower(auth.users.email)
from auth.users
where auth.users.id = public.profiles.id
  and (
    public.profiles.email is null
    or public.profiles.email <> lower(auth.users.email)
  );

create unique index if not exists profiles_email_lower_idx
on public.profiles (lower(email))
where email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;
