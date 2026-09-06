-- Apply after map-v2-grave-gid.sql. All calls go through the service role.
begin;
-- Early production installs predate this column used by atomic counter updates.
alter table public.users add column if not exists updated_at timestamptz not null default now();
alter table public.graves alter column github_url drop not null;
alter table public.graves alter column github_repo_id drop not null;
alter table public.graves add column if not exists source text not null default 'github';
alter table public.graves add column if not exists project_key text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'graves_source_identity_check' and conrelid = 'public.graves'::regclass) then
    alter table public.graves add constraint graves_source_identity_check check (
      (source = 'github' and github_repo_id is not null and github_repo_id > 0 and github_url is not null)
      or (source = 'local' and github_repo_id is null and github_url is null and project_key is not null and project_key ~ '^sha256:[a-f0-9]{64}$')
    );
  end if;
end $$;
create unique index if not exists graves_author_project_key_unique on public.graves(lower(author_github), project_key) where project_key is not null;

create or replace function public.create_grave_once(
  p_author_github text, p_grave jsonb, p_auto_slot_ids integer[], p_slot_id integer,
  p_map_version text, p_grave_gid integer default null
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  v_author text := lower(trim(p_author_github));
  v_source text := p_grave->>'source';
  v_key text := p_grave->>'project_key';
  v_repo bigint := (p_grave->>'github_repo_id')::bigint;
  v_grave public.graves%rowtype;
  v_slots integer;
  v_limit integer;
  v_constraint text;
begin
  if v_author is null or v_author = '' or p_map_version is null or p_map_version not in ('v1','v2') then
    return jsonb_build_object('status','failed');
  end if;
  perform pg_advisory_xact_lock(hashtext('grave-account:' || v_author));
  select 4 + case when x_first_grave_shared_at is not null then 1 else 0 end into v_limit
    from public.users where lower(github_username) = v_author for update;
  if v_limit is null then return jsonb_build_object('status','failed'); end if;
  if v_source = 'local' then
    if v_key is null or v_key !~ '^sha256:[a-f0-9]{64}$' or v_repo is not null or p_grave->>'github_url' is not null then
      return jsonb_build_object('status','failed');
    end if;
    select * into v_grave from public.graves where lower(author_github) = v_author and project_key = v_key;
    if found then return jsonb_build_object('status','replayed','grave',to_jsonb(v_grave) - 'project_key'); end if;
  elsif v_source = 'github' then
    if v_repo is null or v_repo <= 0 or p_grave->>'github_url' is null then return jsonb_build_object('status','failed'); end if;
    if exists(select 1 from public.graves where github_repo_id = v_repo) then return jsonb_build_object('status','duplicate_repo'); end if;
  else return jsonb_build_object('status','failed');
  end if;
  select count(*)::integer into v_slots from public.graves where lower(author_github) = v_author;
  if v_slots >= v_limit then
    return jsonb_build_object('status','user_slots_exhausted','slots_unlocked',v_limit,'slots_used',v_slots);
  end if;
  if p_slot_id is null or p_slot_id = 0 then return jsonb_build_object('status','no_slots'); end if;
  if p_auto_slot_ids is null or not coalesce(p_slot_id = any(p_auto_slot_ids), false) then return jsonb_build_object('status','failed'); end if;
  begin
    insert into public.graves(name,description,epitaph,born_at,died_at,cause,stack,github_url,github_repo_id,
      author_github,slot_id,last_commit_message,map_version,grave_gid,source,project_key)
    values(p_grave->>'name',p_grave->>'description',p_grave->>'epitaph',(p_grave->>'born_at')::timestamptz,
      (p_grave->>'died_at')::timestamptz,p_grave->>'cause',
      case when jsonb_typeof(p_grave->'stack') = 'array' then array(select jsonb_array_elements_text(p_grave->'stack')) else null end,
      p_grave->>'github_url',v_repo,v_author,p_slot_id,p_grave->>'last_commit_message',p_map_version,p_grave_gid,v_source,v_key)
    returning * into v_grave;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'graves_github_repo_id_key' then return jsonb_build_object('status','duplicate_repo'); end if;
    if v_constraint in ('graves_slot_id_key','graves_slot_id_map_version_key') then return jsonb_build_object('status','slot_collision'); end if;
    raise;
  end;
  update public.users set graves_count = v_slots + 1, updated_at = now() where lower(github_username) = v_author;
  return jsonb_build_object('status','created','grave',to_jsonb(v_grave) - 'project_key');
end $$;
revoke all on function public.create_grave_once(text,jsonb,integer[],integer,text,integer) from public,anon,authenticated;
grant execute on function public.create_grave_once(text,jsonb,integer[],integer,text,integer) to service_role;
commit;
