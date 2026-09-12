# REKT scanner: live-wallet audit findings

CU accounting/load-limit follow-up (2026-09-12): PnL CLI requests now use a shared weighted RPC gate (450 throughput CU/s by default) and a per-invocation 50,000 estimated CU budget. Reports distinguish Alchemy RPC estimates, other RPC equivalents, unpriced external HTTP, retries, HTTP 429 and JSON-RPC throttles. Unknown costs cannot bypass active limits; batches are rejected. Tests cover cross-origin concurrency, exact budgets, retry accounting, cancellation, credential omission, CLI settings and checkpoint/resume after CU exhaustion. All 158 scanner tests, TypeScript and scoped ESLint pass. Tests used mock/local providers; no Alchemy quota was consumed. This is per-process control, not an account-wide or monthly spending cap. Existing live timings predate CU pacing and require remeasurement. Details: [CU accounting and load limits](rekt-scanner-fast-plan.md#cu-accounting-and-load-limits-2026-09-12).

Fast-scanner follow-up (2026-09-11): [Alchemy, concurrency and evidence-cache implementation](rekt-scanner-fast-plan.md). Cached live runs took 14.643 and 10.311 seconds. The existing Robinhood Alchemy endpoint was subsequently recovered; cold runs took 21.762 and 21.697 seconds after explicitly deferring one slow V4 metadata lookup. All 18 cycle amounts/IDs match the original evidence. Coverage differs for that pool; no publication authorization is granted. Pre-commit review fixed failure-report transaction counts for discovery/Relay and nonexistent resume links after rejected seeds. 147 tests, typecheck and scoped lint pass. This remains an implementation-author audit; no independent review is claimed.

Latest follow-up (2026-09-11): [combined Uni V2/V3/V4 + Relay patch and verification results](rekt-scanner-patch-2026-09.md). It includes a fresh wallet run and 129 passing tests. The dated findings below retain the original investigation history; the new discovery path does not remove the remaining publication-verification limits.

Date: 2026-09-08. This is an implementation-author audit, not an independent security audit. The user supplied a Robinhood Chain address as the test case. Raw wallet data and financial estimates remain in the ignored `.local-archive/rekt/` directory.

## Result

The original Base/Uniswap V3 implementation could not scan this user's Robinhood routes. The main CLI now includes a Robinhood/Base Relay discovery adapter and reproduces the preliminary finding. It does not yet provide fully verified Relay eligibility: do not mark the whole scanner block complete or enable burial from these estimates.

The read-only investigation collected 41 wallet ERC-20 logs from block 1 through finalized block 57,898,022 and fetched the corresponding 41 receipts. The logs cover 20 token contracts. The public RPC supports large, sparsely matching ranges; collecting this address's history required 17 requests including preliminary checks. Current balances reconciled with the net Transfer quantities for the inspected tokens. Historical state reads failed on the tested public endpoint, so a finalized log snapshot is not a substitute for independently checked cycle boundary balances.

## Original coverage findings

1. **Network registry is hardcoded to Base.** `scripts/rekt-scan/cli.mts` exits before attempting Robinhood data. `providers/prices.ts` and `providers/uniswap-v3.ts` also embed Base quote assets and factory. Needed: chain-specific source capabilities, settlement assets, protocol addresses, finality and historical-state support.
2. **Sponsored smart-wallet execution is excluded.** The test address has an EIP-7702 delegation marker. Its outgoing operations use an ERC-4337 EntryPoint, with a bundler as transaction sender. The decoder's `transaction.from === wallet` requirement rejects legitimate execution. Removing that check alone is unsafe: decode/verify the account operation and attribute receipt events to that operation, especially in multi-user bundles.
3. **Settlement occurs on another chain.** Relay records link Robinhood token legs to Solana USDC settlement legs. A wallet-only Robinhood receipt contains just the acquired or spent target token. Treating an incoming token as a free acquisition or an outgoing token as a total loss would be wrong. A chain-aware Relay request adapter must bind owner, recipient, chain IDs, amounts and both confirmed transaction hashes.
4. **Single-pool direct flow assumptions do not cover these routes.** Receipts contain intermediary transfers and multiple swap event formats. Attribution must follow the full route and net settlement, not sum every pool event or attribute a solver's entire transaction to the wallet.
5. **Source availability differs by method.** Robinhood logs, receipts and latest balances worked. Historical `eth_getTransactionCount` returned RPC -32000 (`metadata is not found`) and `debug_traceTransaction` was unavailable. Blockscout returned a browser challenge. Solana's public RPC timed out; another public provider returned null for the selected historical transaction. These are incomplete verification states, not evidence of zero loss.

## Findings from the research calculation

34 of the 41 wallet events matched successful Relay records with the expected target token amount, chain and transaction hash. Quote amounts were also matched against Relay-reported owner balance changes. The records indicate 14 closed trade-like cycles plus a separate USDG transfer sequence; some other incoming tokens remain held and are not treated as trades.

One preliminary cycle exceeded $250 using Relay's historical USD fields. This is **not** an eligible server candidate: the Solana settlements were not independently verified, historical Robinhood boundary balances are unavailable from the tested source, and cross-chain/app/bridge fee treatment needs an explicit contract. Relay `amountUsdCurrent` was not used; arbitrary route calldata USD strings were not accepted as prices.

## Implementation order

1. Freeze this private fixture and add synthetic variants for missing counterpart transaction, wrong chain, incorrect amount, multi-user bundle, transfer-only flow and duplicate request.
2. Introduce a chain registry and read-only capability probe; retain an explicit distinction between history collection and verified loss calculation.
3. Implement Relay history pagination and request-to-transaction matching, retaining original source provenance. Do not equate an API's success flag with independent onchain verification.
4. Add EIP-7702/ERC-4337 attribution and route decoding, including native assets where traces or equivalent complete proof are available.
5. Verify both settlement legs with suitable archive providers and historical prices; define fee treatment and ownership across chains before producing burial-eligible evidence.
6. Re-run this wallet end to end, compare the first and second cycles of the same token separately, and verify every excluded event has a reason. Finish with independent review of the resulting adapters and eligibility gates.

## Implemented remediation and remaining blockers

- Added `providers/chains.ts`, `providers/relay.ts`, `scanner/relay.ts` and `scripts/rekt-scan/relay.mts`, with source selection in the main CLI. Robinhood now defaults to Relay discovery. The explicit unsupported-network result remains for incompatible source/network combinations.
- The adapter verifies target receipt/index/block agreement and matches Relay chain, owner, token, amount, status and opposite settlement. It does not trust the bundler as owner. This is provider attribution, not independent account-operation or cross-chain ownership proof.
- Added version-aware pagination, separate v3 recipient queries, duplicate/settlement reuse rejection, historical-vs-current-price isolation, closed-cycle accounting and explicit archive-state diagnostics. Fixed a failed-resume path that could overwrite an existing partial analytical report, including changing to an unsupported source.
- Main CLI replay collected 46 Relay records (one more than the earlier research snapshot; requests after the frozen EVM snapshot do not create wallet events). The same 34 target flows match. The 221-request initial run and 3-request resume both return one preliminary cycle above threshold, zero eligible candidates and `partial` status.
- All 122 historical balance reads failed with RPC -32000 on the tested public Robinhood endpoint. Their absence appears in the report and in each affected cycle's warnings. The earlier latest-balance check is not presented as historical proof.
- 60 tests pass, including threshold precision, multiple cycles, unmatched transfers, owner/chain/quantity spoofing, missing settlement, changing current-price fields, overlapping evidence, pagination loops, v3 recipient buys and CLI resume preservation. TypeScript and scoped ESLint pass. This remains an author audit; an independent security audit has not been performed.
- Remaining blockers for burial-eligible Relay results: archive token state, independently verified remote settlements, account-operation attribution and cross-chain ownership, historical price quality, token behavior/liquidity and gas/bridge fee treatment. v3 live access additionally requires a Relay API key; its response handling is tested with synthetic fixtures, while the live replay used public v2.

## First-funding author audit (2026-09-09)

Implemented a separate read-only four-network funding scanner, with direct cash-transfer verification, cross-chain ordering, per-chain coverage/budgets, Relay external-account discovery, evidence hashes, atomic checkpoints and resume locking. This does not modify PnL IDs or authorize burials.

Issues found and corrected while testing:

- Public dRPC returns oversized log ranges as HTTP 400. The transport now recognizes that specific JSON-RPC error and reduces the range, while preserving generic configuration/authentication failures. HTTP 408 uses bounded retries. Archive-access restrictions and unavailable historical providers have explicit reason codes.
- The tested BNB default rejected log queries down to a one-block range. Changed the funding default and made an explicit `--chunk-size` reset adaptive range sizes on resume, preventing a new provider from inheriting an unusably tiny range.
- History collection could consume the entire budget before receipt decoding. Each chain now reserves half its budget for evidence, allowing partial reports to expose observed sources without claiming firstness.
- Duplicate receipt logs are canonicalized before summing; malformed cash Transfer events fail closed. Receipt/index disagreement, false sender/calldata, native value and mixed/taxed movements cannot become a direct source.
- Failed resumes preserve complete reports and partial reports whose evidence or previously complete chain coverage would otherwise disappear. Fresh errors are written beside the retained report. A bad RPC configuration for one chain no longer prevents trying the others.

Live supplied-wallet validation: two budget-limited runs found five independently receipt-checked direct Base USDC credits from one source. The earliest observed credit precedes the first Robinhood buy by 19 seconds. The resumed run completed Robinhood's genesis ERC-20 history and receipt decoding. Base remains budget-limited; BNB timed out; Ethereum's tested public gateway could not route historical logs to a provider. Relay also exposes a Solana settlement counterpart whose full history and FOMO membership are unverified. The final live result is therefore partial, with `firstSource: null`, not a verified first funder. Private addresses, amounts and transaction evidence are retained only in ignored local reports.

The accepted product rule is broader than this adapter: native and routed funding conversion, the complete FOMO trading balance across its addresses, source signatures/challenges, link uniqueness and server quotas remain unimplemented. The implemented direct-source positive path is tested synthetically on all four networks; the live partial result is not represented as a successful account binding. This is an author audit, not an independent security audit.

Validation: 90 scanner tests pass, including the 60 prior PnL/provider tests and new funding/CLI/RPC cases. Final TypeScript, scoped ESLint and whitespace checks passed.

## Funding threshold and repeat-deposit audit (2026-09-09)

Policy v2 applies an inclusive $10 minimum to each credit at its historical USD price, with exact decimals, chain-specific contracts and no assumed stablecoin peg. Priced dust remains in evidence, never accumulates into a qualifying deposit and cannot backdate a later sender's priority. Earlier missing/invalid prices still block establishing a first source. Possible test payments are attached to the same source's later qualifying credit as context only.

Added per-address/chain statistics for distinct transactions, qualifying days, qualifying USD amount and observed direct-funding share. Unpriced and below-minimum counts remain separate. Repetition does not alter the first-source decision, signature state, economic IDs or quotas.

Existing v1 checkpoints are re-evaluated from retained evidence under v2; the previous report is archived before replacing its obsolete decision. Tests cover the exact threshold including 18-decimal BNB tokens, trial deposits, later-sender takeover attempts, cumulative dust, depegs, missing prices, duplicate evidence, chain separation, and migration. All 104 scanner tests, TypeScript and scoped ESLint pass.

Live replay: all five observed direct Base USDC deposits passed $10 using fetched historical quotes, on two UTC days. All quotes were available in this replay. The three incomplete chain histories and related external-account gap still block an established first source; this threshold change does not remove those restrictions.

## Primary references

- [Robinhood RPC and archive requirements](https://docs.robinhood.com/chain/connecting/)
- [EIP-7702 delegation indicator](https://eips.ethereum.org/EIPS/eip-7702)
- [Relay request history and chain/transaction filters](https://docs.relay.link/references/api/get-requests)
- [Relay gasless execution](https://docs.relay.link/features/gasless-execution)
- [Solana getTransaction and null results](https://solana.com/docs/rpc/http/gettransaction)
