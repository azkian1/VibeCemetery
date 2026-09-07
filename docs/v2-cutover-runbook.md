# v2 cutover release candidate

Status: local implementation and read-only live preflight complete; Preview publication, production migration and deployment are pending.
Baseline: `af1eab7` (`codex/map2-unification`). Work branch: `codex/v2-cutover`.
The pre-existing `docs/rekt-product-spec.md` draft is outside this change.

## Implemented

- `/cemetery` renders v2. Both versioned routes return 308 and preserve query parameters.
- Home scanner, browser burial, OAuth callback, shared modal state and local helper use v2.
- Omitted API versions default to v2; explicit v1 GET/POST returns 410 with `CEMETERY_VERSION_RETIRED`.
- UUID share pages retain their server-side lookup and metadata. Invalid/missing UUIDs return 404.
- The shared modal layer no longer imports the v1 scene into the home/client bundle.
- The API supports `CEMETERY_BURIALS_PAUSED=true`; an independent database gate also protects old deployments.
- Offline manifest tooling generates deterministic placements, a review table, rollback-only SQL and restoration SQL.
- SQL asserts complete memorial/UUID identity, unchanged existing v2 graves, related records, account counters, share unlocks and exact numeric offering totals.

The v1 shell, scene, utilities and `public/map/az.tmj` remain in the checkout for the pre-migration preservation requirement. They are not imported by the public page tree. Do not mistake local code readiness for a completed production retirement.

## Before production writes

1. Deploy this branch only to an isolated Preview. Use the mocked browser suite or staging data; do not point a persistent test burial at production. Vercel Preview burials are paused by default even when it inherits production credentials. Only set `CEMETERY_BURIALS_PAUSED=false` on a Preview after isolating its database. This gate covers burial creation; other UI writes must still be mocked.
2. Verify the target Supabase project against `docs/supabase-simplification-rollout.md`. Verify required schema/RPCs again; that document's counts are historical.
3. Inventory the actual v1 Storage objects and ownership. Save licensed originals and purchase records to a private directory outside Git/public hosting.
4. Apply `docs/v2-cutover-write-gate.sql`. It is additive and leaves existing behavior unchanged. Confirm only the operator can modify the gate.
5. Close the gate with `UPDATE public.cemetery_write_control SET burials_paused=true WHERE singleton;`. Its lock waits for in-flight inserts. Optionally also set the API environment flag on the deployment.
6. Save a full private database export (including graves, users, votes, intents and burns), plus SHA-256 checksums of the export files. No backup belongs in Git or `public/`.
7. Run `scripts/v2-cutover/snapshot.sql` and save its single JSON value outside the repository as `snapshot.json`. It uses a read-only, repeatable-read transaction and PostgreSQL fingerprints; large token amounts are decimal strings. Snapshot and migration transactions set their local timezone to UTC so the operator's session cannot change timestamp fingerprints.

## Build and review a manifest

The offline CLI needs Node 22.18+ (tested with Node 24). It never opens a database connection, executes SQL, or overwrites an output file.

```powershell
npm run cutover -- plan C:/private/v2/snapshot.json C:/private/v2/plan
npm run cutover -- validate C:/private/v2/snapshot.json C:/private/v2/plan/manifest.json
```

By default, graves are ordered by creation time and UUID; free authored slots are ordered top-to-bottom, then left-to-right. Occupied, decorative and special slots are excluded. Review the founder area using `placements.tsv` and the current v2 map. To choose a different visual order, rerun `plan` into a new private directory with `--slots=ID,ID,...` (one slot per v1 grave). Never edit the TMJ after manifest review without regenerating it.

Run the generated `dry-run.sql` in the SQL editor. It locks relevant tables briefly, requires the closed database gate and matching fingerprints, exercises the migration, verifies all invariants and **rolls back**. Any legitimate F/burn/account update since the snapshot requires a fresh snapshot and manifest; never remove a failing assertion to force a release.

When the backup, placement review and dry run are accepted, generate the exact commit transaction:

```powershell
npm run cutover -- sql C:/private/v2/snapshot.json C:/private/v2/plan/manifest.json C:/private/v2/apply --commit
```

Review `apply.sql` before execution. Only `map_version`, `slot_id` and `grave_gid` change on graves. The transaction also changes the default namespace to v2 and makes the database reject future explicit v1 inserts. It leaves the burial gate **closed**. A statement failure requires ROLLBACK, never a manual COMMIT of a partially executed script.

## Release and retirement

1. Verify every snapshot UUID against the migrated database and Preview: correct name, epitaph, placement, F and GRAVE totals, and the original `/grave/[uuid]` link. Include desktop/mobile, GitHub callback, profile, Necropolis, meta memorial and the offering ledger. Reconcile full UUID sets, not only counts.
2. Deploy the v2 application, run the same smoke on the production domain and check fresh-cache asset requests. Use an explicitly agreed project if a persistent test burial is needed. No real token transfer is part of this workflow.
3. Reopen the database gate and clear any API environment pause only after production smoke. Verify new graves are v2 with compatible GIDs and complete create → ceremony → reload → share.
4. Only after every old grave is verified, privatize the inventoried v1 Storage. Run cold-cache smoke again.
5. Remove the now-unused v1 shell, canvas, scene, config, parser/utilities/tests and `public/map/az.tmj` in a follow-up retirement commit. Rebuild and run the bundle audit. Remove any local licensed PNGs from the publishable `public/` tree after verifying the private archive.
6. After the recovery window, delete only confirmed v1 Storage objects. Observe API errors, UUID links, token totals and Storage egress for 72 hours. No monitoring automation was installed by this code change.

## Emergency recovery

Close the database burial gate. Use a maintenance deployment or a previously verified v2 deployment; never automatically restore the public v1 map. `restore-dry-run.sql` checks each new placement and restores only its manifest old fields. It ends with ROLLBACK. An operator must review the data/state before explicitly committing restoration. It retains the closed gate and retirement policy, and does not rewrite F, burns, users or post-cutover graves.

## Local verification

```powershell
npm run test:unit
npx tsc --noEmit --incremental false
npm run lint
npm run build
npm run check:v2-bundle
npm run test:web3-e2e
git diff --check
```

Baseline passed before runtime edits: 489 unit tests, 19 mocked browser tests, TypeScript, lint and production build.

Candidate verification on 2026-09-07: full unit suite 502/502, followed by 35/35 focused tests including two additional collision/gate cases; mocked browser suite 18/18 (OAuth callback, F/profile, ceremony/reload, redirects, mobile, ledger and wallet recovery). TypeScript, lint and production build pass. All 53 production client chunks pass the v1-asset audit. No production data or Storage changes, deployment, or real token transfer was performed.

## Read-only live preflight — 2026-09-07

- The authenticated dashboard confirms the existing Vercel production deployment uses `master` commit `9010b01`. The Supabase target is `lnyfogihvackjwhdvgzo`, `main`.
- Fresh inventory: 9 graves, all v1; no occupied v2 slots; 9 users, 7 F votes, 7 burn intents and 4 burns. The verified offering total remains `25263442113724649798733865` raw units. The new database gate is not installed.
- All 11 public application tables were exported as raw JSON outside Git. A local PostgreSQL check reproduced the live fingerprints of all five protected tables and verified the exact token total. This is a preflight data export, not a schema backup or the required fresh export after gate closure.
- A local PostgreSQL rehearsal imported the real records, including historical `users.id`, `cremated_count` and the existing burn-recovery fields. The migration passed for all 9 UUIDs with unchanged memorial fields, F, burn history, account counters and token totals. This did not execute migration SQL on the live database.
- The private archive contains 196 original package/map files verified against their source SHA-256 values, plus copies of all 10 inventoried `tilesets` Storage objects (8,231,789 bytes) with separate checksums. The two original ZIPs and terms-of-use documents are included; a separate purchase receipt has not been located.
- A deterministic placement manifest and rollback-only SQL were generated privately. Regenerate the snapshot/manifest after closing the gate; the preliminary artifacts are not authorization to commit a production migration.
- The Preview default pause passed 14 focused API/maintenance tests; the updated application build and its 53 client chunks passed. Migration coverage also checks a non-UTC operator session and the legacy account/recovery fields.
- Git push for the Preview was rejected by automatic approval review pending explicit permission to publish source and documentation to the existing GitHub repository. No push, deployment, live database mutation or Storage access change has occurred. A failed attempt to add a branch-specific Preview variable was discarded; Vercel environment values remain unchanged.

## Local visual review of the real manifest

The operator-only browser review consumes the private rehearsal files: `inventory-snapshot.json`, `preliminary-plan-utc/manifest.json`, `rehearsal-v2-graves.json` and `read-only-export/{graves,grave_burns}.json`. It validates the manifest and complete memorial fields before running the app with inert credentials. Every API is mocked; external requests, v1 assets and HTTP writes fail the review. Private project hashes are excluded from the browser payload.

```powershell
$env:CUTOVER_REVIEW_DIR = 'C:/private/v2-cutover'
npx playwright test -c scripts/v2-cutover/review.config.ts --max-failures=1
```

Screenshots stay in `browser-review` under the private input directory, outside Git. The canvas reports its camera position through DOM attributes so the review can click the actual slot at any zoom or terrain boundary without exposing the Phaser instance.

Verified on 2026-09-07: 18/18 scenarios passed for all 9 real UUIDs at desktop (1280px) and mobile (390px) widths. Each scenario checks the canonical grave query, epitaph, F count, whole-token GRAVE display, Find on Map and a pointer click reopening the same memorial. Desktop and mobile screenshots were visually inspected. This remains a local rehearsal; it does not replace the required post-migration checks of every live `/grave/[uuid]` URL on Preview and production.
