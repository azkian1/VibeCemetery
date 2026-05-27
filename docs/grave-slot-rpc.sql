alter table public.users
  add column if not exists x_first_grave_shared_at timestamptz;

create or replace function public.insert_grave_if_user_slot_available(
  p_author_github text,
  p_auto_slot_ids integer[],
  p_slot_id integer,
  p_name text,
  p_description text,
  p_epitaph text,
  p_born_at timestamptz,
  p_died_at timestamptz,
  p_cause text,
  p_stack text[],
  p_github_url text,
  p_github_repo_id bigint,
  p_last_commit_message text
)
returns jsonb
language plpgsql
as $$
declare
  v_has_shared_first_grave boolean := false;
  v_daily_count integer := 0;
  v_slots_unlocked integer := 4;
  v_slots_used integer := 0;
  v_grave public.graves%rowtype;
  v_constraint text;
  v_detail text;
begin
  perform pg_advisory_xact_lock(hashtext(p_author_github));

  if not (p_slot_id = any(p_auto_slot_ids)) then
    return jsonb_build_object('status', 'failed', 'message', 'slot_id is not auto-assignable');
  end if;

  select count(*)::integer
  into v_daily_count
  from public.graves
  where author_github = p_author_github
    and created_at >= timezone('utc', now()) - interval '24 hours';

  if v_daily_count >= 20 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select exists(
    select 1
    from public.users
    where github_username = p_author_github
      and x_first_grave_shared_at is not null
  )
  into v_has_shared_first_grave;

  v_slots_unlocked := 4 + case when coalesce(v_has_shared_first_grave, false) then 1 else 0 end;

  select count(*)::integer
  into v_slots_used
  from public.graves
  where author_github = p_author_github
    and slot_id = any(p_auto_slot_ids);

  if v_slots_used >= v_slots_unlocked then
    return jsonb_build_object(
      'status', 'user_slots_exhausted',
      'slots_unlocked', v_slots_unlocked,
      'slots_used', v_slots_used
    );
  end if;

  begin
    insert into public.graves (
      name,
      description,
      epitaph,
      born_at,
      died_at,
      cause,
      stack,
      github_url,
      github_repo_id,
      author_github,
      slot_id,
      last_commit_message
    ) values (
      p_name,
      p_description,
      p_epitaph,
      p_born_at,
      p_died_at,
      p_cause,
      p_stack,
      p_github_url,
      p_github_repo_id,
      p_author_github,
      p_slot_id,
      p_last_commit_message
    )
    returning * into v_grave;

    return jsonb_build_object('status', 'created', 'grave', to_jsonb(v_grave));
  exception
    when unique_violation then
      get stacked diagnostics
        v_constraint = constraint_name,
        v_detail = pg_exception_detail;

      if v_constraint = 'graves_github_repo_id_key'
        or coalesce(v_detail, '') like '%(github_repo_id)%'
      then
        return jsonb_build_object('status', 'duplicate_repo');
      end if;

      if v_constraint = 'graves_slot_id_key'
        or coalesce(v_detail, '') like '%(slot_id)%'
      then
        return jsonb_build_object('status', 'slot_collision');
      end if;

      return jsonb_build_object('status', 'failed', 'message', sqlerrm);
    when others then
      return jsonb_build_object('status', 'failed', 'message', sqlerrm);
  end;
end;
$$;

-- Service-only contract: p_auto_slot_ids is trusted only because EXECUTE is
-- closed to public/anon/authenticated and granted only to service_role. Do not
-- grant this RPC to client roles unless allowed slots move to a DB-owned source.
revoke all on function public.insert_grave_if_user_slot_available(
  text,
  integer[],
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text[],
  text,
  bigint,
  text
) from public, anon, authenticated;

grant execute on function public.insert_grave_if_user_slot_available(
  text,
  integer[],
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text[],
  text,
  bigint,
  text
) to service_role;
