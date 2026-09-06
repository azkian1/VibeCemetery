# CLAUDE.md - VibeCemetery Reference

This file is the detailed project reference. The actual Claude Code entrypoint should live at the repo root in `CLAUDE.md`.

## Project Overview
VibeCemetery is a Next.js + Phaser web app where users bury abandoned GitHub repositories on a hand-crafted pixel-art cemetery map including local projects submitted by GitHub-approved coding agents. The GitLawb / Agent Layer experiment is paused and hidden from the primary UI until the cemetery is more populated.

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
|   |   |-- page.tsx                   # scanner landing page and legacy query redirects
|   |   |-- globals.css                # base document styles
|   |   |-- error.tsx                  # app error boundary UI
|   |   |-- not-found.tsx              # 404 page
|   |   |-- robots.ts                  # robots.txt
|   |   |-- sitemap.ts                 # sitemap.xml
|   |   |-- cli/connect/
|   |   |   |-- page.tsx               # CLI approval page route
|   |   |   `-- CliConnectClient.tsx   # client approval flow
|   |   |-- agent-ash/connect/        # paused legacy Agent Ash approval route
|   |   |   |-- page.tsx
|   |   |   `-- AgentAshConnectClient.tsx
|   |   |-- agents/page.tsx            # paused Agent / GitLawb landing page
|   |   |-- agents/gitlawb/page.tsx    # paused Agent Ash install contract
|   |   |-- agents/gitlawb/v1/page.tsx # paused Agent Skill distribution page
|   |   |-- cemetery/
|   |   |   |-- page.tsx          # v1 cemetery map experience
|   |   |   `-- v2/
|   |   |       `-- page.tsx      # v2 cemetery map experience (Cemetery Map 2.0, 140×104, PixelLab)
|   |   |-- grave/[id]/
|   |   |   |-- page.tsx               # grave deep-link redirect page
|   |   |   |-- GraveRedirectClient.tsx
|   |   |   `-- opengraph-image.tsx    # grave share card image
|   |   `-- api/
|   |       |-- auth/[...nextauth]/route.ts
|   |       |-- f-status/route.ts
|   |       |-- github/last-commit/route.ts
|   |       |-- github/scan/route.ts
|   |       |-- graves/route.ts
|   |       |-- graves/atomicInsertWithSlotRetry.ts
|   |       |-- graves/insertOutcomeResponse.ts
|   |       |-- graves/githubRepoEligibility.ts
|   |       |-- graves/[id]/f/route.ts
|   |       |-- graves/[id]/share-confirm/route.ts
|   |       |-- agent-ashes/            # paused legacy Agent Ash ingest/read APIs
|   |       |-- agent-ash/              # paused legacy Agent Ash auth APIs
|   |       `-- cli/
|   |           |-- link/start/route.ts
|   |           |-- link/approve/route.ts
|   |           |-- link/status/route.ts
|   |           |-- token/route.ts
|   |           |-- token/revoke/route.ts
|   |           `-- tokens/route.ts
|   |-- components/
|   |   |-- AppProviders.tsx           # top-level React providers
|   |   |-- CemeteryApp.tsx            # v1 cemetery app shell and modal layer
|   |   |-- CemeteryAppV2.tsx         # v2 cemetery app shell (Cemetery Map 2.0, 140×104)
|   |   |-- HomeScannerLanding.tsx     # root scanner landing page
|   |   |-- PhaserCanvas.tsx           # v1 Phaser bootstrap wrapper
|   |   |-- PhaserCanvasV2.tsx        # v2 Phaser bootstrap wrapper
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
|   |   |-- config-v2.ts            # v2 Phaser game config
|   |   |-- events.ts
|   |   |-- scenes/
|   |   |   |-- CemeteryScene.ts    # v1 scene (az.tmj, 40×40, 48px)
|   |   |   `-- CemeterySceneV2.ts  # v2 scene (cemetery-v2.tmj, 140×104, 32px)
|   |   `-- utils/
|   |       |-- slotManager.ts
|   |       |-- slotManager-v2.ts   # v2 slot parser (GraveObj layer)
|   |       |-- tileRegistry.ts
|   |       |-- tileRegistry-v2.ts  # v2 tile catalog (PixelLab GIDs)
|   |       |-- fogCameraBounds.ts  # pure v2 fog-aware camera constraints
|   |       |-- minimapProjection.ts # circular v2 minimap projection
|   |       `-- minimapRaster.ts    # Tiled layer -> minimap fog/terrain raster
|   |-- gravedigger/
|   |   |-- character.md
|   |   |-- phrases.ts
|   |   |-- epitaphs.ts
|   |   |-- templates.ts
|   |   `-- fillTemplate.ts
|   |-- hooks/useIsMobile.ts
|   |-- lib/
|   |   |-- agent-ash-auth.ts          # paused legacy Agent Ash support
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
|   |   |-- az.tmj                  # v1 map (40×40, 48px, read-only)
|   |   |-- cemetery-v2.tmj               # v2 map (140×104, 32px, PixelLab)
|   |   |-- pixellab/              # v2 PixelLab production assets
|   |   |-- tilesets/              # v2 terrain spritesheet
|   |   `-- docs/
|   |       |-- CLAUDEMAP.md
|   |       |-- LEVEL_DESIGN_RULES.md
|   |       `-- PATCH.md
|   |-- Tailes/
|   `-- og-image.png
|-- tests/
|   |-- home-entry-flow.spec.ts
|   |-- phaser-resize.spec.ts
|   |-- agent-ashes-ui.spec.ts        # paused legacy Agent Ash coverage
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
|   `-- skills/gitlawb/               # paused legacy Agent Skill
|-- docs/
|   |-- agent-layer/
|   |-- agent-layer-archive/        # archived paused GitLawb / Agent Ash docs
|   |-- archive/agent-layer-planning/
|   |-- atomic-grave-slot-insert-plan.md
|   |-- CLAUDE.md
|   |-- cli-auth-v1.sql
|   |-- grave-slot-rpc.sql
|   |-- map2.md                      # v2 integration plan and architecture
|   |-- map-v2-migration.sql         # v2 DB migration (map_version, RPC)
|   |-- map-v2-grave-gid.sql         # v2 grave sprite selection (grave_gid, RPC)
|   |-- setup.md
|   `-- supabase-schema.sql
|-- scripts/
|   `-- convert-tmx-to-tmj.mjs       # TMX→TMJ converter for Cemetery Map 2.0
|-- next.config.ts
|-- playwright.config.ts
|-- playwright.unit.config.ts
|-- playwright.cli-connect.config.ts
|-- eslint.config.mjs
|-- package.json
`-- README.md
```

## App Routes
- `/` - scanner landing page for connected-account GitHub scans; redirects legacy root grave and bury-modal query intents into `/cemetery`
- `/cemetery` - Phaser cemetery map experience with React HUD and Human Layer rituals
- `/cemetery/v2` - Map v2 (140×104, 32px, PixelLab assets) with full functionality
- `/grave/[id]` - redirects into `/cemetery?grave=<uuid>` flow
- `/cli/connect` - browser approval UI for CLI linking
- `/grave/[id]/opengraph-image` - dynamic grave share card image

Paused legacy Agent Layer routes remain for direct links, but are hidden from the primary UI:

- `/agent-ash/connect` - paused Agent Ash browser approval UI
- `/agents` - paused Agent / GitLawb landing page
- `/agents/gitlawb` - paused GitLawb Agent Ash install contract
- `/agents/gitlawb/v1` - paused Agent Skill installer/distribution route

## API Routes
- `GET /api/github/scan?username=X` - scan the signed-in user's own GitHub repos and return inactive non-forks; public username scanning is not supported
- `GET /api/github/last-commit?owner=X&repo=Y` - fetch last commit message for a repo
- `GET /api/graves` - list graves, optional `?author=username`
- `POST /api/graves` - create grave for an authenticated user
- `POST /api/graves/[id]/f` - press F for a grave, one vote per user
- `POST /api/graves/[id]/share-confirm` - confirm owner first-grave X share and unlock the social slot
- `GET /api/f-status` - get voted grave ids for current user
- `POST /api/cli/link/start` - create CLI link session and claim token
- `POST /api/cli/link/approve` - signed-in browser approval for pending CLI link
- `GET /api/cli/link/status?link_id=...` - CLI polling endpoint, guarded by claim token
- `POST /api/cli/token` - issue a one-time visible settings token for human-controlled agent setup
- `GET /api/cli/tokens` - list current user's CLI tokens
- `POST /api/cli/token/revoke` - revoke a CLI token
- `GET|POST /api/auth/[...nextauth]` - NextAuth handler

Paused legacy Agent Layer API routes remain in the codebase, but are not part of the active product flow:

- `POST /api/agent-ash/link/start`
- `GET /api/agent-ash/link/session?link_id=...`
- `POST /api/agent-ash/link/approve`
- `GET /api/agent-ash/link/status?link_id=...`
- `GET /api/agent-ash/tokens`
- `POST /api/agent-ash/token/revoke`
- `GET /api/agent-ashes/summary`
- `GET /api/agent-ashes/[id]`
- `GET /api/agent-ashes/[id]/certificate`
- `POST /api/agent-ashes`

## Core Architecture Notes
- `src/app/page.tsx` renders the scanner landing page and redirects legacy root query intents such as `/?grave=...` and `/?modal=bury` to `/cemetery`.
- `src/app/cemetery/page.tsx` renders the v1 Phaser cemetery map through `src/components/CemeteryApp.tsx`.
- `src/app/cemetery/v2/page.tsx` renders the v2 Phaser cemetery map through `src/components/CemeteryAppV2.tsx`.
- `src/app/agents/page.tsx` is a paused legacy Agent / GitLawb landing page, not an active product hub.
- `src/components/AppProviders.tsx` and `src/context/GameContext.tsx` hold the shared client state for graves, modal stack, chat, user session-derived data, and event coordination.
- `src/components/HomeScannerLanding.tsx` owns the compact root scanner flow; `Scan GitHub` is the only landing-page GitHub auth entry point and scans `session.user.github_username` only.
- `src/components/PhaserCanvas.tsx` embeds Phaser client-side only, starts with explicit non-zero dimensions, and ignores zero-size resize events before calling `game.scale.resize(...)`.
- `src/components/PhaserCanvasV2.tsx` v2 counterpart, imports `createGameConfigV2` instead of `createGameConfig`.
- `src/game/scenes/CemeteryScene.ts` owns v1 map rendering, camera behavior, pinch zoom, day/night cycle, particle effects, lamp rendering, highlights, and the burial ceremony animation.
- `src/game/scenes/CemeterySceneV2.ts` v2 counterpart: 74 PixelLab tilesets, 3 grave types (tall/wide/large), building/tree preview sprites, adapted fog/camera/particles.
- `src/lib/map-slots.ts` and `src/game/utils/slotManager.ts` are the slot source of truth for map placement.
- `src/game/utils/slotManager-v2.ts` v2 slot parser: infers grave type from dimensions (32×64→tall, 64×32→wide, 64×64→large), hardcoded building map.
- `src/game/utils/tileRegistry-v2.ts` v2 tile catalog: GID ranges 51-76 (1×2), 77-85 (2×1), 86-97 (2×2). Also exports `pickRandomGraveGid()` for server-side random sprite selection.
- `src/lib/slot-economy.ts` is the source of truth for normal user slot progression: 4 base normal slots, +1 first-grave X share slot.
- Browser and local agent burials share the same account allowance. At quota, new burials stop; no fallback memorial.
- `src/proxy.ts` applies shared API CORS handling and read rate limiting for `/api/*` requests.

## Current Entry Flow
- `/` answers what the user should do now: sign in through `Scan GitHub`, scan the connected GitHub account, and act on dead repo results before entering the map.
- `/cemetery` answers what exists in the cemetery: graves, Crematory, The Crypt, Necropolis, profile/auth UI, deep links, agent instructions, and the burial action.
- The root page has no GitHub username input and no top-nav `Connect GitHub`; public username scan is intentionally outside the current MVP.
- Home results preload a single-project burial flow when account slots remain.
- Burials started from home save a pending ceremony and navigate to the correct cemetery map.
- The map HUD offers one action: Bury a project. The Crematory is a token offering ledger.
- The map top bar exposes Home, FAQ, and Necropolis in the stone-button visual language.

## Data Model
- `users` - GitHub-linked user profile, progression counters, and first-grave X share unlock timestamp
- `graves` - mapped GitHub burials with slot assignment, epitaph, tier, `f_count`, `map_version`, and `grave_gid`
  - `map_version` - partitions v1 and v2 graves (`'v1'` default, `'v2'` for Cemetery Map 2.0)
  - `grave_gid` - the randomly selected PixelLab sprite GID (v2 only, nullable for v1)
  - Unique constraint: `(slot_id, map_version)` — same slot can exist in both versions
- `f_votes` - idempotent respect votes keyed per user and grave
- `cli_link_sessions` - short-lived browser approval sessions for CLI auth
- `cli_tokens` - hashed long-lived CLI tokens, never stored raw
- `agent_ashes` - paused legacy Agent Ash records; retained for compatibility/data preservation
- `agent_ash_tokens` - paused legacy hashed Agent Ash tokens
- `agent_ash_link_sessions` - paused legacy Agent Ash browser approval sessions
- RPC: `insert_grave_if_user_slot_available(...)` for atomic grave slot economy enforcement and grave insertion; supports `p_map_version` and `p_grave_gid`

## Key Conventions
- Prefer inline styles for UI; `globals.css` is for app-wide base styling, not component-level theme work.
- Stone palette and Cinzel typography are part of the product identity; new UI should match the established cemetery visual language.
- Shared modal chrome belongs in `src/components/ui/`; feature modal behavior belongs in `src/components/modals/`.
- GitHub repos count as dead when they have no commits for 7+ days and are not forks.
- The first page must not suggest public GitHub username scanning; scans use the authenticated user's GitHub username only.
- `POST /api/graves` verifies the GitHub repository before insertion: URL and repo id must match, owner must be the signed-in user, forks are rejected, and pushed_at must be 7+ days old.
- Grave placement must come from parsed map slots, not hardcoded coordinates.
- Normal user graves are limited server-side by slot economy before map slot assignment.
- Auto-assigned user graves can use only `grave` and `grave_tall` slots in v1. In v2, only `grave_tall` is auto-assignable (87 slots). `grave_special` is reserved for friends/welcome placements; Tier 2–3 slots are manual Gravedigger upgrades for best ideas.
- v2 grave sprites are single-PNG PixelLab assets rendered as Phaser sprites (not multi-tile compositions). The sprite GID is randomly selected server-side at burial time via `pickRandomGraveGid()` using `Math.random()`, stored in `grave_gid`, and rendered deterministically on subsequent page loads.
- v2 slot type is inferred from GraveObj object dimensions: 32×64→`grave_tall`, 64×32→`grave_wide`, 64×64→`grave_large`.
- v2 buildings are hardcoded in `slotManager-v2.ts` (Chapel, Gravedigger Lodge, Service Garage, Service Building, Main Gate, Side Wicket) and rendered from preview object layers.
- v2 coordinate source of truth is `public/map/cemetery-v2.tmj`; Phaser applies Tiled tile/object layer offsets. Do not manually add object-layer offsets in `slotManager-v2.ts` or `CemeterySceneV2.ts`, and keep tile-layer `x/y` plus negative offsets numeric in the TMJ.
- v2 camera drag must use the clear cells of `fog_locked_blockout`, via `fogCameraBounds.ts`, rather than a rectangular terrain clamp alone. It permits a 32 px resting buffer and a resisted 64 px maximum fog excursion; the fog safety backdrop must remain above world objects so no empty canvas is visible.
- v2 uses `pickRandomFreeSlot(usedIds, 'v2')` with bias `{grave_tall: 2, grave_wide: 1}` — grave_tall is twice as likely as grave_wide.
- `/cemetery/v2` reuses all modals, HUD, and GameContext from v1. Only PhaserCanvas, CemeteryApp, and Minimap have v2 counterparts.
- Phaser uses explicit sizing with `Scale.NONE`; `ResizeObserver` drives resize updates and zero-width or zero-height resize events are ignored to avoid WebGL framebuffer instability.
- Grave burial ceremony is React-triggered and Phaser-rendered.
- CLI auth uses browser approval plus a one-time `claim_token`; long-lived CLI tokens are server-issued and hashed at rest.
- GitHub-approved vc_cli tokens authorize local submissions to /api/graves. Paused Agent Ash tokens cannot create graves.
- Paused Agent Ash auth used browser approval plus a one-time `claim_token`; keep its `ash_...` token boundary intact while the legacy code remains.
- Paused Agent Ash ingest must never accept `vc_cli_*` tokens or a static ingest token fallback.
- Current Agent Layer status lives in `docs/agent-layer/README.md`; detailed docs are archived under `docs/agent-layer-archive/`.

## Modal Types
```ts
type ModalType = 'grave' | 'crematory' | 'mausoleum' | 'leaderboard' | 'agentAshes' | 'agentSkill' | 'bury' | 'skill' | 'burger' | 'profile'
```

## Deep Links
- `?grave=<uuid>` on `/cemetery` - pan camera to a grave slot and open `GraveModal`
- Root query intents for `grave` and `modal=bury` redirect to `/cemetery`

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
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Paused Agent Layer legacy routes also reference `AGENT_ASH_TOKEN_SECRET` and `GITLAWB_ALLOWED_NODE_URLS`, but they are not required for the main cemetery, GitHub scan, local burial flows.

## Security Notes
- Security headers and CSP are defined in `next.config.ts`.
- When adding a new browser-side external origin, update the relevant CSP directive first.
- CLI link and token endpoints use `Cache-Control: no-store`.
- If the paused Agent Layer is revived, `AGENT_ASH_TOKEN_SECRET` must remain server-only and Agent Ash ingest must keep rejecting static ingest tokens and `vc_cli_*` human burial tokens.
- Shared rate limiting uses Upstash when configured and in-memory fallback otherwise.
- Local helper safety boundaries must be enforced in code, not only in prompt text or documentation.
- Current instructions are served at `/agent-instructions` and `/agent-instructions.md`; the temporary helper is at `/agent-instructions/helper.mjs`. Legacy installer downloads return 410.
- Public helper downloads must retain the exact production origin and digest verification.

## Local agent workflow
- Current specification: src/lib/agent-instructions.ts; public HTML and Markdown share the same content.
- Standalone helper: src/agent/burial-helper.mjs, published with its SHA-256 at /agent-instructions/helper.mjs.
- GitHub browser approval issues vc_cli credentials; source remains local. New local receipts use buried-registry.json and never import former project cremation receipts.
- API: /api/graves (write) and /api/graves/account (private allowance + own graves).
- Schema and deployment order: docs/unified-burial-setup.md. Use create_grave_once for every write; it owns quota, idempotency and counter updates in one transaction.
- The legacy project endpoint returns 410. Never reintroduce alternative records at slot exhaustion.

## Related Docs
- `README.md` - product overview and local setup
- `docs/agent-layer/README.md` - current paused Agent Layer status
- `docs/agent-layer-archive/` - archived GitLawb / Agent Ash docs
- `docs/cli-auth-v1.sql` - Supabase schema for CLI auth tables
- `docs/unified-burial-setup.md` - current release and migration order
- `docs/unified-burials.sql` - account-wide atomic grave writes
- `docs/offering-ledger.sql` - verified offering aggregation
- `docs/grave-slot-rpc.sql` - historical RPC, superseded by unified burial
- `docs/map-v2-migration.sql` - v2 DB migration (map_version column + RPC update)
- `docs/map-v2-grave-gid.sql` - v2 grave sprite selection (grave_gid column + RPC update)
- `docs/map2.md` - current v2 runtime reference plus historical integration material
- `public/map/docs/CLAUDEMAP.md` - v1 map slot and tile reference
- `public/map/docs/LEVEL_DESIGN_RULES.md` - map design constraints
