-- Phase 3: Map v2 support — add map_version column to graves
-- Run against Supabase (SQL Editor → New query)

-- 1. Add map_version column (default 'v1' for all existing rows)
ALTER TABLE public.graves
  ADD COLUMN IF NOT EXISTS map_version TEXT NOT NULL DEFAULT 'v1';

-- Only the deployed map namespaces may participate in slot allocation.
-- NOT VALID keeps this migration safe on installations that already contain
-- legacy invalid rows, while still rejecting all new invalid writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'graves_map_version_check'
      AND conrelid = 'public.graves'::regclass
  ) THEN
    ALTER TABLE public.graves
      ADD CONSTRAINT graves_map_version_check
      CHECK (map_version IN ('v1', 'v2')) NOT VALID;
  END IF;
END $$;

-- 2. Add index for map_version queries
CREATE INDEX IF NOT EXISTS graves_map_version_idx ON public.graves (map_version);

-- 3. Change unique constraint: was (slot_id), now (slot_id, map_version)
--    This allows v1 slot_id=42 and v2 slot_id=42 to coexist
ALTER TABLE public.graves
  DROP CONSTRAINT IF EXISTS graves_slot_id_key;

ALTER TABLE public.graves
  ADD CONSTRAINT graves_slot_id_map_version_key UNIQUE (slot_id, map_version);

-- 4. Update RPC: insert_grave_if_user_slot_available now accepts map_version
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
  p_map_version text DEFAULT 'v1'
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

  IF p_map_version NOT IN ('v1', 'v2') THEN
    RETURN jsonb_build_object('status', 'failed', 'message', 'unsupported map_version');
  END IF;

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
      author_github, slot_id, last_commit_message, map_version
    ) VALUES (
      p_name, p_description, p_epitaph, p_born_at, p_died_at,
      p_cause, p_stack, p_github_url, p_github_repo_id,
      p_author_github, p_slot_id, p_last_commit_message, p_map_version
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

-- Re-apply grants (service_role only)
REVOKE ALL ON FUNCTION public.insert_grave_if_user_slot_available(
  text, integer[], integer, text, text, text,
  timestamptz, timestamptz, text, text[],
  text, bigint, text, text
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_grave_if_user_slot_available(
  text, integer[], integer, text, text, text,
  timestamptz, timestamptz, text, text[],
  text, bigint, text, text
) TO service_role;
