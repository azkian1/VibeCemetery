import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFunding } from '../../src/lib/rekt/scanner/funding.ts';
import type { FundingEvidence, FundingObservation } from '../../src/lib/rekt/scanner/funding.ts';
import { fundingChains } from '../../src/lib/rekt/providers/funding-chains.ts';
import { decodeFundingReceipt, externalRelayAccounts } from '../../src/lib/rekt/providers/funding.ts';
import type { FundingTransaction } from '../../src/lib/rekt/providers/funding.ts';
import { TRANSFER_TOPIC, hex } from '../../src/lib/rekt/providers/rpc.ts';
import type { RpcReceipt } from '../../src/lib/rekt/providers/rpc.ts';
import { scanChain } from '../../src/lib/rekt/providers/chains.ts';
import type { RelayRequest } from '../../src/lib/rekt/providers/relay.ts';

const wallet = `0x${'1'.repeat(40)}`, source = `0x${'2'.repeat(40)}`;
const block = { number: '0x64', timestamp: '0x3e8', hash: `0x${'a'.repeat(64)}` };
function observation(chainId = 8453, creditedAt = 900): FundingObservation {
  return { chainId, wallet, sourceAddress: source, token: Object.keys(fundingChains().find(c => c.id === chainId)!.cashTokens)[0],
    amountRaw: chainId === 56 ? '100000000000000000000' : '100000000', txHash: `0x${'b'.repeat(64)}`, blockHash: block.hash, blockNumber: '90',
    price: { usd: '1', timestamp: creditedAt, confidence: 1, source: 'synthetic_test_quote' },
    transactionIndex: '1', logIndex: '1', creditedAt, kind: 'direct' };
}
function evidence(observations = [observation()]): FundingEvidence {
  return { wallet, observations, coverage: fundingChains().map(c => ({ chainId: c.id, fromBlock: '0', complete: true, snapshot: block })),
    externalAccounts: [], relayComplete: true };
}
for (const chain of fundingChains()) test(`identifies direct first source in ${chain.name}, without granting burial authorization`, () => {
  const r = analyzeFunding(evidence([observation(chain.id)]), 950);
  assert.equal(r.status, 'complete'); assert.equal(r.firstSource?.sourceChainId, chain.id);
  assert.equal(r.firstSource?.fundingWallet, wallet); assert.equal(r.signatureVerified, false); assert.equal(r.burialAuthorized, false);
});
test('earliest credit uses destination time across networks, not block number or loss chain', () => {
  const bnb = observation(56, 800); bnb.blockNumber = '99';
  const robinhood = observation(4663, 900); robinhood.blockNumber = '1';
  assert.equal(analyzeFunding(evidence([robinhood, bnb])).firstSource?.sourceChainId, 56);
});
test('missing or duplicate chain coverage cannot establish a first source', () => {
  for (const change of ['missing', 'duplicate', 'partial', 'narrowed', 'error']) {
    const e = evidence();
    if (change === 'missing') e.coverage.pop();
    if (change === 'duplicate') e.coverage.push(e.coverage[0]);
    if (change === 'partial') e.coverage[0].complete = false;
    if (change === 'narrowed') e.coverage[0].fromBlock = '1';
    if (change === 'error') e.coverage[0].error = 'reorg_detected';
    const r = analyzeFunding(e); assert.equal(r.status, 'partial'); assert.equal(r.firstSource, null);
    assert.equal(r.observedDirectSources.length, 1);
  }
});
test('unresolved earlier cash or unknown asset cannot be skipped for a convenient later sender', () => {
  const earlier = { ...observation(1, 700), kind: 'unresolved' as const, sourceAddress: undefined, reason: 'routed_or_nonstandard_cash_credit' };
  const r = analyzeFunding(evidence([observation(), earlier]));
  assert.equal(r.firstSource, null); assert.equal(r.firstObservedCredit?.chainId, 1);
  assert.ok(r.reasons.includes('earliest_credit_unresolved:routed_or_nonstandard_cash_credit'));
});
test('later unsupported movement does not invalidate earlier established direct source', () => {
  const later = { ...observation(1, 950), kind: 'unresolved' as const, reason: 'unsupported_asset_credit' };
  assert.ok(analyzeFunding(evidence([later, observation()])).firstSource);
});
test('cross-chain timestamp tie is ambiguous; same-chain order uses tx/log position', () => {
  assert.ok(analyzeFunding(evidence([observation(), observation(1)])).reasons.includes('ambiguous_cross_chain_order'));
  const other = { ...observation(), logIndex: '2', sourceAddress: `0x${'3'.repeat(40)}` };
  assert.equal(analyzeFunding(evidence([other, observation()])).firstSource?.sourceAddress, source);
});
test('deposit must precede cycle opening and other chain snapshots must cover its timestamp', () => {
  for (const time of [800, 900]) assert.ok(analyzeFunding(evidence(), time).reasons.includes('funding_not_before_cycle'));
  const e = evidence(); e.coverage[1].snapshot = { ...block, timestamp: hex(850n) };
  assert.ok(analyzeFunding(e).reasons.includes('snapshot_before_first_credit:4663'));
});
test('related external/Solana account or incomplete Relay discovery blocks account-wide primacy', () => {
  const e = evidence(); e.externalAccounts = [{ chainId: 792703809, address: 'SolanaExample', requestId: 'route' }];
  assert.equal(analyzeFunding(e).firstSource, null);
  e.externalAccounts = []; e.relayComplete = false;
  assert.ok(analyzeFunding(e).reasons.includes('incomplete_route_discovery'));
});
test('proof ID stable across input order and duplicate evidence, but bound to source and chain', () => {
  const base = observation(), later = observation(1, 950);
  const id = analyzeFunding(evidence([base, later])).firstSource!.evidenceId;
  assert.equal(analyzeFunding(evidence([later, base, base])).firstSource!.evidenceId, id);
  assert.notEqual(analyzeFunding(evidence([{ ...base, sourceAddress: `0x${'3'.repeat(40)}` }])).firstSource!.evidenceId, id);
  assert.notEqual(analyzeFunding(evidence([observation(56)])).firstSource!.evidenceId, id);
  assert.throws(() => analyzeFunding(evidence([base, { ...base, amountRaw: '1' }])), /conflicting/);
});
test('empty fully covered scope differs from incomplete or invalid evidence', () => {
  assert.equal(analyzeFunding(evidence([])).sourceStatus, 'not_found');
  const e = evidence([]); e.coverage[0].complete = false; assert.equal(analyzeFunding(e).sourceStatus, 'unknown');
  assert.throws(() => analyzeFunding(evidence([{ ...observation(), wallet: source }])), /invalid/);
  assert.throws(() => analyzeFunding(evidence([{ ...observation(), amountRaw: '0' }])), /invalid/);
  assert.throws(() => analyzeFunding(evidence([{ ...observation(), sourceAddress: wallet }])), /invalid/);
});

function receiptFixture(chainId = 8453) {
  const chain = fundingChains().find(c => c.id === chainId)!;
  const token = Object.keys(chain.cashTokens)[0], amount = 100000000n;
  const topic = (a: string) => `0x${a.slice(2).padStart(64, '0')}`;
  const log = { address: token, topics: [TRANSFER_TOPIC, topic(source), topic(wallet)], data: `0x${amount.toString(16).padStart(64, '0')}`,
    blockNumber: block.number, blockHash: block.hash, transactionHash: `0x${'b'.repeat(64)}`, transactionIndex: '0x1', logIndex: '0x1' };
  const receipt: RpcReceipt = { status: '0x1', transactionHash: log.transactionHash, blockHash: block.hash, blockNumber: block.number,
    from: source, to: token, transactionIndex: '0x1', logs: [log] };
  const tx: FundingTransaction = { from: source, to: token, value: '0x0', hash: log.transactionHash, blockHash: block.hash,
    input: `0xa9059cbb${wallet.slice(2).padStart(64, '0')}${amount.toString(16).padStart(64, '0')}` };
  return { chain, log, receipt, tx };
}
for (const chain of fundingChains()) test(`validates onchain direct transfer in ${chain.name}`, () => {
  const f = receiptFixture(chain.id), [r] = decodeFundingReceipt(f.chain, wallet, [f.log], f.receipt, f.tx, block);
  assert.equal(r.kind, 'direct'); assert.equal(r.sourceAddress, source); assert.equal(r.amountRaw, '100000000');
});
test('bundler, wrong calldata, payable transfer, mint and unsupported assets never identify a personal source', () => {
  for (const variant of ['bundler', 'calldata', 'payable', 'mint', 'unknown']) {
    const f = receiptFixture();
    if (variant === 'bundler') f.tx.from = f.receipt.from = `0x${'3'.repeat(40)}`;
    if (variant === 'calldata') f.tx.input = '0x';
    if (variant === 'payable') f.tx.value = '0x1';
    if (variant === 'mint') f.log.topics[1] = `0x${'0'.repeat(64)}`;
    if (variant === 'unknown') f.log.address = `0x${'4'.repeat(40)}`;
    const [r] = decodeFundingReceipt(f.chain, wallet, [f.log], f.receipt, f.tx, block);
    assert.equal(r.kind, 'unresolved'); assert.equal(r.sourceAddress, undefined);
  }
});
test('receipt tampering, omitted logs, failed transaction and reorg fail closed', () => {
  for (const variant of ['omitted', 'hash', 'failed', 'removed', 'index']) {
    const f = receiptFixture();
    if (variant === 'omitted') f.receipt.logs = [];
    if (variant === 'hash') f.tx.blockHash = `0x${'c'.repeat(64)}`;
    if (variant === 'failed') f.receipt.status = '0x0';
    if (variant === 'removed') f.receipt.logs = [{ ...f.log, removed: true }];
    if (variant === 'index') f.receipt.transactionIndex = '0x2';
    assert.throws(() => decodeFundingReceipt(f.chain, wallet, [f.log], f.receipt, f.tx, block), /funding_|invalid_log/);
  }
});
test('duplicate receipt events cannot double-count a funding credit', () => {
  const f = receiptFixture(); f.receipt.logs.push({ ...f.log });
  const [r] = decodeFundingReceipt(f.chain, wallet, [f.log], f.receipt, f.tx, block);
  assert.equal(r.amountRaw, '100000000'); assert.equal(r.kind, 'direct');
});
test('zero/self transfers and ERC721 do not create funding observations', () => {
  for (const variant of ['zero', 'self', 'nft']) {
    const f = receiptFixture();
    if (variant === 'zero') f.log.data = `0x${'0'.repeat(64)}`;
    if (variant === 'self') f.log.topics[1] = f.log.topics[2];
    if (variant === 'nft') { f.log.address = `0x${'4'.repeat(40)}`; f.log.topics.push(`0x${'0'.repeat(64)}`); f.log.data = '0x'; }
    assert.deepEqual(decodeFundingReceipt(f.chain, wallet, [f.log], f.receipt, f.tx, block), []);
  }
});
test('round-trip and tax movements cannot masquerade as a direct deposit', () => {
  const f = receiptFixture();
  const outgoing = { ...f.log, topics: [TRANSFER_TOPIC, f.log.topics[2], f.log.topics[1]], logIndex: '0x2' };
  f.receipt.logs.push(outgoing);
  assert.deepEqual(decodeFundingReceipt(f.chain, wallet, [f.log, outgoing], f.receipt, f.tx, block), []);
  outgoing.data = `0x${(1n).toString(16).padStart(64, '0')}`;
  assert.equal(decodeFundingReceipt(f.chain, wallet, [f.log, outgoing], f.receipt, f.tx, block)[0].kind, 'unresolved');
});
test('Relay counterpart is recorded without claiming membership; case-sensitive Solana retained', () => {
  const request = { id: 'r1', status: 'success', user: wallet, recipient: 'SolanaAddress',
    data: { metadata: { currencyIn: { currency: { chainId: 8453 } }, currencyOut: { currency: { chainId: 792703809 } } } } } as RelayRequest;
  assert.deepEqual(externalRelayAccounts(wallet, [request, request]), [{ chainId: 792703809, address: 'SolanaAddress', requestId: 'r1' }]);
  request.recipient = wallet.toUpperCase().replace('0X', '0x'); request.data.metadata.currencyOut.currency.chainId = 1;
  assert.deepEqual(externalRelayAccounts(wallet, [request]), []);
});
test('funding support does not silently expand PnL networks', () => {
  assert.equal(scanChain('bnb'), undefined); assert.equal(scanChain('ethereum'), undefined);
});

export { wallet, source, block, receiptFixture };

for (const [raw, expected] of [['9999999', 'below_minimum_only'], ['10000000', 'source_identified'], ['10000001', 'source_identified']] as const) {
  test(`funding threshold includes exactly $10 without rounding: ${raw} micro-USDC`, () => {
    const r = analyzeFunding(evidence([{ ...observation(), amountRaw: raw }]));
    assert.equal(r.sourceStatus, expected); assert.equal(r.minimumDepositUsd, '10');
    assert.equal(r.observations[0].amountUsd, raw === '9999999' ? '9.999999' : raw === '10000000' ? '10' : '10.000001');
  });
}
test('BNB 18-decimal funding is compared exactly at the $10 threshold', () => {
  const credit = observation(56); credit.amountRaw = '9999999999999999999';
  assert.equal(analyzeFunding(evidence([credit])).sourceStatus, 'below_minimum_only');
  credit.amountRaw = '10000000000000000000';
  assert.equal(analyzeFunding(evidence([credit])).sourceStatus, 'source_identified');
});
test('test transfer followed by a large deposit preserves context without backdating priority', () => {
  const small = { ...observation(8453, 700), amountRaw: '1000000', txHash: `0x${'d'.repeat(64)}` };
  const large = observation(8453, 900);
  const r = analyzeFunding(evidence([large, small]), 950);
  assert.equal(r.firstObservedCredit?.creditedAt, 700); assert.equal(r.firstSource?.credit.creditedAt, 900);
  assert.equal(r.sourceSummaries[0].possibleTestDeposits.length, 1);
  assert.equal(r.sourceSummaries[0].depositCount, 2); assert.equal(r.sourceSummaries[0].qualifyingDepositCount, 1);
  assert.equal(r.sourceSummaries[0].hasRepeatedQualifyingDeposits, false);
  assert.ok(analyzeFunding(evidence([large, small]), 800).reasons.includes('funding_not_before_cycle'));
});
test('early dust sender cannot leapfrog another source by later making a large deposit', () => {
  const small = { ...observation(8453, 600), amountRaw: '10000', txHash: `0x${'d'.repeat(64)}` };
  const other = { ...observation(1, 700), sourceAddress: `0x${'3'.repeat(40)}` };
  const large = observation(8453, 900);
  const r = analyzeFunding(evidence([small, other, large]));
  assert.equal(r.firstSource?.sourceAddress, other.sourceAddress);
  assert.equal(r.sourceSummaries.find(s => s.sourceAddress === source)?.possibleTestDeposits.length, 1);
});
test('many small deposits never accumulate into a qualifying deposit or repeat-strength signal', () => {
  const credits = Array.from({ length: 10 }, (_, i) => ({ ...observation(), amountRaw: '2000000', txHash: `0x${i.toString(16).padStart(64, '0')}` }));
  const r = analyzeFunding(evidence(credits));
  assert.equal(r.sourceStatus, 'below_minimum_only'); assert.equal(r.firstSource, null);
  assert.equal(r.sourceSummaries[0].qualifyingDepositCount, 0); assert.equal(r.sourceSummaries[0].belowMinimumCount, 10);
  assert.equal(r.sourceSummaries[0].hasRepeatedQualifyingDeposits, false);
});
test('unknown/stale/low-confidence historical value cannot be discarded as dust', () => {
  const tiny = { ...observation(1, 700), amountRaw: '1' };
  for (const price of [undefined, { usd: '1', timestamp: 9999, confidence: 1, source: 'test' },
    { usd: '1', timestamp: 700, confidence: 0.5, source: 'test' }, { usd: '0', timestamp: 700, confidence: 1, source: 'test' }]) {
    const r = analyzeFunding(evidence([{ ...tiny, price }, observation()]));
    assert.equal(r.firstSource, null); assert.ok(r.reasons.includes('earliest_credit_value_unverified'));
    assert.equal(r.belowMinimumCredits.length, 0);
  }
});
test('depeg is applied at deposit time, not a hardcoded $1 stablecoin price', () => {
  const credit = { ...observation(), amountRaw: '12000000', price: { usd: '0.5', timestamp: 900, confidence: 1, source: 'test' } };
  const r = analyzeFunding(evidence([credit]));
  assert.equal(r.sourceStatus, 'below_minimum_only'); assert.equal(r.observations[0].amountUsd, '6');
});
test('known routed cash dust can be skipped; an unpriced unknown asset still blocks a later sender', () => {
  const small = { ...observation(1, 700), amountRaw: '1000000', kind: 'unresolved' as const, reason: 'routed_or_nonstandard_cash_credit' };
  assert.ok(analyzeFunding(evidence([small, observation()])).firstSource);
  small.token = `0x${'4'.repeat(40)}`;
  assert.equal(analyzeFunding(evidence([small, observation()])).firstSource, null);
});
test('source statistics count distinct transactions and UTC days, keep chain identities separate and exclude dust from share', () => {
  const one = observation(8453, 900), two = { ...observation(8453, 87300), txHash: `0x${'c'.repeat(64)}` };
  const otherChain = { ...observation(1, 1000), amountRaw: '200000000' };
  const small = { ...observation(8453, 800), amountRaw: '1000000', txHash: `0x${'d'.repeat(64)}` };
  const e = evidence([one, two, small, otherChain, one]); e.coverage.forEach(c => { c.snapshot = { ...block, timestamp: hex(100000n) }; });
  const r = analyzeFunding(e, 2000), base = r.sourceSummaries.find(s => s.sourceChainId === 8453)!;
  assert.equal(r.sourceSummaries.length, 2); assert.equal(base.depositCount, 3); assert.equal(base.qualifyingDepositCount, 2);
  assert.equal(base.qualifyingDaysUtc, 2); assert.equal(base.qualifyingAmountUsd, '200');
  assert.equal(base.shareOfObservedQualifyingDirectAmountPct, '50'); assert.equal(base.qualifyingBeforeCycleCount, 1);
  assert.equal(base.hasRepeatedQualifyingDeposits, true);
});
