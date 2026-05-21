# VibeCemetery

Project instructions for Claude Code. Detailed reference lives in `docs/CLAUDE.md`.

## Project Focus
- Next.js 16 App Router app with a Phaser-powered cemetery map.
- Users can bury dead GitHub repos as map graves, cremate projects through browser/CLI flows, and preview the separate Agent Ashes layer.
- Keep the existing cemetery visual language intact: Cinzel, stone palette, inline-style-driven UI.

## Commands
- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`
- Lint: `npm run lint`
- `/bury` Playwright suite: `npm run test:bury-skill`

## Structure
- `src/app/` - routes, app shell, API handlers
- `src/components/` - React UI, HUD, modals, shared stone UI
- `src/context/GameContext.tsx` - shared client state and modal orchestration
- `src/game/` - Phaser config, scene, events, map rendering logic
- `src/lib/` - Supabase, auth, rate limiting, site URL, map slot helpers
- `src/proxy.ts` - API CORS and read rate limiting
- `tests/` - Playwright and unit-style coverage
- `SKILL/` - `/bury` command and supporting workflow files
- `SKILL/install/` - GitHub-hosted `/bury` installer scripts and shared contract

## Rules
- Use inline styles for component-level UI unless an existing file already relies on `globals.css`.
- Do not hardcode grave coordinates; use parsed map slots.
- Treat repos as dead only when inactive for 7+ days and not forks.
- Human CLI `/bury` cremations stay in `/api/cremated`; they are not Agent Ashes ingest.
- Keep grave burial ceremony behavior intact; cremations do not use ceremony animation.
- Preserve CLI auth flow: browser approval, `claim_token`, hashed long-lived CLI tokens.
- Enforce `/bury` safety boundaries in code, not only in skill text or docs.
- Keep installer quick-install sources pinned to an explicit commit or release artifact, never a floating branch.
- Update CSP in `next.config.ts` before introducing new browser-side external origins.

## References
- `docs/CLAUDE.md`
- `docs/agent-layer/README.md`
- `README.md`
- `docs/cli-auth-v1.sql`
- `docs/grave-slot-rpc.sql`
- `public/map/docs/CLAUDEMAP.md`
