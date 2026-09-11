import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fundingMain } from './funding.mts';
import { fundingChains } from '../../src/lib/rekt/providers/funding-chains.ts';
import { Transport, TRANSFER_TOPIC, hex } from '../../src/lib/rekt/providers/rpc.ts';

const wallet = `0x${'1'.repeat(40)}`, source = `0x${'2'.repeat(40)}`;
function rpcFixture() {
  const chains = fundingChains(), urls = new Map(chains.map(c => [c.rpcUrl, c.id]));
  const token = Object.keys(chains.find(c => c.id === 56)!.cashTokens)[0];
  const block = { number: '0xa', timestamp: '0x3e8', hash: `0x${'a'.repeat(64)}` };
  const creditBlock = { number: '0x6', timestamp: '0x384', hash: `0x${'c'.repeat(64)}` };
  const amount = 10000000000000000000n;
  const log = { address: token, topics: [TRANSFER_TOPIC, `0x${source.slice(2).padStart(64, '0')}`, `0x${wallet.slice(2).padStart(64, '0')}`],
    data: `0x${amount.toString(16).padStart(64, '0')}`, blockHash: creditBlock.hash, blockNumber: creditBlock.number,
    transactionHash: `0x${'b'.repeat(64)}`, transactionIndex: '0x0', logIndex: '0x0' };
  const receipt = { status: '0x1', transactionHash: log.transactionHash, from: source, to: token, blockHash: creditBlock.hash,
    blockNumber: creditBlock.number, transactionIndex: '0x0', logs: [log] };
  const tx = { from: source, to: token, value: '0x0', hash: log.transactionHash, blockHash: creditBlock.hash,
    input: `0xa9059cbb${wallet.slice(2).padStart(64, '0')}${amount.toString(16).padStart(64, '0')}` };
  const calls: { chainId: number; method: string }[] = [];
  const controls = { failChain: 0, mismatchChain: 0, reorgChain: 0, relayFailure: false, price: '1' };
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).startsWith('https://coins.llama.fi/')) return new Response(JSON.stringify({ coins: {
      [`bsc:${token}`]: { price: controls.price, timestamp: 900, confidence: 1 },
    } }));
    if (String(url).startsWith('https://api.relay.link/')) return controls.relayFailure ? new Response('{}', { status: 401 }) : new Response('{"requests":[]}');
    const chainId = urls.get(String(url))!;
    assert.ok(chainId);
    const { method, params } = JSON.parse(String(init?.body)); calls.push({ chainId, method });
    if (chainId === controls.failChain && method === 'eth_getLogs') return new Response('{"error":{"code":-32000,"message":"private RPC failure"}}');
    let result: unknown;
    if (method === 'eth_chainId') result = hex(BigInt(chainId === controls.mismatchChain ? 999 : chainId));
    else if (method === 'eth_getBlockByNumber') result = params[0] === creditBlock.number ? creditBlock
      : { ...block, hash: controls.reorgChain === chainId ? `0x${'d'.repeat(64)}` : block.hash };
    else if (method === 'eth_getLogs') result = chainId === 56 && params[0].topics[1] === null ? [log] : [];
    else if (method === 'eth_getTransactionReceipt') result = receipt;
    else if (method === 'eth_getTransactionByHash') result = tx;
    else throw new Error(`unexpected_method:${method}`);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  };
  return { fetcher, controls, calls };
}
async function cleanup(directory: string) {
  const target = resolve(directory);
  assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith('rekt-funding-'));
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
test('funding CLI resumes all four snapshots, finds BNB source, and protects completed report on failed resume', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-funding-')), f = rpcFixture();
  t.mock.method(globalThis, 'fetch', f.fetcher); t.mock.method(Transport.prototype, 'wait', async () => {});
  try {
    const output = join(directory, 'report.json'), args = ['--wallet', wallet, '--output', output, '--cycle-opened-at', '950'];
    assert.equal(await fundingMain([...args, '--max-requests', '4']), 2);
    const partial = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(partial.coverage.length, 4); assert.equal(partial.firstSource, null);
    assert.equal(await fundingMain([...args, '--resume', '--max-requests', '30']), 0);
    const completed = await readFile(output, 'utf8'), checkpoint = await readFile(`${output}.checkpoint.json`, 'utf8');
    const report = JSON.parse(completed);
    assert.equal(report.firstSource.sourceChainId, 56); assert.equal(report.firstSource.sourceAddress, source);
    assert.equal(report.firstSource.fundingWallet, wallet); assert.equal(report.signatureVerified, false);
    assert.ok(report.coverage.every((c: { complete: boolean }) => c.complete));
    assert.equal(new Set(f.calls.filter(c => c.method === 'eth_getLogs').map(c => c.chainId)).size, 4);
    assert.ok(!completed.includes('rpcUrl'));
    await assert.rejects(access(`${output}.lock`));
    assert.equal(await fundingMain(args), 1); assert.equal(await readFile(output, 'utf8'), completed);
    assert.equal(await readFile(`${output}.checkpoint.json`, 'utf8'), checkpoint);
    assert.equal(await fundingMain([...args, '--resume', '--cycle-opened-at', '951']), 1);
    assert.equal(await readFile(output, 'utf8'), completed);
    f.controls.reorgChain = 8453;
    assert.equal(await fundingMain([...args, '--resume', '--max-requests', '30']), 2);
    assert.equal(await readFile(output, 'utf8'), completed);
    const error = JSON.parse(await readFile(`${output}.error.json`, 'utf8'));
    assert.equal(error.firstSource, null); assert.ok(error.coverage.some((c: { error: string }) => c.error === 'reorg_detected'));
  } finally { await cleanup(directory); }
});
test('one failed history or Relay source cannot prevent other networks being scanned or produce a verified first source', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-funding-')), f = rpcFixture();
  t.mock.method(globalThis, 'fetch', f.fetcher); t.mock.method(Transport.prototype, 'wait', async () => {});
  try {
    f.controls.failChain = 8453; f.controls.relayFailure = true;
    const output = join(directory, 'report.json');
    assert.equal(await fundingMain(['--wallet', wallet, '--output', output, '--max-requests', '40']), 2);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.coverage.length, 4); assert.equal(report.firstSource, null); assert.equal(report.observedDirectSources[0].sourceAddress, source);
    assert.equal(report.coverage.find((c: { chainId: number }) => c.chainId === 1).complete, true);
    assert.equal(report.relay.error, 'http_401'); assert.ok(!JSON.stringify(report).includes('private RPC failure'));
    const previous = await readFile(output, 'utf8');
    f.controls.mismatchChain = 56;
    assert.equal(await fundingMain(['--wallet', wallet, '--output', output, '--max-requests', '40', '--resume']), 2);
    assert.equal(await readFile(output, 'utf8'), previous);
    const error = JSON.parse(await readFile(`${output}.error.json`, 'utf8'));
    assert.equal(error.observedDirectSources.length, 0); assert.ok(error.reasons.includes('incomplete_history:56'));
  } finally { await cleanup(directory); }
});
test('funding CLI rejects bad arguments, foreign checkpoints and active locks before network work', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-funding-')), f = rpcFixture();
  t.mock.method(globalThis, 'fetch', f.fetcher); t.mock.method(Transport.prototype, 'wait', async () => {});
  try {
    const output = join(directory, 'report.json'), args = ['--wallet', wallet, '--output', output];
    await assert.rejects(fundingMain(['--wallet', 'bad', '--output', output]), /invalid_wallet/);
    await assert.rejects(fundingMain([...args, '--max-requests=-1']), /invalid_positive/);
    await assert.rejects(fundingMain([...args, '--chain', 'base']), /Unknown option/);
    await writeFile(`${output}.lock`, 'active'); await assert.rejects(fundingMain(args), /scan_locked/);
    assert.equal(await readFile(`${output}.lock`, 'utf8'), 'active');
    const differentOutput = join(directory, 'foreign.json');
    await writeFile(`${differentOutput}.checkpoint.json`, '{"version":"another-scanner"}');
    assert.equal(await fundingMain(['--wallet', wallet, '--output', differentOutput, '--resume']), 1);
    assert.equal(await readFile(`${differentOutput}.checkpoint.json`, 'utf8'), '{"version":"another-scanner"}');
    assert.equal(f.calls.length, 0);
  } finally { await cleanup(directory); }
});

test('v1 resume re-evaluates raw evidence at the $10 threshold and archives the previous decision', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rekt-funding-')), f = rpcFixture();
  t.mock.method(globalThis, 'fetch', f.fetcher); t.mock.method(Transport.prototype, 'wait', async () => {});
  try {
    const output = join(directory, 'report.json'), args = ['--wallet', wallet, '--output', output, '--max-requests', '40'];
    assert.equal(await fundingMain(args), 0);
    const checkpoint = JSON.parse(await readFile(`${output}.checkpoint.json`, 'utf8'));
    checkpoint.version = 'first_funding_source_v1';
    for (const chain of Object.values(checkpoint.chains) as { prices?: unknown; decoded: Record<string, { price?: unknown }[]> }[]) {
      delete chain.prices;
      for (const credits of Object.values(chain.decoded)) for (const credit of credits) delete credit.price;
    }
    await writeFile(`${output}.checkpoint.json`, JSON.stringify(checkpoint));
    const old = JSON.parse(await readFile(output, 'utf8')); old.methodVersion = 'first_funding_source_v1';
    await writeFile(output, JSON.stringify(old));
    f.controls.price = '0.5';
    assert.equal(await fundingMain([...args, '--resume']), 0);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.methodVersion, 'first_funding_source_v2'); assert.equal(report.firstSource, null);
    assert.equal(report.sourceStatus, 'below_minimum_only'); assert.equal(report.observations[0].amountUsd, '5');
    assert.deepEqual(JSON.parse(await readFile(`${output}.policy-v1.json`, 'utf8')), old);
    assert.equal(JSON.parse(await readFile(`${output}.checkpoint.json`, 'utf8')).version, 'first_funding_source_v2');
    assert.ok(report.coverage.every((c: { complete: boolean }) => c.complete));
  } finally { await cleanup(directory); }
});
