# V1 simplification release — 2026-09-06

Prepared separately from production commit `6b042f2`; the v2 development branch is not merged.

## Scope

- Normal graves for GitHub-approved local agents and GitHub repository burials, with the existing epitaph and share flow.
- Atomic shared 4 + 1 account allowance and safe recovery of repeated local requests.
- Project cremation UI removed; Necropolis receives offering totals and Crematory becomes the verified token ledger with supply information.
- Agent instructions replace the installed bury skill and target v1. Unpublished map versions are rejected by the helper and public grave API.
- Atomic Redis counter/expiry fix.
- Production burn minimums, presets, pending-transfer guards and lost-transaction recovery remain intact.
- No `/cemetery/v2` route, v2 assets or map-switch control. SQL namespace compatibility remains because those additive migrations are already applied to the shared database.

## Verification

- 441 unit tests passed, including actual SQL execution, authentication, quota/replay, v1 release boundaries and existing burn recovery tests.
- 9 browser scenarios passed: Necropolis retry, burial pending-write guard, shared limit, local grave, actual Crematory building/mobile layout, no v2 route, HUD/FAQ, verified wallet offering and recovery after reload. Writes and wallet transfers were mocked.
- Production build, TypeScript and full ESLint passed. The pre-existing unprocessed `@theme` CSS warning remains; the baseline repository has no tracked PostCSS config. Map/HUD/modal screenshots and interactions were checked.
- Production build manifest contains v1 only. All three instruction route traces include the helper.
- Read-only production-build smoke against the migrated Supabase database: 9 existing graves, no private project hashes in public responses, 4 verified offerings and preserved total `25263442113724649798733865` raw units. Instructions/helper return 200 with matching SHA-256; v2 returns 404, v2 API requests 400, unauthenticated account requests 401 and retired cremation API 410. Local smoke used an isolated in-memory rate limiter after the shared Redis bucket returned 429.
- No local credential values were found in the selected changes. Private configuration and licensed local textures remain ignored.

No database records were deleted or real token transfers made. Legacy cremation storage cleanup remains a separate post-deployment step requiring its current export.
