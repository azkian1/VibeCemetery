import { createHash } from 'node:crypto';
import { decimal, formatDecimal } from './decimal.ts';
import { matchRelayFlow } from '../providers/relay.ts';
import type { RelayRequest, RelaySettlement } from '../providers/relay.ts';
import { canonicalLogs, ProviderError } from '../providers/rpc.ts';
import type { RpcLog, RpcReceipt, RpcBlock } from '../providers/rpc.ts';
import { transfer } from '../providers/uniswap-v3.ts';
import type { RouteObservation } from '../providers/dex.ts';

export interface RelayFlow {
  token: string; txHash: string; blockNumber: string; blockHash: string;
  transactionIndex: number; timestamp: number; deltaRaw: string; eventIds: string[];
  settlement?: RelaySettlement; reason?: string;
  route?: RouteObservation; warnings?: string[];
}
export interface RelayEvidence {
  chainId: number; wallet: string; fromBlock: string; snapshot: RpcBlock; historyComplete: boolean; relayHistoryComplete: boolean;
  flows: RelayFlow[]; balances: Record<string, string>; balanceErrors: Record<string, string>;
}

// Attribute target flows using receipt events, never a bundler's transaction.from.
// Relay attribution is provider evidence only and cannot produce eligible candidates.
export function decodeRelayReceipt(chainId: number, wallet: string, receipt: RpcReceipt, block: RpcBlock,
  expectedLogs: RpcLog[], requests: RelayRequest[]): RelayFlow[] {
  const txHash = receipt.transactionHash.toLowerCase();
  if (receipt.status !== '0x1' || block.hash !== receipt.blockHash || block.number !== receipt.blockNumber
    || expectedLogs.some(l => l.transactionHash.toLowerCase() !== txHash || l.blockHash !== block.hash || l.blockNumber !== block.number)) throw new ProviderError('receipt_block_mismatch');
  const actual = canonicalLogs(receipt.logs.filter(l => {
    const t = transfer(l); return t && (t.from === wallet || t.to === wallet);
  }));
  const expected = canonicalLogs(expectedLogs.filter(l => !!transfer(l)));
  const fingerprint = (logs: RpcLog[]) => JSON.stringify(logs.map(l => [l.transactionHash.toLowerCase(), l.logIndex, l.address.toLowerCase(), l.topics.map(t => t.toLowerCase()), l.data.toLowerCase()]));
  if (fingerprint(actual) !== fingerprint(expected)) throw new ProviderError('receipt_history_mismatch');
  const grouped = new Map<string, RpcLog[]>();
  for (const log of actual) { const token = log.address.toLowerCase(); const list = grouped.get(token) ?? []; list.push(log); grouped.set(token, list); }
  const result: RelayFlow[] = [];
  for (const [token, logs] of grouped) {
    const delta = logs.reduce((n, log) => { const t = transfer(log)!; return n + (t.to === wallet ? t.amount : 0n) - (t.from === wallet ? t.amount : 0n); }, 0n);
    // Pure zero-value logs cannot create or contaminate a position.
    if (logs.every(l => transfer(l)!.amount === 0n)) continue;
    const flow: RelayFlow = { token, txHash, blockHash: block.hash, blockNumber: BigInt(block.number).toString(),
      transactionIndex: Number(BigInt(receipt.transactionIndex)), timestamp: Number(BigInt(block.timestamp)),
      deltaRaw: delta.toString(), eventIds: logs.map(l => `${txHash}:${BigInt(l.logIndex)}`) };
    result.push({ ...flow, ...matchRelayFlow(chainId, wallet, flow, requests) });
  }
  return result;
}

export function analyzeRelay(e: RelayEvidence, days = 90) {
  const exclusions: { token: string; reason: string; txHash?: string }[] = [];
  const cycles: { id: string; token: string; symbol?: string; openedAt: number; closedAt: number;
    estimatedCostUsd: string | null; estimatedReturnedUsd: string | null; estimatedLossUsd: string | null;
    thresholdReached: boolean | null; estimatedLossPercent: string | null; buyCount: number; sellCount: number;
    status: 'preliminary' | 'excluded'; reasons: string[]; warnings: string[]; proof: RelayFlow[] }[] = [];
  const ordered = [...e.flows].sort((a, b) => BigInt(a.blockNumber) === BigInt(b.blockNumber)
    ? a.transactionIndex - b.transactionIndex : BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : 1);
  const requestUses = new Map<string, number>(), settlementUses = new Map<string, Set<string>>();
  for (const f of ordered) if (f.settlement) {
    const s = f.settlement;
    requestUses.set(s.requestId, (requestUses.get(s.requestId) ?? 0) + 1);
    const key = `${s.quote.chainId}:${s.quote.txHash}:${s.quote.owner}:${s.quote.token}`;
    const ids = settlementUses.get(key) ?? new Set(); ids.add(s.requestId); settlementUses.set(key, ids);
  }
  const pending = new Map<string, RelayFlow[]>(), inventory = new Map<string, bigint>();
  const tokenProblems = new Map<string, Set<string>>();
  const eventTokens = new Map<string, string[]>();
  for (const f of ordered) for (const id of f.eventIds) { const ts = eventTokens.get(id) ?? []; ts.push(f.token); eventTokens.set(id, ts); }
  const overlapTokens = new Set([...eventTokens.values()].filter(ts => ts.length > 1).flat());
  for (const token of new Set(ordered.map(f => f.token))) {
    const reasons = new Set<string>();
    const initial = e.balances[`${token}:${BigInt(e.fromBlock) - 1n}`];
    if (initial === undefined && e.fromBlock !== '1') reasons.add('unknown_opening_balance');
    inventory.set(token, initial === undefined ? 0n : BigInt(initial));
    if (inventory.get(token)! > 0n) reasons.add('unknown_opening_cost');
    const total = ordered.filter(f => f.token === token).reduce((n, f) => n + BigInt(f.deltaRaw), inventory.get(token)!);
    const snapshot = e.balances[`${token}:${BigInt(e.snapshot.number)}`];
    if (snapshot !== undefined && BigInt(snapshot) !== total) reasons.add('snapshot_balance_mismatch');
    if (!e.historyComplete || (!e.relayHistoryComplete && ordered.some(f => f.token === token && f.settlement?.source !== 'dex_wallet_net_historical_usd'))) reasons.add('incomplete_history');
    if (overlapTokens.has(token)) reasons.add('overlapping_events');
    tokenProblems.set(token, reasons);
  }
  for (const f of ordered) {
    const problems = tokenProblems.get(f.token)!;
    const before = inventory.get(f.token)!, after = before + BigInt(f.deltaRaw); inventory.set(f.token, after);
    if (after < 0n) problems.add('negative_inventory');
    const list = pending.get(f.token) ?? []; list.push(f); pending.set(f.token, list);
    if (after !== 0n) continue;
    const reasons = new Set(problems);
    if (BigInt(list[0].deltaRaw) <= 0n) reasons.add('missing_purchase');
    let cost = 0n, returned = 0n;
    for (const flow of list) {
      const s = flow.settlement;
      if (flow.reason || !s) { reasons.add(flow.reason ?? 'missing_settlement'); continue; }
      const key = `${s.quote.chainId}:${s.quote.txHash}:${s.quote.owner}:${s.quote.token}`;
      if (requestUses.get(s.requestId)! > 1 || settlementUses.get(key)!.size > 1) reasons.add('ambiguous_settlement_reuse');
      if (BigInt(flow.deltaRaw) > 0n) cost += decimal(s.amountUsd); else returned += decimal(s.amountUsd);
    }
    if (cost <= 0n) reasons.add('unknown_cost');
    const closing = e.balances[`${f.token}:${f.blockNumber}`];
    if (closing !== undefined && BigInt(closing) !== 0n) reasons.add('closing_balance_not_zero');
    const opening = e.balances[`${f.token}:${BigInt(list[0].blockNumber) - 1n}`];
    if (opening !== undefined && BigInt(opening) !== 0n) reasons.add('opening_balance_not_zero');
    const warnings = [...new Set(['fee_separation_unverified', ...list.flatMap(x => x.warnings ?? []),
      ...(list.some(x => x.settlement?.source === 'relay_historical_amount_usd') ? ['provider_settlement_not_independently_verified'] : [])])];
    if (opening === undefined || closing === undefined) warnings.push('cycle_boundary_balances_unverified');
    if (e.balances[`${f.token}:${BigInt(e.snapshot.number)}`] === undefined) warnings.push('snapshot_balance_unverified');
    if (f.timestamp > Number(BigInt(e.snapshot.timestamp)) || f.timestamp < Number(BigInt(e.snapshot.timestamp)) - days * 86400) reasons.add('outside_closure_window');
    const id = createHash('sha256').update(JSON.stringify([e.chainId, e.wallet, f.token, list.flatMap(x => x.eventIds).sort()])).digest('hex');
    cycles.push({ id, token: f.token, symbol: list.find(x => x.settlement?.symbol)?.settlement?.symbol,
      openedAt: list[0].timestamp, closedAt: f.timestamp, estimatedCostUsd: reasons.size ? null : formatDecimal(cost),
      estimatedReturnedUsd: reasons.size ? null : formatDecimal(returned), estimatedLossUsd: reasons.size ? null : formatDecimal(cost - returned),
      thresholdReached: reasons.size ? null : cost - returned >= decimal('250'),
      estimatedLossPercent: reasons.size ? null : formatDecimal((cost - returned) * 100n * decimal('1') / cost, 6),
      buyCount: list.filter(x => BigInt(x.deltaRaw) > 0n).length, sellCount: list.filter(x => BigInt(x.deltaRaw) < 0n).length,
      status: reasons.size ? 'excluded' : 'preliminary', reasons: [...reasons], warnings, proof: list });
    for (const reason of reasons) exclusions.push({ token: f.token, reason, txHash: f.txHash });
    pending.delete(f.token);
    // Unknown pre-window cost affects its first cycle only. Global reconciliation problems persist.
    problems.delete('unknown_opening_cost');
  }
  const openPositions = [...pending].map(([token, flows]) => {
    const reasons = new Set(['open_position', ...tokenProblems.get(token)!, ...flows.flatMap(f => f.reason ? [f.reason] : [])]);
    for (const reason of reasons) exclusions.push({ token, reason });
    return { token, symbol: flows.find(f => f.settlement?.symbol)?.settlement?.symbol, balanceRaw: inventory.get(token)!.toString(), reasons: [...reasons] };
  });
  // All Relay-derived estimates stay outside the existing eligible-candidate contract.
  const hasRelay = ordered.some(f => f.settlement?.source === 'relay_historical_amount_usd');
  const hasDirect = ordered.some(f => f.settlement?.source === 'dex_wallet_net_historical_usd');
  return { candidates: [], preliminaryCandidates: cycles.filter(c => c.status === 'preliminary' && c.thresholdReached).sort((a, b) =>
    decimal(a.estimatedLossUsd!) > decimal(b.estimatedLossUsd!) ? -1 : decimal(a.estimatedLossUsd!) < decimal(b.estimatedLossUsd!) ? 1 : a.id.localeCompare(b.id)),
    cycles, openPositions, exclusions, verification: { status: 'incomplete',
      missing: [...(hasRelay ? ['independent_settlement_verification', 'historical_price_quality'] : []),
        'operation_attribution', ...(ordered.some(f => f.settlement && f.settlement.quote.chainId !== e.chainId) ? ['cross_chain_ownership_and_operation_attribution'] : []),
        'gas_and_bridge_fee_separation', 'token_behavior_and_liquidity_checks',
        ...(Object.keys(e.balanceErrors).length ? ['historical_token_balances'] : [])],
      balanceReadErrors: e.balanceErrors,
      valuation: hasRelay && hasDirect ? 'mixed_relay_and_wallet_net_historical_usd' : hasDirect ? 'wallet_net_historical_usd' : 'relay_reported_historical_usd',
      feeTreatment: 'net_amounts_gas_separation_unverified' } };
}
