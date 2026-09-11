import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../src/lib/rekt/scanner/analyze.ts';
import { decimal, formatDecimal, usdValue } from '../../src/lib/rekt/scanner/decimal.ts';
import type { Evidence, Trade } from '../../src/lib/rekt/scanner/types.ts';

import { fixture } from "./fixtures.mts";
const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

for (const [returned, eligible, loss] of [['750.01', false, '249.99'], ['750.001', false, '249.999'], ['750', true, '250'], ['749.99', true, '250.01']] as const) {
  test(`exact inclusive threshold: loss ${loss}`, () => {
    const r = analyze(fixture(returned)); assert.equal(r.candidates.length, eligible ? 1 : 0);
    if (eligible) assert.equal(r.candidates[0].lossUsd, loss);
  });
}
test('large raw amounts and sub-cent precision never use floating point', () => {
  assert.equal(formatDecimal(usdValue('1000000000000000000000000000001', 18, '0.123456789123456789')), '123456789123.456789000000000000123456789123456789');
  assert.equal(formatDecimal(decimal('249.999')), '249.999');
});
test('full cycle loss and proof', () => {
  const candidate = analyze(fixture()).candidates[0];
  assert.equal(candidate.costUsd, '1000'); assert.equal(candidate.returnedUsd, '700');
  assert.equal(candidate.lossUsd, '300'); assert.equal(candidate.lossPercent, '30'); assert.equal(candidate.eventIds.length, 4);
});
test('closure window does not truncate old purchases', () => {
  const e = fixture(); e.trades[0].timestamp -= 200 * 86400; e.trades[0].quote!.price.timestamp = e.trades[0].timestamp;
  assert.equal(analyze(e).candidates.length, 1);
});
test('old closure filtered', () => { const e = fixture(); e.snapshotTimestamp += 91 * 86400; assert.equal(analyze(e).candidates.length, 0); });
test('stable IDs across sorting, duplicate input and window changes', () => {
  const e = fixture(); const id = analyze(e).candidates[0].id; e.trades.reverse(); e.trades.push(structuredClone(e.trades[0]));
  assert.equal(analyze(e, { days: 200 }).candidates[0].id, id);
});
test('two independent cycles remain separate', () => {
  const e = fixture(); const next = structuredClone(e.trades);
  next.forEach((t, i) => { t.txHash = hash(i + 3); t.blockNumber = String(i + 3); t.blockHash = hash(i + 13); t.eventIds = [`${t.txHash}:1`, `${t.txHash}:2`]; t.timestamp += 200; t.quote!.price.timestamp += 200; });
  e.trades.push(...next); const r = analyze(e); assert.equal(r.candidates.length, 2); assert.notEqual(r.candidates[0].id, r.candidates[1].id);
});
test('partial sells cannot cherry-pick a loss in a profitable cycle', () => {
  const e = fixture('1100'); assert.equal(analyze(e).candidates.length, 0);
});
for (const [name, mutate, reason] of [
  ['transfer instead of sale', (e: Evidence) => { e.trades[1].kind = 'unsupported'; e.trades[1].reason = 'transfer'; }, 'transfer'],
  ['unknown entry', (e: Evidence) => { e.trades[0].balanceBeforeRaw = '1'; }, 'unknown_opening_inventory'],
  ['balance gap', (e: Evidence) => { e.trades[1].balanceBeforeRaw = '9'; }, 'balance_gap'],
  ['dust', (e: Evidence) => { e.trades[1].balanceAfterRaw = '1'; e.snapshotBalances[address(2)] = '1'; }, 'open_position'],
  ['unknown price', (e: Evidence) => { delete e.trades[0].quote; }, 'missing_price_or_pool'],
  ['low confidence', (e: Evidence) => { e.trades[0].quote!.price.confidence = 0.5; }, 'unreliable_price_or_quantity'],
  ['stale price', (e: Evidence) => { e.trades[0].quote!.price.timestamp -= 3601; }, 'unreliable_price_or_quantity'],
  ['thin pool', (e: Evidence) => { e.trades[0].quote!.poolReserveRaw = '100'; }, 'insufficient_pool_liquidity'],
  ['incomplete history', (e: Evidence) => { e.historyComplete = false; }, 'incomplete_history'],
] as const) test(name, () => { const e = fixture(); mutate(e); const r = analyze(e); assert.equal(r.candidates.length, 0); assert.ok(r.exclusions.some(x => x.reason === reason)); });
test('stablecoins are historically priced, including depegs', () => {
  const e = fixture(); e.trades[1].quote!.price.usd = '0.5'; assert.equal(analyze(e).candidates[0].lossUsd, '650');
});
test('same economic events cannot create overlapping candidates', () => {
  const e = fixture(); const others = structuredClone(e.trades); others.forEach(t => { t.token = address(9); }); e.trades.push(...others);
  e.snapshotBalances[address(9)] = '0';
  assert.equal(analyze(e).candidates.length, 1); assert.ok(analyze(e).exclusions.some(x => x.reason === 'overlapping_events'));
});
test('conflicting duplicate evidence fails closed', () => {
  const e = fixture(); const other = structuredClone(e.trades[0]); other.deltaRaw = '1'; e.trades.push(other); assert.throws(() => analyze(e), /conflicting_duplicate/);
});
test('malformed quantities and unsupported precision rejected', () => {
  assert.throws(() => decimal('NaN')); assert.throws(() => usdValue('1', 18, '1e2'));
  assert.throws(() => usdValue('1', 256, '1')); assert.throws(() => analyze(fixture(), { minLossUsd: '249' }));
});
test('multiple buys and partial sells use the entire position cycle', () => {
  const e = fixture(); const buy = e.trades[0], sell = e.trades[1];
  const make = (base: Trade, n: number, delta: string, before: string, after: string, paid: string) => {
    const t = structuredClone(base); t.txHash = hash(n); t.blockHash = hash(n + 10); t.blockNumber = String(n);
    t.eventIds = [`${t.txHash}:1`, `${t.txHash}:2`]; t.timestamp = 1700000000 + n * 100;
    t.deltaRaw = delta; t.balanceBeforeRaw = before; t.balanceAfterRaw = after;
    t.quote!.amountRaw = paid; t.quote!.decimals = 0; t.quote!.price.timestamp = t.timestamp;
    return t;
  };
  e.trades = [make(buy, 1, '100', '0', '100', '1000'), make(sell, 2, '-40', '100', '60', '100'), make(buy, 3, '40', '60', '100', '300'), make(sell, 4, '-100', '100', '0', '500')];
  const [candidate] = analyze(e).candidates;
  assert.equal(candidate.costUsd, '1300'); assert.equal(candidate.returnedUsd, '600'); assert.equal(candidate.lossUsd, '700'); assert.equal(candidate.proof.length, 4);
});
test('snapshot balance independently catches unlogged inventory changes', () => {
  const e = fixture(); e.snapshotBalances[address(2)] = '1';
  const r = analyze(e); assert.equal(r.candidates.length, 0); assert.equal(r.exclusions[0].reason, 'snapshot_balance_mismatch');
});
