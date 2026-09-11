import { collectRelayHistory } from '../../src/lib/rekt/providers/relay.ts';
import type { RelayHistory } from '../../src/lib/rekt/providers/relay.ts';
import { DexDecoder, matchesWalletRoute } from '../../src/lib/rekt/providers/dex.ts';
import type { DexCache, DexProtocol } from '../../src/lib/rekt/providers/dex.ts';
import { quoteAssets, ZERO_ADDRESS } from '../../src/lib/rekt/providers/deployments.ts';
import { HistoricalPrices } from '../../src/lib/rekt/providers/prices.ts';
import { transfer } from '../../src/lib/rekt/providers/uniswap-v3.ts';
import { ProviderError, hex } from '../../src/lib/rekt/providers/rpc.ts';
import type { Rpc, RpcBlock, RpcLog, RpcReceipt, RpcTransaction } from '../../src/lib/rekt/providers/rpc.ts';
import { analyzeRelay, decodeRelayReceipt } from '../../src/lib/rekt/scanner/relay.ts';
import type { RelayFlow } from '../../src/lib/rekt/scanner/relay.ts';
import type { Price } from '../../src/lib/rekt/scanner/types.ts';
import { formatDecimal, usdValue } from '../../src/lib/rekt/scanner/decimal.ts';
import { mapBounded } from '../../src/lib/rekt/providers/parallel.ts';

export const DISCOVERY_VERSION = 'evm-dex-relay/1';
export interface DiscoveryCheckpoint {
  version: string; relay: RelayHistory; relayError?: string;
  receipts: Record<string, RpcReceipt>; blocks: Record<string, RpcBlock>; transactions: Record<string, RpcTransaction>;
  dex: DexCache; flows: Record<string, RelayFlow[]>; prices: Record<string, Price>;
  balances: Record<string, string>; balanceErrors: Record<string, string>;
}
export function newDiscoveryCheckpoint(): DiscoveryCheckpoint {
  return { version: DISCOVERY_VERSION, relay: { apiVersion: process.env.REKT_RELAY_API_KEY ? 'v3' : 'v2', requests: [], seenContinuations: [], complete: false },
    receipts: {}, blocks: {}, transactions: {}, dex: { pools: {}, v4Search: {} }, flows: {}, prices: {}, balances: {}, balanceErrors: {} };
}

// Called only after validating the old finalized snapshot against the current RPC.
// Refresh mutable provider evidence and derived flows; never reuse failure markers.
export function reuseDiscoveryEvidence(old: DiscoveryCheckpoint, snapshot: RpcBlock): DiscoveryCheckpoint {
  const state = newDiscoveryCheckpoint();
  const limit = BigInt(snapshot.number);
  state.receipts = Object.fromEntries(Object.entries(old.receipts).filter(([, r]) => BigInt(r.blockNumber) <= limit));
  state.blocks = Object.fromEntries(Object.entries(old.blocks).filter(([, b]) => BigInt(b.number) <= limit));
  state.transactions = Object.fromEntries(Object.entries(old.transactions).filter(([h, t]) => state.receipts[h]?.blockHash === t.blockHash));
  if (old.version === DISCOVERY_VERSION) {
    state.dex.pools = structuredClone(old.dex.pools); state.prices = structuredClone(old.prices);
    state.balances = Object.fromEntries(Object.entries(old.balances).filter(([k]) => BigInt(k.split(':')[1]) <= limit));
  }
  return state;
}

export async function discoverReceipt(rpc: Rpc, chainId: number, wallet: string, receipt: RpcReceipt, block: RpcBlock,
  expected: RpcLog[], state: DiscoveryCheckpoint, save: () => Promise<void>, only?: DexProtocol): Promise<RelayFlow[]> {
  const all = decodeRelayReceipt(chainId, wallet, receipt, block, expected, only ? [] : state.relay.requests);
  const quotes = quoteAssets(chainId), flows = all.filter(f => !quotes[f.token]);
  if (!flows.length) return [];
  const route = await new DexDecoder(rpc, chainId, state.dex, save).observe(receipt, only);
  const walletDeltas = new Map<string, bigint>();
  for (const log of receipt.logs) {
    const t = transfer(log); if (!t || (t.to !== wallet && t.from !== wallet)) continue;
    walletDeltas.set(t.token, (walletDeltas.get(t.token) ?? 0n) + (t.to === wallet ? t.amount : 0n) - (t.from === wallet ? t.amount : 0n));
  }
  const nonzero = [...walletDeltas].filter(([, v]) => v !== 0n), cash = nonzero.filter(([t]) => quotes[t]);
  const txHash = receipt.transactionHash.toLowerCase();
  let tx = state.transactions[txHash];
  if (!tx) { tx = await rpc.call<RpcTransaction>('eth_getTransactionByHash', [txHash]); state.transactions[txHash] = tx; await save(); }
  if (tx.hash.toLowerCase() !== txHash || tx.blockHash !== receipt.blockHash) throw new ProviderError('transaction_receipt_mismatch');
  const warnings = ['discovery_only_no_burial_authorization', 'token_behavior_and_liquidity_unverified'];
  if (tx.from.toLowerCase() !== wallet) warnings.push('smart_account_or_relayer_operation_unverified');
  if (route.swaps.some(s => s.hooks && s.hooks !== ZERO_ADDRESS)) warnings.push('v4_hook_accounting_unverified');
  for (const f of flows) {
    f.route = route; f.warnings = [...warnings];
    // Prefer a complete same-chain wallet settlement. Full receipt deltas already include ERC-20 fees.
    // Never infer native amounts from tx.value: refunds, sponsored fees and relayer payouts differ.
    if (flows.length === 1 && nonzero.length === 2 && cash.length === 1 && BigInt(tx.value) === 0n && matchesWalletRoute(route, walletDeltas)) {
      const [token, delta] = cash[0];
      if ((delta > 0n) === (BigInt(f.deltaRaw) > 0n)) continue;
      const price = await new HistoricalPrices(rpc.transport, state.prices, chainId).get(token, f.timestamp);
      if (price) {
        const amount = delta < 0n ? -delta : delta;
        f.settlement = { requestId: `dex:${chainId}:${txHash}:${f.token}`, amountUsd: formatDecimal(usdValue(amount.toString(), quotes[token].decimals, price.usd)),
          quote: { chainId, token, decimals: quotes[token].decimals, amountRaw: amount.toString(), owner: wallet, txHash, historicalPrice: price }, source: 'dex_wallet_net_historical_usd' };
        delete f.reason;
      } else if (!f.settlement) f.reason = 'missing_historical_quote_price';
    } else if (!f.settlement) {
      f.reason = route.swaps.some(s => s.token0 === ZERO_ADDRESS || s.token1 === ZERO_ADDRESS) || BigInt(tx.value) > 0n
        ? 'native_settlement_requires_trace' : route.issues[0] ?? (route.swaps.length ? 'unmatched_wallet_route_settlement' : f.reason);
    }
    if (f.settlement?.source === 'relay_historical_amount_usd' && f.settlement.quote.chainId !== chainId) {
      f.warnings.push('cross_chain_settlement_unverified');
      if (f.settlement.quote.chainId === 792703809) f.warnings.push('settlement_chain_outside_evm_scope');
    }
  }
  return flows;
}

export async function scanDiscovery(rpc: Rpc, chainId: number, wallet: string, fromBlock: string, snapshot: RpcBlock,
  logs: RpcLog[], state: DiscoveryCheckpoint, days: number, save: () => Promise<void>, options: { only?: DexProtocol; retryEvidence?: boolean; concurrency?: number } = {}) {
  if (state.version !== DISCOVERY_VERSION) {
    // Receipts remain immutable evidence; derived metadata/results must be recomputed after decoder changes.
    state.version = DISCOVERY_VERSION; state.flows = {}; state.dex = { pools: {}, v4Search: {} };
  }
  if (options.retryEvidence) { state.flows = {}; state.balanceErrors = {}; state.dex.v4Search = {}; }
  if (!options.only) {
    try { await collectRelayHistory(rpc.transport, wallet, state.relay, save, { apiKey: process.env.REKT_RELAY_API_KEY }); delete state.relayError; }
    catch (error) {
      if (!(error instanceof ProviderError) || !['http_401', 'http_403', 'http_404', 'http_410'].includes(error.code)) throw error;
      state.relayError = error.code; await save();
    }
  }
  const groups = new Map<string, RpcLog[]>();
  for (const log of logs) { const hash = log.transactionHash.toLowerCase(); const list = groups.get(hash) ?? []; list.push(log); groups.set(hash, list); }
  await mapBounded([...groups], options.concurrency ?? 1, async ([hash, expected]) => {
    if (state.flows[hash]) return;
    let receipt = state.receipts[hash];
    if (!receipt) { receipt = await rpc.call<RpcReceipt>('eth_getTransactionReceipt', [hash]); state.receipts[hash] = receipt; }
    if (receipt.transactionHash.toLowerCase() !== hash) throw new ProviderError('invalid_receipt');
    let block = state.blocks[receipt.blockNumber];
    if (!block) { block = await rpc.call<RpcBlock>('eth_getBlockByNumber', [receipt.blockNumber, false]); state.blocks[receipt.blockNumber] = block; }
    state.flows[hash] = await discoverReceipt(rpc, chainId, wallet, receipt, block, expected, state, async () => {}, options.only);
    await save();
  });
  const flows = Object.values(state.flows).flat(), reads = new Set<string>();
  for (const f of flows) {
    if (fromBlock !== '1') reads.add(`${f.token}:${BigInt(fromBlock) - 1n}`);
    reads.add(`${f.token}:${BigInt(snapshot.number)}`);
    reads.add(`${f.token}:${BigInt(f.blockNumber) - 1n}`); reads.add(`${f.token}:${f.blockNumber}`);
  }
  let archiveUnavailable = false;
  const readBalance = async (key: string) => {
    if (state.balances[key] !== undefined || state.balanceErrors[key] !== undefined) return;
    const [token, bn] = key.split(':');
    if (archiveUnavailable) { state.balanceErrors[key] = 'archive_read_skipped_after_provider_failure'; return; }
    try {
      const value = await rpc.call<string>('eth_call', [{ to: token, data: `0x70a08231${wallet.slice(2).padStart(64, '0')}` }, hex(BigInt(bn))]);
      if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new ProviderError('invalid_contract_response');
      state.balances[key] = BigInt(value).toString();
    } catch (error) {
      if (!(error instanceof ProviderError) || !['rpc_error_-32000', 'rpc_error_-32601', 'contract_reverted', 'invalid_contract_response'].includes(error.code)) throw error;
      state.balanceErrors[key] = error.code;
      // Keep all gaps explicit while avoiding hundreds of identical failing archive calls.
      if (['rpc_error_-32000', 'rpc_error_-32601'].includes(error.code)) archiveUnavailable = true;
    }
    await save();
  };
  const pendingReads = [...reads].filter(key => state.balances[key] === undefined && state.balanceErrors[key] === undefined);
  // Probe archive support before starting a batch of potentially unsupported reads.
  const first = pendingReads.shift(); if (first) await readBalance(first);
  await mapBounded(pendingReads, options.concurrency ?? 1, readBalance);
  await save();
  const evidence = { chainId, wallet, fromBlock, snapshot, historyComplete: true,
    relayHistoryComplete: options.only ? true : state.relay.complete, flows, balances: state.balances, balanceErrors: state.balanceErrors };
  const counts: Record<string, number> = {};
  for (const receiptFlows of Object.values(state.flows)) for (const p of new Set(receiptFlows.flatMap(f => f.route?.swaps.map(s => s.protocol) ?? []))) counts[p] = (counts[p] ?? 0) + 1;
  return { ...analyzeRelay(evidence, days), evidence, discovery: { version: DISCOVERY_VERSION, protocolsByTransaction: counts,
    relayComplete: state.relay.complete, relayError: state.relayError, quoteAssetsExcludedFromPositions: Object.keys(quoteAssets(chainId)),
    scope: 'erc20_positions_uniswap_v2_v3_v4_and_relay', authorization: false } };
}
