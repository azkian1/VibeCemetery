# CLAUDE.md — VibeCemetery

## Project Overview
VibeCemetery — interactive pixel-art cemetery for dead vibe-coded projects. Users bury their abandoned GitHub repositories on a hand-crafted Tiled map.

## Tech Stack
- **Framework:** Next.js (App Router, TypeScript)
- **Game engine:** Phaser 3 (pixelArt, no audio)
- **Font:** Cinzel (Google Fonts) — loaded via next/font + direct link for Phaser canvas
- **Database:** Supabase (PostgreSQL)
- **Auth:** NextAuth.js + GitHub OAuth
- **Deploy:** Vercel
- **Source dir:** `src/`

## Project Structure
```
vibecemetery/
├── src/
│   ├── app/                — pages + API routes (App Router)
│   │   ├── layout.tsx      — Cinzel font setup (next/font + Google Fonts link)
│   │   ├── page.tsx        — main SPA page (SessionProvider, GameProvider, deep links)
│   │   ├── grave/[id]/page.tsx  — deep link page for graves (?grave=uuid)
│   │   ├── urn/[id]/page.tsx    — deep link page for urns (?urn=id)
│   │   └── api/            — API routes (see API Routes section)
│   ├── components/
│   │   ├── PhaserCanvas.tsx — Phaser wrapper (dynamic import, ssr: false)
│   │   ├── HoverTooltip.tsx — hover tooltip over graves
│   │   ├── hud/            — HUD components
│   │   │   ├── TopBar.tsx       — top bar (burger, Necropolis, DayCycleIcon, @Mogilschik, AuthButton)
│   │   │   ├── CTAButtons.tsx   — BURY + SKILL buttons (bottom-right)
│   │   │   ├── ChatLog.tsx      — Lineage 2 style chat log (bottom-left)
│   │   │   ├── AuthButton.tsx   — Login/Profile button
│   │   │   ├── DayCycleIcon.tsx — day/night medallion (sun/moon with fade transition)
│   │   │   ├── Minimap.tsx      — canvas minimap with click-to-teleport
│   │   │   ├── ZoomButtons.tsx  — mobile-only +/− zoom buttons (bottom-right, emits zoom_change)
│   │   │   └── BurgerMenu.tsx   — menu panel (FAQ, About, GitHub link)
│   │   ├── modals/         — modal dialogs
│   │   │   ├── ModalOverlay.tsx
│   │   │   ├── GraveModal.tsx     — grave details, F votes, share
│   │   │   ├── UrnModal.tsx       — cremated item details, last words, share
│   │   │   ├── ProfileModal.tsx   — user profile, Souls progress, slot thresholds
│   │   │   ├── CrematoryModal.tsx — 2-tab: Columbarium (with URL) + Ash Pit (no URL)
│   │   │   ├── MausoleumModal.tsx (displayed as "The Crypt") — sortable graves ledger
│   │   │   ├── LeaderboardModal.tsx (displayed as "Necropolis") — 3 tabs: Serial Killers, Causes, AI-Bots
│   │   │   ├── BuryFlowModal.tsx  (4-step: Scan → Select → Cause → Done, emits burial_ceremony for graves)
│   │   │   ├── SkillModal.tsx     — skill install instructions
│   │   │   └── bury/       — BuryFlow step components
│   │   │       ├── StepScan.tsx
│   │   │       ├── StepSelect.tsx
│   │   │       ├── StepCause.tsx
│   │   │       └── StepDone.tsx
│   │   └── ui/             — shared stone-styled UI components
│   │       ├── StoneFrame.tsx      — modal container (stone gradient, noise, vignette)
│   │       ├── ModalOverlay.tsx    — semi-transparent backdrop with focus trap
│   │       ├── CloseButton.tsx     — close button (✕)
│   │       ├── StoneButton.tsx     — stone gradient button
│   │       ├── OrnamentDivider.tsx — decorative divider (✦)
│   │       └── InsetBlock.tsx      — inset carved block for code/quotes
│   ├── context/
│   │   └── GameContext.tsx  — shared state (graves, cremated, modals, chat, fVotes)
│   ├── game/
│   │   ├── config.ts       — Phaser GameConfig (windowEvents: false)
│   │   ├── events.ts       — typed EventBridge Phaser ↔ React (incl. burial_ceremony / burial_ceremony_done / zoom_change)
│   │   ├── scenes/
│   │   │   └── CemeteryScene.ts — main scene: map, camera, pinch-to-zoom, day/night, lamps, particles, burial ceremony animation
│   │   └── utils/
│   │       ├── slotManager.ts   — parse Object Layer → slot coords
│   │       └── tileRegistry.ts  — tile GID catalog, dynamic graves
│   ├── gravedigger/
│   │   ├── character.md    — Gravedigger NPC character design (personality, tone, rules)
│   │   ├── phrases.ts      — static phrase pools (greeting, idle, burial, mass burial, profile)
│   │   ├── epitaphs.ts     — tombstone epitaph generator (37 templates, deterministic fallback for old graves)
│   │   ├── templates.ts    — dynamic chat phrase templates with {placeholders}
│   │   └── fillTemplate.ts — picks random grave/cremated, fills chat template with real data
│   ├── hooks/
│   │   └── useIsMobile.ts  — mobile detection hook
│   ├── lib/
│   │   ├── supabase.ts     — Supabase clients (admin + public)
│   │   ├── map-slots.ts    — parse grave slot IDs from Tiled .tmj map
│   │   ├── rate-limit.ts   — in-memory sliding window rate limiter
│   │   └── github-auth.ts  — GitHub auth utilities
│   ├── middleware.ts        — NextAuth middleware
│   └── types/
│       └── game.ts         — GraveData, CrematedData, DeadRepo, BuryResult, GitHubScanResult
├── public/
│   ├── map/
│   │   ├── az.tmj              — main map (40x40, 9 tilesets embedded inline)
│   │   ├── docs/
│   │   │   ├── CLAUDEMAP.md        — full map reference (slots, GID, tiles)
│   │   │   └── LEVEL_DESIGN_RULES.md — level design rules
│   │   └── *.png               — 9 tileset PNGs
│   └── Tailes/                 — source tilesets (PNG, 48px)
│       ├── graveyard/          — KR Peaceful Rest Graveyard
│       └── crypt/              — KR Burial Grounds
├── docs/
│   ├── CLAUDE.md               — project overview (this file)
│   ├── PRDv3.md                — product requirements
│   ├── PLANv3.md               — master plan (phases 1-9)
│   └── AGENT-MODAL-UX.md       — agent modal UX patterns
```

## Database Tables
- **users** — github_id, github_username, avatar_url, graves_count, cremated_count
- **graves** — project graves with GitHub repo link, slot_id for map placement, last_commit_message, tier, f_count, epitaph (generated by Gravedigger at burial)
- **cremated** — cremated projects (first 50 unlimited, then 3/day per user). `source` column: `'github'` (browser session) or `'skill'` (CLI token auth). Souls: github=3, skill=1. Auth: browser session or server-issued CLI Bearer token
- **f_votes** — Press F votes (one per user per grave). Idempotent. Count synced to `graves.f_count`
- **cli_link_sessions** — short-lived browser approval sessions for CLI linking (10 minute TTL, one-time token claim)
- **cli_tokens** — hashed long-lived CLI tokens, revocable from the site, never stored raw
- **Supabase RPC:** `increment_cremated_count(username)` — atomic counter increment

## Modal Types
```typescript
ModalType = 'grave' | 'crematory' | 'mausoleum' | 'leaderboard' | 'bury' | 'skill' | 'burger' | 'profile' | 'urn'
```
Modal stack supports push/pop (deduplication on push). `useModal()` hook: `open()`, `push()`, `close()`, `closeAll()`.

## Key Conventions
- All UI uses inline styles with hardcoded hex values (no CSS modules/Tailwind classes)
- Stone palette: `#1a1918` (darkest) → `#d4d0c4` (lightest), gold accents `#e8d5a3`
- Font: Cinzel everywhere (var(--font-cinzel) for React, 'Cinzel' for Phaser canvas)
- Shared UI components in `src/components/ui/` — always use StoneFrame for modals
- API routes in `src/app/api/`
- `supabaseAdmin` (service key) for server-side, `supabase` (anon key) for client-side
- GitHub repos "dead" = no commits 14+ days, forks excluded
- Building names: Crematory (code: 'Crematory'), The Crypt (code: 'Mausoleum' → display 'The Crypt')
- Phaser config: `input: { windowEvents: false }` — prevents pointer bleed-through to HTML overlay
- Day/night cycle: dusk(15s) → night(25s) → dawn(30s) → day(50s), synced via `day_phase` event
- **Burial ceremony animation** (~5.5s, graves only, not cremations): modal emits `burial_ceremony` BEFORE `ADD_GRAVE` dispatch (so PhaserCanvas pre-registers slot_id in `sentSlotIdsRef` to suppress auto-render). CemeteryScene stores `pendingCeremony`, starts animation on modal close via `onModalState`. Sequence: camera pan+zoom → dirt burst+shake → grave reveal → R.I.P. glow → zoom out. All ceremony objects tracked in `ceremonyObjects[]` for shutdown cleanup. `buryModalOpen` flag ensures only bury modal close triggers ceremony

## API Routes
- `GET /api/github/scan?username=X` — scan public repos, filter dead (14+ days inactive). Rate limit: 10/min per IP (in-memory). Cached 24h. Uses server `GITHUB_TOKEN`
- `GET /api/github/last-commit?owner=X&repo=Y` — fetch last commit message from GitHub. Uses server `GITHUB_TOKEN`
- `POST /api/graves` — create grave (authenticated). Rate limit: 20/day per user. Duplicate prevention by repo_id. Assigns `slot_id` from actual Tiled map slots via `map-slots.ts`
- `GET /api/graves` — list all graves. Enriches f_count from f_votes table. Optional `?author=username` filter
- `POST /api/graves/[id]/f` — Press F to pay respects. One vote per user per grave (idempotent). Updates graves.f_count
- `GET /api/f-status` — get current user's voted grave IDs (Set of grave UUIDs)
- `POST /api/cremated` — cremate project (browser session or CLI Bearer token). Accepts `{name, cause, github_url?, last_commit_message?}`. Rate limit: first 50 unlimited, then 3/day
- `POST /api/cli/link/start` — create short-lived CLI link session, returns browser approval URL
- `POST /api/cli/link/approve` — signed-in browser user approves pending CLI link session
- `GET /api/cli/link/status?link_id=...` — CLI polls for pending/approved/claimed/expired link state; raw token returned once on approval
- `GET /api/cremated` — list all cremated projects

## Deep Links
- `?grave=<uuid>` — camera pans to grave slot, highlights it, opens GraveModal after animation
- `?urn=<id>` — opens UrnModal for cremated project
- Standalone pages: `/grave/[id]` and `/urn/[id]` redirect to main page with deep link params

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_TOKEN              — server-side PAT for GitHub API (rate limit, no special permissions needed)
NEXTAUTH_URL
NEXTAUTH_SECRET
CLI_TOKEN_SECRET          — optional dedicated secret for long-lived CLI tokens; falls back to NEXTAUTH_SECRET if omitted
```

## Current Phase
- Phase 1 (Map) — DONE
- Phase 2 (Phaser) — DONE
- Phase 3 (Backend + API) — DONE
- Phase 4 (UI) — DONE
- Phase 4.1 (Style polish) — DONE (Cinzel font, stone palette, shared UI components)
- Phase 4.2 (Modal content & UX) — DONE (all modals implemented including ProfileModal, UrnModal)
- Phase 4.3 (Working buttons) — DONE (BURY flow end-to-end, F votes, deep links, profile)
- Phase 4.4 (Audits) — DONE (security audit, rate-limit.ts, security headers + CSP in next.config)
- Phase 4.5 (Burial ceremony animation) — DONE (camera fly, dirt burst, grave reveal, R.I.P. glow, zoom out)
- **Phase 5 (Skill / CLI cremation) — DONE for V1** (browser approval flow, server-issued CLI token, revoke UI/API, no body-auth for CLI, production origin configurable via `NEXT_PUBLIC_SITE_URL`)
- **Phase 5.5 (Mobile polish) — DONE** (all 13 tasks from `docs/mobile.md` complete — see Mobile section below)
- Phase 5.6 (Pre-launch hardening) — IN PROGRESS (`POST /api/graves` retry tightened, `GameContext.user` wired to session, shared site URL config added)
- Phase 6 (Expanded NPC / agent layer) — TODO — post-launch scope
- See `docs/PLANv3.md` for full plan

## Mobile (read-only showcase)
- **Detection:** `useIsMobile()` hook (`max-width: 640px` via matchMedia). Phaser uses `this.scale.width < 640` / `this.isMobile`
- **Viewport:** `100dvh`, `viewportFit: 'cover'`, `maximumScale: 1`, `userScalable: false`, `touchAction: 'none'` on canvas
- **Hidden on mobile:** CTA buttons (BURY/SKILL), Login button (unauthenticated), Minimap, ChatLog, DayCycleIcon medallion, F button in GraveModal
- **Camera:** pinch-to-zoom (two-finger gesture, drag↔pinch transition handled), initial zoom `Math.max(fitZoom, 0.85)`, ZoomButtons (+/−) bottom-right
- **Performance:** particle emission delays doubled, lamp glow redraw intervals 2.5x on mobile
- **Safe areas:** TopBar uses `env(safe-area-inset-top)` with `minHeight: 44`
- **Touch targets:** modal tabs (Leaderboard, Crematory) use `minHeight: 44`, larger padding/font on mobile
- **Deep links:** all setTimeout delays halved on mobile (`window.innerWidth < 640`)
- **Events:** `zoom_change` event (React → Phaser) for ZoomButtons

## Security Headers (next.config.ts)
- X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy — all set
- **CSP (Content-Security-Policy)** — configured in `next.config.ts`, works automatically on Vercel and `next start`
- **IMPORTANT:** when adding a new external resource (CDN, analytics, new API) — update the corresponding CSP directive in `next.config.ts`, otherwise the browser will block loading
- Currently allowed domains: `fonts.googleapis.com`, `fonts.gstatic.com`, `avatars.githubusercontent.com`, `*.supabase.co`
- Server-side fetch (API routes → `api.github.com`) is not covered by CSP — this applies only to the browser

## CLI Skill — /bury (Mogil'schik)
- Location: `.claude/commands/bury/` (SKILL.md, character.md, cremated-registry.json)
- Auth: first run opens `/cli/connect` in the browser, user approves once, CLI stores server-issued token locally and sends `Authorization: Bearer <cli_token>` on future runs
- Raw CLI token is one-time visible only; database stores hash + masked prefix, and tokens can be revoked from the profile
- Supabase setup: apply `docs/cli-auth-v1.sql` and ensure `users.github_username` is `UNIQUE`
- Endpoint hardening: CLI link/token endpoints use `Cache-Control: no-store`; `POST /api/cli/link/start` has basic IP rate limiting
- Local deduplication via `cremated-registry.json` (fingerprints: git_remote, first_commit, path)
- Uses `node` for HTTP requests (UTF-8 safe on Windows)
