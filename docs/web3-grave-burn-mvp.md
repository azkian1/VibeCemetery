# GRAVE tributes and transaction recovery

Current implementation reference, updated 2026-09-07. The released v1 fixes have been brought into the two-map development branch. This does not publish v2 or execute database migrations.

## Product behavior

A visitor can voluntarily send GRAVE to the configured burn address in memory of a grave. All tokens go directly to that address on Base mainnet (chain ID 8453). No new payout contract, grave-owner reward, claim, payment for burial or extra slot is involved. Transfers to the burn address do not reduce the ERC-20 contract's `totalSupply`.

Both development map shells support the flow. Production remains v1 until v2 is separately released. Wallet controls stay inside the grave modal and behind the server/client feature flags. Connecting a wallet does not create a GitHub account.

## User flow

1. Expand burn controls and connect the wallet.
2. Switch to Base if necessary.
3. Choose a preset or MAX. The current minimum is 1,000 GRAVE. MAX preserves the exact wallet balance, including token precision; UI totals may still display whole tokens.
4. Create a server intent for the exact grave, wallet and raw amount.
5. Sign the intent, then confirm the direct token transfer.
6. Verify the submitted transaction or recover its hash if the broadcast response was lost.
7. Show verified completion and highlight the grave only after verification.

A rejected wallet request is different from an unknown broadcast result. A safe user rejection clears the pending operation; an ambiguous result is preserved in local storage so a reload cannot accidentally encourage a duplicate transfer. The interface offers retry/recovery states instead of treating every transport error as a failed transfer.

## Verification and persistence

- Intents pin the chain, token, recipient, wallet, grave, amount, nonce and expiry.
- Authorization records a verified canonical block and signature.
- The verifier checks receipt success, token Transfer events, sender, recipient, exact amount, authorized interval, confirmations and canonical block hashes.
- Atomic intent/transaction binding prevents duplicate counting and competing grave claims.
- Missing receipts remain retryable without being counted as verified burns.
- PostgREST uint256 amounts and block numbers are selected as text; decimal precision must never pass through a JavaScript number.
- Public ledger data is derived from verified burns. Errors in the ledger produce a retry state, not a fabricated zero balance.
- Web writes retain strict body/field checks, same-origin validation and IP/wallet rate limits. Error logs omit credentials and provider payloads.

Configuration authority is `src/web3/config.ts`; server activation is validated in `src/lib/web3/burnConfig.ts`. Never put private RPC credentials in `NEXT_PUBLIC_*` variables.

## Unknown-hash recovery

`src/lib/web3/recoverBurnTx.ts` scans only the authorized intent's wallet-to-burn-address transfers in a bounded block interval, in chunks. Candidates must have the exact amount and then pass the normal submission verifier.

- One valid candidate can restore the hash and continue confirmation.
- No match while the valid interval is still open remains pending.
- A completed search with no possible remaining match can resolve safely without retrying a transfer automatically.
- Multiple candidates, conflicts or a rejected candidate require operator review rather than choosing a convenient transaction.
- Recovery works after reload and through the protected scheduled batch. Leases prevent concurrent batch workers from processing the same claim without coordination.
- Reorg checks can mark previously accepted records orphaned; only currently verified records contribute to totals.

## API and UI

- `POST /api/graves/[id]/burn-intents` — create an exact intent.
- `POST /api/graves/[id]/burn-intents/[intentId]/authorize` — verify the signed intent.
- `POST /api/graves/[id]/burn-intents/[intentId]/recover` — recover an unknown transaction hash.
- `POST /api/graves/[id]/burns` — submit the hash for independent verification.
- `GET /api/graves/[id]/burns` — verified grave totals and mourners.
- `/api/internal/grave-burns/reverify` — protected maintenance and recovery batch.
- `/api/offerings` — aggregate ledger and optional onchain supply snapshot.

The Crematory uses centered **Burned** and supply amount, plus a sortable **Tributes** table of graves. Necropolis displays **Burned ($GRAVE)** by grave author. These displays use whole tokens, while accounting retains the raw values. The account allowance remains independent of burns.

## Database installation and upgrades

For a database that does not yet have burn tables, apply `web3-grave-burn-mvp.sql`, then `web3-grave-burn-v1-finish.sql`, then `web3-grave-burn-hash-recovery.sql`. The filename `v1-finish` records the original burn rollout, not a restriction to one map.

For an existing database, first inspect which tables, columns and RPCs are already installed. Follow the preflight in `web3-grave-burn-v1-finish-runbook.md`; apply only missing prerequisites and retain existing burns. The hash-recovery migration is additive and repeatable. Finish with the applicable RLS hardening checks.

The burial schema and allowance use `unified-burial-setup.md`. Do not overwrite the current burial RPC with an old map-only migration. Do not run cleanup SQL automatically as part of a source sync.

## Verification

`npm run test:unit` covers amount bounds/precision, API validation, signature/receipt checks, concurrent binding, expiry, recovery, reorgs, aggregation and SQL behavior. `npm run test:web3-e2e` uses simulated wallets and mocked application APIs on both maps, including rejection, reload and lost-broadcast recovery. No real tokens are required by these tests.