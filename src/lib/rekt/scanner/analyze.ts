import { createHash } from 'node:crypto';
import { decimal, formatDecimal, usdValue, USD_SCALE } from './decimal.ts';
import type { Analysis, Evidence, Trade } from './types.ts';

const ADDRESS = /^0x[0-9a-f]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
export const ANALYZER_VERSION = 'rekt-closed-spot/1';

function validateTrade(t: Trade) {
  if (!ADDRESS.test(t.token) || !HASH.test(t.txHash) || !HASH.test(t.blockHash)
    || !/^\d+$/.test(t.blockNumber) || !/^-?\d+$/.test(t.deltaRaw)
    || !/^\d+$/.test(t.balanceBeforeRaw) || !/^\d+$/.test(t.balanceAfterRaw)
    || !Number.isSafeInteger(t.timestamp) || t.timestamp < 0
    || !Number.isSafeInteger(t.transactionIndex) || t.transactionIndex < 0
    || !['buy', 'sell', 'unsupported'].includes(t.kind) || !t.eventIds.length
    || t.eventIds.some(id => !new RegExp(`^${t.txHash}:\\d+$`).test(id))) throw new Error('invalid_trade_evidence');
}

export function analyze(evidence: Evidence, options: { days?: number; minLossUsd?: string } = {}): Analysis {
  if (evidence.schemaVersion !== 1 || !ADDRESS.test(evidence.wallet) || !Number.isSafeInteger(evidence.chainId)
    || !HASH.test(evidence.toBlockHash) || !/^\d+$/.test(evidence.fromBlock) || !/^\d+$/.test(evidence.toBlock)
    || BigInt(evidence.fromBlock) > BigInt(evidence.toBlock) || !Number.isSafeInteger(evidence.snapshotTimestamp)) throw new Error('invalid_evidence');
  const days = options.days ?? 90;
  if (!Number.isSafeInteger(days) || days < 1) throw new Error('invalid_days');
  const threshold = decimal(options.minLossUsd ?? '250');
  if (threshold < decimal('250')) throw new Error('threshold_below_250');
  const result: Analysis = { candidates: [], exclusions: [] };
  if (!evidence.historyComplete) {
    result.exclusions.push({ token: '*', reason: 'incomplete_history' });
    return result;
  }
  const seen = new Map<string, string>();
  const byToken = new Map<string, Trade[]>();
  for (const trade of evidence.trades) {
    validateTrade(trade);
    if (BigInt(trade.blockNumber) < BigInt(evidence.fromBlock) || BigInt(trade.blockNumber) > BigInt(evidence.toBlock)
      || trade.timestamp > evidence.snapshotTimestamp) throw new Error('trade_outside_coverage');
    const identity = `${trade.token}:${trade.txHash}`;
    const serialized = JSON.stringify(trade);
    if (seen.has(identity)) {
      if (seen.get(identity) !== serialized) throw new Error('conflicting_duplicate_trade');
      continue;
    }
    seen.set(identity, serialized);
    const list = byToken.get(trade.token) ?? [];
    list.push(trade);
    byToken.set(trade.token, list);
  }
  const usedEvents = new Set<string>();
  for (const [token, trades] of byToken) {
    trades.sort((a, b) => BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1 : a.transactionIndex - b.transactionIndex);
    const snapshotBalance = evidence.snapshotBalances?.[token];
    if (snapshotBalance === undefined || !/^\d+$/.test(snapshotBalance) || BigInt(snapshotBalance) !== BigInt(trades[trades.length - 1].balanceAfterRaw)) {
      result.exclusions.push({ token, reason: 'snapshot_balance_mismatch' });
      continue;
    }
    let cycle: Trade[] = [];
    let invalid = new Set<string>();
    let cost = 0n;
    let returned = 0n;
    let previous: bigint | undefined;
    for (const t of trades) {
      const before = BigInt(t.balanceBeforeRaw);
      const after = BigInt(t.balanceAfterRaw);
      const delta = BigInt(t.deltaRaw);
      if (previous !== undefined && previous !== before) invalid.add('balance_gap');
      if (!cycle.length && before !== 0n) invalid.add('unknown_opening_inventory');
      if (after !== before + delta) invalid.add('balance_mismatch');
      previous = after;
      // Zero-value unsolicited transfers cannot create or invalidate a cycle.
      if (delta === 0n && before === after && !cycle.length) continue;
      cycle.push(t);
      if (t.kind === 'unsupported') invalid.add(t.reason ?? 'unsupported_operation');
      if ((t.kind === 'buy' && delta <= 0n) || (t.kind === 'sell' && delta >= 0n)) invalid.add('invalid_trade_direction');
      if (t.kind !== 'unsupported') {
        const q = t.quote;
        if (!q || !ADDRESS.test(q.token) || !t.pool || !ADDRESS.test(t.pool)) invalid.add('missing_price_or_pool');
        else {
          try {
            if (!Number.isFinite(q.price.confidence) || q.price.confidence < 0.9 || q.price.confidence > 1
              || !Number.isSafeInteger(q.price.timestamp) || Math.abs(t.timestamp - q.price.timestamp) > 3600
              || !q.price.source) throw new Error('price_quality');
            const amount = usdValue(q.amountRaw, q.decimals, q.price.usd);
            if (amount <= 0n) throw new Error('zero_trade');
            if (usdValue(q.poolReserveRaw, q.decimals, q.price.usd) < decimal('10000')) invalid.add('insufficient_pool_liquidity');
            if (t.kind === 'buy') cost += amount;
            else returned += amount;
          } catch { invalid.add('unreliable_price_or_quantity'); }
        }
      }
      if (after !== 0n) continue;
      const first = cycle[0];
      const last = cycle[cycle.length - 1];
      if (first.kind !== 'buy' || last.kind !== 'sell' || cost <= 0n) invalid.add('not_closed_by_trading');
      if (first.blockNumber === last.blockNumber) invalid.add('same_block_cycle');
      const events = cycle.flatMap(x => x.eventIds).sort();
      if (new Set(events).size !== events.length || events.some(id => usedEvents.has(id))) invalid.add('overlapping_events');
      const loss = cost - returned;
      if (last.timestamp < evidence.snapshotTimestamp - days * 86400) invalid.add('closed_outside_window');
      if (loss < threshold) invalid.add(loss <= 0n ? 'not_a_loss' : 'below_threshold');
      if (!invalid.size) {
        const id = createHash('sha256').update(JSON.stringify([evidence.chainId, evidence.wallet, token, events])).digest('hex');
        result.candidates.push({
          id, chainId: evidence.chainId, wallet: evidence.wallet, token,
          openedAt: first.timestamp, closedAt: last.timestamp,
          costUsd: formatDecimal(cost), returnedUsd: formatDecimal(returned), lossUsd: formatDecimal(loss),
          lossPercent: formatDecimal(loss * 100n * USD_SCALE / cost, 6),
          eventIds: events, txHashes: [...new Set(cycle.map(x => x.txHash))],
          analyzerVersion: ANALYZER_VERSION, status: 'eligible', gasIncluded: false,
          valuation: 'historical_usd_estimate', proof: cycle,
        });
        events.forEach(id => usedEvents.add(id));
      } else for (const reason of invalid) result.exclusions.push({ token, reason, txHash: last.txHash });
      cycle = []; invalid = new Set(); cost = 0n; returned = 0n;
    }
    if (cycle.length) {
      const txHash = cycle[cycle.length - 1].txHash;
      result.exclusions.push({ token, reason: 'open_position', txHash });
      for (const reason of invalid) result.exclusions.push({ token, reason, txHash });
    }
  }
  result.candidates.sort((a, b) => decimal(a.lossUsd) > decimal(b.lossUsd) ? -1 : decimal(a.lossUsd) < decimal(b.lossUsd) ? 1 : a.id.localeCompare(b.id));
  return result;
}
