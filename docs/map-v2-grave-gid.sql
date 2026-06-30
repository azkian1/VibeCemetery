-- Phase 3b: Random grave sprite selection for v2
-- Run against Supabase after map-v2-migration.sql

-- 1. Add grave_gid column (nullable — v1 graves won't have it)
ALTER TABLE public.graves
  ADD COLUMN IF NOT EXISTS grave_gid INTEGER;

-- 2. Recreate RPC with grave_gid parameter
CREATE OR REPLACE FUNCTION public.insert_grave_if_user_slot_available(
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
  p_last_commit_message text,
  p_map_version text DEFAULT 'v1',
  p_grave_gid integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_shared_first_grave boolean := false;
  v_daily_count integer := 0;
  v_slots_unlocked integer := 4;
  v_slots_used integer := 0;
  v_grave public.graves%rowtype;
  v_constraint text;
  v_detail text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_author_github || ':' || p_map_version));

  IF NOT (p_slot_id = ANY(p_auto_slot_ids)) THEN
    RETURN jsonb_build_object('status', 'failed', 'message', 'slot_id is not auto-assignable');
  END IF;

  SELECT count(*)::integer
  INTO v_daily_count
  FROM public.graves
  WHERE author_github = p_author_github
    AND map_version = p_map_version
    AND created_at >= timezone('utc', now()) - INTERVAL '24 hours';

  IF v_daily_count >= 20 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.users
    WHERE github_username = p_author_github
      AND x_first_grave_shared_at IS NOT NULL
  )
  INTO v_has_shared_first_grave;

  v_slots_unlocked := 4 + CASE WHEN coalesce(v_has_shared_first_grave, false) THEN 1 ELSE 0 END;

  SELECT count(*)::integer
  INTO v_slots_used
  FROM public.graves
  WHERE author_github = p_author_github
    AND map_version = p_map_version
    AND slot_id = ANY(p_auto_slot_ids);

  IF v_slots_used >= v_slots_unlocked THEN
    RETURN jsonb_build_object(
      'status', 'user_slots_exhausted',
      'slots_unlocked', v_slots_unlocked,
      'slots_used', v_slots_used
    );
  END IF;

  BEGIN
    INSERT INTO public.graves (
      name, description, epitaph, born_at, died_at,
      cause, stack, github_url, github_repo_id,
      author_github, slot_id, last_commit_message, map_version, grave_gid
    ) VALUES (
      p_name, p_description, p_epitaph, p_born_at, p_died_at,
      p_cause, p_stack, p_github_url, p_github_repo_id,
      p_author_github, p_slot_id, p_last_commit_message, p_map_version, p_grave_gid
    )
    RETURNING * INTO v_grave;

    RETURN jsonb_build_object('status', 'created', 'grave', to_jsonb(v_grave));
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS
        v_constraint = CONSTRAINT_NAME,
        v_detail = PG_EXCEPTION_DETAIL;

      IF v_constraint = 'graves_github_repo_id_key'
        OR coalesce(v_detail, '') LIKE '%(github_repo_id)%'
      THEN
        RETURN jsonb_build_object('status', 'duplicate_repo');
      END IF;

      IF v_constraint = 'graves_slot_id_map_version_key'
        OR coalesce(v_detail, '') LIKE '%(slot_id, map_version)%'
        OR coalesce(v_detail, '') LIKE '%(slot_id)%'
      THEN
        RETURN jsonb_build_object('status', 'slot_collision');
      END IF;

      RETURN jsonb_build_object('status', 'failed', 'message', sqlerrm);
    WHEN others THEN
      RETURN jsonb_build_object('status', 'failed', 'message', sqlerrm);
  END;
END;
$$;

-- Re-apply grants
REVOKE ALL ON FUNCTION public.insert_grave_if_user_slot_available(
  text, integer[], integer, text, text, text,
  timestamptz, timestamptz, text, text[],
  text, bigint, text, text, integer
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_grave_if_user_slot_available(
  text, integer[], integer, text, text, text,
  timestamptz, timestamptz, text, text[],
  text, bigint, text, text, integer
) TO service_role;
