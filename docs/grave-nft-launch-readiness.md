# Grave NFT launch readiness — 2026-09-23

Scope: project graves only. REKT burial and the 50/25/25 token model are outside this release. NFT claims are free after a real burial; GRAVE tributes remain voluntary. Robinhood Chain hosts the NFT, while GRAVE remains on Base.

This is the 2026-09-23 audit of the then-current code. The [2026-09-25 contract target design](grave-nft-contract-spec.md) supersedes its product assumptions: one GitHub and one agent-assisted local primary claim per account, a fixed 666-plot ceiling, same-plot reservation after exhumation, and first expansion on either 1B new GRAVE sent to the sink or full allocation of the current stage. None of those changes is implemented by the audit results below.

## What was verified

| Area | Evidence | Status |
| --- | --- | --- |
| Production site | `/cemetery` loaded in the browser on 2026-09-23; 9 graves were visible in the counter | Live smoke check passed, not a capacity test |
| Map assets | `npm run check:v2-bundle` audited 74 committed map images and the production bundle | Passed |
| Current plots | `tests/map-slots.spec.ts` confirmed all 144 approved v2 slots and full-map behavior | Passed |
| Burial limits | `tests/unified-burials.spec.ts` confirmed the shared 4 + 1 account allowance, collision rollback and idempotent local retries | Passed |
| Share card | A production grave's 1200 × 630 OpenGraph image rendered and was legible; share metadata and layout tests passed | Pass for a short name/cause; long custom causes need a visual check |
| Map/ceremony runtime | `npm run test:v2-runtime` passed 10 isolated browser cases, including mobile camera sizes, carried ceremony and texture reconciliation | Passed in fixtures; live burial was not performed |
| Build | `npm run build` completed with TypeScript and 38 generated static pages using placeholder build environment values | Passed; production secrets were not copied |
| Hosting dashboard | Vercel confirmed the current `vibecemetery.app` production deployment `ARVyCHLmUuoQKQvduDAeFbhvNwKG` from commit `9c48c54` | Plan headroom, usage and error rate remain unverified |

The map has a consistent pixel/stone style. At 9 graves, the entrance and some paths still look sparse. Before promotion, inspect a fixture with 144 populated plots on desktop and mobile; the present production view cannot show whether a full cemetery remains readable.

The preserved [live production screenshot](images/production-live-2026-09-22.png) records the low-density entrance state used in this review.

## Remaining launch gates

1. **Hosting capacity.** The repository shows Vercel hosting and Supabase, but contains no evidence of the production plan, headroom, function error rate, database capacity, bandwidth budget or CDN hit rate. Review those dashboards and run a staged traffic test with the expected launch mix: page views, map assets, grave-card crawler requests, GitHub scans, and burial attempts. Do not load-test production writes.
2. **Shared rate limits.** `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are optional in setup. The code falls back to per-process memory if absent or unavailable, which is not a reliable global limit on serverless instances. Verify production configuration and alert on fallback before a promotion.
3. **GitHub API headroom.** A scan can fetch repository pages and project contents; burial verifies both again. Confirm the production GitHub token, its observed rate budget, and behavior under a burst of simultaneous scans.
4. **Full-world reads.** The client loads all current-map graves in one request. The prior API default/cap of 500 would hide plots beyond row 500 after opening the full 666-place world. This checkout now sets both to 666; deploy and test the full fixture before unlocking future zones.
   The same endpoint fetches every matching `f_votes` row to recalculate F counts. That adds work to every map load and can truncate counts at Supabase's response row limit. Replace it with a database aggregate or reliable maintained counters before a traffic campaign.
5. **Share cards.** Check the live image on X and other preview scrapers, including long repository names and custom causes. The currently rendered production example is readable, but this does not establish every text length fits.
6. **Copy and ritual.** Several random gravedigger lines and epitaphs that mocked the project or author were softened in this checkout against `src/gravedigger/character.md`. Run a complete staged burial, from scanner through camera movement, grave reveal, automatically opened memorial and share action, with desktop and mobile screen recordings. Existing epitaphs stored in the database will retain their old wording unless migrated.
7. **No-slot state.** Verify the 144th burial, the 145th rejection, concurrent attempts for the final plot, and the user-facing path to secondary NFT listings or a waitlist. The current account quota and map capacity are separate checks. For the target design, reserved plots and unclaimed graves must count as unavailable when testing the full-allocation zone trigger.
8. **Product focus.** This branch starts from the exact production commit and contains no REKT beta flow. Keep future REKT changes isolated unless explicitly selected.

## Proposed release order

1. Finish the gates above and capture baseline metrics on the current site.
2. Add the NFT claim and exhumation data model, event indexer and wallet-to-GitHub binding behind feature flags.
3. Audit the draft in [`../contracts/GravePlotNFT.sol`](../contracts/GravePlotNFT.sol), deploy it to Robinhood Chain testnet, and run mint, transfer, owner-only burn, reservation, reburial, signer-rotation and reorg tests. `npm run check:grave-nft` verifies compilation; it is not a contract behavior test.
4. Test secondary-market support and actual creator-earnings behavior on Robinhood Chain. Decide the royalty/buyback policy before making any public revenue promise; publish receipts and Base buyback/burn transactions only if that policy is adopted.
5. Open claims to existing grave authors first. Enable public claims after the migration reconciles every existing occupied slot.

The contract design is specified in [`grave-nft-contract-spec.md`](grave-nft-contract-spec.md). The source compiles locally but is not audited or deployed; no site claim, event indexer or database migration is implemented by this audit.
