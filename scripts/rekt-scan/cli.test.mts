import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { createServer } from 'node:http';
import { main } from './cli.mts';
import { fixture } from './fixtures.mts';

async function cleanup(directory: string) {
  const target = resolve(directory);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith('rekt-cli-'));
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

test('CLI offline report contains exact result, refuses accidental overwrite and releases lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-cli-'));
  try {
    const input = join(directory, 'evidence.json'), output = join(directory, 'report.json');
    await writeFile(input, JSON.stringify(fixture()));
    assert.equal(await main(['--input', input, '--output', output]), 0);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.candidates[0].lossUsd, '300'); assert.equal(report.mode, 'offline_untrusted_evidence');
    await assert.rejects(access(`${output}.lock`));
    await assert.rejects(main(['--input', input, '--output', output]), /output_exists/);
    assert.equal((JSON.parse(await readFile(output, 'utf8'))).candidates[0].lossUsd, '300');
    await assert.rejects(main(['--input', input, '--output', input]), /input_output_conflict/);
  } finally { await cleanup(directory); }
});
test('partial input gets nonzero exit code and no false eligibility', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-cli-'));
  try {
    const e = fixture(); e.historyComplete = false;
    const input = join(directory, 'evidence.json'), output = join(directory, 'report.json');
    await writeFile(input, JSON.stringify(e));
    assert.equal(await main(['--input', input, '--output', output]), 2);
    const report = JSON.parse(await readFile(output, 'utf8')); assert.equal(report.status, 'partial'); assert.equal(report.candidates.length, 0);
  } finally { await cleanup(directory); }
});
test('unsupported network is explicit, not an empty successful scan', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-cli-'));
  try {
    const output = join(directory, 'report.json');
    assert.equal(await main(['--wallet', `0x${'1'.repeat(40)}`, '--chain', 'unsupported-chain', '--source', 'uniswap-v3', '--output', output]), 1);
    const report = JSON.parse(await readFile(output, 'utf8')); assert.equal(report.status, 'unsupported_network'); assert.equal(report.chainId, null);
  } finally { await cleanup(directory); }
});
test('invalid wallet and range arguments cannot start network work', async () => {
  await assert.rejects(main(['--wallet', 'wrong', '--output', 'unused.json']), /invalid_wallet/);
  await assert.rejects(main(['--wallet', `0x${'1'.repeat(40)}`, '--days', 'NaN', '--output', 'unused.json']), /invalid_days/);
});

test('new snapshot reuses validated old complete history and only requests the tail', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-cli-'));
  const previousRpc = process.env.REKT_BASE_RPC_URL, previousFetch = globalThis.fetch;
  const snapshot = { number: '0x4', hash: `0x${'4'.repeat(64)}`, timestamp: '0x6553f100' };
  const oldSnapshot = { ...snapshot, number: '0x2', hash: `0x${'2'.repeat(64)}` };
  const ranges: { fromBlock: string; toBlock: string }[] = [];
  try {
    process.env.REKT_BASE_RPC_URL = 'https://seed-fixture.invalid';
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      let result: unknown;
      if (body.method === 'eth_chainId') result = '0x2105';
      else if (body.method === 'eth_getBlockByNumber') result = body.params[0] === '0x2' ? oldSnapshot : snapshot;
      else if (body.method === 'eth_getLogs') { ranges.push(body.params[0]); result = []; }
      else throw new Error(`Unexpected ${body.method}`);
      return Response.json({ result });
    };
    const seed = join(directory, 'seed.json'), output = join(directory, 'report.json');
    const data = { version: 1, wallet: `0x${'1'.repeat(40)}`, chainId: 8453, fromBlock: '1', createdAt: 0,
      snapshot: oldSnapshot, history: { complete: true, logs: [], nextToBlock: '0', chunkSize: '10' } };
    await writeFile(seed, JSON.stringify(data));
    const args = ['--wallet', data.wallet, '--source', 'uniswap-v4', '--request-interval-ms', '1', '--output', output, '--seed-checkpoint', seed];
    assert.equal(await main(args), 2);
    assert.equal(ranges.length, 2); assert.ok(ranges.every(r => r.fromBlock === '0x3' && r.toBlock === '0x4'));
    assert.equal(JSON.parse(await readFile(output, 'utf8')).coverage.fromGenesis, true);
    data.wallet = `0x${'9'.repeat(40)}`; await writeFile(seed, JSON.stringify(data));
    assert.equal(await main([...args.slice(0, -4), '--output', join(directory, 'bad.json'), '--seed-checkpoint', seed]), 2);
    assert.equal(JSON.parse(await readFile(join(directory, 'bad.json'), 'utf8')).error, 'invalid_seed_checkpoint');
    assert.equal(ranges.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRpc === undefined) delete process.env.REKT_BASE_RPC_URL; else process.env.REKT_BASE_RPC_URL = previousRpc;
    await cleanup(directory);
  }
});
test('concurrent run is rejected by exclusive lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-cli-'));
  try {
    const input = join(directory, 'evidence.json'), output = join(directory, 'report.json');
    await writeFile(input, JSON.stringify(fixture())); await writeFile(`${output}.lock`, 'test-owner');
    await assert.rejects(main(['--input', input, '--output', output]), /scan_locked/);
    assert.equal(await readFile(`${output}.lock`, 'utf8'), 'test-owner');
  } finally { await cleanup(directory); }
});
test('live CLI checkpoint resumes a budget-limited scan and preserves a completed report on later failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-cli-'));
  const old = process.env.REKT_BASE_RPC_URL;
  const block = { number: '0xa', hash: `0x${'a'.repeat(64)}`, timestamp: '0x6553f100' };
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const result = body.method === 'eth_chainId' ? '0x2105' : body.method === 'eth_getBlockByNumber' ? block : [];
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    process.env.REKT_BASE_RPC_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const output = join(directory, 'report.json'); const args = ['--wallet', `0x${'1'.repeat(40)}`, '--output', output];
    assert.equal(await main([...args, '--max-requests', '3']), 2);
    const checkpoint = JSON.parse(await readFile(`${output}.checkpoint.json`, 'utf8'));
    assert.equal(checkpoint.history.nextToBlock, '10'); assert.equal(checkpoint.history.complete, false);
    assert.equal(await main([...args, '--resume', '--max-requests', '20']), 0);
    const complete = await readFile(output, 'utf8');
    assert.equal(JSON.parse(complete).status, 'complete');
    assert.equal(await main([...args, '--resume', '--max-requests', '1']), 2);
    assert.equal(await readFile(output, 'utf8'), complete);
    assert.equal(JSON.parse(await readFile(`${output}.error.json`, 'utf8')).error, 'request_budget_exhausted');
  } finally {
    if (old === undefined) delete process.env.REKT_BASE_RPC_URL; else process.env.REKT_BASE_RPC_URL = old;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await cleanup(directory);
  }
});

test('Robinhood Relay CLI preserves partial analytical results across failed resume and rejects a changed source', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-cli-'));
  const oldRpc = process.env.REKT_ROBINHOOD_RPC_URL, oldKey = process.env.REKT_RELAY_API_KEY;
  const originalFetch = globalThis.fetch;
  const block = { number: '0xa', hash: `0x${'a'.repeat(64)}`, timestamp: '0x6553f100' };
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('https://api.relay.link/')) return new Response(JSON.stringify({ requests: [] }));
    const body = JSON.parse(String(init?.body));
    const result = body.method === 'eth_chainId' ? '0x1237' : body.method === 'eth_getBlockByNumber' ? block : [];
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  };
  try {
    process.env.REKT_ROBINHOOD_RPC_URL = 'https://synthetic.invalid'; delete process.env.REKT_RELAY_API_KEY;
    const output = join(directory, 'report.json');
    const args = ['--wallet', `0x${'1'.repeat(40)}`, '--chain', 'robinhood', '--output', output];
    assert.equal(await main([...args, '--max-requests', '3']), 2);
    assert.equal(await main([...args, '--resume', '--max-requests', '20']), 2);
    const complete = await readFile(output, 'utf8'), report = JSON.parse(complete);
    assert.equal(report.collectionComplete, true); assert.equal(report.mode, 'live_relay_discovery'); assert.equal(report.coverage.chainId, 4663);
    assert.equal(report.candidates.length, 0); assert.equal(report.verification.status, 'incomplete');
    assert.equal(await main([...args, '--resume', '--max-requests', '1']), 2);
    assert.equal(await readFile(output, 'utf8'), complete);
    assert.equal(JSON.parse(await readFile(`${output}.error.json`, 'utf8')).error, 'request_budget_exhausted');
    assert.equal(await main([...args, '--resume', '--source', 'uniswap-v3']), 2);
    assert.equal(JSON.parse(await readFile(`${output}.error.json`, 'utf8')).error, 'checkpoint_mismatch_or_expired');
    assert.equal(await readFile(output, 'utf8'), complete);
    await assert.rejects(access(`${output}.lock`));
  } finally {
    globalThis.fetch = originalFetch;
    if (oldRpc === undefined) delete process.env.REKT_ROBINHOOD_RPC_URL; else process.env.REKT_ROBINHOOD_RPC_URL = oldRpc;
    if (oldKey === undefined) delete process.env.REKT_RELAY_API_KEY; else process.env.REKT_RELAY_API_KEY = oldKey;
    await cleanup(directory);
  }
});
