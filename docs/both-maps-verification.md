# Both-map cleanup and v1 fix synchronization

Updated 2026-09-07. This report covers the local cleanup and synchronization with production v1 commit `9010b01`, based on v2 branch commit `ac0440b`.

## Scope

- Preserve 71 runtime PixelLab images; remove 191 experiment/preview/metadata files from the served directory. Originals and ten ignored ad-hoc diagnostics remain in `.local-archive/v2-cleanup-2026-09-07/` on the working machine.
- Include the two generated planning/mask PNGs required by v2, without exposing the licensed v1 tilesets.
- Update stale map/release/agent documentation and retain current migration instructions.
- Carry the v1 red Bury, bottom chat, ledger styling, whole GRAVE amounts, Tributes sorting and FAQ corrections into shared components.
- Carry minimum/exact-MAX handling, unknown-hash recovery, precision fixes, expiry maintenance and reorg verification into both maps.
- Keep map-specific geometry, fog, minimap projection, grave placement and shared account limits.
- Default the agent helper and its production-facing instructions to v1 while accepting an explicit v2 selection for development.

## Verification contract

The unit suite uses inert credentials and covers API, amount, verification, recovery, database-function and map behavior. Browser tests explicitly override application credentials, including values Next.js would otherwise load from `.env.local`, and mock all application API writes and wallet/RPC operations. They run burial, ledgers, responsive UI, wallet rejection and lost-broadcast recovery independently on v1 and v2. Runtime assets remain real local images. A clean checkout without the licensed v1 PNGs can use `PLAYWRIGHT_TILESET_BASE_URL` for public image GETs only.

No production database updates, posts, actual burials or real token transfers are performed. Git history and remote branches are unchanged by the local source cleanup.

## Release state

Production was verified at `9010b01`; v2 Preview at `ac0440b`. The primary-domain `/cemetery/v2` returned 404. Pushing the development branch would update its Preview, not automatically make v2 the production map. Old artifacts remain in existing Git history until a separately authorized history cleanup.
## Test results

- Full repeated hermetic unit suite: 489 passed, 0 failed, 0 skipped, including the final agent default and strengthened asset checks.
- Final repeated browser run on both maps: all 19 scenarios passed in one run, 0 failed, 0 skipped, 0 flaky. This includes the minimap's second responsive remount, burial, both ledgers, wallet rejection and unknown-hash recovery after reload.
- Agent helper/instruction regression suite: 32 passed after correcting the default map to v1, including explicit-v2 support and the helper checksum served with instructions.
- Desktop and mobile Necropolis/Crematory screenshots were visually inspected. Amounts, centered headings, Tributes sorting, bottom chat and red Bury follow the v1 corrections.
- Initial production compilation succeeded but type checking detected a duplicated tail in the generated `.next/dev/types/routes.d.ts`. Only that generated dev-type cache was cleared; the clean build and standalone TypeScript check then passed. No source check was disabled.
- Production build passed after the agent correction. The subsequent review changed test configuration, asset validation and documentation only. Standalone TypeScript and ESLint were rerun successfully after those changes; `git diff --check` passed.

## Recheck findings

- Fixed browser-test isolation: deleting inherited environment keys allowed Next.js to restore them from `.env.local`. Explicit inert overrides now win. A separate process with a synthetic `.env.local` confirmed all 13 checked service settings stayed isolated.
- The first isolated browser run exposed Chromium's block on port 9 for v1 image requests. The test image origin now uses the local app port; the complete 19-scenario rerun passed. Public image fallback configuration is independent of application API credentials.
- The v2 asset test now checks loader/TMJ agreement, PNG signatures and dimensions, and Git eligibility. All 74 runtime PNGs are available for shipment, including the two generated planning/mask images.
- Independently checked the cleanup: 71 retained PixelLab PNGs are byte-identical to HEAD, exactly 191 tracked files were removed, and no remaining tracked or non-ignored text files reference those removed paths. Ported files differ from v1 only for documented dual-map adaptations and the updated runbook context.
- The existing REKT specification is unchanged; the production v1 worktree is clean. No additional runtime defect was found in the reviewed synchronization.

Logs, JSON reports, screenshots and archived originals are local under `.local-archive/v2-cleanup-2026-09-07/`; that directory is excluded from Git, TypeScript and ESLint. The final build uses inert service/RPC settings, not production credentials.
