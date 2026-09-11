import { createHash } from 'node:crypto';
import { FUNDING_CHAIN_IDS, FUNDING_POLICY, MIN_FUNDING_USD, fundingChains, fundingTokenDecimals } from '../providers/funding-chains.ts';
import type { RpcBlock } from '../providers/rpc.ts';
import type { Price } from './types.ts';
import { decimal, formatDecimal, usdValue, USD_SCALE } from './decimal.ts';

export interface FundingObservation {
  chainId: number; wallet: string; token: string; amountRaw: string;
  txHash: string; logIndex: string; transactionIndex: string; blockNumber: string; blockHash: string;
  creditedAt: number; kind: 'direct' | 'unresolved'; sourceAddress?: string; reason?: string;
  price?: Price;
}
export interface FundingCoverage {
  chainId: number; fromBlock: string; complete: boolean; snapshot?: RpcBlock; error?: string;
}
export interface FundingEvidence {
  wallet: string; coverage: FundingCoverage[]; observations: FundingObservation[];
  // Route discovery is not an account-membership proof. Any external account
  // prevents treating this EVM address's history as the entire FOMO balance.
  externalAccounts: { chainId: number; address: string; requestId: string }[];
  relayComplete: boolean;
}

function order(a: FundingObservation, b: FundingObservation): number {
  if (a.creditedAt !== b.creditedAt) return a.creditedAt - b.creditedAt;
  if (a.chainId !== b.chainId) return a.chainId - b.chainId; // display order only; ties are rejected below
  for (const key of ['blockNumber', 'transactionIndex', 'logIndex'] as const) {
    if (BigInt(a[key]) !== BigInt(b[key])) return BigInt(a[key]) < BigInt(b[key]) ? -1 : 1;
  }
  return 0;
}

function fundingValue(o: FundingObservation): bigint | undefined {
  const decimals = fundingTokenDecimals(o.chainId, o.token), p = o.price;
  if (decimals === undefined || !p) return undefined;
  if (!/^\d+(?:\.\d{1,36})?$/.test(p.usd) || decimal(p.usd) <= 0n || !Number.isFinite(p.confidence) || p.confidence < 0.9 || p.confidence > 1
    || !Number.isSafeInteger(p.timestamp) || Math.abs(p.timestamp - o.creditedAt) > 3600 || !p.source) return undefined;
  return usdValue(o.amountRaw, decimals, p.usd);
}

export function analyzeFunding(evidence: FundingEvidence, cycleOpenedAt?: number) {
  if (!/^0x[0-9a-f]{40}$/.test(evidence.wallet)) throw new Error('invalid_funding_wallet');
  if (cycleOpenedAt !== undefined && (!Number.isSafeInteger(cycleOpenedAt) || cycleOpenedAt < 1)) throw new Error('invalid_cycle_opened_at');
  const reasons = new Set<string>();
  const unique = new Map<string, FundingObservation>();
  for (const o of evidence.observations) {
    if (!FUNDING_CHAIN_IDS.some(id => id === o.chainId) || o.wallet !== evidence.wallet
      || !Number.isSafeInteger(o.creditedAt) || o.creditedAt < 1 || !/^\d+$/.test(o.amountRaw) || BigInt(o.amountRaw) <= 0n
      || !/^0x[0-9a-f]{40}$/.test(o.token) || !/^0x[0-9a-f]{64}$/.test(o.txHash) || !/^0x[0-9a-f]{64}$/.test(o.blockHash)
      || ![o.logIndex, o.transactionIndex, o.blockNumber].every(n => /^\d+$/.test(n))
      || !['direct', 'unresolved'].includes(o.kind)
      || (o.kind === 'direct' && !fundingChains().find(c => c.id === o.chainId)?.cashTokens[o.token])
      || (o.kind === 'direct' && (!/^0x[0-9a-f]{40}$/.test(o.sourceAddress ?? '') || o.sourceAddress === evidence.wallet || /^0x0{40}$/.test(o.sourceAddress!)))) {
      throw new Error('invalid_funding_observation');
    }
    const key = `${o.chainId}:${o.txHash}:${o.logIndex}`;
    const prior = unique.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(o)) throw new Error('conflicting_funding_observation');
    unique.set(key, o);
  }
  for (const id of FUNDING_CHAIN_IDS) {
    const entries = evidence.coverage.filter(c => c.chainId === id);
    if (entries.length !== 1 || !entries[0].complete || entries[0].fromBlock !== '0' || !entries[0].snapshot || entries[0].error) reasons.add(`incomplete_history:${id}`);
  }
  if (!evidence.relayComplete) reasons.add('incomplete_route_discovery');
  if (evidence.externalAccounts.length) reasons.add('external_account_history_and_membership_unverified');
  const observations = [...unique.values()].sort(order);
  for (const o of observations) {
    const coverage = evidence.coverage.find(c => c.chainId === o.chainId);
    if (!coverage?.snapshot || BigInt(o.blockNumber) > BigInt(coverage.snapshot.number)
      || o.creditedAt > Number(BigInt(coverage.snapshot.timestamp))) reasons.add(`observation_outside_snapshot:${o.chainId}`);
  }
  const minimum = decimal(MIN_FUNDING_USD);
  const assessed = observations.map(o => {
    const value = fundingValue(o);
    return { ...o, amountUsd: value === undefined ? null : formatDecimal(value),
      thresholdStatus: value === undefined ? 'unpriced' as const : value < minimum ? 'below_minimum' as const : 'qualifying' as const };
  });
  // Unknown value may be >= the threshold: it must block a later source.
  // Known dust remains in evidence but cannot establish priority, even if a
  // much later significant deposit happens to come from the same sender.
  const relevant = assessed.filter(o => o.thresholdStatus !== 'below_minimum');
  const first = relevant[0];
  if (first) {
    for (const id of FUNDING_CHAIN_IDS) {
      const snapshot = evidence.coverage.find(c => c.chainId === id)?.snapshot;
      if (!snapshot || Number(BigInt(snapshot.timestamp)) < first.creditedAt) reasons.add(`snapshot_before_first_credit:${id}`);
    }
    if (first.kind !== 'direct') reasons.add(`earliest_credit_unresolved:${first.reason ?? 'unknown'}`);
    if (first.thresholdStatus === 'unpriced') reasons.add('earliest_credit_value_unverified');
    if (relevant.some(o => o.chainId !== first.chainId && o.creditedAt === first.creditedAt)) reasons.add('ambiguous_cross_chain_order');
    if (cycleOpenedAt !== undefined && first.creditedAt >= cycleOpenedAt) reasons.add('funding_not_before_cycle');
  }
  const firstSource = first?.kind === 'direct' && first.thresholdStatus === 'qualifying' && reasons.size === 0 ? {
    method: 'first_funding_source' as const, methodVersion: FUNDING_POLICY,
    sourceAddress: first.sourceAddress!, sourceChainId: first.chainId,
    fundingWallet: evidence.wallet, fundingChainId: first.chainId,
    evidenceId: createHash('sha256').update(JSON.stringify([FUNDING_POLICY, first.chainId, evidence.wallet,
      first.sourceAddress, first.token, first.amountRaw, first.txHash, first.logIndex, first.blockHash,
      MIN_FUNDING_USD, first.price!.usd, first.price!.timestamp, first.price!.source])).digest('hex'),
    credit: first,
  } : null;
  const direct = assessed.filter(o => o.kind === 'direct');
  const totalQualifyingUsd = direct.filter(o => o.thresholdStatus === 'qualifying').reduce((sum, o) => sum + decimal(o.amountUsd!), 0n);
  const sources = new Map<string, typeof direct>();
  for (const o of direct) {
    const key = `${o.chainId}:${o.sourceAddress}`;
    sources.set(key, [...(sources.get(key) ?? []), o]);
  }
  const sourceSummaries = [...sources.values()].map(credits => {
    const qualifying = credits.filter(o => o.thresholdStatus === 'qualifying');
    const amount = qualifying.reduce((sum, o) => sum + decimal(o.amountUsd!), 0n);
    const count = (items: typeof direct) => new Set(items.map(o => o.txHash)).size;
    const firstQualifying = qualifying[0];
    const possibleTests = firstQualifying ? credits.filter(o => o.thresholdStatus === 'below_minimum' && order(o, firstQualifying) < 0) : [];
    return { sourceAddress: credits[0].sourceAddress!, sourceChainId: credits[0].chainId,
      depositCount: count(credits), qualifyingDepositCount: count(qualifying),
      belowMinimumCount: count(credits.filter(o => o.thresholdStatus === 'below_minimum')),
      unpricedCount: count(credits.filter(o => o.thresholdStatus === 'unpriced')),
      qualifyingDaysUtc: new Set(qualifying.map(o => new Date(o.creditedAt * 1000).toISOString().slice(0, 10))).size,
      hasRepeatedQualifyingDeposits: count(qualifying) > 1,
      qualifyingAmountUsd: formatDecimal(amount),
      shareOfObservedQualifyingDirectAmountPct: totalQualifyingUsd ? formatDecimal(amount * 100n * USD_SCALE / totalQualifyingUsd, 6) : null,
      firstQualifyingCredit: firstQualifying ?? null, possibleTestDeposits: possibleTests,
      qualifyingBeforeCycleCount: cycleOpenedAt === undefined ? null : count(qualifying.filter(o => o.creditedAt < cycleOpenedAt)),
    };
  });
  return {
    status: reasons.size ? 'partial' as const : 'complete' as const,
    sourceStatus: firstSource ? 'source_identified' : first ? 'unresolved' : reasons.size ? 'unknown' : assessed.length ? 'below_minimum_only' : 'not_found',
    methodVersion: FUNDING_POLICY, minimumDepositUsd: MIN_FUNDING_USD, thresholdComparison: 'greater_than_or_equal',
    firstSource, firstObservedCredit: assessed[0] ?? null, firstRelevantCredit: first ?? null,
    firstObservedQualifyingCredit: assessed.find(o => o.thresholdStatus === 'qualifying') ?? null,
    observedDirectSources: direct, observations: assessed, sourceSummaries,
    belowMinimumCredits: assessed.filter(o => o.thresholdStatus === 'below_minimum'),
    reasons: [...reasons].sort(), signatureVerified: false, burialAuthorized: false,
    scope: 'allowlisted_erc20_cash_credits_to_supplied_evm_address',
    cycleOpenedAt: cycleOpenedAt ?? null,
  };
}
