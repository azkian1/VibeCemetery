-- Mandatory defense-in-depth for server-only application tables.
--
-- Run this after docs/supabase-schema.sql and all optional schema migrations.
-- It is safe to re-run. The Next.js server is the only application data path
-- and uses SUPABASE_SERVICE_KEY; browser clients must not access these tables
-- through the Supabase Data API.
--
-- FORCE ROW LEVEL SECURITY also prevents a table owner from accidentally
-- bypassing the boundary. The service_role used only on the server continues
-- to bypass RLS as intended by Supabase.

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users FROM anon, authenticated;

ALTER TABLE IF EXISTS public.graves ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.graves FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.graves FROM anon, authenticated;

ALTER TABLE IF EXISTS public.f_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.f_votes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.f_votes FROM anon, authenticated;

-- Protect legacy installations before cutover, and allow reruns after retirement.
DO $$ BEGIN
  IF to_regclass('public.cremated') IS NOT NULL THEN
    ALTER TABLE public.cremated ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.cremated FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.cremated FROM anon, authenticated;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.cli_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cli_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cli_tokens FROM anon, authenticated;

ALTER TABLE IF EXISTS public.cli_link_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cli_link_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cli_link_sessions FROM anon, authenticated;

ALTER TABLE IF EXISTS public.agent_ashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_ashes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_ashes FROM anon, authenticated;

-- Legacy Agent Ash auth tables may exist on earlier installations. They are
-- paused, but they contain link and token metadata and need the same boundary.
DO $$ BEGIN
  IF to_regclass('public.agent_ash_tokens') IS NOT NULL THEN
    ALTER TABLE IF EXISTS public.agent_ash_tokens ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.agent_ash_tokens FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.agent_ash_tokens FROM anon, authenticated;
  END IF;
  IF to_regclass('public.agent_ash_link_sessions') IS NOT NULL THEN
    ALTER TABLE IF EXISTS public.agent_ash_link_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.agent_ash_link_sessions FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.agent_ash_link_sessions FROM anon, authenticated;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.grave_burn_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.grave_burn_intents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.grave_burn_intents FROM anon, authenticated;

ALTER TABLE IF EXISTS public.grave_burns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.grave_burns FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.grave_burns FROM anon, authenticated;
