import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transport, Rpc, collectHistory, ProviderError, TRANSFER_TOPIC } from '../../src/lib/rekt/providers/rpc.ts';
import type { HistoryCheckpoint, RpcLog } from '../../src/lib/rekt/providers/rpc.ts';
import { HistoricalPrices, HistoricalFundingPrices } from '../../src/lib/rekt/providers/prices.ts';
import { fundingChains } from '../../src/lib/rekt/providers/funding-chains.ts';

const wallet = `0x${'1'.repeat(40)}`;
const fetcher = (fn: (url: string, body: Record<string, unknown>) => Response | Promise<Response>) => (async (url, init) => fn(String(url), init?.body ? JSON.parse(String(init.body)) : {})) as typeof fetch;
const options = { wait: async () => {}, retries: 0 };
test('429 retry respects bounded attempts and preserves decimal lexeme', async () => {
  let calls = 0; const waits: number[] = [];
  const transport = new Transport({ retries: 2, wait: async ms => { waits.push(ms); }, fetch: fetcher(() => ++calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '1' } }) : new Response('{"price":0.123456789123456789,"integer":9007199254740993}')) });
  assert.deepEqual(await transport.json('https://test.invalid'), { price: '0.123456789123456789', integer: '9007199254740993' });
  assert.equal(calls, 2); assert.ok(waits.includes(1000));
});
test('retries cannot exceed request budget', async () => {
  const transport = new Transport({ ...options, retries: 5, maxRequests: 2, fetch: fetcher(() => new Response('', { status: 503 })) });
  await assert.rejects(transport.json('https://test.invalid'), /budget/); assert.equal(transport.requests, 2);
});
test('timeout becomes explicit provider error', async () => {
  const transport = new Transport({ ...options, fetch: fetcher(() => { throw new DOMException('test', 'TimeoutError'); }) });
  await assert.rejects(transport.json('https://test.invalid'), /network_or_invalid_response/);
});
test('aborted request does not retry', async () => {
  const controller = new AbortController(); controller.abort();
  const transport = new Transport({ ...options, signal: controller.signal });
  await assert.rejects(transport.json('https://test.invalid')); assert.equal(transport.requests, 0);
});
test('history adapts ranges, deduplicates self transfers and resumes without skipping failed half', async () => {
  let incomingFails = true;
  const log: RpcLog = { address: `0x${'2'.repeat(40)}`, topics: [TRANSFER_TOPIC, `0x${wallet.slice(2).padStart(64, '0')}`, `0x${wallet.slice(2).padStart(64, '0')}`], data: `0x${'0'.repeat(63)}1`, blockNumber: '0x3', blockHash: `0x${'4'.repeat(64)}`, transactionHash: `0x${'5'.repeat(64)}`, transactionIndex: '0x0', logIndex: '0x1' };
  const transport = new Transport({ ...options, fetch: fetcher((_url, body) => {
    const filter = (body.params as { fromBlock: string; toBlock: string; topics: unknown[] }[])[0];
    if (BigInt(filter.toBlock) - BigInt(filter.fromBlock) >= 2n) return Response.json({ error: { code: -32005, message: 'block range limit' } });
    if (filter.topics[1] === null && incomingFails) { incomingFails = false; return new Response('', { status: 503 }); }
    return Response.json({ result: BigInt(filter.fromBlock) <= 3n && BigInt(filter.toBlock) >= 3n ? [log] : [] });
  }) });
  const rpc = new Rpc('https://test.invalid', transport);
  const state: HistoryCheckpoint = { nextToBlock: '4', chunkSize: '4', logs: [], complete: false };
  let saves = 0; const save = async () => { saves++; };
  await assert.rejects(collectHistory(rpc, wallet, 1n, state, save), /http_503/);
  assert.equal(state.nextToBlock, '4'); assert.equal(state.logs.length, 0);
  await collectHistory(rpc, wallet, 1n, state, save);
  assert.equal(state.complete, true); assert.equal(state.logs.length, 1); assert.ok(saves >= 3);
});
test('RPC does not leak provider error text or credentials', async () => {
  const rpc = new Rpc('https://test.invalid/private-secret', new Transport({ ...options, fetch: fetcher(() => Response.json({ error: { code: -32000, message: 'private-secret failure' } })) }));
  await assert.rejects(rpc.call('eth_call', []), error => error instanceof ProviderError && !error.message.includes('private-secret'));
});
test('historical prices reject missing, stale, low-confidence values and retain depeg', async () => {
  const token = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
  let item = { price: '0.91', timestamp: '1700000000', confidence: '0.99' };
  const make = () => new HistoricalPrices(new Transport({ ...options, fetch: fetcher(() => Response.json({ coins: { [`base:${token}`]: item } })) }));
  assert.equal((await make().get(token, 1700000000))?.usd, '0.91');
  item = { ...item, timestamp: '1600000000' }; assert.equal(await make().get(token, 1700000000), undefined);
  item = { ...item, timestamp: '1700000000', confidence: '0.1' }; assert.equal(await make().get(token, 1700000000), undefined);
  assert.equal(await make().get(wallet, 1700000000), undefined);
});
test('HTTP 413 block limit is split and JSON-RPC rate limits back off', async () => {
  let first = true; let second = true;
  const transport = new Transport({ ...options, retries: 2, fetch: fetcher(() => {
    if (first) { first = false; return new Response('', { status: 413 }); }
    if (second) { second = false; return Response.json({ error: { code: -32005, message: 'rate limit exceeded' } }); }
    return Response.json({ result: [] });
  }) });
  const state: HistoryCheckpoint = { nextToBlock: '10', chunkSize: '10', logs: [], complete: false };
  await collectHistory(new Rpc('https://test.invalid', transport), wallet, 1n, state, async () => {});
  assert.equal(state.complete, true); assert.equal(state.chunkSize, '5');
});

test('HTTP 400 RPC range errors are adaptive; credential and malformed errors are not', async () => {
  let first = true;
  const transport = new Transport({ ...options, fetch: fetcher(() => {
    if (first) { first = false; return Response.json({ error: { code: 35, message: 'ranges over 10000 blocks are not supported on free plan' } }, { status: 400 }); }
    return Response.json({ result: [] });
  }) });
  const state: HistoryCheckpoint = { nextToBlock: '10', chunkSize: '10', logs: [], complete: false };
  await collectHistory(new Rpc('https://test.invalid', transport), wallet, 0n, state, async () => {});
  assert.equal(state.complete, true); assert.equal(state.chunkSize, '5'); assert.equal(state.nextToBlock, '-1');
  for (const body of ['{"error":{"message":"invalid API key private-secret"}}', 'not JSON']) {
    const rpc = new Rpc('https://test.invalid', new Transport({ ...options, fetch: fetcher(() => new Response(body, { status: 400 })) }));
    await assert.rejects(rpc.call('eth_getLogs', []), error => error instanceof ProviderError && error.code === 'http_400');
  }
});

test('archive restrictions and unavailable historical providers remain explicit coverage gaps', async () => {
  for (const [status, message, expected] of [
    [403, 'Archive requests require a personal token. private-secret', 'rpc_archive_access_required'],
    [400, "Can't route your request to suitable provider", 'rpc_history_provider_unavailable'],
  ] as const) {
    const rpc = new Rpc('https://test.invalid', new Transport({ ...options, fetch: fetcher(() => Response.json({ error: { message } }, { status })) }));
    await assert.rejects(rpc.call('eth_getLogs', []), error => error instanceof ProviderError && error.code === expected && !error.message.includes('private-secret'));
  }
});

test('HTTP 408 is retried within the same bounded request budget', async () => {
  let requests = 0;
  const transport = new Transport({ ...options, retries: 2, fetch: fetcher(() => ++requests === 1 ? new Response('', { status: 408 }) : Response.json({ result: [] })) });
  assert.deepEqual(await new Rpc('https://test.invalid', transport).call('eth_getLogs', []), []);
  assert.equal(requests, 2);
});

test('Robinhood log query timeout shrinks history range; state read errors stay distinct', async () => {
  let first = true;
  const transport = new Transport({ ...options, fetch: fetcher(() => {
    if (first) { first = false; return Response.json({ error: { code: -32000, message: 'log query timed out' } }); }
    return Response.json({ result: [] });
  }) });
  const state: HistoryCheckpoint = { nextToBlock: '10', chunkSize: '10', logs: [], complete: false };
  await collectHistory(new Rpc('https://test.invalid', transport), wallet, 1n, state, async () => {});
  assert.equal(state.complete, true); assert.equal(state.chunkSize, '5');
  const rpc = new Rpc('https://test.invalid', new Transport({ ...options, fetch: fetcher(() => Response.json({ error: { code: -32000, message: 'query timed out' } })) }));
  await assert.rejects(rpc.call('eth_call', []), /rpc_error_-32000/);
});

test('funding historical prices use chain/token/time-specific quotes and cache without assuming a peg', async () => {
  const names: Record<number, string> = { 8453: 'base', 4663: 'robinhood', 56: 'bsc', 1: 'ethereum' };
  const urls: string[] = [];
  const provider = new HistoricalFundingPrices(new Transport({ ...options, fetch: fetcher(url => {
    urls.push(url); const key = new URL(url).pathname.split('/').at(-1)!;
    return Response.json({ coins: { [key]: { price: '0.975123456789123456', timestamp: 900, confidence: 0.99 } } });
  }) }));
  for (const chain of fundingChains()) {
    const token = Object.keys(chain.cashTokens)[0];
    const p = await provider.get(chain.id, token, 900);
    assert.equal(p?.usd, '0.975123456789123456'); assert.equal(p?.source, `defillama:historical:${names[chain.id]}`);
    assert.deepEqual(await provider.get(chain.id, token, 900), p);
  }
  assert.equal(urls.length, 4); assert.ok(urls.every(url => url.includes('/historical/900/') && url.includes('searchWidth=1h')));
  assert.equal(await provider.get(8453, wallet, 900), undefined); assert.equal(urls.length, 4);
});

test('missing, stale or low-quality funding prices do not fall back to one dollar', async () => {
  const token = Object.keys(fundingChains()[0].cashTokens)[0];
  for (const item of [undefined, { price: '1', timestamp: 9999, confidence: 1 },
    { price: '1', timestamp: 900, confidence: 0.89 }, { price: '0', timestamp: 900, confidence: 1 }]) {
    const provider = new HistoricalFundingPrices(new Transport({ ...options,
      fetch: fetcher(() => Response.json({ coins: { [`base:${token}`]: item } })) }));
    assert.equal(await provider.get(8453, token, 900), undefined);
  }
});
