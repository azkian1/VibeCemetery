import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectRelayHistory, matchRelayFlow } from '../../src/lib/rekt/providers/relay.ts';
import type { RelayHistory, RelayRequest } from '../../src/lib/rekt/providers/relay.ts';
import { SOLANA_RELAY_CHAIN_ID, SOLANA_USDC } from '../../src/lib/rekt/providers/chains.ts';
import { Transport, TRANSFER_TOPIC } from '../../src/lib/rekt/providers/rpc.ts';
import type { RpcLog } from '../../src/lib/rekt/providers/rpc.ts';
import { analyzeRelay, decodeRelayReceipt } from '../../src/lib/rekt/scanner/relay.ts';
import type { RelayEvidence, RelayFlow } from '../../src/lib/rekt/scanner/relay.ts';

const wallet = `0x${'1'.repeat(40)}`, token = `0x${'2'.repeat(40)}`, solver = `0x${'3'.repeat(40)}`;
const solOwner = 'AbCdEfGhijkLMnopQrSTuvWXyz123456789ABCDEFGH';
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const topic = (address: string) => `0x${address.slice(2).padStart(64, '0')}`;

function request(buy = true, n = 1, usd = buy ? '1000' : '700'): RelayRequest {
  const target = { currency: { chainId: 4663, address: token, decimals: 18, symbol: 'TEST' }, amount: '100' };
  const quote = { currency: { chainId: SOLANA_RELAY_CHAIN_ID, address: SOLANA_USDC, decimals: 6 }, amount: '1000000', amountUsd: usd };
  const t = { chainId: 4663, txHash: hash(n), status: 'success', stateChanges: [
    { address: wallet, change: { kind: 'token', data: { tokenAddress: token }, balanceDiff: buy ? '100' : '-100' } },
  ] };
  const q = { chainId: SOLANA_RELAY_CHAIN_ID, hash: String.fromCharCode(65 + n).repeat(88), status: 'success', stateChanges: [
    { address: solOwner, change: { kind: 'token', data: { tokenAddress: SOLANA_USDC }, balanceDiff: buy ? '-1000000' : '1000000' } },
  ] };
  return { id: hash(100 + n), status: 'success', user: buy ? solOwner : wallet, recipient: buy ? wallet : solOwner,
    data: { inTxs: [buy ? q : t], outTxs: [buy ? t : q], metadata: { currencyIn: buy ? quote : target, currencyOut: buy ? target : quote } } };
}
function flow(buy = true, n = 1, usd?: string): RelayFlow {
  const r = request(buy, n, usd);
  const f = { token, txHash: hash(n), blockNumber: String(n), blockHash: hash(1000 + n), transactionIndex: 0,
    timestamp: 1000 + n, deltaRaw: buy ? '100' : '-100', eventIds: [`${hash(n)}:0`] };
  return { ...f, ...matchRelayFlow(4663, wallet, f, [r]) };
}
function evidence(flows = [flow(), flow(false, 2)]): RelayEvidence {
  return { chainId: 4663, wallet, fromBlock: '1', snapshot: { number: '0x64', hash: hash(100), timestamp: '0x44c' },
    historyComplete: true, relayHistoryComplete: true, balances: { [`${token}:0`]: '0', [`${token}:100`]: '0' }, balanceErrors: {}, flows };
}

test('Relay attributes a sponsored buy and sell with exact chain, owner, amount and historical USD', () => {
  assert.equal(flow().settlement?.amountUsd, '1000');
  assert.equal(flow(false, 2).settlement?.amountUsd, '700');
  const a = analyzeRelay(evidence());
  assert.equal(a.preliminaryCandidates[0].estimatedLossUsd, '300');
  assert.equal(a.candidates.length, 0); assert.equal(a.verification.status, 'incomplete');
});

test('FOMO Relay accepts allowlisted EVM settlement assets with their actual decimals', () => {
  for (const [chainId, address, decimals] of [
    [4663, '0x5fc5360d0400a0fd4f2af552add042d716f1d168', 6],
    [8453, '0x4200000000000000000000000000000000000006', 18],
    [56, '0x55d398326f99059ff775485246999027b3197955', 18],
    [1, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6],
  ] as const) {
    const r = request();
    r.user = wallet;
    r.data.metadata.currencyIn.currency = { chainId, address, decimals };
    r.data.inTxs[0] = { chainId, txHash: hash(99), status: 'success', stateChanges: [
      { address: wallet, change: { kind: 'token', data: { tokenAddress: address }, balanceDiff: '-1000000' } },
    ] };
    const result = matchRelayFlow(4663, wallet, flow(), [r]);
    assert.equal(result.settlement?.quote.decimals, decimals); assert.equal(result.settlement?.amountUsd, '1000');
    r.data.metadata.currencyIn.currency.decimals = decimals === 6 ? 18 : 6;
    assert.equal(matchRelayFlow(4663, wallet, flow(), [r]).reason, 'unsupported_relay_quote');
  }
});

test('separate cycles, exact inclusive threshold and old purchases use closure-date filtering', () => {
  const e = evidence([flow(true, 1, '500'), flow(false, 2, '250'), flow(true, 3, '500'), flow(false, 4, '250.000001')]);
  e.flows[0].timestamp = 1; e.snapshot.timestamp = '0x15245';
  const a = analyzeRelay(e, 1);
  assert.equal(a.cycles.length, 2); assert.equal(a.preliminaryCandidates.length, 1);
  assert.equal(a.cycles[0].estimatedLossUsd, '250'); assert.equal(a.cycles[1].estimatedLossUsd, '249.999999');
});

test('Relay rejects wrong chain, owner, quote, target amount, ambiguous links and failed settlement', () => {
  const mutations: ((r: RelayRequest) => void)[] = [
    r => { r.data.metadata.currencyOut.currency.chainId = 8453; },
    r => { r.recipient = solver; },
    r => { r.data.metadata.currencyOut.amount = '101'; },
    r => { r.data.inTxs[0].chainId = 4663; },
    r => { r.data.inTxs[0].status = 'pending'; },
    r => { r.data.inTxs[0].stateChanges![0].change.balanceDiff = '-999999'; },
    r => { r.data.metadata.currencyIn.currency.address = SOLANA_USDC.toLowerCase(); },
    r => { r.data.inTxs[0].stateChanges![0].address = solOwner.toLowerCase(); },
    r => { delete r.data.metadata.currencyIn.amountUsd; },
    r => { r.data.metadata.currencyIn.amountUsd = 'NaN'; },
    r => { r.status = 'refund'; },
  ];
  for (const mutate of mutations) { const r = request(); mutate(r); assert.ok(matchRelayFlow(4663, wallet, flow(), [r]).reason); }
  assert.equal(matchRelayFlow(4663, wallet, flow(), [request(), request()]).reason, 'missing_or_ambiguous_relay_link');
});

test('current prices never substitute for missing historical USD', () => {
  const r = request(); delete r.data.metadata.currencyIn.amountUsd;
  Object.assign(r.data.metadata.currencyIn, { amountUsdCurrent: '1000' });
  assert.equal(matchRelayFlow(4663, wallet, flow(), [r]).reason, 'missing_relay_historical_price');
});

test('transfers, missing counterpart, unknown opening and balance drift cannot become estimated losses', () => {
  for (const mutate of [
    (e: RelayEvidence) => { e.flows[1].settlement = undefined; e.flows[1].reason = 'missing_or_ambiguous_relay_link'; },
    (e: RelayEvidence) => { e.fromBlock = '2'; },
    (e: RelayEvidence) => { e.balances[`${token}:100`] = '1'; },
    (e: RelayEvidence) => { e.balances[`${token}:2`] = '1'; },
    (e: RelayEvidence) => { e.historyComplete = false; },
    (e: RelayEvidence) => { e.relayHistoryComplete = false; },
  ]) {
    const e = evidence(); mutate(e); const a = analyzeRelay(e);
    assert.equal(a.preliminaryCandidates.length, 0); assert.equal(a.cycles[0].estimatedLossUsd, null);
  }
  const e = evidence([flow()]); e.balances[`${token}:100`] = '100';
  assert.equal(analyzeRelay(e).cycles.length, 0); assert.equal(analyzeRelay(e).openPositions[0].balanceRaw, '100');
});

test('a provider settlement cannot be charged to multiple cycles or requests', () => {
  const e = evidence([flow(true, 1), flow(false, 2), flow(true, 3), flow(false, 4)]);
  e.flows[2].settlement!.requestId = e.flows[0].settlement!.requestId;
  assert.equal(analyzeRelay(e).preliminaryCandidates.length, 0);
  e.flows[2].settlement!.requestId = hash(103);
  e.flows[2].settlement!.quote.txHash = e.flows[0].settlement!.quote.txHash;
  assert.equal(analyzeRelay(e).preliminaryCandidates.length, 0);
});

test('overlap detected in a later cycle invalidates both cycles, and known nonzero opening is excluded', () => {
  const e = evidence([flow(true, 1), flow(false, 2), flow(true, 3), flow(false, 4)]);
  e.flows[2].eventIds = e.flows[0].eventIds;
  assert.equal(analyzeRelay(e).preliminaryCandidates.length, 0);
  const fresh = evidence(); fresh.balances[`${token}:0`] = '1';
  assert.equal(analyzeRelay(fresh).preliminaryCandidates.length, 0);
});

test('receipt attribution ignores bundler sender, verifies full wallet transfers and rejects index mismatch', () => {
  const log: RpcLog = { address: token, topics: [TRANSFER_TOPIC, topic(solver), topic(wallet)], data: `0x${(100n).toString(16).padStart(64, '0')}`,
    transactionHash: hash(1), blockNumber: '0x1', blockHash: hash(1001), logIndex: '0x0', transactionIndex: '0x0' };
  const block = { number: '0x1', hash: hash(1001), timestamp: '0x3e9' };
  const receipt = { status: '0x1', blockNumber: '0x1', blockHash: block.hash, transactionHash: hash(1), transactionIndex: '0x0', from: solver, to: solver, logs: [log] };
  assert.equal(decodeRelayReceipt(4663, wallet, receipt, block, [log], [request()])[0].settlement?.amountUsd, '1000');
  assert.throws(() => decodeRelayReceipt(4663, wallet, receipt, block, [], [request()]), /receipt_history_mismatch/);
  assert.throws(() => decodeRelayReceipt(4663, wallet, receipt, { ...block, hash: hash(20) }, [log], [request()]), /receipt_block_mismatch/);
});

test('Relay pagination is checkpointed, follows continuation and deduplicates identical requests', async () => {
  const state: RelayHistory = { requests: [], seenContinuations: [], complete: false, apiVersion: 'v2' };
  const urls: string[] = []; let saves = 0;
  const transport = new Transport({ wait: async () => {}, fetch: async input => {
    urls.push(String(input));
    return new Response(JSON.stringify(urls.length === 1 ? { requests: [request()], continuation: 'page2', deprecation: 'upgrade' } : { requests: [request(), request(false, 2)] }));
  } });
  await collectRelayHistory(transport, wallet, state, async () => { saves++; });
  assert.equal(state.complete, true); assert.equal(state.requests.length, 2); assert.equal(saves, 2);
  assert.ok(urls[1].includes('continuation=page2')); assert.equal(state.deprecation, 'upgrade');
});

test('pagination loop and conflicting request fail without advancing past the bad page', async () => {
  for (const conflict of [false, true]) {
    const state: RelayHistory = { requests: [request()], continuation: 'cursor', seenContinuations: [], complete: false, apiVersion: 'v2' };
    const changed = request(); changed.status = 'refund';
    const transport = new Transport({ wait: async () => {}, fetch: async () => new Response(JSON.stringify(conflict
      ? { requests: [changed] } : { requests: [], continuation: 'cursor' })) });
    await assert.rejects(collectRelayHistory(transport, wallet, state, async () => {}), conflict ? /conflicting_relay_request/ : /relay_pagination_loop/);
    assert.equal(state.complete, false); assert.equal(state.continuation, 'cursor'); assert.equal(state.requests[0].status, 'success');
  }
});

test('v3 supports txHash and requires explicit API credentials without saving them', async () => {
  const state: RelayHistory = { requests: [], seenContinuations: [], complete: false, apiVersion: 'v3' };
  const transport = new Transport({ wait: async () => {}, fetch: async (_input, init) => {
    assert.equal((init!.headers as Record<string, string>)['x-api-key'], 'test-credential');
    return new Response(JSON.stringify({ requests: [request()] }));
  } });
  await assert.rejects(collectRelayHistory(transport, wallet, state, async () => {}), /relay_api_key_required/);
  await collectRelayHistory(transport, wallet, state, async () => {}, { apiKey: 'test-credential' });
  assert.equal(JSON.stringify(state).includes('test-credential'), false);
});

test('v3 separately queries recipient buys and tolerates changing current-price display metadata', async () => {
  const state: RelayHistory = { requests: [], seenContinuations: [], complete: false, apiVersion: 'v3' };
  const urls: string[] = [];
  const transport = new Transport({ wait: async () => {}, fetch: async input => {
    urls.push(String(input)); const r = request(false, 2);
    Object.assign(r.data.metadata.currencyOut, { amountUsdCurrent: String(urls.length) });
    return new Response(JSON.stringify({ requests: urls.length === 1 ? [r] : [r, request()] }));
  } });
  await collectRelayHistory(transport, wallet, state, async () => {}, { apiKey: 'synthetic' });
  assert.equal(urls.length, 2); assert.ok(urls[0].includes('user=')); assert.ok(urls[1].includes('recipient='));
  assert.equal(state.requests.length, 2); assert.equal(state.complete, true);
});
