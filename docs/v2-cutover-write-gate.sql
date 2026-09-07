-- Additive preparation, safe before cutover. Does not pause or retire anything on install.
begin;
create table if not exists public.cemetery_write_control (
  singleton boolean primary key default true check (singleton),
  burials_paused boolean not null default false,
  v1_retired boolean not null default false
);
insert into public.cemetery_write_control(singleton) values(true) on conflict do nothing;
alter table public.cemetery_write_control enable row level security;
revoke all on public.cemetery_write_control from public, anon, authenticated;
grant select on public.cemetery_write_control to service_role;

create or replace function public.guard_cemetery_burial()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare control public.cemetery_write_control%rowtype;
begin
  -- Shared row lock lets inserts run concurrently and makes a gate UPDATE wait
  -- for in-flight inserts (including their account-counter updates) to commit.
  select * into strict control from public.cemetery_write_control where singleton for share;
  if control.burials_paused then
    raise exception 'CEMETERY_BURIALS_PAUSED';
  end if;
  if control.v1_retired and new.map_version is distinct from 'v2' then
    raise exception 'CEMETERY_VERSION_RETIRED';
  end if;
  return new;
end $$;
revoke all on function public.guard_cemetery_burial() from public, anon, authenticated;
drop trigger if exists guard_cemetery_burial on public.graves;
create trigger guard_cemetery_burial before insert on public.graves
for each row execute function public.guard_cemetery_burial();
commit;

-- Operator commands (run separately, never before saving a private backup):
-- UPDATE public.cemetery_write_control SET burials_paused = true WHERE singleton;
-- Keep the gate closed through migration and production smoke.
-- UPDATE public.cemetery_write_control SET burials_paused = false WHERE singleton;
