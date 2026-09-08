# V2 release verification and operations

The live cemetery is served at `/cemetery`. Two of nine zones are open, with 144 approved plots and a 666-grave master plan. See [map2.md](map2.md).

## Deployed behavior

The audit follow-up was released on 2026-09-08 in commit `2fc6bb8`: zoom-aware camera projection, preserved ceremony sprite GIDs and sequential asset-error recovery. Local validation covered 518 unit tests, nine isolated Phaser runtime checks and 18 application browser scenarios. Production validation covered 115 read-only HTTP checks, including all 74 map images, plus desktop/mobile UI checks.

Later releases must repeat the checks relevant to their changes. Record exact commits, immutable deployments and results in private operator receipts.

## Before a release

1. Review the complete diff and publication file list. Keep credentials, exports, local drafts and temporary diagnostics out of Git and public hosting.
2. Run TypeScript, lint, relevant unit/runtime/browser tests, the production build and `npm run check:v2-bundle`.
3. Check grave links, actual sprite clicks, Find on Map at normal and close zoom, ceremony/reload, modal stacks, HUD, chat and minimap on desktop/mobile.
4. Verify a Preview of the exact candidate, then publish within the owner's authorized release scope.
5. Confirm the production deployment points to that commit and repeat read-only checks.

Before schema or placement changes, preserve a fresh private export. Compare complete UUID sets, memorial fields, compatible unique slots, sprite GIDs, account quotas, F history and exact verified GRAVE totals.

## Observation

The initial observation window ends at 2026-09-10T17:36:38.438Z. The existing local monitor performs read-only checks every four hours and reports meaningful failures or the final result; it requires the operator's machine and desktop app.

The original baseline is immutable. Explicitly approved fixture removals and relocations have separate checksummed manifests and receipts. Keep all other historical data under strict comparison and account for legitimate new activity.

Observe grave API failures, collisions, asset errors, links, tribute totals, reverify and separate Database/Storage egress. The reverify job is scheduled daily at 03:00 UTC. A passing HTTP check does not prove the job ran; record unavailable log history and metric gaps.

## Assets and recovery

All 74 map images are committed under `public/map/` and served by the application host/CDN. The runtime has no Storage tileset dependency. Retired public asset URLs return errors; historical grave routes retain redirects.

Recovery copies are private. A closed bucket is not an empty bucket. Verify its actual contents and archive checksums before any separately authorized permanent deletion. The read-only monitor never changes buckets, data, permissions or deployments.

If UUIDs, history or exact totals diverge, repeat the read to rule out concurrent activity, preserve evidence and notify the operator. Do not hide a discrepancy by changing the baseline or automatically modifying production.
