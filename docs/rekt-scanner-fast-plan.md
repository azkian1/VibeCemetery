# REKT: indexed history, RPC and cache

Implemented locally 2026-09-11. Target: show preliminary closed-loss candidates in 30 seconds. This is a latency objective, not an established SLA. Existing measured baseline: 355.961 seconds for a 50-transaction repeat scan through public Robinhood RPC; a cold scan hit HTTP 429.

## Implementation plan

1. Add an explicit Alchemy ERC-20 transfer-history adapter for Base and Robinhood. Read incoming and outgoing transfers, exhaust pagination over a fixed finalized block range, reject looping/malformed pages, and preserve raw integer amounts. Keep RPC history available for compatibility. Do not silently substitute an incomplete indexer result for full history.
2. Use indexed transfers to identify transactions; retrieve authoritative receipts through RPC, match indexed amounts against receipt logs, and reconstruct wallet flows from those logs. Keep our existing cycle and loss calculation. Indexer completeness remains a provider assertion; preliminary discovery cannot authorize burial.
3. Add configurable bounded concurrency and shared per-origin request pacing. Drain workers before returning errors, preserve request budgets, serialize checkpoint writes, and deduplicate concurrent pool lookups.
4. Reuse finalized raw evidence from validated previous checkpoints: receipts, transactions, blocks, pool identity and historical prices/balances. Recompute derived flows, refresh Relay evidence and do not persist transient failures as valid data. Preserve chain/wallet/range binding and reorg checks.
5. Add a private local cache directory with an exclusive per-wallet lock. Reuse complete history and save completed snapshots atomically. This is a standalone CLI cache; a shared database/object store and distributed job coordination remain necessary for multiple server instances.
6. Add an execution deadline with graceful checkpointing. A deadline returns an explicit incomplete job, never an empty successful list. Keep slower full-history scans resumable.
7. Test pagination, precision, duplicates, receipt mismatches, cache isolation/reorg rejection, concurrent errors, request budgets and deadline/resume behavior. Repeat the real-wallet benchmark where credentials permit.

## Provider setup

The user selected Alchemy and does not yet have an account/key. No subscription or paid resource is created. Configure secrets locally or in hosting environment variables, never in source control or report output.

Official sources:

- https://docs.robinhood.com/chain/connecting/
- https://www.alchemy.com/docs/robinhood-chain/robinhood-chain-api-overview
- https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers

Live cold-scan performance with Alchemy cannot be established until a working key with access to both selected networks is configured. Public RPC/cache experiments must be labelled separately from this benchmark.

## How to run

Create an Alchemy app with Base Mainnet and Robinhood Mainnet enabled. Copy `scripts/rekt-scan/scanner.env.example` to `.env.scanner` in the repository root and set `REKT_ALCHEMY_API_KEY` locally. The CLI does not load environment files implicitly. Keep this key on the server; do not use a `NEXT_PUBLIC_` variable.

With environment variables already configured:

```sh
npm run rekt:fast -- --wallet 0xYOUR_ADDRESS --chain robinhood --output .local-archive/rekt/fast-001.json
```

With a local environment file (Node 22.18+):

```sh
node --env-file=.env.scanner --experimental-strip-types scripts/rekt-scan/cli.mts --source auto --history-provider alchemy --concurrency 5 --request-interval-ms 25 --deadline-ms 28000 --cache-dir .local-archive/rekt/cache --wallet 0xYOUR_ADDRESS --chain robinhood --output .local-archive/rekt/fast-001.json
```

Use `--chain base` for Base. Choose a new output path for a new snapshot. For an unfinished job, repeat its command with `--resume`; the existing 24-hour checkpoint TTL applies. Alchemy page cursors expire sooner and are restarted with deduplication when stale. A manual background continuation can raise `--deadline-ms` and `--max-requests`.

The 28-second deadline is cooperative: network calls are aborted, workers drain, and a final checkpoint is written. Startup and final disk writes add overhead. `scan_deadline_reached` means unfinished work, not a successful result within the target. Large or throttled wallets may need continuation. No background scheduler is installed by this patch.

## Implemented behavior and audit notes

- `--history-provider alchemy` is explicit, requires configuration and never silently falls back to a slow public history scan. Both the indexer endpoint and RPC are checked for the selected chain ID.
- Both ERC-20 transfer directions are paginated over fixed block bounds, including zero-valued events. API display values are ignored; raw hex quantities remain exact. Receipt checks reject wrong amounts, blocks, duplicate claims and missing wallet events within returned transactions.
- Exhausting pages is an indexer coverage assertion, not proof of completeness. Reports expose `coverage.historyCompleteness = indexer_asserted_receipt_checked`. A missing entire transaction cannot be disproved by checking only the returned receipts. After an indexed cached scan, the most recent 10,000 blocks are re-queried and unioned with known events to mitigate indexing lag; this is not an unlimited-lag guarantee.
- Parallel workers are bounded at 1–16 (fast command: 5). Request spacing is shared per origin; retry attempts share the total budget. Workers drain before error reporting, pool lookups are deduplicated while in flight, and checkpoint writes are coalesced and serialized.
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

### Remaining acceptance gate

Validation: all 144 scanner tests passed, including a cold indexed buy/sell cycle through our decoder and exact PnL calculation, precision, pagination, receipt reconciliation, concurrency, cache/reorg, deadline/resume and lock-isolation cases. TypeScript and scoped ESLint checks pass. Tests use synthetic provider responses; they do not establish Alchemy availability, billing or latency. The Docker image has not been built on this workstation.

Configure Alchemy, run an uncached scan, compare every closed cycle with the existing evidence, and measure several wallets (including a larger history). Until then, the first-scan 30-second target and production RPC capacity remain unverified. Funders across four networks are a separate job and are not included in these timings.
