-- DESTRUCTIVE: run only after exporting public.cremated and deploying the grave-only application.
-- Does not remove grave_burns or any graves. No CASCADE: unknown dependencies stop the migration.
begin;
drop function if exists public.create_cremation_once(text,text,text,text,text,text,bigint,text);
drop function if exists public.increment_cremated_count(text);
drop table if exists public.cremated;
alter table public.users drop column if exists cremated_count;
-- Retire all overloads that could enforce a separate map quota or bypass local identity.
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace and proname = 'insert_grave_if_user_slot_available' loop
    execute format('drop function %s', f.signature);
  end loop;
end $$;
commit;
