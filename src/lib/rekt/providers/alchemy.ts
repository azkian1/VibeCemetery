import { canonicalLogs, hex, ProviderError } from './rpc.ts';
import type { Rpc, RpcLog, RpcReceipt } from './rpc.ts';
import { transfer } from './uniswap-v3.ts';
import { mapBounded } from './parallel.ts';

interface IndexedTransfer { id: string; hash: string; block: string; from: string; to: string; token: string; amount: string }
export interface IndexedHistory {
  version: 1; fromBlock: string; toBlock: string; direction: 'from' | 'to'; complete: boolean;
  transfers: Record<string, IndexedTransfer>; pageKey?: string; pageAt?: number; seen: string[];
  hydrated: Record<string, boolean>;
}
export function newIndexedHistory(from: bigint, to: bigint): IndexedHistory {
  return { version: 1, fromBlock: from.toString(), toBlock: to.toString(), direction: 'from', complete: false,
    transfers: {}, seen: [], hydrated: {} };
}
const address = /^0x[0-9a-fA-F]{40}$/;
const hash = /^0x[0-9a-fA-F]{64}$/;
const quantity = /^0x[0-9a-fA-F]+$/;
function normalize(value: unknown, wallet: string, state: IndexedHistory): IndexedTransfer {
  const t = value as { uniqueId?: string; hash?: string; blockNum?: string; from?: string; to?: string; category?: string;
    rawContract?: { address?: string; value?: string } };
  if (!t || typeof t.uniqueId !== 'string' || !t.uniqueId || t.uniqueId.length > 256 || !hash.test(t.hash ?? '')
    || !quantity.test(t.blockNum ?? '') || !address.test(t.from ?? '') || !address.test(t.to ?? '')
    || t.category !== 'erc20' || !address.test(t.rawContract?.address ?? '') || !quantity.test(t.rawContract?.value ?? '')) throw new ProviderError('invalid_indexed_transfer');
  const block = BigInt(t.blockNum!), amount = BigInt(t.rawContract!.value!);
  if (block < BigInt(state.fromBlock) || block > BigInt(state.toBlock) || amount >= 1n << 256n
    || t[state.direction]!.toLowerCase() !== wallet) throw new ProviderError('indexed_history_filter_mismatch');
  return { id: t.uniqueId, hash: t.hash!.toLowerCase(), block: block.toString(), from: t.from!.toLowerCase(), to: t.to!.toLowerCase(),
    token: t.rawContract!.address!.toLowerCase(), amount: amount.toString() };
}

export async function collectIndexedHistory(rpc: Rpc, wallet: string, state: IndexedHistory, save: () => Promise<void>) {
  // Alchemy cursors expire after ten minutes. Restart the current direction and
  // deduplicate exact identities; already completed pages are not called complete.
  if (state.pageKey && (!state.pageAt || Date.now() - state.pageAt >= 9 * 60 * 1000)) {
    state.pageKey = undefined; state.seen = []; await save();
  }
  while (!state.complete) {
    const page = await rpc.call<{ transfers?: unknown[]; pageKey?: string | null }>('alchemy_getAssetTransfers', [{
      fromBlock: hex(BigInt(state.fromBlock)), toBlock: hex(BigInt(state.toBlock)),
      [`${state.direction}Address`]: wallet, category: ['erc20'], excludeZeroValue: false,
      withMetadata: false, maxCount: '0x3e8', order: 'asc', ...(state.pageKey ? { pageKey: state.pageKey } : {}),
    }]);
    if (!page || !Array.isArray(page.transfers) || (page.pageKey != null && typeof page.pageKey !== 'string')) throw new ProviderError('invalid_indexed_page');
    const next = page.pageKey || undefined;
    if (next && (next === state.pageKey || state.seen.includes(next))) throw new ProviderError('indexed_pagination_loop');
    const additions: Record<string, IndexedTransfer> = {};
    for (const raw of page.transfers) {
      const row = normalize(raw, wallet, state), old = additions[row.id] ?? state.transfers[row.id];
      if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new ProviderError('conflicting_indexed_transfer');
      additions[row.id] = row;
    }
    Object.assign(state.transfers, additions);
    if (state.pageKey) state.seen.push(state.pageKey);
    state.pageKey = next; state.pageAt = Date.now();
    if (!next) {
      if (state.direction === 'from') { state.direction = 'to'; state.seen = []; }
      else state.complete = true;
    }
    await save();
  }
}

// The indexer locates transactions; exact wallet movements come from RPC receipts.
// Do not manufacture logIndex or blockHash from a transfer-provider summary.
export async function hydrateIndexedHistory(rpc: Rpc, wallet: string, state: IndexedHistory,
  receipts: Record<string, RpcReceipt>, history: { logs: RpcLog[] }, concurrency: number, save: () => Promise<void>) {
  if (!state.complete) throw new ProviderError('indexed_history_incomplete');
  const groups = new Map<string, IndexedTransfer[]>();
  for (const row of Object.values(state.transfers)) { const rows = groups.get(row.hash) ?? []; rows.push(row); groups.set(row.hash, rows); }
  await mapBounded([...groups], concurrency, async ([txHash, rows]) => {
    if (state.hydrated[txHash]) return;
    const receipt = receipts[txHash] ?? await rpc.call<RpcReceipt>('eth_getTransactionReceipt', [txHash]);
    if (!receipt || receipt.transactionHash.toLowerCase() !== txHash || receipt.status !== '0x1'
      || !hash.test(receipt.blockHash) || rows.some(r => BigInt(receipt.blockNumber) !== BigInt(r.block))) throw new ProviderError('indexed_receipt_mismatch');
    const logs = canonicalLogs(receipt.logs).filter(l => {
      const t = transfer(l); return t && (t.from === wallet || t.to === wallet);
    });
    if (logs.some(l => l.transactionHash.toLowerCase() !== txHash || l.blockHash !== receipt.blockHash
      || BigInt(l.blockNumber) !== BigInt(receipt.blockNumber) || BigInt(l.transactionIndex) !== BigInt(receipt.transactionIndex))) throw new ProviderError('indexed_receipt_mismatch');
    const unmatched = [...logs];
    for (const row of rows) {
      const index = unmatched.findIndex(l => { const t = transfer(l)!; return t.token === row.token && t.from === row.from && t.to === row.to && t.amount === BigInt(row.amount); });
      if (index < 0) throw new ProviderError('indexed_receipt_mismatch');
      unmatched.splice(index, 1);
    }
    // Missing events in a returned transaction indicate incomplete indexing too.
    if (unmatched.length) throw new ProviderError('indexed_receipt_missing_transfers');
    receipts[txHash] = receipt;
    history.logs = canonicalLogs([...history.logs, ...logs]); state.hydrated[txHash] = true;
    await save();
  });
}
