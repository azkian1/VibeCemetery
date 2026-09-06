# Supabase simplification rollout — 2026-09-06

Target verified against `.env.local`: project `vibecemetery`, ref `lnyfogihvackjwhdvgzo`, branch `main`.

## Applied

The SQL Editor ran these files together in a transaction with lock/statement timeouts and assertions that existing records were unchanged:

1. `map-v2-grave-gid.sql` — the live database already had map namespaces, but lacked `grave_gid`.
2. `unified-burials.sql` — local grave identity, shared atomic 4 + 1 allowance and retries. The live users table also lacked `updated_at`; the migration now adds it idempotently. The upgrade regression test reproduces this older schema.
3. `offering-ledger.sql` — verified token offering totals, author receipts and recent transactions.

PostgREST schema reload was requested. The existing map-version migration was not replayed, since its constraint was already present. Existing Web3 and CLI auth tables were also present.

[Saved migration in Supabase](https://supabase.com/dashboard/project/lnyfogihvackjwhdvgzo/sql/e6479432-18a9-4499-850f-5865f2d7fe76)

## Verified on the connected database

- Before/after: **9 graves, 9 users, 8 legacy cremations, 4 token offering records**.
- Existing grave fingerprint, excluding the newly added fields, remained `94499164ca513b7ef476636cfb362289`.
- Verified offering sum remained `25263442113724649798733865` raw token units.
- A transaction running as `service_role` created a temporary fixture account and exercised local/GitHub graves across both maps, a replay at quota with slot zero, the four-slot limit, one share unlock, rejection of a sixth grave, private-hash exclusion and the exact account counter. **All checks passed and every fixture write was rolled back.** No production account was modified by this probe.
- `create_grave_once` is executable by `service_role`, not `anon` or `authenticated`. Anonymous execution of the ledger RPC is also denied; public data continues through application endpoints.
- Nine focused local SQL tests passed after adding compatibility for the older users table.

[Saved rollback-only verification in Supabase](https://supabase.com/dashboard/project/lnyfogihvackjwhdvgzo/sql/dff78707-a673-4e22-9a74-05989cd9a080)

Local application requests against the migrated database returned:

| Endpoint | Result |
| --- | --- |
| `/api/graves?map_version=v1` | 200, 9 records, no `project_key` |
| `/api/graves?map_version=v2` | 200, empty map, no preview records |
| `/api/offerings` | 200, 4 verified offerings and the exact preserved total |
| `/api/offerings?supply=1` | 200, ledger available, supply unavailable with current local configuration |
| `/api/graves/account` without credentials | 401 |

## Still pending

- Deploy the new application. At the time of this rollout the public site's `/api/cremated` still returned 200 and `/agent-instructions.md` returned 404, so the old application was still live.
- After cutover, export the current `cremated` contents and execute `retire-project-cremations.sql`. It has **not** been applied: removing its table/RPCs now would break the deployed old application. No legacy records were deleted or exported during this additive rollout.
- Smoke-test the complete real GitHub browser approval and agent/API submission path after cutover. The live database RPC was tested transactionally; no persistent test burial or wallet transfer was made.
- Local `.env.local` has no `BASE_RPC_URL` or Web3 feature flags configured. This is why the supply bar returns unavailable. The ledger itself is working. Production environment values were not inspected or changed.

No commit, push or application deployment was performed in this rollout.
