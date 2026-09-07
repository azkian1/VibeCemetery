# v2 cutover release candidate

Status: v2 is live in production with 144 approved active slots. All nine old graves are migrated and verified on Preview and production. Burial writes are open for v2 and rejected for v1. A controlled new burial, Storage privatization, source/asset retirement and the observation window remain pending.
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

## Manual local review before considering a push — 2026-09-07

The user requested manual local review and another verification pass before considering a push. Publication remains deferred.

The local browser review used the actual Next.js application with inert credentials, a loopback PostgREST fixture containing the nine migrated public memorials, and in-memory API fixtures for account, GitHub scan, F and burial writes. The real graves GET route and server-side UUID share lookup ran against that fixture. No production database, OAuth session, wallet transaction or external share publication was used.

Manually verified in the browser:

- The canonical map loads all nine memorials; FAQ, Necropolis, author filtering, epitaph and Find on Map work. Clicking the relocated gravestone reopens the same memorial.
- An F vote updates the local copy once, disables a second vote, and remains visible after navigation. Existing whole-token GRAVE totals remain visible.
- Both legacy cemetery aliases redirect to the canonical route; the v1 grave link preserves its UUID and repeated query parameters. A real memorial's `/grave/[uuid]` link opens the correct v2 epitaph.
- At 390px width, the long memorial title and controls fit; Find on Map and zoom work. The separate meta memorial opens without occupying a normal grave slot.
- Home scanner → selected test repository → cause of death → burial → ceremony → epitaph completes. Exactly one local POST creates a compatible v2 grave. Its UUID link and page reload reopen it; the total changes from 9 to 10.
- The real GET endpoint returns only v2 public fields. Explicit v1 reads return 410; malformed and missing UUID links return 404. The local request log contains no legacy map or Storage asset requests, and the inspected browser console contains no errors or warnings.

The temporary harness stays in ignored `.local-archive`; its request evidence stays in the private cutover directory. These fixtures verify local application behavior, not live authentication, production writes, external sharing or production cutover readiness.

After the manual review, the full unit suite passed 507/507 and the mocked browser suite passed 18/18. TypeScript, lint and the production build passed again; all 53 client chunks passed the v1-asset audit. No runtime code changes were needed as a result of this review. The loopback review server was reset to the nine original migrated fixtures for the user's own inspection.

Follow-up building corrections: the lodge opens a caretaker notice, the two eastern sprites share one Crematory hitbox, and the main gate and adjacent fence have no interactive slots. The chapel still opens The Crypt. Manual clicks verified the lodge, both crematory wings, chapel, gate and both fence sides; the notice fits at 390px. All 10 focused map tests, TypeScript, lint, build and the updated 54-chunk asset audit passed. Publication remains deferred.

## Authorized release preflight — 2026-09-07

The user subsequently authorized branch publication, production migration/deployment, and retirement after successful verification. The earlier publication deferral no longer applies.

- Published `codex/v2-cutover` at `3f9512b`. [Vercel Preview](https://vercel.com/azats-projects-db37144a/vibecemetery/FphVEwkrohG86fjb4jmPJJAr9bbU) is Ready; the production domain still serves `master` commit `9010b01`.
- Manually checked the published v2 map, desktop HUD/mobile controls, FAQ, Necropolis with real offering totals, the v1 route alias with preserved query parameters, and the meta memorial. The observed asset inventory contains the v2 TMJ and 74 images, no v1 map/Storage requests, and no browser errors or warnings. Existing grave placement and real writes still require the post-migration checks.
- A fresh live read-only query confirmed nine v1 graves, zero v2 graves, nine users, seven F votes, seven intents and four burns. Verified raw total remains `25263442113724649798733865`. The database burial gate is still absent.
- Re-exported all 11 public application tables as raw JSON, preserving exact numeric literals, plus Storage metadata and SHA-256 checksums into the private archive. The SQL schema export includes 153 columns, 13 functions, 57 constraints, indexes, triggers, permissions, policies and Storage metadata. This is a pre-gate backup; repeat the data export and snapshot after closing the gate immediately before migration.
- The newly added capacity requirements need a map-owner decision before migration: all 144 authored rectangles have unique IDs, supported footprints and no intersections; none are decorative/special objects and none has `zone_id`. The extra 24 therefore represent a difference from the 120-place concept, not duplicate or technical objects. An optional 120-active/24-reserve proposal was prepared privately; it has not changed the runtime. The user was asked whether to approve all 144 current slots or that proposal, and which real repository to use for the controlled production burial.
- No production database mutation, Storage permission change, real token transfer or production deployment has occurred during this release preflight.

The owner then approved all 144 authored slots, retaining the 666-place master target and reducing the combined future-zone budget to 522. The 120-active/24-reserve proposal is superseded. The audit and shared active-ID catalog are recorded in `docs/v2-slot-audit.md` and `src/lib/map-layout-v2.ts`. A concrete repository for the controlled production burial is still needed.

Validation after pinning the active slots: 508/508 unit tests, then 12/12 focused migration tests including the inherited-privileges regression, 18/18 isolated browser scenarios, TypeScript, lint and production build passed. All 54 client chunks pass the v1 asset audit.

Installed the additive database gate on the verified production project after the private backup. Live checks confirm `burials_paused=false`, `v1_retired=false`, nine unchanged graves, and service-role read access without write access to the gate. The SQL now explicitly revokes inherited service-role table privileges before granting SELECT, so default Supabase ACLs cannot let application credentials reopen it. Migration has not run yet.

## Production cutover — 2026-09-07

- The current production release is `f9c6f97b70b63bd337a2db49bda98042894ba1b8`, deployed from `master` without a force push. [Production deployment](https://vercel.com/azats-projects-db37144a/vibecemetery/AkTWYv6T5ydYXNtGdnmfcrQnKiLA) and [matching Preview](https://vercel.com/azats-projects-db37144a/vibecemetery/2ZJ44wh21zNL9bcFo2exJptzEW6y) are Ready.
- Production history had diverged through earlier squash/parallel development. Compared the candidate against `9010b01`: burn recovery, ledger components, CTA, chat, terminology, wallet runtime and the dependency lockfile already matched after the `af1eab7` port. Reviewed remaining backend differences as intentional v2 cutover changes. A history-only merge records both parents and keeps exactly the tested `06ff226` tree; its before/after tree hashes match.
- Closed the independent burial gate and saved a repeatable-read, read-only backup at `2026-09-07T14:02:33.216113Z`. The private export contains all 12 public tables, SQL schema/security definitions, Storage metadata, protected-table fingerprints and exact decimal amounts. Raw JSON and CSV, separate table files, the snapshot, manifest, restoration SQL and SHA-256 checksums remain outside Git.
- The live dry run passed every invariant and rolled back. A separate query confirmed nine v1 graves, zero v2 graves and the unchanged verified raw total after rollback. The committed SQL had an identical body to the rehearsed SQL; only its explanatory header and final transaction command differ.
- Applied the migration on `lnyfogihvackjwhdvgzo/main`: nine v2 graves, zero v1 graves, unique compatible slots/GIDs. A separate REST comparison checked every original field in all nine graves, nine users, seven F votes, seven burn intents and four burns against the backup. Only the three approved placement fields changed. Verified raw GRAVE remained `25263442113724649798733865`.
- Opened all nine original `/grave/[uuid]` links on the authenticated Preview. Canonical URL, project name, epitaph, F and GRAVE display matched for each one. Repeated all nine on production at 1280px and 390px. Public HTTP checks also verified each share page, per-grave offering endpoint, full UUID set and placement. Invalid and absent UUIDs returned 404; v1 reads returned 410; both old cemetery aliases returned 308 preserving query parameters, including repeated values.
- Manually checked production FAQ, Necropolis, author-filtered Crypt, nested memorial return, profile, meta memorial and Crematory/Tributes. After closing the full modal stack, the map accepts input, chat messages remain, chat collapse/expand works, and clicking an open area on the minimap moves the camera. Mobile Find on Map and zoom work.
- Reopened the database gate only after production smoke. Confirmed `burials_paused=false`, `v1_retired=true`, nine v2 graves. Existing deployments cannot create v1 graves.
- Performed one controlled F on the owner's `myvibe` grave: 0 → 1, persisted after reload, with the second vote disabled. This intentional post-migration check adds one F vote (7 → 8); it is not migration drift. No GRAVE transfer occurred. HTTP reconciliation at `2026-09-07T14:30:03Z` confirmed all nine UUIDs and the unchanged exact GRAVE total after that vote.
- A fresh production page inventory contained the v2 TMJ, 76 images, 28 scripts and no v1 map or Storage URLs. Inspected browser logs contained no errors or warnings. The initial production deployment still retains the old public files on disk until the retirement follow-up; absence of requests is not deletion.

### Remaining release gate

The signed-in profile shows one existing grave and four available account slots. The owner still needs to name the actual project for the controlled create → ceremony → reload → share-link check. Do not bury an arbitrary repository or send a real token transfer to complete this checklist.

After that check, privatize the inventoried `tilesets` bucket, verify cold-cache production again, and prepare the retirement commit. The specific legacy dependencies are `CemeteryApp.tsx`, `PhaserCanvas.tsx`, `game/config.ts`, `CemeteryScene.ts`, the v1 slot/tile utilities, and the v1 reader in `lib/map-slots.ts`. Update the mixed v1/v2 assertions in `phaser-resize`, `ceremony`, `grave-reconciliation` and `grave-burn-map-boundary` tests rather than deleting the v2 coverage. Remove `public/map/az.tmj` and only inventoried licensed public PNGs after checking their private copies. Rebuild, run the required tests and bundle audit, then publish the retirement commit.

Storage is still public and its ten objects are intact. No Storage deletion, source retirement or 72-hour monitoring automation has been performed as part of this cutover. Those remain required work; the original goal is not complete.
