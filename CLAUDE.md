# VibeCemetery

Project guidance. Detailed reference: `docs/CLAUDE.md`.

## Product and release scope

- Next.js 16 / React 19 app with a GitHub scanner at `/` and the released Phaser cemetery at `/cemetery`.
- Production serves v2 at `/cemetery`. Existing graves and history are preserved. See `docs/v2-cutover-runbook.md` for current verification and operations.
- GitHub-owned repositories and local projects submitted by GitHub-approved coding agents receive normal graves. Project cremation is retired; its compatibility endpoint returns 410.
- The current account allowance is 4 graves plus one sharing slot, shared across project sources.
- Two of nine zones are open with 144 plots; the full-world target is 666. Further zones are planned around announced GRAVE burn checkpoints. Do not describe automatic unlocks or unpublished thresholds as implemented.
- GRAVE tributes are voluntary Base transfers to the existing burn address. The v2 cemetery uses the existing verified burn/recovery flow; no payout, claim or extra slot is awarded.
- GitLawb / Agent Ash remains paused. The current local-project flow starts from the site's agent instructions and needs no skill installation.

## Commands

- Development: `npm run dev`
- Typecheck: `npx tsc --noEmit --incremental false`
- Unit suite: `npm run test:unit`
- Mocked v2 browser scenarios and retirement redirects: `npm run test:web3-e2e`
- Lint / build: `npm run lint` / `npm run build`
- Do not run the broad API smoke suite against a production database. Browser burial and wallet tests must use fixtures.

## Implementation rules

- Preserve the Cinzel/stone visual language. Reuse the existing UI components and CSS modules where present.
- Scan only the authenticated GitHub account. Preserve repository ownership, fork, project-content and 7-day inactivity checks.
- Use parsed map slots; never hardcode grave placement. Persist v2 `grave_gid` at creation.
- Keep the shared `create_grave_once` account lock, quota and idempotency behavior. Placement is scoped by `map_version`.
- Preserve browser-approved CLI auth and hashed tokens. Enforce security in code, not only in documentation.
- Keep the burial ceremony and retained minimap state working after resize and late mounting.
- Burn recovery never counts an unverified transfer. Candidate hashes go through the same receipt, signature, sender, amount and canonical-block checks.
- `public/` contains served assets. Keep art experiments, manifests, prompts, reference crops and diagnostics outside it.
- `.local-archive/` is local and ignored. Do not commit its contents or environment files.
- Keep external source packages and private archives outside Git. The two generated v2 planning/mask PNGs are explicitly included because the loader requires them.
- Edit v2 runtime data in `public/map/cemetery-v2.tmj`; use `scripts/convert-tmx-to-tmj.mjs` if starting from TMX.
- Update CSP when introducing a new browser-side external origin.

## References

- `docs/setup.md` — contributor setup and migrations.
- `docs/map2.md` — current v2 rendering, assets and camera contract.
- `docs/web3-grave-burn-mvp.md` — current burn and recovery behavior.
- `docs/unified-burial-setup.md` — schema upgrade order.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
