# REKT wallet scanner

Standalone, read-only CLI. It does not sign transactions, create graves, or enable the website's REKT flow. Node 22.18+ is required; the existing `viem` dependency is used.

## Fast scanner: Alchemy and finalized evidence cache

The new `npm run rekt:fast` command uses indexed ERC-20 history, five workers, a private per-wallet cache and a 28-second cooperative deadline. Configure Alchemy first. Repeated real-wallet scans with cached raw evidence completed in 14.643 and 10.311 seconds on public RPC; cold Alchemy latency still needs a key and live measurement. Full setup, cache/coverage semantics, remaining limitations and results: [fast scanner plan](rekt-scanner-fast-plan.md).

## September 11 patch: combined discovery

Use `npm run rekt:discover -- --wallet 0x... --chain robinhood --output .local-archive/rekt/new-report.json` (or `--chain base`). This is `rekt:scan --source auto` and combines Uni V2/V3/V4 pool recognition with Relay route attribution. The previous strict Base V3 and Relay-only sources remain available for compatibility; the historical sections below describe those paths.

- Official factories and V4 PoolManagers are chain-specific for Base and Robinhood. V2/V3 membership is checked with `getPair`/`getPool`. V4 PoolKey is read from the official PositionManager or Initialize logs and its full PoolId is recomputed. Immutable identities may be read at latest if historical metadata calls fail; this never substitutes latest balances or prices for historical values.
- ERC-20 multi-pool routes are reconciled against the wallet's actual net movement. Intermediate volumes are not counted as additional purchases. V4 hook usage and sponsored/relayed operations stay explicitly unverified. Native currency settlement, arbitrary hooks, unsupported factories and unmatched movements do not acquire fabricated USD amounts.
- FOMO/Relay supports the allowlisted EVM quote assets with correct decimals, including Robinhood USDG and Base WETH, as well as the previously supported counterpart evidence. Solana is not queried or added as a target. Existing Relay-reported non-EVM legs remain labelled outside the EVM scope.
- `preliminaryCandidates` are sorted by exact loss and include `estimatedLossPercent`, `buyCount`, `sellCount`, protocol evidence and warnings. Cash quote assets are excluded from target positions in combined discovery. `candidates` stays empty: this patch expands discovery, not publication authorization.
- `--resume --retry-evidence` recomputes discovery against saved receipts and retries failed state reads after a provider change. The first known archive failure avoids redundant calls and explicitly marks skipped reads. `--request-interval-ms` controls pacing; log-query timeouts shrink the block range.
- `--seed-checkpoint FILE` starts a new snapshot from a complete prior history with the same chain/wallet/start block. The old block hash is revalidated. Discovery also reuses raw receipts, transactions, blocks, pool identities and exact historical prices/balances, then rebuilds derived calculations. RPC history fetches only the tail; indexed history rechecks a recent overlap for indexing lag. This differs from resuming a frozen 24-hour job.

See [patch plan and results](rekt-scanner-patch-2026-09.md) and [server runbook](rekt-scanner-hosting.md). The prepared container uses only Node and viem, keeps reports on a private persistent volume and exposes no HTTP API.

## Implementation plan

1. Define a versioned local report and evidence contract. Keep atomic token quantities and USD decimals as strings; stable economic IDs use chain, owner, token and transfer events only.
2. Read finalized chain state and collect both incoming and outgoing ERC-20 Transfer logs with adaptive block ranges. Persist a checkpoint after each complete range. Never advance past a failed range or treat truncated history as complete.
3. Verify receipts, block hashes, pool membership against the official Uniswap V3 factory, and actual wallet flows. Initially accept only a single pool, a single target token and one allowlisted ERC-20 settlement asset. Reject ambiguous routes, native ETH, transfers, LP operations and nonstandard tokens.
4. Reconstruct whole zero-to-zero position cycles. Read balances at the beginning/end and at transaction-block boundaries. Include purchases before the close-date filter. Reject unknown inventory, dust, outside transfers and missing prices.
5. Fetch historical settlement-asset USD prices from DefiLlama with confidence and timestamp checks. Require a minimum quote reserve in the pool. Compute C, R and L exactly before applying the inclusive $250 boundary; gas is excluded.
6. Produce candidates, exclusions, coverage and provider diagnostics. Persist input evidence for offline reproduction; lock concurrent runs of the same checkpoint; resume within TTL, with bounded retries and request budgets.
7. Test arithmetic boundaries, multiple cycles, old purchases, transfers, missing/invalid evidence, duplicates, ordering, pagination, retries, restart and CLI failure states. Run a read-only live RPC/price smoke test and a live wallet scan, then project type and lint checks.

### Robinhood / Relay extension plan and implemented steps

1. Add a chain registry and explicit source selection. Robinhood defaults to Relay discovery; Base also accepts `--source relay`. Keep the direct V3 analyzer as a separate source.
2. Collect a frozen finalized ERC-20 history from genesis before matching any route. Fetch full receipts and compare every wallet Transfer against indexed logs, including topics and block hashes. Compute net target-token changes per transaction; do not use a bundler's `from` as the wallet identity.
3. Paginate Relay requests with persisted cursors, loop detection and duplicate conflict checks. With `REKT_RELAY_API_KEY`, use v3 and query both sender and recipient roles separately. Otherwise use compatibility v2 and retain its deprecation notice. Never substitute mutable current prices for historical fields.
4. Bind each route to wallet, chain, target token, exact quantity, transaction hash, successful status and provider-reported owner balance changes. Match the opposite leg to allowlisted Solana/Base USDC. Reject ambiguous/split settlements and reuse of one settlement across multiple events or cycles.
5. Reconstruct complete zero-to-zero token-flow cycles and exact historical USD differences. Read initial, transaction-boundary and snapshot balances when the RPC supports them. Unknown transfers, mismatches, unknown pre-window inventory, open positions and incomplete history cannot yield preliminary losses.
6. Write provider-backed estimates into `preliminaryCandidates`, always separate from `candidates`. Missing archive balances are explicit warnings on provisional full-genesis log-derived cycles. All Relay reports currently use `status: partial`, `collectionComplete: true` only after collection finishes, and exit code 2. There is no automatic promotion to burial eligibility.
7. Exercise synthetic positive/negative cases and replay the supplied Robinhood wallet through the main CLI. Verify failed resumes preserve analytical output. Independent settlement verification, account-operation attribution, price quality, token/liquidity checks and fee separation remain prerequisites for eligible Relay results.

## First-funding implementation plan (2026-09-09)

1. Add a separate `rekt:funding` CLI and pure analyzer. Keep funding identity, source chain and evidence separate from PnL and economic IDs. The CLI never verifies a signature or authorizes a burial.
2. Freeze finalized snapshots on Base (8453), Robinhood (4663), BNB Smart Chain (56), and Ethereum (1). Collect complete ERC-20 history from genesis with independent per-chain request budgets, adaptive ranges and resumable checkpoints. One unavailable chain must not prevent work on the other three.
3. Recognize funding cash assets by chain and contract, never ticker. Decode positive net credits; ignore zero/self transfers and NFT events. Preserve unknown assets and routed credits as explicit unresolved observations. Native gas payments are outside the cash-funding definition.
4. Validate candidate receipts, canonical blocks, exact transfer logs, calldata and sender for direct ERC-20 transfers. Never treat a router/bundler as the personal funder. Retain Relay counterpart chains/addresses as route evidence, without inferring ownership of related Solana accounts or silently skipping them.
5. Choose the earliest credit by destination timestamp across all four networks, using transaction/log order only within one chain. Missing coverage, earlier unresolved movements, ties between chains and deposits after the selected cycle begins must prevent an established first source. Return observed candidates separately so partial scans remain useful.
6. Save method version, evidence digest, both addresses/chains, amount, transaction/log references and frozen block hashes. Implement locking, atomic writes, cancellation, resume validation and preservation of earlier reports on invalid resumes.
7. Add meaningful positive/negative analyzer, receipt and CLI tests, run existing PnL regressions/typecheck/lint, then scan the supplied wallet using public providers. Record provider limitations honestly. Native/cross-chain funding conversion adapters and server challenge/uniqueness enforcement remain explicit integration work; unsupported flows cannot acquire a verified label.

## Run

```sh
npm run rekt:scan -- --wallet 0xYOUR_ADDRESS --output .local-archive/rekt/report.json
npm run rekt:scan -- --wallet 0xYOUR_ADDRESS --output .local-archive/rekt/report.json --resume
npm run rekt:scan -- --wallet 0xYOUR_ADDRESS --chain robinhood --chunk-size 10000000 --output .local-archive/rekt/robinhood.json
npm run rekt:scan -- --wallet 0xYOUR_ADDRESS --chain base --source relay --output .local-archive/rekt/base-relay.json
npm run rekt:scan -- --help
npm run rekt:funding -- --wallet 0xYOUR_FOMO_ADDRESS --output .local-archive/rekt/funding.json
npm run rekt:funding -- --wallet 0xYOUR_FOMO_ADDRESS --output .local-archive/rekt/funding.json --resume
npm run test:rekt
```

Optional `REKT_BASE_RPC_URL` (or `BASE_RPC_URL`) selects an archive RPC; no key is required for the public default. The script does not automatically load `.env.local`. Use Node's `--env-file=.env.local` before the script path if needed. RPC URLs and credentials are never saved in reports. Public RPC is a development default, not a production service guarantee.

`REKT_ROBINHOOD_RPC_URL` selects a Robinhood archive endpoint. `REKT_RELAY_API_KEY` selects authenticated v3 for a new scan; without it the compatibility v2 endpoint is used. Relay announces v2 retirement on November 24, 2026 and progressively reduced quotas before that date. A resumed scan keeps its original API version and saved evidence. To retry failed archive reads with another endpoint or change Relay API version, start a new output/checkpoint. Checkpointed missing balances are not silently converted into zeroes.

The default scan reads from block 1 through a frozen finalized block, in descending ranges, then reconstructs in ascending order. `--days 90` filters **closure dates only**. `--from-block` deliberately narrows coverage; opening balances are still checked, so an old position cannot acquire an invented zero cost. Large histories can require several budget-limited runs. `--resume` keeps the same snapshot; start with another output path for fresh data.

Exit codes: 0 complete (including a valid empty result), 2 partial coverage, 1 failure/configuration error, 130 cancellation. A partial scan never means no losses. The JSON includes exclusions even when no eligible candidates exist. The CLI writes progress to stderr and a small summary to stdout.

## Current coverage and integration limits

- Base mainnet, official Uniswap V3 factory, direct single-pool ERC-20 swaps settled in native Base USDC or WETH. Router/aggregator entrypoints are acceptable only when their complete receipt satisfies the same strict flow checks.
- The direct V3 source excludes native ETH, multi-hop/split swaps, token-to-token swaps without an allowlisted quote, V2/V4/Aerodrome, LP, bridges, lending, transfer-tax/rebase and smart-account flows.
- The Relay source supports Base and Robinhood mainnet (4663) for **preliminary discovery** across routes with ERC-20 target legs and Solana/Base USDC settlement. It can associate sponsored wallet flows with Relay records without decoding each intermediate DEX. It does not independently verify every router, account operation or remote settlement and therefore emits no eligible candidates. Transactions outside Relay remain explicit unsupported movements, not fabricated sales.
- Historical USD is an estimate, not an onchain dollar fact. Require confidence >= 0.9, timestamp distance <= 1 hour, and pool quote reserves >= $10,000 at the trade block. This is a conservative quality filter, not proof against all market manipulation or related counterparties.
- Reports are local analytical results, **not burial authorization**. Offline input/checkpoint files are untrusted outside this CLI. The future server must retain trusted evidence, revalidate finality/freshness/ownership, enforce event overlap and burial uniqueness in its database, and apply account quotas. No public API, distributed queue, account auth or database migration is included in this standalone script.
- Checkpoints expire after 24 hours; partial provider errors can be retried with `--resume`. Remove local report/checkpoint files when no longer needed. No telemetry or address catalogue is created.

## Sources checked 2026-09-08

- [Robinhood network configuration](https://docs.robinhood.com/chain/connecting/)
- [Uniswap V3 Base deployment addresses](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments)
- [DefiLlama historical prices](https://api-docs.defillama.com/)
- [Blockscout API migration notice](https://docs.blockscout.com/devs/apis)
- [Relay request API](https://docs.relay.link/references/api/get-requests)
- [Relay v2/v3 migration and retirement](https://docs.relay.link/references/api/api_guides/migrating-to-requests-v3)

## Validation (2026-09-08)

- `npm run test:rekt`: 60 tests passed, covering both analyzers, raw V3/Relay receipts, provider limits, pagination, role filtering and CLI restart/locking/report preservation.
- `npx tsc --noEmit --incremental false`, scoped ESLint and `git diff --check`: passed.
- Live Base and Robinhood RPC chain IDs: 8453 and 4663. Live DefiLlama historical WETH quote: returned a timestamped price with 0.99 confidence.
- Live Base scan of a public active address over 5,001 finalized blocks: 8 wallet events, 52 requests, about 31 seconds in the first run. Results contained open/incompletely supported positions; no eligible loss was found in this sample. The positive eligible-loss path is tested using explicitly synthetic fixtures, not presented as a verified real person's loss.
- Public Base RPC returned HTTP 413 for ranges above 10,000 blocks, and 429 under repeated historical reads. Both cases were reproduced and handled. A full-genesis scan at that range limit needs roughly 10,000–14,000 history requests at the measured chain height, before receipts and balances. The default 2,000-request budget intentionally pauses it; use `--resume` or a suitable archive provider. This fallback prioritizes reproducibility over indexer speed.
- An attempted resume hit a real 429; its separate `.error.json` preserved the last completed report. Resuming the same snapshot through `https://base.drpc.org` then completed successfully (5 additional requests in that run), including the final token-balance reconciliation. Checkpoints and live reports are kept in the ignored `.local-archive/rekt/` directory.
- Main CLI Robinhood replay through finalized block 57,898,022: 41 wallet logs, 34 Relay-matched flows, 14 priced closed cycles plus one excluded transfer sequence. One preliminary cycle exceeded $250. Initial run: 221 HTTP requests; resumed analysis: 3. All 122 attempted historical balance reads returned RPC -32000 on the public endpoint. The output retains these evidence gaps and has zero eligible candidates. Private amounts and addresses are not checked into the repository.

The Node runtime may emit `MODULE_TYPELESS_PACKAGE_JSON` when loading the project's TypeScript modules. It reparses them as ESM; execution and tests succeed without changing the application-wide module mode.

## First-funding scanner: implemented scope

`npm run rekt:funding` checks all four required networks independently of the PnL chain. It freezes finalized snapshots and collects ERC-20 logs from block **0**, including history before any closure-date window. There is deliberately no `--chain` or `--from-block` shortcut in this command. `--cycle-opened-at` accepts an optional Unix timestamp in seconds; when supplied, funding at or after that timestamp cannot qualify for that cycle. Without it, the report establishes no relationship to any selected loss cycle.

The funding asset policy `first_funding_source_v2` recognizes Base USDC, Robinhood USDG, Ethereum USDC/USDT, and BNB's Binance-Peg USDC/BSC-USD by exact contract address. A direct source requires a successful canonical receipt, matching full wallet Transfer history, a single positive transfer, exact ERC-20 `transfer` calldata, matching event sender and transaction sender, zero native value, and no mixed/taxed movements. Wallet-native gas payments, NFT events, zero transfers and self transfers do not become cash deposits. Unknown ERC-20 assets and routed cash credits remain unresolved; an earlier credit that cannot be proven below the minimum blocks selecting a later convenient direct sender. This conservative behavior can exclude harmless airdrops whose role cannot be established.

The user-approved minimum is **$10 per deposit, inclusive**, valued using the token's own historical USD price at credit time. USDC/USDT/USDG are not assumed to be worth exactly $1. The four chain namespaces are `base`, `robinhood`, `bsc`, and `ethereum`; unavailable historical coverage remains unpriced. Exact integer/decimal arithmetic applies 6 decimals for supported Base/Robinhood/Ethereum cash tokens and 18 for supported BNB tokens. Quotes require confidence >= 0.9 and distance <= 1 hour. This funding threshold does not change the $250 loss threshold or PnL pricing.

Known credits below $10 remain in `belowMinimumCredits`. They cannot establish priority, accumulate into a qualifying deposit, or inflate repeat strength. A smaller transfer from the same source before its first qualifying deposit is retained as a **possible** test transfer, without asserting intent. Priority and the before-cycle check use the qualifying deposit's timestamp. Thus $1 then $100 is one significant deposit plus test context; dust from A followed by $100 from B and later $100 from A leaves B first. Unknown values are not silently treated as dust. `firstObservedCredit` preserves the earliest raw observation, while `firstRelevantCredit` excludes proven dust and `firstObservedQualifyingCredit` reports the earliest observed deposit meeting the threshold.

`sourceSummaries` groups direct credits by source address **and chain**. It reports distinct deposit transactions, qualifying count, qualifying UTC days, possible tests, unpriced count, exact qualifying USD sum, and share of the observed qualifying direct USD total. That denominator excludes dust/unpriced/routed credits and is not a claim about all funding under incomplete coverage. Repeat strength is a factual count/flag, not a probability of ownership or permission to replace the first source. If a cycle opening is supplied, the summary separately counts qualifying deposits before it.

`firstSource` is populated only after all four histories and receipt decoding complete, finalized snapshots cover the credit time, and the first relevant credit is an unambiguous direct cash transfer meeting the $10 minimum. Cross-chain timestamps, not block numbers, determine order. A successful result is **`source_identified`**, not a verified signature or FOMO-account ownership. Reports always retain `signatureVerified: false` and `burialAuthorized: false`. The future server must independently revalidate evidence, establish the FOMO account/address scope, verify a nonce-bound source signature, check significant funding precedes the selected cycle, enforce one-account linkage and preserve economic IDs/quotas. Local JSON is not a trusted authorization token.

`firstObservedCredit`, `observedDirectSources`, per-chain `coverage`, and `reasons` retain useful discoveries during a partial scan. Relay pagination also records counterpart addresses/chains; discovering an external account, such as the Solana settlement address in the supplied example, prevents equating one EVM address's history with the entire FOMO account. Routed conversions, native-asset funding and complete history of related external accounts still need adapters. The script does not claim this broader account-wide proof is implemented.

Funding options:

- `--max-requests 1000`: budget **per chain**, including retries. Half is reserved for receipt decoding; Relay has a separate budget capped at 100. One failed chain does not starve the others.
- `--chunk-size 1000000`: adaptive range. Providing it explicitly with `--resume` resets range sizes, useful after changing providers that previously reduced a range to one block.
- `--timeout-ms 15000`: timeout per request. SIGINT/SIGTERM checkpoint safely and return 130.
- `--resume`: preserve snapshots and accumulated evidence for 24 hours. Wallet and an explicitly supplied cycle timestamp must match. Legacy v1 raw evidence is re-evaluated under v2, with the old decision archived to `.policy-v1.json`; unknown versions fail closed. Exclusive locks prevent concurrent writers. Within the same policy, failed/invalid resumes preserve existing analytical reports; a failure after a complete result goes to `.error.json`.

RPC overrides: `REKT_BASE_RPC_URL` (fallback `BASE_RPC_URL`), `REKT_ROBINHOOD_RPC_URL`, `REKT_BNB_RPC_URL`, `REKT_ETHEREUM_RPC_URL`. Public BNB/Ethereum defaults use dRPC. Its HTTP 400 block-range error is now classified and split; generic HTTP 400 authorization/configuration errors are not. The tested official BNB public endpoint did not serve the required log queries; PublicNode returned HTTP 403 for archive requests. Full genesis scans on public endpoints limited to 10,000 blocks remain expensive and resumable. Use providers with sufficient history and range support for production.

Contract references checked for this policy: [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Robinhood contracts](https://docs.robinhood.com/chain/contracts/), [Tether protocols](https://tether.to/en/supported-protocols/), [Trust Wallet BNB USDC registry](https://github.com/trustwallet/assets/blob/master/blockchains/smartchain/assets/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d/info.json), [BNB BSC-USD registry](https://github.com/trustwallet/assets/blob/master/blockchains/smartchain/assets/0x55d398326f99059fF775485246999027B3197955/info.json). These define scanner cash candidates; they are not a verified exhaustive list of FOMO-supported deposit assets.

Validation on 2026-09-09: 104 scanner tests pass. The live supplied-wallet run and resume found five receipt-checked direct Base USDC credits, including a credit 19 seconds before the earliest Robinhood buy. All five pass the $10 threshold using fetched historical quotes, across two UTC days. Robinhood history/decoding completed; three other chain histories and external-account coverage remain incomplete, so the report correctly has no established `firstSource`. See `docs/rekt-scanner-audit.md` for the author audit and exact limitations.
