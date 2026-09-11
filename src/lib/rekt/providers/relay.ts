import { decimal } from '../scanner/decimal.ts';
import { SOLANA_RELAY_CHAIN_ID, SOLANA_USDC, sameAddress } from './chains.ts';
import { quoteAssets } from './deployments.ts';
import { fundingTokenDecimals } from './funding-chains.ts';
import type { Price } from '../scanner/types.ts';
import { ProviderError, Transport } from './rpc.ts';

interface Currency { chainId: number | string; address: string; decimals: number | string; symbol?: string }
interface Amount { currency: Currency; amount: string; amountUsd?: string }
interface StateChange { address: string; change: { kind: string; data?: { tokenAddress?: string }; balanceDiff: string } }
export interface RelayTx {
  chainId: number | string; hash?: string; txHash?: string; status: string; stateChanges?: StateChange[];
}
export interface RelayRequest {
  id: string; status: string; user: string; recipient: string;
  data: { inTxs: RelayTx[]; outTxs: RelayTx[]; metadata: { currencyIn: Amount; currencyOut: Amount } };
}
export interface RelayHistory {
  requests: RelayRequest[]; continuation?: string; seenContinuations: string[]; complete: boolean;
  apiVersion: 'v2' | 'v3'; deprecation?: unknown;
  filter?: 'user' | 'recipient';
}
export interface RelaySettlement {
  requestId: string; symbol?: string; amountUsd: string;
  quote: { chainId: number; token: string; amountRaw: string; decimals: number; owner: string; txHash: string; historicalPrice?: Price };
  source: 'relay_historical_amount_usd' | 'dex_wallet_net_historical_usd';
}

export const relayTxHash = (tx: RelayTx) => tx.txHash ?? tx.hash ?? '';

function requestFingerprint(r: RelayRequest): string {
  // Mutable display fields (notably amountUsdCurrent) are not financial evidence.
  const amount = (a: Amount) => [Number(a.currency.chainId), a.currency.address, Number(a.currency.decimals), a.amount, a.amountUsd];
  const txs = (list: RelayTx[]) => list.map(t => [Number(t.chainId), relayTxHash(t), t.status,
    t.stateChanges?.map(s => JSON.stringify([s.address, s.change.kind, s.change.data?.tokenAddress, s.change.balanceDiff])).sort()]);
  return JSON.stringify([r.id, r.status, r.user, r.recipient, txs(r.data.inTxs), txs(r.data.outTxs),
    amount(r.data.metadata.currencyIn), amount(r.data.metadata.currencyOut)]);
}

// Public v2 remains a compatibility source. v3 requires a caller-supplied API key.
// Never silently switch API version while resuming a saved scan.
export async function collectRelayHistory(transport: Transport, wallet: string, state: RelayHistory,
  save: () => Promise<void>, options: { apiKey?: string; baseUrl?: string } = {}) {
  const byId = new Map(state.requests.map(r => [r.id, r]));
  while (!state.complete) {
    const url = new URL(`/requests/${state.apiVersion}`, options.baseUrl ?? 'https://api.relay.link');
    url.searchParams.set(state.filter ?? 'user', wallet); url.searchParams.set('limit', '50');
    if (state.continuation) url.searchParams.set('continuation', state.continuation);
    if (state.apiVersion === 'v3' && !options.apiKey) throw new ProviderError('relay_api_key_required');
    const page = await transport.json(url.toString(), undefined, options.apiKey ? { 'x-api-key': options.apiKey } : {}) as {
      requests?: RelayRequest[]; continuation?: string | null; deprecation?: unknown;
    };
    if (!Array.isArray(page.requests) || (page.continuation != null && typeof page.continuation !== 'string')) throw new ProviderError('invalid_relay_page');
    const next = page.continuation || undefined;
    if (next && (next === state.continuation || state.seenContinuations.includes(next))) throw new ProviderError('relay_pagination_loop');
    const additions = new Map<string, RelayRequest>();
    for (const request of page.requests) {
      if (!request || typeof request.id !== 'string' || !request.id || !request.data) throw new ProviderError('invalid_relay_request');
      const previous = byId.get(request.id) ?? additions.get(request.id);
      if (previous) {
        try { if (requestFingerprint(previous) !== requestFingerprint(request)) throw new ProviderError('conflicting_relay_request'); }
        catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError('invalid_relay_request'); }
      }
      additions.set(request.id, previous ?? request);
    }
    for (const [id, request] of additions) byId.set(id, request);
    if (state.continuation) state.seenContinuations.push(state.continuation);
    state.requests = [...byId.values()]; state.continuation = next; state.complete = !next;
    // v3's user filter only covers senders/depositors. Destination wallet buys
    // require a separate recipient query. v2's user filter matched either role.
    if (!next && state.apiVersion === 'v3' && state.filter !== 'recipient') {
      state.filter = 'recipient'; state.seenContinuations = []; state.complete = false;
    }
    if (page.deprecation !== undefined) state.deprecation = page.deprecation;
    await save();
  }
}

export interface WalletFlow { token: string; txHash: string; deltaRaw: string }
type Match = { settlement: RelaySettlement; reason?: never } | { reason: string; settlement?: never };

function ownerDelta(tx: RelayTx, owner: string, token: string): bigint {
  if (!Array.isArray(tx.stateChanges)) throw new Error('missing_state_changes');
  let result = 0n;
  for (const s of tx.stateChanges) {
    if (s.change?.kind !== 'token' || typeof s.change.data?.tokenAddress !== 'string' || typeof s.address !== 'string') continue;
    if (sameAddress(s.address, owner, Number(tx.chainId)) && sameAddress(s.change.data.tokenAddress, token, Number(tx.chainId))) {
      if (!/^-?\d+$/.test(s.change.balanceDiff)) throw new Error('invalid_balance_change');
      result += BigInt(s.change.balanceDiff);
    }
  }
  return result;
}

export function matchRelayFlow(chainId: number, wallet: string, flow: WalletFlow, requests: RelayRequest[]): Match {
  try {
    const delta = BigInt(flow.deltaRaw), buy = delta > 0n;
    if (!delta) return { reason: 'zero_net_transfer' };
    const matches = requests.filter(r => (buy ? r.data?.outTxs : r.data?.inTxs)?.some(tx =>
      Number(tx.chainId) === chainId && relayTxHash(tx).toLowerCase() === flow.txHash.toLowerCase()));
    if (matches.length !== 1) return { reason: 'missing_or_ambiguous_relay_link' };
    const r = matches[0];
    if (r.status !== 'success') return { reason: 'relay_request_not_successful' };
    const target = buy ? r.data.metadata.currencyOut : r.data.metadata.currencyIn;
    const quote = buy ? r.data.metadata.currencyIn : r.data.metadata.currencyOut;
    const targetLeg = buy ? r.data.outTxs : r.data.inTxs;
    const quoteLeg = buy ? r.data.inTxs : r.data.outTxs;
    const owner = buy ? r.recipient : r.user, quoteOwner = buy ? r.user : r.recipient;
    if (typeof owner !== 'string' || !sameAddress(owner, wallet, chainId)) return { reason: 'relay_wallet_mismatch' };
    if (Number(target.currency.chainId) !== chainId || !sameAddress(target.currency.address, flow.token, chainId)
      || !/^\d+$/.test(target.amount) || BigInt(target.amount) !== (buy ? delta : -delta)) return { reason: 'relay_target_mismatch' };
    if (targetLeg.length !== 1 || quoteLeg.length !== 1 || targetLeg[0].status !== 'success' || quoteLeg[0].status !== 'success') return { reason: 'relay_unconfirmed_or_split_settlement' };
    if (ownerDelta(targetLeg[0], wallet, flow.token) !== delta) return { reason: 'relay_target_balance_mismatch' };
    const qc = Number(quote.currency.chainId), qt = quote.currency.address;
    const decimals = qc === SOLANA_RELAY_CHAIN_ID && qt === SOLANA_USDC ? 6
      : quoteAssets(qc)[qt.toLowerCase()]?.decimals ?? fundingTokenDecimals(qc, qt.toLowerCase());
    if (decimals === undefined || Number(quote.currency.decimals) !== decimals) return { reason: 'unsupported_relay_quote' };
    const quoteHash = relayTxHash(quoteLeg[0]);
    const validHash = qc === SOLANA_RELAY_CHAIN_ID ? /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(quoteHash) : /^0x[0-9a-fA-F]{64}$/.test(quoteHash);
    if (Number(quoteLeg[0].chainId) !== qc || !validHash || !/^\d+$/.test(quote.amount) || BigInt(quote.amount) <= 0n
      || typeof quoteOwner !== 'string' || ownerDelta(quoteLeg[0], quoteOwner, qt) !== (buy ? -BigInt(quote.amount) : BigInt(quote.amount))) return { reason: 'relay_settlement_amount_mismatch' };
    if (typeof quote.amountUsd !== 'string' || !/^\d+(?:\.\d{1,36})?$/.test(quote.amountUsd) || decimal(quote.amountUsd) <= 0n) return { reason: 'missing_relay_historical_price' };
    return { settlement: { requestId: r.id, symbol: target.currency.symbol?.slice(0, 80), amountUsd: quote.amountUsd,
      quote: { chainId: qc, token: qt, amountRaw: quote.amount, decimals, owner: quoteOwner, txHash: quoteHash }, source: 'relay_historical_amount_usd' } };
  } catch { return { reason: 'invalid_relay_evidence' }; }
}
