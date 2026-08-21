# VibeCemetery

Project instructions for Claude Code. Detailed reference lives in `docs/CLAUDE.md`.

## Project Focus
- Next.js 16 App Router app with a scanner landing page and Phaser-powered cemetery map at `/cemetery`.
- Users can scan only their connected GitHub account, bury dead GitHub repos as map graves, and cremate projects through browser/CLI flows.
- The GitLawb / Agent Layer experiment is paused and hidden from the primary UI until the cemetery is more populated.
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
- `src/app/cemetery/v2/` - Map v2 route (140×104 PixelLab cemetery)
- `src/components/` - scanner landing page, cemetery app shell, React UI, HUD, modals, shared stone UI
- `src/context/GameContext.tsx` - shared client state and modal orchestration
- `src/game/` - Phaser config, scene, events, map rendering logic
  - `src/game/scenes/CemeteryScene.ts` - v1 scene (az.tmj, 40×40, 48px tiles, asset-pack)
  - `src/game/scenes/CemeterySceneV2.ts` - v2 scene (Map4.tmj, 140×104, 32px tiles, PixelLab)
  - `src/game/utils/slotManager.ts` / `slotManager-v2.ts` - slot parsing per version
  - `src/game/utils/tileRegistry.ts` / `tileRegistry-v2.ts` - tile catalog per version
- `src/lib/` - Supabase, auth, rate limiting, site URL, map slot helpers
- `src/proxy.ts` - API CORS and read rate limiting
- `public/map/` - Tiled map files and tileset images
  - `public/map/az.tmj` - v1 map (untouched)
  - `public/map/Map4.tmj` - v2 map source (converted from Map4.tmx)
  - `public/map/pixellab/` - v2 PixelLab production assets
  - `public/map/tilesets/` - v2 terrain spritesheet
- `scripts/convert-tmx-to-tmj.mjs` - TMX→TMJ converter for Map4
- `tests/` - Playwright and unit-style coverage
- `SKILL/` - `/bury` command and supporting workflow files
- `SKILL/install/` - site-hosted `/bury` installer scripts and shared contract

## Rules
- Use inline styles for component-level UI unless an existing file already relies on `globals.css`.
- Keep `/` as the scanner landing page, `/cemetery` as the v1 map (view-only), and `/cemetery/v2` as the active v2 map.
- Do not add public GitHub username scanning; scans use the authenticated GitHub account only.
- Do not hardcode grave coordinates; use parsed map slots.
- Treat repos as dead only when inactive for 7+ days and not forks.
- Human CLI `/bury` cremations stay in `/api/cremated`; do not route them into paused Agent Ash ingest.
- Keep grave burial ceremony behavior intact; cremations do not use ceremony animation.
- Preserve CLI auth flow: browser approval, `claim_token`, hashed long-lived CLI tokens.
- Enforce `/bury` safety boundaries in code, not only in skill text or docs.
- Keep installer quick-install sources pinned to an explicit commit or release artifact, never a floating branch.
- Update CSP in `next.config.ts` before introducing new browser-side external origins.
- Map v1 (`az.tmj`) is read-only and must not be modified.
- Map v2 (`Map4.tmj`) graves use server-side random sprite selection via `grave_gid` column.
- v1 and v2 graves share the `graves` table, partitioned by `map_version` column.
- All v2 tileset assets live under `public/map/pixellab/` and `public/map/tilesets/`.
- The TMX→TMJ conversion script lives at `scripts/convert-tmx-to-tmj.mjs`.

## References
- `docs/CLAUDE.md`
- `docs/agent-layer/README.md` - paused Agent Layer status
- `README.md`
- `docs/cli-auth-v1.sql`
- `docs/grave-slot-rpc.sql`
- `public/map/docs/CLAUDEMAP.md`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
