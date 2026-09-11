import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from 'viem';
import { DexDecoder, matchesWalletRoute, poolId, V2_SWAP, V3_SWAP, V4_SWAP, V4_INITIALIZE } from '../../src/lib/rekt/providers/dex.ts';
import type { DexProtocol, RouteObservation } from '../../src/lib/rekt/providers/dex.ts';
import { DEX_DEPLOYMENTS, quoteAssets, ZERO_ADDRESS } from '../../src/lib/rekt/providers/deployments.ts';
import { Rpc, Transport, TRANSFER_TOPIC } from '../../src/lib/rekt/providers/rpc.ts';
import type { RpcLog, RpcReceipt, RpcBlock } from '../../src/lib/rekt/providers/rpc.ts';
import { discoverReceipt, newDiscoveryCheckpoint, scanDiscovery } from './discovery.mts';
import { analyzeRelay } from '../../src/lib/rekt/scanner/relay.ts';
import { collectIndexedHistory, hydrateIndexedHistory, newIndexedHistory } from '../../src/lib/rekt/providers/alchemy.ts';
import { transfer } from '../../src/lib/rekt/providers/uniswap-v3.ts';

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const wallet = addr(1), token = addr(2), pool = addr(3), router = addr(4), mid = addr(5);
const word = (a: string) => `0x${a.slice(2).padStart(64, '0')}`;
function encoded(types: string, values: unknown[]) { return encodeAbiParameters(parseAbiParameters(types), values); }
function fixture(protocol: DexProtocol, chainId = 4663, sell = false) {
  const deployment = DEX_DEPLOYMENTS[chainId], quote = Object.keys(quoteAssets(chainId)).find(k => quoteAssets(chainId)[k].decimals === 6)!;
  const amount = sell ? 100000000n : 600000000n, n = sell ? 3 : 2;
  const block: RpcBlock = { number: `0x${n}`, hash: hash(n + 10), timestamp: `0x${(1700000000 + n).toString(16)}` };
  const info = { token0: token, token1: quote, hooks: ZERO_ADDRESS, fee: 3000, tickSpacing: 60 };
  const id = poolId(info);
  function log(address: string, topics: string[], data: string, index: number): RpcLog {
    return { ...block, blockNumber: block.number, blockHash: block.hash, address, topics, data, transactionHash: hash(n), transactionIndex: '0x0', logIndex: `0x${index}` };
  }
  const holder = protocol === 'uniswap-v4' ? deployment.v4Manager : pool;
  const transfers = [
    log(token, [TRANSFER_TOPIC, word(sell ? wallet : holder), word(sell ? holder : wallet)], encoded('uint256', [100n]), 1),
    log(quote, [TRANSFER_TOPIC, word(sell ? holder : wallet), word(sell ? wallet : holder)], encoded('uint256', [amount]), 2),
  ];
  const topic = (abi: typeof V4_SWAP | typeof V3_SWAP | typeof V2_SWAP | typeof V4_INITIALIZE, args: object) => encodeEventTopics({ abi: [abi], args }) as string[];
  const d0 = sell ? -100n : 100n, d1 = sell ? amount : -amount;
  const swap = protocol === 'uniswap-v4'
    ? log(holder, topic(V4_SWAP, { id, sender: router }), encoded('int128,int128,uint160,uint128,int24,uint24', [d0, d1, 1n, 1000n, 0, 3000]), 3)
    : protocol === 'uniswap-v3'
      ? log(holder, topic(V3_SWAP, { sender: router, recipient: wallet }), encoded('int256,int256,uint160,uint128,int24', [-d0, -d1, 1n, 1000n, 0]), 3)
      : log(holder, topic(V2_SWAP, { sender: router, to: wallet }), encoded('uint256,uint256,uint256,uint256', [sell ? 100n : 0n, sell ? 0n : amount, sell ? 0n : 100n, sell ? amount : 0n]), 3);
  const init = { ...log(holder, topic(V4_INITIALIZE, { id, currency0: token, currency1: quote }), encoded('uint24,int24,address,uint160,int24', [3000, 60, ZERO_ADDRESS, 1n, 0]), 0), blockNumber: '0x1', blockHash: hash(11) };
  const receipt: RpcReceipt = { status: '0x1', blockNumber: block.number, blockHash: block.hash, transactionHash: hash(n), transactionIndex: '0x0', from: wallet, to: router, logs: [...transfers, swap] };
  let wrongFactory = false, wrongRegistration = false, priceMissing = false, from = wallet, value = '0x0', rangeFailure = false, posm = false;
  const methods: string[] = [], balanceCalls: unknown[] = [];
  const fetcher: typeof fetch = async (url, request) => {
    if (String(url).includes('coins.llama.fi')) return Response.json({ coins: priceMissing ? {} : { [quoteAssets(chainId)[quote].priceKey]: { price: 1, confidence: 0.99, timestamp: 1700000000 + n } } });
    const body = JSON.parse(String(request!.body)); methods.push(body.method);
    let result: unknown;
    if (body.method === 'eth_getLogs') {
      if (rangeFailure) { rangeFailure = false; return Response.json({ error: { code: -32000, message: 'block range too large' } }); }
      result = BigInt(body.params[0].fromBlock) <= 1n && BigInt(body.params[0].toBlock) >= 1n ? [init] : [];
    } else if (body.method === 'eth_getBlockByNumber') result = body.params[0] === '0x1' ? { number: '0x1', hash: hash(11), timestamp: '0x6553f100' } : block;
    else if (body.method === 'eth_getTransactionReceipt') result = receipt;
    else if (body.method === 'eth_getTransactionByHash') result = { hash: hash(n), blockHash: block.hash, from, to: router, value };
    else if (body.method === 'eth_call') {
      const data: string = body.params[0].data;
      if (data.startsWith('0x70a08231')) { balanceCalls.push(body.params); return Response.json({ error: { code: -32000, message: 'metadata is not found' } }); }
      if (body.params[0].to === deployment.v4PositionManager) return Response.json({ result: posm ? encoded('address,address,uint24,int24,address', [token, quote, 3000, 60, ZERO_ADDRESS]) : `0x${'0'.repeat(320)}` });
      const selector = data.slice(0, 10);
      const responses: Record<string, string> = {
        '0x0dfe1681': word(token), '0xd21220a7': word(quote),
        '0xc45a0155': word(wrongFactory ? addr(99) : protocol === 'uniswap-v2' ? deployment.v2Factory : deployment.v3Factory),
        '0xddca3f43': encoded('uint24', [3000]), '0x1698ee82': word(wrongRegistration ? addr(99) : pool), '0xe6a43905': word(wrongRegistration ? addr(99) : pool),
      };
      result = responses[selector]; assert.ok(result, `Unexpected selector ${selector}`);
    } else throw new Error(`Unexpected RPC ${body.method}`);
    return Response.json({ result });
  };
  const transport = new Transport({ fetch: fetcher, retries: 0, wait: async () => {}, maxRequests: 200 });
  const rpc = new Rpc('https://fixture.invalid', transport), state = newDiscoveryCheckpoint(); state.relay.complete = true;
  return { rpc, state, quote, block, receipt, transfers, init, swap, id, methods, balanceCalls,
    mutate: (options: { wrongFactory?: boolean; wrongRegistration?: boolean; priceMissing?: boolean; from?: string; value?: string; rangeFailure?: boolean; posm?: boolean }) => {
      wrongFactory = options.wrongFactory ?? false; wrongRegistration = options.wrongRegistration ?? false; priceMissing = options.priceMissing ?? false;
      from = options.from ?? wallet; value = options.value ?? '0x0'; rangeFailure = options.rangeFailure ?? false;
      posm = options.posm ?? false;
    } };
}

for (const chain of [8453, 4663]) for (const protocol of ['uniswap-v2', 'uniswap-v3', 'uniswap-v4'] as const) for (const sell of [false, true]) {
  test(`${chain} ${protocol} ${sell ? 'sell' : 'buy'}: actual wallet settlement and exact historical price`, async () => {
    const f = fixture(protocol, chain, sell);
    const [flow] = await discoverReceipt(f.rpc, chain, wallet, f.receipt, f.block, f.transfers, f.state, async () => {});
    assert.equal(flow.reason, undefined); assert.equal(flow.settlement?.source, 'dex_wallet_net_historical_usd');
    assert.equal(flow.settlement.amountUsd, sell ? '100' : '600'); assert.equal(flow.deltaRaw, sell ? '-100' : '100');
    assert.equal(flow.route?.swaps[0].protocol, protocol);
  });
}
for (const protocol of ['uniswap-v2', 'uniswap-v3'] as const) {
  test(`${protocol}: factory spoof and wrong registered pool are rejected`, async () => {
    for (const mutation of [{ wrongFactory: true }, { wrongRegistration: true }]) {
      const f = fixture(protocol); f.mutate(mutation);
      const r = await new DexDecoder(f.rpc, 4663, f.state.dex, async () => {}).observe(f.receipt);
      assert.equal(r.swaps.length, 0); assert.ok(r.issues.length);
    }
  });
}
test('V4 rejects fake manager and inconsistent Initialize PoolKey', async () => {
  const fake = fixture('uniswap-v4'); fake.swap.address = pool;
  assert.deepEqual((await new DexDecoder(fake.rpc, 4663, fake.state.dex, async () => {}).observe(fake.receipt)).issues, ['unverified_v4_manager']);
  const mismatch = fixture('uniswap-v4'); mismatch.init.data = encoded('uint24,int24,address,uint160,int24', [500, 60, ZERO_ADDRESS, 1n, 0]);
  assert.deepEqual((await new DexDecoder(mismatch.rpc, 4663, mismatch.state.dex, async () => {}).observe(mismatch.receipt)).issues, ['v4_pool_key_mismatch']);
});
test('V4 Initialize range limits shrink and pool metadata is cached', async () => {
  const f = fixture('uniswap-v4'); f.mutate({ rangeFailure: true });
  const decoder = new DexDecoder(f.rpc, 4663, f.state.dex, async () => {});
  assert.equal((await decoder.observe(f.receipt)).swaps.length, 1);
  const count = f.methods.length; assert.equal((await decoder.observe(f.receipt)).swaps.length, 1); assert.equal(f.methods.length, count);
});

test('parallel decoders share one in-flight immutable V4 pool lookup', async () => {
  const f = fixture('uniswap-v4'); f.mutate({ posm: true });
  const observations = await Promise.all(Array.from({ length: 8 }, () => new DexDecoder(f.rpc, 4663, f.state.dex, async () => {}).observe(f.receipt)));
  assert.ok(observations.every(r => r.swaps.length === 1));
  assert.equal(f.methods.filter(m => m === 'eth_call').length, 1);
});

test('fast discovery defers missing V4 metadata without inventing a route; full mode reprocesses it', async () => {
  const f = fixture('uniswap-v4');
  const quick = await scanDiscovery(f.rpc, 4663, wallet, '1', f.block, f.transfers, f.state, 90, async () => {},
    { only: 'uniswap-v4', poolHistory: 'defer', concurrency: 5 });
  assert.equal(f.methods.includes('eth_getLogs'), false);
  assert.equal(quick.evidence.flows[0].settlement, undefined);
  assert.deepEqual(quick.evidence.flows[0].route?.swaps, []);
  assert.ok(quick.evidence.flows[0].warnings?.includes('v4_pool_metadata_deferred'));
  assert.deepEqual(quick.discovery.deferredPoolTransactions, [f.receipt.transactionHash]);
  assert.deepEqual(quick.candidates, []); assert.deepEqual(quick.preliminaryCandidates, []);
  const full = await scanDiscovery(f.rpc, 4663, wallet, '1', f.block, f.transfers, f.state, 90, async () => {},
    { only: 'uniswap-v4', poolHistory: 'full', concurrency: 5 });
  assert.equal(f.methods.includes('eth_getLogs'), true);
  assert.equal(full.evidence.flows[0].settlement?.amountUsd, '600');
  assert.equal(full.evidence.flows[0].route?.swaps.length, 1);
  assert.deepEqual(full.discovery.deferredPoolTransactions, []);
});

test('deferred pool identity preserves an independently matched Relay amount with an explicit warning', async () => {
  const f = fixture('uniswap-v4');
  f.state.relay.requests = [{ id: 'fixture-relay-buy', status: 'success', user: wallet, recipient: wallet, data: {
    inTxs: [{ chainId: 4663, hash: hash(999), status: 'success', stateChanges: [
      { address: wallet, change: { kind: 'token', data: { tokenAddress: f.quote }, balanceDiff: '-600000000' } },
    ] }],
    outTxs: [{ chainId: 4663, hash: f.receipt.transactionHash, status: 'success', stateChanges: [
      { address: wallet, change: { kind: 'token', data: { tokenAddress: token }, balanceDiff: '100' } },
    ] }],
    metadata: { currencyIn: { currency: { chainId: 4663, address: f.quote, decimals: 6 }, amount: '600000000', amountUsd: '600' },
      currencyOut: { currency: { chainId: 4663, address: token, decimals: 18 }, amount: '100', amountUsd: '600' } },
  } }];
  const [flow] = await discoverReceipt(f.rpc, 4663, wallet, f.receipt, f.block, f.transfers, f.state, async () => {}, undefined, 'defer');
  assert.equal(flow.settlement?.source, 'relay_historical_amount_usd'); assert.equal(flow.settlement?.amountUsd, '600');
  assert.ok(flow.warnings?.includes('v4_pool_metadata_deferred')); assert.deepEqual(flow.route?.swaps, []);
  f.state.relay.requests[0].data.metadata.currencyOut.amount = '101';
  const [wrong] = await discoverReceipt(f.rpc, 4663, wallet, f.receipt, f.block, f.transfers, f.state, async () => {}, undefined, 'defer');
  assert.equal(wrong.settlement, undefined);
});

test('cold indexed buy/sell history feeds our concurrent decoder and exact closed-loss calculation', async () => {
  const buy = fixture('uniswap-v4'), sell = fixture('uniswap-v4', 4663, true);
  buy.mutate({ posm: true }); sell.mutate({ posm: true });
  const rows = [...buy.transfers, ...sell.transfers].map(log => {
    const t = transfer(log)!;
    return { uniqueId: `${log.transactionHash}:log:${log.logIndex}`, hash: log.transactionHash, blockNum: log.blockNumber,
      from: t.from, to: t.to, category: 'erc20', rawContract: { address: t.token, value: `0x${t.amount.toString(16)}` } };
  });
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).includes('coins.llama.fi')) return buy.rpc.transport.options.fetch!(url, init);
    const body = JSON.parse(String(init?.body));
    if (body.method === 'alchemy_getAssetTransfers') {
      const p = body.params[0];
      return Response.json({ result: { transfers: rows.filter(r => p.fromAddress ? r.from === wallet : r.to === wallet) } });
    }
    if (body.method === 'eth_getBlockByNumber') return Response.json({ result: body.params[0] === buy.block.number ? buy.block : sell.block });
    const f = body.params[0] === sell.receipt.transactionHash ? sell : buy;
    return f.rpc.transport.options.fetch!(url, init);
  };
  const rpc = new Rpc('https://indexed-fixture.invalid', new Transport({ fetch: fetcher, wait: async () => {}, retries: 0 }));
  const index = newIndexedHistory(1n, 3n), state = newDiscoveryCheckpoint(), history = { logs: [] as RpcLog[] };
  await collectIndexedHistory(rpc, wallet, index, async () => {});
  await hydrateIndexedHistory(rpc, wallet, index, state.receipts, history, 5, async () => {});
  const result = await scanDiscovery(rpc, 4663, wallet, '1', sell.block, history.logs, state, 90, async () => {}, { only: 'uniswap-v4', concurrency: 5 });
  assert.equal(history.logs.length, 4); assert.equal(result.preliminaryCandidates.length, 1);
  assert.equal(result.preliminaryCandidates[0].estimatedCostUsd, '600');
  assert.equal(result.preliminaryCandidates[0].estimatedReturnedUsd, '100');
  assert.equal(result.preliminaryCandidates[0].estimatedLossUsd, '500');
  assert.deepEqual(result.candidates, []);
  assert.equal(buy.methods.includes('eth_getLogs') || sell.methods.includes('eth_getLogs'), false);
});
test('V4 uses immutable PosM PoolKey without a genesis scan and verifies the full ID', async () => {
  const f = fixture('uniswap-v4'); f.mutate({ posm: true });
  const decoder = new DexDecoder(f.rpc, 4663, f.state.dex, async () => {});
  assert.equal((await decoder.observe(f.receipt)).swaps.length, 1); assert.equal(f.methods.includes('eth_getLogs'), false);
  const wrong = fixture('uniswap-v4'); wrong.mutate({ posm: true }); wrong.swap.topics[1] = hash(999); wrong.init.topics[1] = hash(999);
  assert.equal((await new DexDecoder(wrong.rpc, 4663, wrong.state.dex, async () => {}).observe(wrong.receipt)).swaps.length, 0);
});
test('disk/checkpoint failures propagate instead of silently excluding a valid swap', async () => {
  const f = fixture('uniswap-v4'); f.mutate({ posm: true });
  await assert.rejects(new DexDecoder(f.rpc, 4663, f.state.dex, async () => { throw new Error('checkpoint_write_failed'); }).observe(f.receipt), /checkpoint_write_failed/);
});
test('multi-hop routes conserve endpoints and reject extra/detached/mixed flows', () => {
  const edge = { protocol: 'uniswap-v3' as const, pool, eventId: 'test', token0: token, token1: mid, delta0: '100', delta1: '-200' };
  const route: RouteObservation = { swaps: [edge, { ...edge, token0: mid, token1: addr(6), delta0: '200', delta1: '-600' }], issues: [] };
  assert.equal(matchesWalletRoute(route, new Map([[token, 100n], [addr(6), -600n]])), true);
  assert.equal(matchesWalletRoute(route, new Map([[token, 99n], [addr(6), -600n]])), false);
  route.swaps.push({ ...edge, token0: addr(7), token1: addr(8), delta0: '10', delta1: '-10' });
  assert.equal(matchesWalletRoute(route, new Map([[token, 100n], [addr(6), -600n]])), false);
});
test('transfer taxes, missing prices and native value do not fabricate direct settlement', async () => {
  for (const reason of ['tax', 'price', 'native']) {
    const f = fixture('uniswap-v4');
    if (reason === 'tax') f.transfers[0].data = encoded('uint256', [99n]);
    if (reason === 'price') f.mutate({ priceMissing: true });
    if (reason === 'native') f.mutate({ value: '0x1' });
    const [flow] = await discoverReceipt(f.rpc, 4663, wallet, f.receipt, f.block, f.transfers, f.state, async () => {});
    assert.equal(flow.settlement, undefined); assert.ok(flow.reason);
  }
});
test('FOMO sponsored execution is discoverable but never becomes ownership or eligible proof', async () => {
  const flows = [];
  for (const sell of [false, true]) {
    const f = fixture('uniswap-v4', 4663, sell); f.mutate({ from: addr(99) });
    flows.push(...await discoverReceipt(f.rpc, 4663, wallet, f.receipt, f.block, f.transfers, f.state, async () => {}));
  }
  const a = analyzeRelay({ chainId: 4663, wallet, fromBlock: '1', snapshot: { number: '0x4', hash: hash(14), timestamp: '0x6553f105' },
    historyComplete: true, relayHistoryComplete: false, flows, balances: {}, balanceErrors: {} });
  assert.equal(a.preliminaryCandidates[0].estimatedLossUsd, '500'); assert.equal(a.preliminaryCandidates[0].estimatedLossPercent, '83.333333');
  assert.equal(a.preliminaryCandidates[0].buyCount, 1); assert.equal(a.preliminaryCandidates[0].sellCount, 1);
  assert.ok(a.preliminaryCandidates[0].warnings.includes('smart_account_or_relayer_operation_unverified')); assert.equal(a.candidates.length, 0);
});
test('discovery avoids repeated unavailable archive calls; receipt cache supports retry', async () => {
  const f = fixture('uniswap-v4');
  await scanDiscovery(f.rpc, 4663, wallet, '1', f.block, f.transfers, f.state, 90, async () => {}, { only: 'uniswap-v4' });
  assert.equal(f.balanceCalls.length, 1); assert.ok(Object.keys(f.state.balanceErrors).length >= 2);
  const count = f.methods.length;
  await scanDiscovery(f.rpc, 4663, wallet, '1', f.block, f.transfers, f.state, 90, async () => {}, { only: 'uniswap-v4' });
  assert.equal(f.methods.length, count);
  await scanDiscovery(f.rpc, 4663, wallet, '1', f.block, f.transfers, f.state, 90, async () => {}, { only: 'uniswap-v4', retryEvidence: true });
  assert.equal(f.methods.filter(m => m === 'eth_getTransactionReceipt').length, 1); assert.equal(f.balanceCalls.length, 2);
});
