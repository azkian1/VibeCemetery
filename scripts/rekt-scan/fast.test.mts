import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { Rpc, Transport, TRANSFER_TOPIC } from '../../src/lib/rekt/providers/rpc.ts';
import type { RpcLog, RpcReceipt } from '../../src/lib/rekt/providers/rpc.ts';
import { collectIndexedHistory, hydrateIndexedHistory, newIndexedHistory } from '../../src/lib/rekt/providers/alchemy.ts';
import { mapBounded } from '../../src/lib/rekt/providers/parallel.ts';
import { alchemyUrl, scanChain } from '../../src/lib/rekt/providers/chains.ts';
import { checkpointWriter } from './checkpoint.mts';
import { newDiscoveryCheckpoint, reuseDiscoveryEvidence } from './discovery.mts';
import { main } from './cli.mts';

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const word = (a: string) => `0x${a.slice(2).padStart(64, '0')}`;
const wallet = addr(1), token = addr(2), sender = addr(3), amount = 2n ** 200n + 123n;
const row = { uniqueId: `${hash(2)}:log:4`, hash: hash(2), blockNum: '0x2', from: sender, to: wallet,
  category: 'erc20', value: 0.1, rawContract: { address: token, value: `0x${amount.toString(16)}` } };
const log: RpcLog = { address: token, topics: [TRANSFER_TOPIC, word(sender), word(wallet)], data: `0x${amount.toString(16).padStart(64, '0')}`,
  blockNumber: '0x2', blockHash: hash(22), transactionHash: hash(2), transactionIndex: '0x0', logIndex: '0x4' };
const receipt: RpcReceipt = { status: '0x1', blockNumber: '0x2', blockHash: hash(22), transactionHash: hash(2), transactionIndex: '0x0', from: sender, to: token, logs: [log] };
function mockRpc(handle: (method: string, params: unknown[]) => unknown) {
  return new Rpc('https://fixture.invalid', new Transport({ intervalMs: 0, retries: 0, wait: async () => {}, fetch: async (_url, init) => {
    const b = JSON.parse(String(init?.body)); return Response.json({ result: handle(b.method, b.params) });
  } }));
}

test('indexed history pages both directions, deduplicates self transfers and preserves uint256 precision', async () => {
  const state = newIndexedHistory(1n, 5n), calls: Record<string, unknown>[] = [];
  const self = { ...row, from: wallet };
  const rpc = mockRpc((method, params) => {
    assert.equal(method, 'alchemy_getAssetTransfers'); const p = params[0] as Record<string, unknown>; calls.push(p);
    assert.equal(p.excludeZeroValue, false); assert.equal(p.toBlock, '0x5');
    return p.fromAddress && !p.pageKey ? { transfers: [self], pageKey: 'page-two' } : { transfers: p.toAddress ? [self] : [], pageKey: '' };
  });
  await collectIndexedHistory(rpc, wallet, state, async () => {});
  assert.equal(state.complete, true); assert.equal(calls.length, 3); assert.equal(Object.keys(state.transfers).length, 1);
  assert.equal(Object.values(state.transfers)[0].amount, amount.toString());
});

test('indexer rejects malformed pages, wrong filters, ranges, conflicting identities and looping cursors', async () => {
  for (const page of [{}, { transfers: null }, { transfers: [], pageKey: 42 },
    { transfers: [{ ...row, to: sender }] }, { transfers: [{ ...row, blockNum: '0x6' }] },
    { transfers: [{ ...row, rawContract: { address: token, value: null } }] },
    { transfers: [row, { ...row, rawContract: { address: token, value: '0x1' } }] }]) {
    const state = newIndexedHistory(1n, 5n); state.direction = 'to';
    await assert.rejects(collectIndexedHistory(mockRpc(() => page), wallet, state, async () => {}));
    assert.equal(state.complete, false); assert.equal(Object.keys(state.transfers).length, 0);
  }
  const state = newIndexedHistory(1n, 5n);
  await assert.rejects(collectIndexedHistory(mockRpc(() => ({ transfers: [], pageKey: 'same' })), wallet, state, async () => {}), /pagination_loop/);
  assert.equal(state.complete, false);
});

test('expired indexer cursor restarts the current direction without claiming completeness', async () => {
  const state = newIndexedHistory(1n, 5n); state.direction = 'to'; state.pageKey = 'expired'; state.seen = ['old']; state.pageAt = 1;
  await collectIndexedHistory(mockRpc((_m, p) => { assert.equal((p[0] as { pageKey?: string }).pageKey, undefined); return { transfers: [row] }; }), wallet, state, async () => {});
  assert.equal(state.complete, true); assert.equal(Object.keys(state.transfers).length, 1);
});

test('indexer amounts must match full wallet receipt events, including duplicates and missing events', async () => {
  const state = newIndexedHistory(1n, 5n); state.direction = 'to';
  await collectIndexedHistory(mockRpc(() => ({ transfers: [row] })), wallet, state, async () => {});
  const history = { logs: [] as RpcLog[] }, receipts = {};
  await hydrateIndexedHistory(mockRpc(() => receipt), wallet, state, receipts, history, 5, async () => {});
  assert.deepEqual(history.logs, [log]); assert.equal(state.hydrated[hash(2)], true);
  for (const bad of [{ ...receipt, blockHash: hash(999) }, { ...receipt, logs: [{ ...log, data: word('0x1') }] },
    { ...receipt, logs: [log, { ...log, logIndex: '0x5' }] }, { ...receipt, status: '0x0' }]) {
    const copy = structuredClone(state); copy.hydrated = {};
    await assert.rejects(hydrateIndexedHistory(mockRpc(() => bad), wallet, copy, {}, { logs: [] }, 2, async () => {}), /indexed_receipt/);
    assert.deepEqual(copy.hydrated, {});
  }
});

test('bounded workers stop scheduling after error and drain active mutations before rejecting', async () => {
  let active = 0, peak = 0; const finished: number[] = [];
  await assert.rejects(mapBounded([0, 1, 2, 3], 2, async n => {
    active++; peak = Math.max(peak, active);
    try { await Promise.resolve(); if (!n) throw new Error('fixture_error'); await delay(10); finished.push(n); }
    finally { active--; }
  }), /fixture_error/);
  assert.equal(active, 0); assert.equal(peak, 2); assert.deepEqual(finished, [1]);
});

test('concurrent request budget cannot be exceeded, even when all callers start together', async () => {
  let calls = 0;
  const transport = new Transport({ maxRequests: 2, wait: async () => {}, retries: 0, fetch: async () => { calls++; return Response.json({ ok: true }); } });
  const result = await Promise.allSettled(Array.from({ length: 12 }, () => transport.json('https://fixture.invalid')));
  assert.equal(calls, 2); assert.equal(transport.requests, 2); assert.equal(result.filter(r => r.status === 'fulfilled').length, 2);
});

test('request pacing is shared by concurrent callers to the same origin', async () => {
  let pacing = 0, peak = 0;
  const transport = new Transport({ wait: async () => { pacing++; peak = Math.max(peak, pacing); await delay(2); pacing--; },
    fetch: async () => Response.json({ ok: true }) });
  await Promise.all(Array.from({ length: 5 }, (_, n) => transport.json(`https://fixture.invalid/${n}`)));
  assert.equal(peak, 1); assert.equal(transport.requests, 5);
});

test('checkpoint writer serializes overlapping saves and includes mutations made during a write', async () => {
  let active = 0, peak = 0, state = 0; const writes: number[] = [];
  const save = checkpointWriter(async () => { active++; peak = Math.max(peak, active); const snapshot = state; await delay(10); writes.push(snapshot); active--; });
  const first = save(); state = 1; const second = save(); state = 2; const third = save();
  await Promise.all([first, second, third]);
  assert.equal(peak, 1); assert.equal(writes.at(-1), 2);
});

test('raw cache reuse drops derived flows, provider history, failures and future evidence', () => {
  const old = newDiscoveryCheckpoint(); old.receipts[hash(2)] = receipt;
  old.receipts[hash(6)] = { ...receipt, blockNumber: '0x6' };
  old.transactions[hash(2)] = { hash: hash(2), blockHash: hash(22), from: sender, to: token, value: '0x0' };
  old.balances[`${token}:2`] = '1'; old.balances[`${token}:6`] = '2'; old.balanceErrors['bad'] = 'rpc_error_-32000';
  old.flows[hash(2)] = []; old.relay.complete = true;
  const fresh = reuseDiscoveryEvidence(old, { number: '0x5', hash: hash(5), timestamp: '0x1' });
  assert.equal(Object.keys(fresh.receipts).length, 1); assert.equal(Object.keys(fresh.transactions).length, 1);
  assert.deepEqual(fresh.flows, {}); assert.deepEqual(fresh.balanceErrors, {}); assert.equal(fresh.relay.complete, false);
  assert.deepEqual(fresh.balances, { [`${token}:2`]: '1' });
});

const envNames = ['REKT_BASE_RPC_URL', 'BASE_RPC_URL', 'REKT_BASE_INDEXER_URL', 'REKT_ALCHEMY_API_KEY', 'REKT_CU_PER_SECOND', 'REKT_MAX_CU'] as const;
async function cliFixture(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-fast-'));
  const prior = Object.fromEntries(envNames.map(k => [k, process.env[k]])); const fetcher = globalThis.fetch;
  for (const name of envNames) delete process.env[name];
  try { await run(directory); } finally {
    globalThis.fetch = fetcher;
    for (const name of envNames) { if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; }
    const target = resolve(directory); assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith('rekt-fast-'));
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

test('Alchemy configuration never silently uses public RPC and explicit endpoints take precedence', async () => cliFixture(async directory => {
  await assert.rejects(main(['--wallet', wallet, '--source', 'auto', '--history-provider', 'alchemy', '--output', join(directory, 'missing.json')]), /alchemy_configuration_required/);
  process.env.REKT_ALCHEMY_API_KEY = 'fixture-key';
  assert.equal(alchemyUrl('base'), 'https://base-mainnet.g.alchemy.com/v2/fixture-key');
  assert.equal(scanChain('base')?.rpcUrl, alchemyUrl('base'));
  process.env.REKT_BASE_RPC_URL = 'https://rpc.fixture.invalid';
  assert.equal(scanChain('base')?.rpcUrl, process.env.REKT_BASE_RPC_URL);
}));

test('indexed CLI persists cache, refreshes overlap for indexer lag, and rejects a reorganized seed', async () => cliFixture(async directory => {
  process.env.REKT_BASE_RPC_URL = 'https://fixture.invalid'; process.env.REKT_BASE_INDEXER_URL = 'https://fixture.invalid';
  let tip = 5, reorg = false; const ranges: { fromBlock: string; toBlock: string }[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); let result: unknown;
    if (body.method === 'eth_chainId') result = '0x2105';
    else if (body.method === 'eth_getBlockByNumber') {
      const n = body.params[0] === 'finalized' ? tip : Number(BigInt(body.params[0]));
      result = { number: `0x${n.toString(16)}`, hash: hash(reorg && n === 6 ? 999 : n), timestamp: '0x6553f100' };
    } else if (body.method === 'alchemy_getAssetTransfers') { ranges.push(body.params[0]); result = { transfers: [] }; }
    else throw new Error(`unexpected ${body.method}`);
    return Response.json({ result });
  };
  const args = ['--wallet', wallet, '--source', 'uniswap-v4', '--history-provider', 'alchemy', '--concurrency', '5', '--request-interval-ms', '1', '--cache-dir', join(directory, 'cache')];
  const first = join(directory, 'one.json'); assert.equal(await main([...args, '--output', first]), 2);
  assert.equal(JSON.parse(await readFile(first, 'utf8')).coverage.historyCompleteness, 'indexer_asserted_receipt_checked');
  tip = 6; assert.equal(await main([...args, '--output', join(directory, 'two.json')]), 2);
  assert.deepEqual(ranges.map(r => [r.fromBlock, r.toBlock]), [['0x1', '0x5'], ['0x1', '0x5'], ['0x1', '0x6'], ['0x1', '0x6']]);
  reorg = true; tip = 7; const bad = join(directory, 'bad.json'); assert.equal(await main([...args, '--output', bad]), 2);
  assert.equal(JSON.parse(await readFile(bad, 'utf8')).error, 'seed_reorg_detected');
  await assert.rejects(access(`${bad}.lock`));
}));

test('CLI deadline aborts in-flight work, saves partial state and allows resume', async () => cliFixture(async directory => {
  process.env.REKT_BASE_RPC_URL = 'https://fixture.invalid'; process.env.REKT_BASE_INDEXER_URL = 'https://fixture.invalid';
  let block = true;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.method === 'alchemy_getAssetTransfers' && block) await delay(10000, undefined, { signal: init?.signal ?? undefined });
    const result = body.method === 'eth_chainId' ? '0x2105' : body.method === 'eth_getBlockByNumber'
      ? { number: '0x5', hash: hash(5), timestamp: '0x6553f100' } : { transfers: [] };
    return Response.json({ result });
  };
  const output = join(directory, 'deadline.json');
  const args = ['--wallet', wallet, '--source', 'uniswap-v4', '--history-provider', 'alchemy', '--request-interval-ms', '1', '--output', output];
  assert.equal(await main([...args, '--deadline-ms', '500']), 2);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).error, 'scan_deadline_reached');
  await assert.rejects(access(`${output}.lock`)); block = false;
  assert.equal(await main([...args, '--resume']), 2);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).collectionComplete, true);
}));

test('CLI CU budget persists usage on failure and resumes with a fresh invocation budget', async () => cliFixture(async directory => {
  process.env.REKT_BASE_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/private-key';
  process.env.REKT_BASE_INDEXER_URL = process.env.REKT_BASE_RPC_URL;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const result = body.method === 'eth_chainId' ? '0x2105' : body.method === 'eth_getBlockByNumber'
      ? { number: '0x5', hash: hash(5), timestamp: '0x6553f100' } : { transfers: [] };
    return Response.json({ result });
  };
  const output = join(directory, 'cu.json');
  const args = ['--wallet', wallet, '--source', 'uniswap-v4', '--history-provider', 'alchemy', '--request-interval-ms', '1', '--output', output];
  assert.equal(await main([...args, '--max-cu', '20']), 2);
  const partial = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(partial.error, 'cu_budget_exhausted');
  assert.equal(partial.metrics.usage.estimatedAlchemyCu, 20);
  assert.equal(partial.metrics.limits.cuPerSecond, 450);
  assert.equal(partial.metrics.limits.maxCu, 20);
  await access(partial.resume.checkpoint); await assert.rejects(access(`${output}.lock`));
  process.env.REKT_CU_PER_SECOND = '300'; process.env.REKT_MAX_CU = '1000';
  assert.equal(await main([...args, '--resume', '--cu-per-second', '600']), 2);
  const report = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(report.collectionComplete, true);
  assert.equal(report.metrics.limits.cuPerSecond, 600); assert.equal(report.metrics.limits.maxCu, 1000);
  assert.equal(report.metrics.usage.estimatedAlchemyCu, 280);
  assert.equal(report.metrics.usage.estimatedRpcCu, 280);
  assert.equal(report.metrics.usage.byMethod.reduce((sum: number, row: { requests: number }) => sum + row.requests, 0), report.metrics.requests);
  assert.doesNotMatch(JSON.stringify(report.metrics), /private-key|https:/);
}));

test('CLI rejects invalid CU settings before network access', async () => cliFixture(async directory => {
  const args = ['--wallet', wallet, '--source', 'auto', '--output', join(directory, 'invalid.json')];
  globalThis.fetch = async () => { assert.fail('must not reach network'); };
  for (const option of ['--max-cu', '--cu-per-second']) for (const value of ['0', '-1', 'NaN', '1.5']) {
    await assert.rejects(main([...args, `${option}=${value}`]), /invalid_(max_cu|cu_per_second)/);
  }
  process.env.REKT_MAX_CU = 'bad'; await assert.rejects(main(args), /invalid_max_cu/);
}));

test('per-wallet cache lock rejects duplicate jobs without removing the other lock', async () => cliFixture(async directory => {
  const output = join(directory, 'locked.json'), cache = `${8453}-${wallet}-1.json.lock`;
  await writeFile(join(directory, cache), 'other-job');
  assert.equal(await main(['--wallet', wallet, '--source', 'uniswap-v4', '--output', output, '--cache-dir', directory]), 1);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).error, 'cache_locked');
  assert.equal(await readFile(join(directory, cache), 'utf8'), 'other-job');
}));
