
create or replace function public.grant_shopper_for_sellier_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and lower(split_part(new.email, '@', 2)) = 'sellierknightsbridge.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'shopper')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_grant_sellier on auth.users;
create trigger on_auth_user_created_grant_sellier
after insert on auth.users
for each row execute function public.grant_shopper_for_sellier_domain();

drop trigger if exists on_auth_user_confirmed_grant_sellier on auth.users;
create trigger on_auth_user_confirmed_grant_sellier
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.grant_shopper_for_sellier_domain();

-- Backfill: grant shopper role to any existing verified @sellierknightsbridge.com users
insert into public.user_roles (user_id, role)
select id, 'shopper'::app_role
from auth.users
where email_confirmed_at is not null
  and lower(split_part(email, '@', 2)) = 'sellierknightsbridge.com'
on conflict (user_id, role) do nothing;
