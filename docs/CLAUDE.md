# CLAUDE.md - VibeCemetery Reference

This file is the detailed project reference. The actual Claude Code entrypoint should live at the repo root in `CLAUDE.md`.

## Project Overview
VibeCemetery is a Next.js + Phaser web app where users bury abandoned GitHub repositories on a hand-crafted pixel-art cemetery map, cremate projects through browser/CLI flows, and run a separate Agent Layer for GitLawb-verified autonomous-agent project deaths.

## Tech Stack
- Framework: Next.js 16 (App Router, TypeScript, React 19)
- Game layer: Phaser 3
- Database: Supabase Postgres
- Auth: NextAuth.js with GitHub OAuth
- Styling: mostly inline styles plus `src/app/globals.css`
- Fonts: Cinzel via `next/font` and Google Fonts access for Phaser text rendering
- Deployment: Vercel

## Runbook
- Install: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Start production build: `npm run start`
- Lint: `npm run lint`
- Targeted Playwright suite for `/bury`: `npm run test:bury-skill`

## Repository Structure
```text
vibecemetery/
|-- src/
|   |-- app/
|   |   |-- layout.tsx                 # app shell, metadata, font setup
|   |   |-- page.tsx                   # main SPA page
|   |   |-- globals.css                # base document styles
|   |   |-- error.tsx                  # app error boundary UI
|   |   |-- not-found.tsx              # 404 page
|   |   |-- robots.ts                  # robots.txt
|   |   |-- sitemap.ts                 # sitemap.xml
|   |   |-- cli/connect/
|   |   |   |-- page.tsx               # CLI approval page route
|   |   |   `-- CliConnectClient.tsx   # client approval flow
|   |   |-- agent-ash/connect/
|   |   |   |-- page.tsx               # Agent Ash approval page route
|   |   |   `-- AgentAshConnectClient.tsx
|   |   |-- agents/gitlawb/page.tsx    # Agent Ash install contract
|   |   |-- grave/[id]/
|   |   |   |-- page.tsx               # grave deep-link redirect page
|   |   |   |-- GraveRedirectClient.tsx
|   |   |   `-- opengraph-image.tsx    # grave share card image
|   |   |-- urn/[id]/page.tsx          # urn deep-link redirect page
|   |   `-- api/
|   |       |-- auth/[...nextauth]/route.ts
|   |       |-- cremated/route.ts
|   |       |-- f-status/route.ts
|   |       |-- github/last-commit/route.ts
|   |       |-- github/scan/route.ts
|   |       |-- graves/route.ts
|   |       |-- graves/atomicInsertWithSlotRetry.ts
|   |       |-- graves/insertOutcomeResponse.ts
|   |       |-- graves/githubRepoEligibility.ts
|   |       |-- graves/[id]/f/route.ts
|   |       |-- graves/[id]/share-confirm/route.ts
|   |       |-- agent-ashes/            # Agent Ash ingest and read APIs
|   |       |-- agent-ash/              # Agent Ash browser-approved auth APIs
|   |       `-- cli/
|   |           |-- link/start/route.ts
|   |           |-- link/approve/route.ts
|   |           |-- link/status/route.ts
|   |           |-- token/route.ts
|   |           |-- token/revoke/route.ts
|   |           `-- tokens/route.ts
|   |-- components/
|   |   |-- AppProviders.tsx           # top-level React providers
|   |   |-- PhaserCanvas.tsx           # Phaser bootstrap wrapper
|   |   |-- HoverTooltip.tsx
|   |   |-- hud/
|   |   |   |-- TopBar.tsx
|   |   |   |-- CTAButtons.tsx
|   |   |   |-- ChatLog.tsx
|   |   |   |-- AuthButton.tsx
|   |   |   |-- DayCycleIcon.tsx
|   |   |   |-- Minimap.tsx
|   |   |   |-- ZoomButtons.tsx
|   |   |   |-- BurgerMenu.tsx
|   |   |   `-- GateEpitaph.tsx
|   |   |-- modals/
|   |   |   |-- index.ts
|   |   |   |-- ModalOverlay.tsx
|   |   |   |-- GraveModal.tsx
|   |   |   |-- UrnModal.tsx
|   |   |   |-- ProfileModal.tsx
|   |   |   |-- CrematoryModal.tsx
|   |   |   |-- MausoleumModal.tsx
|   |   |   |-- LeaderboardModal.tsx
|   |   |   |-- BuryFlowModal.tsx
|   |   |   |-- AgentAshesModal.tsx
|   |   |   |-- SkillModal.tsx
|   |   |   `-- bury/
|   |   |       |-- StepScan.tsx
|   |   |       |-- StepSelect.tsx
|   |   |       |-- StepCause.tsx
|   |   |       `-- StepDone.tsx
|   |   `-- ui/
|   |       |-- StoneFrame.tsx
|   |       |-- CloseButton.tsx
|   |       |-- StoneButton.tsx
|   |       |-- OrnamentDivider.tsx
|   |       |-- InsetBlock.tsx
|   |       `-- LoadErrorState.tsx
|   |-- context/GameContext.tsx        # shared cemetery state
|   |-- game/
|   |   |-- config.ts
|   |   |-- events.ts
|   |   |-- scenes/CemeteryScene.ts
|   |   `-- utils/
|   |       |-- slotManager.ts
|   |       `-- tileRegistry.ts
|   |-- gravedigger/
|   |   |-- character.md
|   |   |-- phrases.ts
|   |   |-- epitaphs.ts
|   |   |-- templates.ts
|   |   `-- fillTemplate.ts
|   |-- hooks/useIsMobile.ts
|   |-- lib/
|   |   |-- agent-ash-auth.ts
|   |   |-- agent-ash-contract.ts
|   |   |-- agent-ash-install.ts
|   |   |-- agent-ash-security.ts
|   |   |-- agent-ash-taxonomy.ts
|   |   |-- cli-auth.ts
|   |   |-- gitlawb-verification.ts
|   |   |-- github-auth.ts
|   |   |-- grave-share.ts
|   |   |-- grave-share-server.ts
|   |   |-- map-slots.ts
|   |   |-- rate-limit.ts
|   |   |-- site.ts
|   |   `-- supabase.ts
|   |-- proxy.ts                       # API CORS + read rate limiting
|   `-- types/
|       |-- game.ts
|       `-- next-auth.d.ts
|-- public/
|   |-- map/
|   |   |-- az.tmj
|   |   `-- docs/
|   |       |-- CLAUDEMAP.md
|   |       |-- LEVEL_DESIGN_RULES.md
|   |       `-- PATCH.md
|   |-- Tailes/
|   `-- og-image.png
|-- tests/
|   |-- agent-ashes-ui.spec.ts
|   |-- api-smoke.spec.ts
|   |-- bury-skill.spec.ts
|   |-- ceremony.spec.ts
|   |-- cli-auth.spec.ts
|   |-- cli-connect.spec.ts
|   |-- github-repo-eligibility.spec.ts
|   |-- grave-og-card.spec.ts
|   |-- grave-share.spec.ts
|   |-- graves-write-path.spec.ts
|   |-- slot-economy.spec.ts
|   |-- middleware.spec.ts
|   |-- mobile.spec.ts
|   |-- rate-limit.spec.ts
|   |-- site.spec.ts
|   `-- fixtures/
|-- SKILL/
|   |-- commands/bury.md
|   |-- skills/bury-workflow/
|   `-- skills/gitlawb/
|-- docs/
|   |-- agent-layer/
|   |-- atomic-grave-slot-insert-plan.md
|   |-- CLAUDE.md
|   |-- cli-auth-v1.sql
|   |-- grave-slot-rpc.sql
|   |-- setup.md
|   `-- supabase-schema.sql
|-- next.config.ts
|-- playwright.config.ts
|-- playwright.unit.config.ts
|-- playwright.cli-connect.config.ts
|-- eslint.config.mjs
|-- package.json
`-- README.md
```

## App Routes
- `/` - main cemetery experience with Phaser canvas and React HUD
- `/grave/[id]` - redirects into `?grave=<uuid>` flow
- `/urn/[id]` - redirects into `?urn=<id>` flow
- `/cli/connect` - browser approval UI for CLI linking
- `/agent-ash/connect` - browser approval UI for Agent Ash linking
- `/agents/gitlawb` - Hermes/OpenClaw GitLawb Agent Ash install contract
- `/grave/[id]/opengraph-image` - dynamic grave share card image

## API Routes
- `GET /api/github/scan?username=X` - scan public GitHub repos and return inactive non-forks
- `GET /api/github/last-commit?owner=X&repo=Y` - fetch last commit message for a repo
- `GET /api/graves` - list graves, optional `?author=username`
- `POST /api/graves` - create grave for an authenticated user
- `POST /api/graves/[id]/f` - press F for a grave, one vote per user
- `POST /api/graves/[id]/share-confirm` - confirm owner first-grave X share and unlock the social slot
- `GET /api/f-status` - get voted grave ids for current user
- `GET /api/cremated` - list cremated projects
- `POST /api/cremated` - create cremation from browser session or CLI token
- `POST /api/cli/link/start` - create CLI link session and claim token
- `POST /api/cli/link/approve` - signed-in browser approval for pending CLI link
- `GET /api/cli/link/status?link_id=...` - CLI polling endpoint, guarded by claim token
- `POST /api/cli/token` - issue a one-time visible settings token for human-controlled agent setup
- `GET /api/cli/tokens` - list current user's CLI tokens
- `POST /api/cli/token/revoke` - revoke a CLI token
- `POST /api/agent-ash/link/start` - create Agent Ash link session and claim token
- `GET /api/agent-ash/link/session?link_id=...` - read public link metadata for browser approval
- `POST /api/agent-ash/link/approve` - signed-in browser approval or denial for Agent Ash access
- `GET /api/agent-ash/link/status?link_id=...` - agent polling endpoint, guarded by claim token
- `GET /api/agent-ash/tokens` - list current user's connected Agent Ash credentials as safe metadata
- `POST /api/agent-ash/token/revoke` - revoke an Agent Ash token
- `GET /api/agent-ashes/summary` - Agent Ash dashboard summary
- `GET /api/agent-ashes/[id]` - read Agent Ash record metadata
- `GET /api/agent-ashes/[id]/certificate` - read raw stored Agent Ash certificate JSON
- `POST /api/agent-ashes` - ingest GitLawb-verified `agent_ash.v1` records with DB-backed `ash_...` bearer auth
- `GET|POST /api/auth/[...nextauth]` - NextAuth handler

## Core Architecture Notes
- `src/app/page.tsx` renders the main screen and coordinates deep-link handling.
- `src/components/AppProviders.tsx` and `src/context/GameContext.tsx` hold the shared client state for graves, cremated items, modal stack, chat, user session-derived data, and event coordination.
- `src/components/PhaserCanvas.tsx` embeds Phaser client-side only and bridges React state into the game scene.
- `src/game/scenes/CemeteryScene.ts` owns map rendering, camera behavior, pinch zoom, day/night cycle, particle effects, lamp rendering, highlights, and the burial ceremony animation.
- `src/lib/map-slots.ts` and `src/game/utils/slotManager.ts` are the slot source of truth for map placement.
- `src/lib/slot-economy.ts` is the source of truth for normal user slot progression: 4 max normal slots, 1 default, +1 first-grave X share, +1 at 30 Souls, +1 at 100 Souls.
- `src/proxy.ts` applies shared API CORS handling and read rate limiting for `/api/*` requests.

## Data Model
- `users` - GitHub-linked user profile, progression counters, and first-grave X share unlock timestamp
- `graves` - mapped GitHub burials with slot assignment, epitaph, tier, and `f_count`
- `cremated` - cremated projects from browser or CLI flow, with `source` and Souls progression
- `f_votes` - idempotent respect votes keyed per user and grave
- `cli_link_sessions` - short-lived browser approval sessions for CLI auth
- `cli_tokens` - hashed long-lived CLI tokens, never stored raw
- `agent_ashes` - verified Agent Ash records for the separate Agent Layer
- `agent_ash_tokens` - hashed browser-approved `ash_...` Agent Ash tokens
- `agent_ash_link_sessions` - short-lived browser approval sessions for Agent Ash auth
- RPC: `increment_cremated_count(username)` for atomic cremation counter updates
- RPC: `insert_grave_if_user_slot_available(...)` for atomic grave slot economy enforcement and grave insertion

## Key Conventions
- Prefer inline styles for UI; `globals.css` is for app-wide base styling, not component-level theme work.
- Stone palette and Cinzel typography are part of the product identity; new UI should match the established cemetery visual language.
- Shared modal chrome belongs in `src/components/ui/`; feature modal behavior belongs in `src/components/modals/`.
- GitHub repos count as dead when they have no commits for 14+ days and are not forks.
- `POST /api/graves` verifies the GitHub repository before insertion: URL and repo id must match, owner must be the signed-in user, forks are rejected, and pushed_at must be 14+ days old.
- Grave placement must come from parsed map slots, not hardcoded coordinates.
- Normal user graves are limited server-side by slot economy before map slot assignment.
- Auto-assigned user graves can use only `grave` and `grave_tall` slots. `grave_special` is reserved for friends/welcome placements; Tier 2–3 slots are manual Gravedigger upgrades for best ideas.
- Phaser input uses `windowEvents: false` to prevent pointer bleed-through into HTML overlays.
- Grave burial ceremony is React-triggered and Phaser-rendered; cremations do not use the ceremony animation.
- CLI auth uses browser approval plus a one-time `claim_token`; long-lived CLI tokens are server-issued and hashed at rest.
- Settings-issued CLI tokens from `/api/cli/token` are for human-controlled agent setup and still post human-layer cremations to `/api/cremated`; they are not Agent Ashes ingest credentials.
- Agent Ash auth uses browser approval plus a one-time `claim_token`; long-lived `ash_...` tokens are server-issued, hashed at rest, and scoped to `agent_ashes:write`.
- Agent Ash ingest must never accept `vc_cli_*` tokens or a static ingest token fallback.
- Canonical Agent Layer docs live in `docs/agent-layer/README.md`.

## Modal Types
```ts
type ModalType = 'grave' | 'crematory' | 'mausoleum' | 'leaderboard' | 'agentAshes' | 'bury' | 'skill' | 'burger' | 'profile' | 'urn'
```

## Deep Links
- `?grave=<uuid>` - pan camera to a grave slot and open `GraveModal`
- `?urn=<id>` - open `UrnModal`
- `/grave/[id]` and `/urn/[id]` redirect into those query-param flows

## Environment Variables
```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
SUPABASE_SERVICE_KEY
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_TOKEN
NEXTAUTH_URL
NEXTAUTH_SECRET
CLI_TOKEN_SECRET
AGENT_ASH_TOKEN_SECRET
GITLAWB_ALLOWED_NODE_URLS
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

## Security Notes
- Security headers and CSP are defined in `next.config.ts`.
- When adding a new browser-side external origin, update the relevant CSP directive first.
- CLI link and token endpoints use `Cache-Control: no-store`.
- `AGENT_ASH_TOKEN_SECRET` is server-only and derives browser-approved `ash_...` Agent Ash tokens. Agent Ash ingest checks hashed tokens in `agent_ash_tokens`; never add a static ingest token path or reuse `vc_cli_*` human cremation tokens.
- Shared rate limiting uses Upstash when configured and in-memory fallback otherwise.
- `/bury` installer and helper safety boundaries must be enforced in code, not only in prompt text or documentation.
- Quick-install sources must stay pinned to an explicit commit or release artifact; do not point them at floating branches.
- Installer source overrides are test-only and must stay limited to localhost-style origins.

## CLI Workflow
- User-facing command: `SKILL/commands/bury.md`
- Workflow implementation: `SKILL/skills/bury-workflow/`
- Installer flow: `SKILL/install/install-bury.sh` and `SKILL/install/install-bury.ps1`
- Install source: GitHub raw URLs pinned to installer commit `ba4d1a0765b81d071b2824e92460687537786dd6`
- `/bury` is for local project cremation only; it does not scan GitHub repos and does not create map graves.
- First run opens browser approval at `/cli/connect`; later runs use a stored bearer token.
- Local deduplication uses an external per-user `cremated-registry.json`, not a repo file.
- Installer refuses symlinked or redirected `~/.claude` targets before backup, delete, or overwrite.
- Helper refuses unsafe scan paths such as filesystem roots, home, Desktop, Documents, Downloads, non-directories, and symlinked paths.

## Related Docs
- `README.md` - product overview and local setup
- `docs/agent-layer/README.md` - canonical Agent Layer docs for Hermes/OpenClaw, GitLawb, Agent Ash auth, APIs, database, and operations
- `docs/cli-auth-v1.sql` - Supabase schema for CLI auth tables
- `docs/grave-slot-rpc.sql` - Supabase RPC for atomic grave slot inserts
- `public/map/docs/CLAUDEMAP.md` - map slot and tile reference
- `public/map/docs/LEVEL_DESIGN_RULES.md` - map design constraints
