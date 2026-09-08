# GRAVE burn release checks

This filename remains stable for existing migration references. The current cemetery uses verified GRAVE tributes on Base; see [the burn contract](web3-grave-burn-mvp.md) and [setup](setup.md).

## Release unit

A burn release combines an exact application commit, any missing additive database migrations, environment configuration and an immutable deployment. No new Solidity contract is deployed. The user signs a grave-specific intent and confirms a transfer of the existing GRAVE token.

Preview may share a database with production. Verify the target before applying SQL; a Preview label alone does not isolate database writes.

## Configuration

| Variable | Purpose |
| --- | --- |
| `WEB3_GRAVE_BURNS_ENABLED` | Authoritative server write flag |
| `NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED` | Build-time grave tribute UI flag |
| `BASE_RPC_URL` | Private server-side Base Mainnet RPC |
| `NEXT_PUBLIC_BASE_READ_RPC_URL` | Optional browser-safe read endpoint |
| `GRAVE_BURN_REVERIFY_SECRET` | Authentication for manual/external reverify |
| `CRON_SECRET` | Authentication sent by Vercel Cron |

Production has the tribute flow enabled. Fresh environments default both flags to false until verification is complete. Keep authenticated RPC URLs and reverify secrets server-only. Never copy credential values into issues, source, build logs or release receipts.

## Database preflight

1. Inspect installed tables, columns, constraints and RPC signatures; preserve a fresh private export before changes.
2. Apply only missing prerequisites in the documented order: `web3-grave-burn-mvp.sql`, `web3-grave-burn-v1-finish.sql`, then `web3-grave-burn-hash-recovery.sql`.
3. Preserve existing intents and burns. Follow the shared burial upgrade guide for quota and ledger functions.
4. Confirm unique transaction binding, restricted RPC permissions and exact numeric accounting.
5. Keep cleanup SQL separate from deployment. Never reset verified records to make a smoke test pass.

## Verification

Run TypeScript, lint, the production build and relevant unit/API/SQL tests. Use the mocked browser suite for wallet acceptance: it intercepts writes and transfers no real tokens.

Cover wrong chain/token/sender/recipient/amount, bad signatures, expired intents, duplicate transactions, replay, pending receipts, lost broadcast responses, ambiguous recovery candidates and canonical-block changes. Successful results must agree between per-grave stats and the global ledger without floating-point conversion.

Check the grave modal and Crematory on desktop/mobile, wallet rejection and reload/recovery. The supply bar must show unavailability when RPC fails; it must not invent a zero balance.

Any live token transfer is irreversible and requires the wallet owner's explicit action. A read-only production check must not create a burial, authorize an intent, send a transfer or invoke a mutating maintenance endpoint.

## Deployment and observation

Verify Preview first, publish the tested commit and confirm the production alias. Preserve the exact commit/deployment, check results and known limitations privately.

The configured reverify schedule is daily at 03:00 UTC. Confirm its actual execution from available logs or operational records; a schedule alone is not evidence of success. The protected reverify endpoint may update burn records, so do not invoke it during read-only monitoring.

Track API errors, recovery failures and exact verified totals. If a discrepancy is confirmed, preserve evidence and notify the operator before changing flags or data.
