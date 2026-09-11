# REKT: indexed history, RPC and cache

Implemented locally 2026-09-11. Target: show preliminary closed-loss candidates in 30 seconds. This is a latency objective, not an established SLA. Existing measured baseline: 355.961 seconds for a 50-transaction repeat scan through public Robinhood RPC; a cold scan hit HTTP 429.

Latest live result (2026-09-11): the existing Robinhood Alchemy endpoint was found in the separate WalletWatcher project and configured locally. Two scans with no local history/evidence cache completed in **21.762 s and 21.697 s**. All 18 cycles' IDs, boundaries, costs, proceeds and losses match the earlier report. One V4 pool's metadata lookup is explicitly deferred in fast mode; see the acceptance details below.

## Accepted method (2026-09-11)

Accepted for the preliminary REKT list: Alchemy indexed ERC-20 history, RPC receipt validation, our exact cycle/PnL calculation, bounded concurrency and a private finalized-evidence cache. The fast preset uses 10 workers, 25 ms request pacing, a 28 s work deadline and `--pool-history defer`. Missing V4 PoolKeys are explicit evidence gaps; a separate `--pool-history full` run recomputes the deferred flows. That follow-up is not scheduled automatically.

The 30 s objective covers discovery only. Ownership/funding linkage, final burial verification, epitaph generation and website integration remain separate work. The two cold runs establish performance on the supplied Robinhood wallet, not a guarantee for every wallet or host.

Pre-commit review also corrected failure-report progress for discovery/Relay and removed nonexistent resume links when seed validation fails before checkpoint creation. Regression tests cover both cases.

## Implementation plan

1. Add an explicit Alchemy ERC-20 transfer-history adapter for Base and Robinhood. Read incoming and outgoing transfers, exhaust pagination over a fixed finalized block range, reject looping/malformed pages, and preserve raw integer amounts. Keep RPC history available for compatibility. Do not silently substitute an incomplete indexer result for full history.
2. Use indexed transfers to identify transactions; retrieve authoritative receipts through RPC, match indexed amounts against receipt logs, and reconstruct wallet flows from those logs. Keep our existing cycle and loss calculation. Indexer completeness remains a provider assertion; preliminary discovery cannot authorize burial.
3. Add configurable bounded concurrency and shared per-origin request pacing. Drain workers before returning errors, preserve request budgets, serialize checkpoint writes, and deduplicate concurrent pool lookups.
4. Reuse finalized raw evidence from validated previous checkpoints: receipts, transactions, blocks, pool identity and historical prices/balances. Recompute derived flows, refresh Relay evidence and do not persist transient failures as valid data. Preserve chain/wallet/range binding and reorg checks.
5. Add a private local cache directory with an exclusive per-wallet lock. Reuse complete history and save completed snapshots atomically. This is a standalone CLI cache; a shared database/object store and distributed job coordination remain necessary for multiple server instances.
6. Add an execution deadline with graceful checkpointing. A deadline returns an explicit incomplete job, never an empty successful list. Keep slower full-history scans resumable.
7. Test pagination, precision, duplicates, receipt mismatches, cache isolation/reorg rejection, concurrent errors, request budgets and deadline/resume behavior. Repeat the real-wallet benchmark where credentials permit.

## Provider setup

The user selected Alchemy. An existing Robinhood endpoint is now configured in the ignored `.env.scanner` as `REKT_ROBINHOOD_RPC_URL` and `REKT_ROBINHOOD_INDEXER_URL`; RPC chain ID and Transfers API access were checked. A Base endpoint has not been configured or live-tested here. No new subscription or paid resource was created. Configure secrets locally or in hosting environment variables, never in source control or report output.

Official sources:

- https://docs.robinhood.com/chain/connecting/
- https://www.alchemy.com/docs/robinhood-chain/robinhood-chain-api-overview
- https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers

Robinhood cold-scan results are recorded below; Base and multi-wallet latency remain unmeasured. Public RPC/cache experiments are recorded separately.

## How to run

Create an Alchemy app with Base Mainnet and Robinhood Mainnet enabled. Copy `scripts/rekt-scan/scanner.env.example` to `.env.scanner` in the repository root and set `REKT_ALCHEMY_API_KEY` locally. The CLI does not load environment files implicitly. Keep this key on the server; do not use a `NEXT_PUBLIC_` variable.

With environment variables already configured:

```sh
npm run rekt:fast -- --wallet 0xYOUR_ADDRESS --chain robinhood --output .local-archive/rekt/fast-001.json
```

With a local environment file (Node 22.18+):

```sh
node --env-file=.env.scanner --experimental-strip-types scripts/rekt-scan/cli.mts --source auto --history-provider alchemy --concurrency 10 --request-interval-ms 25 --deadline-ms 28000 --pool-history defer --cache-dir .local-archive/rekt/cache --wallet 0xYOUR_ADDRESS --chain robinhood --output .local-archive/rekt/fast-001.json
```

Use `--chain base` for Base. Choose a new output path for a new snapshot. For an unfinished job, repeat its command with `--resume`; the existing 24-hour checkpoint TTL applies. Alchemy page cursors expire sooner and are restarted with deduplication when stale. A manual background continuation can raise `--deadline-ms` and `--max-requests`.

The 28-second deadline is cooperative: network calls are aborted, workers drain, and a final checkpoint is written. Startup and final disk writes add overhead. `scan_deadline_reached` means unfinished work, not a successful result within the target. Large or throttled wallets may need continuation. No background scheduler is installed by this patch.

## Implemented behavior and audit notes

- `--history-provider alchemy` is explicit, requires configuration and never silently falls back to a slow public history scan. Both the indexer endpoint and RPC are checked for the selected chain ID.
- Both ERC-20 transfer directions are paginated over fixed block bounds, including zero-valued events. API display values are ignored; raw hex quantities remain exact. Receipt checks reject wrong amounts, blocks, duplicate claims and missing wallet events within returned transactions.
- Exhausting pages is an indexer coverage assertion, not proof of completeness. Reports expose `coverage.historyCompleteness = indexer_asserted_receipt_checked`. A missing entire transaction cannot be disproved by checking only the returned receipts. After an indexed cached scan, the most recent 10,000 blocks are re-queried and unioned with known events to mitigate indexing lag; this is not an unlimited-lag guarantee.
- Parallel workers are bounded at 1–16 (fast command: 10). Request spacing is shared per origin; retry attempts share the total budget. Workers drain before error reporting, pool lookups are deduplicated while in flight, and checkpoint writes are coalesced and serialized.
- Fast command uses `--pool-history defer`. V4 identity is still checked from cached PoolKeys, the official PositionManager, or Initialize events in the receipt. If unavailable, the historical log search is deferred and `v4_pool_metadata_deferred` is reported on the affected flow and transaction. Missing identity cannot produce a direct DEX settlement. A separately matched Relay settlement may remain preliminary. `--pool-history full` retains the complete historical lookup; switching modes invalidates derived flows so a resumed full job reprocesses deferred transactions. No background full job is scheduled automatically.
- Cached raw evidence is bound to chain, wallet, start block and a revalidated finalized snapshot. Derived flows and mutable Relay history are recomputed. Historical exact prices and immutable pool identities are reused; failed reads are retried. Indexer-derived seeds cannot become RPC-only completeness claims.
- Cache files and output files use separate exclusive locks. A completed scan writes a private per-wallet cache. Interrupted jobs retain their output-adjacent checkpoint for `--resume`. Locks are local-filesystem coordination only.
- No UI, signature validation, funding-link verifier, LLM, website API or cloud deployment is changed. Existing preliminary/eligibility boundaries remain in place.

## Measured results

Two live local Robinhood repeat scans reused receipts for 50 transactions and recomputed the result:

| Run | End-to-end time (including process startup) | HTTP attempts | Result |
| --- | ---: | ---: | --- |
| Explicit prior evidence seed, missing history tail fetched | 14.643 s | 21 | 18 closed cycles, 2 preliminary candidates |
| Automatically selected per-wallet cache | 10.311 s | 19 | Same cycles, candidate IDs and exact losses |

Both used public RPC, concurrency 5, a 250 ms shared request interval and a 28-second deadline. The latest finalized block was 60240191 in both runs. The first reused a previously complete snapshot at 60221557; the second needed no new log range because finality had not advanced. These are cached results with fresh provider requests and recalculation, not cold Alchemy benchmarks. Type/lint checks overlapped part of the first run; the second ran separately.

The original 355.961-second baseline used a 1000 ms request interval and reused raw log history only. Thus the speedup combines stronger cache reuse, lower request pacing and concurrency; it is not a controlled measurement of one optimization in isolation.

Exact candidates remained CATSTRO $511.717792 and TOPBLAST $278.931757 in all three reports. Private timings, checkpoints and comparison evidence are under `.local-archive/rekt/benchmark-fast-2026-09-11/`.

### Cold Alchemy acceptance measurements

The first cold run (5 workers, full pool-history lookup) stopped at its 28-second work deadline after 29.973 seconds including process overhead. A second cold run with 10 workers still stopped at its 60-second work deadline after 61.380 seconds. Both had indexed all wallet transfers but were delayed by historical Initialize search for a V4 PoolKey absent from the PositionManager. Neither is a successful latency measurement.

With explicit deferral of that metadata lookup:

| Cold run | Wall time | Internal time | Requests | Reused cached receipts | Finalized block |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 | 21.762 s | 21.097 s | 343 | 0 | 60439802 |
| 4 | 21.697 s | 21.075 s | 343 | 0 | 60443403 |

Each used a new output file, no `--cache-dir`, no `--seed-checkpoint` and no `--resume`: 10 workers, 25 ms per-origin pacing, 28-second work deadline. Both collected 50 transactions, reconstructed 18 cycles and returned the same 2 preliminary candidates. Historical balance reads: 116 values and zero read errors. All 18 cycles' IDs, dates, costs, proceeds and losses match the older report, not only the two selected candidates. Candidate amounts remain CATSTRO $511.717792 and TOPBLAST $278.931757.

One transaction has deferred V4 metadata. Known route counts therefore include V4 in 33 transactions instead of the deep run's 34; V3 remains 10. These counts overlap. This is an explicit coverage difference, not a claim that all pool checks completed faster.

Private raw reports are under `.local-archive/rekt/benchmark-alchemy-2026-09-12/` (directory label; actual executions were September 11 Moscow time). They are local CLI timings, exclude GitHub/website startup and independent four-chain funding-link verification, and cannot disable or measure provider-side caches. Two scans of one wallet do not establish average/p95 latency or production capacity for arbitrary histories.

Validation: all 147 scanner tests passed, including full/deferred mode transitions, rejection of invented settlement without pool evidence or a valid Relay match, and failure-report/resume regressions. TypeScript and scoped ESLint checks pass. Docker and cloud deployment remain untested. Next acceptance work is a larger set of wallets and Base endpoint configuration; the 30-second preliminary-list goal is demonstrated for this Robinhood test wallet only.
