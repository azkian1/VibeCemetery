import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rpc, Transport } from '../../src/lib/rekt/providers/rpc.ts';
import { requestCost } from '../../src/lib/rekt/providers/usage.ts';

const url = 'https://base-mainnet.g.alchemy.com/v2/private-fixture-key';
const ok = async () => Response.json({ result: '0x1' });

test('CU accounting separates billing weights, throughput weights and external providers without secrets', async () => {
  const t = new Transport({ intervalMs: 0, cuPerSecond: 500, wait: async () => {}, fetch: ok });
  const rpc = new Rpc(url, t), other = new Rpc('https://rpc.fixture.invalid', t);
  await rpc.call('eth_chainId', []); await rpc.call('eth_call', ['private-parameter']);
  await rpc.call('alchemy_getAssetTransfers', []); await other.call('eth_getTransactionReceipt', []);
  await t.json('https://api.relay.link/requests?key=private-relay-key');
  const m = t.metrics();
  assert.equal(m.requests, 5); assert.equal(m.usage.estimatedRpcCu, 166);
  assert.equal(m.usage.estimatedAlchemyCu, 146); assert.equal(m.usage.estimatedThroughputCu, 171);
  assert.equal(m.usage.pacingWaitMs, 342); assert.equal(m.usage.unknownCostRequests, 0);
  assert.equal(m.usage.byMethod.find(r => r.method === 'external_http')?.estimatedCu, 0);
  assert.doesNotMatch(JSON.stringify(m), /private-|https:|fixture/);
  const before = m.usage.byMethod[1].requests;
  await rpc.call('eth_call', []); assert.equal(m.usage.byMethod[1].requests, before);
});

test('weighted pacing serializes concurrent RPC launches across Base and Robinhood origins', async () => {
  let clock = 0, waiting = 0, peak = 0;
  const starts: number[] = [];
  const t = new Transport({ intervalMs: 0, cuPerSecond: 500,
    wait: async ms => { waiting++; peak = Math.max(peak, waiting); await Promise.resolve(); clock += ms; waiting--; },
    fetch: async () => { starts.push(clock); return Response.json({ result: '0x1' }); } });
  await Promise.all(Array.from({ length: 20 }, (_, n) => new Rpc(n % 2 ? url : 'https://robinhood-mainnet.g.alchemy.com/v2/secret', t).call('eth_call', [])));
  assert.equal(peak, 1); assert.equal(starts.length, 20);
  assert.equal(starts[0], 52);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 52);
  assert.equal(t.usage.estimatedRpcCu, 520); assert.equal(t.usage.pacingWaitMs, 1040);
});

test('concurrent CU budget is inclusive and rejects before dispatch without overspending', async () => {
  let fetched = 0;
  const t = new Transport({ cuPerSecond: 450, maxCu: 52, intervalMs: 0, wait: async () => {},
    fetch: async () => { fetched++; return Response.json({ result: '0x1' }); } });
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, n) => new Rpc(n % 2 ? url : 'https://other.invalid', t).call('eth_call', [])));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => /cu_budget_exhausted/.test(String(r.reason))));
  assert.equal(fetched, 2); assert.equal(t.requests, 2); assert.equal(t.usage.estimatedRpcCu, 52);
});

test('different origin gates still cannot race past the CU budget when pacing is disabled', async () => {
  const t = new Transport({ maxCu: 26, intervalMs: 0, wait: async () => {}, fetch: ok });
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, n) => new Rpc(`https://rpc-${n}.invalid`, t).call('eth_call', [])));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(t.usage.estimatedRpcCu, 26); assert.equal(t.requests, 1);
});

test('HTTP and JSON-RPC throttles count each retry and consume the same CU budget', async () => {
  let fetched = 0;
  const t = new Transport({ maxCu: 78, cuPerSecond: 450, intervalMs: 0, wait: async () => {},
    fetch: async () => {
      fetched++;
      if (fetched === 1) return new Response('', { status: 429 });
      if (fetched === 2) return Response.json({ error: { code: -32005, message: 'compute units rate limit' } });
      return Response.json({ result: '0x1' });
    } });
  assert.equal(await new Rpc(url, t).call('eth_call', []), '0x1');
  assert.equal(t.usage.retryRequests, 2); assert.equal(t.usage.http429Responses, 1);
  assert.equal(t.usage.rpcRateLimitResponses, 1); assert.equal(t.usage.estimatedAlchemyCu, 78);
  await assert.rejects(new Rpc(url, t).call('eth_call', []), /cu_budget_exhausted/);
  assert.equal(fetched, 3);
});

test('network failures count attempted CU; retries stop at budget', async () => {
  const t = new Transport({ maxCu: 26, intervalMs: 0, wait: async () => {}, fetch: async () => { throw new Error('private-url'); } });
  await assert.rejects(new Rpc(url, t).call('eth_call', []), /cu_budget_exhausted/);
  assert.equal(t.requests, 1); assert.equal(t.usage.estimatedAlchemyCu, 26); assert.equal(t.usage.retryRequests, 0);
});

test('cancelling during CU pacing drains queued requests without fetching or charging them', async () => {
  const controller = new AbortController(); let fetched = 0;
  const t = new Transport({ signal: controller.signal, cuPerSecond: 450, intervalMs: 0,
    wait: async () => { controller.abort(); }, fetch: async () => { fetched++; return Response.json({ result: '0x1' }); } });
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => new Rpc(url, t).call('eth_call', [])));
  assert.ok(results.every(r => r.status === 'rejected')); assert.equal(fetched, 0);
  assert.equal(t.requests, 0); assert.equal(t.usage.estimatedRpcCu, 0);
});

test('unknown costs and batch payloads cannot bypass active CU limits', async () => {
  const t = new Transport({ cuPerSecond: 450, wait: async () => {}, fetch: ok });
  await assert.rejects(new Rpc(url, t).call('unpriced_method', []), /unknown_rpc_cu_cost/);
  await assert.rejects(t.json(url, [{ method: 'eth_call' }, { method: 'eth_call' }]), /rpc_batch_accounting_unsupported/);
  assert.equal(t.requests, 0);
  const cost = requestCost(url, { method: '__proto__' });
  assert.equal(cost.known, false); assert.equal(cost.method, 'unknown_rpc');
  const unbounded = new Transport({ wait: async () => {}, fetch: ok });
  await new Rpc(url, unbounded).call('unpriced_method', []);
  assert.equal(unbounded.usage.unknownCostRequests, 1);
});

test('invalid CU limits fail before any requests and explicit slower pacing still applies', async () => {
  for (const value of [0, -1, NaN, Infinity, 0.5]) {
    assert.throws(() => new Transport({ cuPerSecond: value }), /invalid_cu_limit/);
    assert.throws(() => new Transport({ maxCu: value }), /invalid_cu_limit/);
  }
  const waits: number[] = [];
  const t = new Transport({ cuPerSecond: 450, intervalMs: 250, wait: async ms => { waits.push(ms); }, fetch: ok });
  await new Rpc(url, t).call('eth_call', []);
  assert.deepEqual(waits, [250]);
});
