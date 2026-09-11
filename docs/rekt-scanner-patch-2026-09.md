# Scanner patch: September 2026

Scope: standalone read-only scanner, Base and Robinhood Chain. No website integration or deployment in this patch. Solana is not a scanning target; existing Relay-reported counterpart evidence is retained without querying Solana.

## Implementation plan

1. Pin official chain-specific Uni V2 factories, V3 factories and V4 PoolManagers and quote assets. Keep the existing strict Base V3 path compatible.
2. Add a discovery decoder for V2/V3/V4 and multi-pool ERC-20 routes. Verify V2/V3 membership through the official factory; resolve V4 PoolKey from Initialize and recompute PoolId. Never interpret all PoolManager custody as one pool's liquidity.
3. Combine direct wallet net settlement with Relay FOMO attribution in one token history. Keep unknown transfers, incomplete prices, non-EVM settlements and native settlement gaps explicit. Do not turn preliminary discovery into burial authorization.
4. Expand Relay settlement assets to supported EVM quote assets; retain historical USD fields only. Record protocol evidence and per-cycle verification gaps, including smart-account execution.
5. Persist receipts and pool metadata, version decoder caches, support retrying failed archive reads and preserve reports on failed resumes. Sort preview candidates by exact loss and include counts/percentages needed by UI.
6. Add synthetic positive and adversarial tests: V2/V3/V4 signs, fake factories/managers, pool-key mismatch, multiple hops, fees/mixed transfers, incomplete prices, duplicate cycles and resume behavior. Run scanner suite, typecheck and scoped lint. Replay a saved real wallet and perform a bounded fresh read-only scan.
7. Prepare a minimal isolated scanner Docker build and a server runbook: persistent private output volume, environment secrets, explicit budgets, cancellation/resume, one job per output path. No database, public HTTP endpoint or deployment needed yet.

## Source registry

- Robinhood deployments: https://github.com/Uniswap/contracts/blob/main/deployments/4663.md
- Base deployments: https://github.com/Uniswap/contracts/blob/main/deployments/8453.md
- V4 event/PoolKey semantics: https://github.com/Uniswap/v4-core/blob/main/src/interfaces/IPoolManager.sol
- Robinhood ecosystem (Uniswap, Rialto; perps separate): https://docs.robinhood.com/chain/
- Production RPC options: https://docs.robinhood.com/chain/connecting/

Rialto, UniswapX and launch-auction contracts are research follow-ups unless a route is attributable through the supported pool events or Relay. Ecosystem listing is not volume evidence. Do not claim arbitrary router, hook, launch, bridge or native asset coverage.

## Implemented and verified on September 11

- Added `--source auto` (`npm run rekt:discover`) combining pool recognition and Relay settlement. Added standalone V2/V4 discovery and Robinhood V3 discovery. The old strict Base V3 mode remains separate.
- Added verified V2/V3 factory membership and V4 PoolKey lookup via immutable PositionManager mapping or Initialize logs, with full keccak PoolId validation. Multi-pool ERC-20 settlement is matched against actual wallet deltas. V4 custody balances are never called pool liquidity.
- Added EVM Relay quote currencies/decimals, per-cycle percentages/counts, sorted preliminary candidates, explicit hook/sponsored/non-EVM warnings and quote-asset exclusion from target positions. First-funding policy remains unchanged; its complete-history/ownership gaps are not declared solved.
- Added receipt/metadata checkpoints, `--retry-evidence`, adjustable pacing and log-query-timeout range reduction. Added `--seed-checkpoint` for revalidated complete log history reused in a new snapshot; this dramatically reduces repeat history collection without truncating purchases.
- Fresh read-only run on the supplied wallet: 50 transactions, 18 closed token cycles, two preliminary losses over $250. Recognized V4 in 34 transactions and V3 in 10; counts can overlap within a route. Exact losses matched the prior report. Real V2 activity was not established on this wallet; V2 buy/sell paths are covered by synthetic tests on both chains.
- Initial incremental run consumed 225 requests; re-analysis with immutable V3 metadata fallback consumed 76. The shared RPC also produced real 429 and log-query timeouts in the earlier unseeded attempt. Those interruptions retained their checkpoints. Missing archive state is still explicit.
- 129 tests passed in a separate minimal runtime installation (only viem and its dependencies), including adversarial pool/route checks, range adaptation, seed validation, checkpoint write failure and FOMO EVM quotes. TypeScript and scoped ESLint pass. This is an author audit, not an independent review.
- Added isolated runtime lockfile, Dockerfile with a restricted build context, server runbook, and a tested standalone source layout. Docker is unavailable on this workstation; image build and Linux execution remain deployment-environment checks. No cloud deployment or website integration was performed.

## Remaining coverage limits

Discovery is operational; automatic burial verification is still incomplete. Native ETH settlement needs traces or equivalent complete native-flow proof; arbitrary launch auctions, UniswapX orders, Rialto-specific flows and unknown factories need dedicated adapters unless Relay already attributes the operation. Hook/account-operation attribution, historical state/price gaps, fees, token behavior and pool-specific liquidity remain per-case verification work. No new Solana queries or target-network support were introduced.
