import { transfer } from './uniswap-v3.ts';
import { canonicalLogs, ProviderError } from './rpc.ts';
import type { RpcBlock, RpcLog, RpcReceipt, RpcTransaction } from './rpc.ts';
import type { FundingChain } from './funding-chains.ts';
import type { FundingObservation } from '../scanner/funding.ts';
import type { RelayRequest } from './relay.ts';
import { sameAddress } from './chains.ts';

export type FundingTransaction = RpcTransaction & { input: string };
const fingerprint = (l: RpcLog) => JSON.stringify([l.address.toLowerCase(), l.topics.map(t => t.toLowerCase()), l.data.toLowerCase(),
  l.blockHash.toLowerCase(), BigInt(l.blockNumber).toString(), l.transactionHash.toLowerCase(), BigInt(l.transactionIndex).toString(), BigInt(l.logIndex).toString()]);

// This adapter recognizes a direct cash transfer, not arbitrary transaction.from.
// Routed deposits remain observations until an independent route adapter proves
// the original payer and the actual trading-balance credit.
export function decodeFundingReceipt(chain: FundingChain, wallet: string, expected: RpcLog[],
  receipt: RpcReceipt, tx: FundingTransaction, block: RpcBlock): FundingObservation[] {
  if (!expected.length || BigInt(receipt.status) !== 1n || receipt.transactionHash.toLowerCase() !== expected[0].transactionHash.toLowerCase()
    || tx.hash.toLowerCase() !== receipt.transactionHash.toLowerCase() || tx.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()
    || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase() || BigInt(block.number) !== BigInt(receipt.blockNumber)
    || tx.from.toLowerCase() !== receipt.from.toLowerCase() || tx.to?.toLowerCase() !== receipt.to?.toLowerCase()) throw new ProviderError('funding_receipt_mismatch');
  const logs = canonicalLogs(receipt.logs);
  for (const log of logs) {
    if (log.removed || log.blockHash.toLowerCase() !== block.hash.toLowerCase() || BigInt(log.blockNumber) !== BigInt(block.number)
      || log.transactionHash.toLowerCase() !== tx.hash.toLowerCase() || BigInt(log.transactionIndex) !== BigInt(receipt.transactionIndex)) throw new ProviderError('funding_receipt_log_mismatch');
  }
  const ownerTopic = `0x${wallet.slice(2).padStart(64, '0')}`;
  const relevant = logs.filter(l => l.topics[0]?.toLowerCase() === expected[0].topics[0]?.toLowerCase()
    && [l.topics[1]?.toLowerCase(), l.topics[2]?.toLowerCase()].includes(ownerTopic));
  if (JSON.stringify(canonicalLogs(relevant).map(fingerprint)) !== JSON.stringify(canonicalLogs(expected).map(fingerprint))) throw new ProviderError('funding_history_receipt_mismatch');
  for (const log of relevant) {
    if ((log.topics.length === 3 || chain.cashTokens[log.address.toLowerCase()]) && !transfer(log)) throw new ProviderError('invalid_funding_transfer_event');
  }
  const movements = logs.flatMap(l => { const t = transfer(l); return t ? [t] : []; });
  const walletMovements = movements.filter(t => t.from === wallet || t.to === wallet);
  const tokens = [...new Set(walletMovements.map(t => t.token))];
  const result: FundingObservation[] = [];
  for (const token of tokens) {
    const tokenMoves = walletMovements.filter(t => t.token === token);
    const delta = tokenMoves.reduce((sum, t) => sum + (t.to === wallet ? t.amount : 0n) - (t.from === wallet ? t.amount : 0n), 0n);
    if (delta <= 0n) continue;
    const incoming = tokenMoves.find(t => t.to === wallet && t.from !== wallet && t.amount > 0n)!;
    const knownCash = Boolean(chain.cashTokens[token]);
    const expectedInput = `0xa9059cbb${wallet.slice(2).padStart(64, '0')}${delta.toString(16).padStart(64, '0')}`;
    const direct = knownCash && movements.length === 1 && incoming.amount === delta
      && !/^0x0{40}$/.test(incoming.from) && incoming.from === tx.from.toLowerCase()
      && tx.to?.toLowerCase() === token && tx.input.toLowerCase() === expectedInput && BigInt(tx.value) === 0n;
    result.push({ chainId: chain.id, wallet, token, amountRaw: delta.toString(), txHash: tx.hash.toLowerCase(),
      logIndex: BigInt(incoming.log.logIndex).toString(), transactionIndex: BigInt(receipt.transactionIndex).toString(),
      blockNumber: BigInt(block.number).toString(), blockHash: block.hash.toLowerCase(), creditedAt: Number(BigInt(block.timestamp)),
      kind: direct ? 'direct' : 'unresolved',
      ...(direct ? { sourceAddress: incoming.from } : { reason: knownCash ? 'routed_or_nonstandard_cash_credit' : 'unsupported_asset_credit' }),
    });
  }
  return result;
}

export function externalRelayAccounts(wallet: string, requests: RelayRequest[]) {
  const result: { chainId: number; address: string; requestId: string }[] = [];
  const seen = new Set<string>();
  for (const r of requests) {
    if (r.status !== 'success') continue;
    const input = Number(r.data?.metadata?.currencyIn?.currency?.chainId), output = Number(r.data?.metadata?.currencyOut?.currency?.chainId);
    if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || typeof r.user !== 'string' || typeof r.recipient !== 'string') throw new ProviderError('invalid_relay_funding_record');
    const pairs = sameAddress(r.user, wallet, input) ? [{ chainId: output, address: r.recipient }]
      : sameAddress(r.recipient, wallet, output) ? [{ chainId: input, address: r.user }] : [];
    for (const pair of pairs) {
      if (sameAddress(pair.address, wallet, pair.chainId)) continue;
      const key = `${pair.chainId}:${pair.address}`;
      if (!seen.has(key)) { result.push({ ...pair, requestId: r.id }); seen.add(key); }
    }
  }
  return result;
}
