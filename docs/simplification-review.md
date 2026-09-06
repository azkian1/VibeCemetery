# Simplification patch review — 2026-09-06

Scope: the working-tree simplification patch based on `b28a7f6`, reviewed before any connected Supabase migration. No deployment, commit, live database mutation or real token transfer was performed.

## Findings fixed

1. GitHub login from the v2 burial flow returned to v1. The callback now preserves the current map.
2. Grave deep links were marked handled before their delayed opening. If data refresh cancelled the timer, the grave could remain closed. Completion is recorded in the final timer; v2 also refuses to interpret an ordinary slot 105 as the v1 meta grave.
3. JavaScript accepted impossible calendar dates through normalization; reversed dates also passed validation. API and temporary helper now agree on actual calendar dates, timezone-qualified timestamps and birth/death ordering.
4. A CLI credential lookup failure looked like an invalid token. The client could discard working credentials. Storage failures now return a retryable 503; genuine missing/invalid authentication remains 401. Account responses are not cacheable.
5. Necropolis waited for optional Base supply reads. Ledger rows now have a separate cache, supply reads are requested only by Crematory, and a slow RPC cannot hide the transaction ledger. Concurrent requests share pending loads; client polling does not overlap.
6. Public grave responses used a private-field denylist. An explicit public-field allowlist now prevents future internal fields from leaking in creation/replay responses.
7. Remaining active operations/status guides still described project cremation or pinged its retired endpoint. They now describe graves and token offerings. Historical design archives remain explicitly historical.

## Verification completed

- `npm run test:unit`: **463 passed**. Includes real handler execution against an isolated PostgreSQL-compatible PGlite database, API validation and source/ownership boundaries, mixed local/GitHub quota across maps, replay at quota/full map, collision/counter rollback, exact verified burn aggregation, and helper privacy/recovery checks.
- Upgrade test starts from the actual previous schema snapshot, applies map and additive migrations twice, exercises 4 + 1 shared quota, then retires legacy records and applies RLS hardening. Existing graves, IDs, maps and counters remain consistent. Fresh-schema and retirement rerun checks pass as well.
- `npm run test:web3-e2e`: **7 passed**. Chromium covers Necropolis error/retry and exact received amounts; one submitted burial and pending-write dismissal guard; exhausted account allowance; local grave deep link; actual v2 Crematory building click and mobile layout; complete simulated wallet offering on each map.
- Browser API, GitHub and wallet/chain responses are controlled fixtures. Test burial requests never reach connected Supabase. The mobile Crematory screenshot was inspected.
- `npm run build` and `npx tsc --noEmit`: passed.
- Production trace manifests include the temporary helper for all three instruction routes. The served helper matches the SHA-256 in the served Markdown instructions. The normal development server was restored on port 3000.
- `npm run lint`: zero errors; one pre-existing unused-variable warning in `scripts/test_v2_final.mjs:50`.
- `git diff --check`: no whitespace errors. Git reports normal local LF/CRLF conversion notices.

The first browser run exposed fixture timing problems (React development effects and camera animation), which were corrected in the tests. The final full seven-test browser run passed.

## Connected-environment checks still pending

**Follow-up:** the user subsequently authorized Supabase SQL execution. Additive migrations and rollback-only live RPC checks are now complete; see [the rollout record](supabase-simplification-rollout.md). The paragraph below records the state at the end of the original review.

Supabase remains unchanged at the user's request. Local SQL execution does not establish the deployed schema, live RLS/grants, real OAuth state or network behavior. The current application requires the additive migrations; grave lists and the offering ledger can fail against the old schema.

Follow `unified-burial-setup.md`: verify the target, apply additive migrations, smoke-test an approved local burial/replay and shared quota, then cut over the application. Export legacy cremation records before the separate retirement migration. Preserve all graves and token offering records. Do not treat this review as a completed production cutover.
