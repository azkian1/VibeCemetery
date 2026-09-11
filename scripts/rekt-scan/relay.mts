import { collectRelayHistory } from '../../src/lib/rekt/providers/relay.ts';
import type { RelayHistory } from '../../src/lib/rekt/providers/relay.ts';
import { ProviderError, Rpc, hex } from '../../src/lib/rekt/providers/rpc.ts';
import type { RpcBlock, RpcLog, RpcReceipt } from '../../src/lib/rekt/providers/rpc.ts';
import { analyzeRelay, decodeRelayReceipt } from '../../src/lib/rekt/scanner/relay.ts';
import type { RelayFlow } from '../../src/lib/rekt/scanner/relay.ts';

export interface RelayCheckpoint { history: RelayHistory; flows: Record<string, RelayFlow[]>; balances: Record<string, string>; balanceErrors: Record<string, string> }

export async function scanRelay(rpc: Rpc, chainId: number, wallet: string, fromBlock: string, snapshot: RpcBlock,
  logs: RpcLog[], state: RelayCheckpoint, days: number, save: () => Promise<void>) {
  await collectRelayHistory(rpc.transport, wallet, state.history, save, { apiKey: process.env.REKT_RELAY_API_KEY });
  const grouped = new Map<string, RpcLog[]>();
  for (const log of logs) { const hash = log.transactionHash.toLowerCase(); const list = grouped.get(hash) ?? []; list.push(log); grouped.set(hash, list); }
  const blocks = new Map<string, RpcBlock>();
  for (const [hash, expected] of grouped) {
    if (state.flows[hash]) continue;
    const receipt = await rpc.call<RpcReceipt>('eth_getTransactionReceipt', [hash]);
    if (receipt.transactionHash.toLowerCase() !== hash) throw new ProviderError('invalid_receipt');
    let block = blocks.get(receipt.blockNumber);
    if (!block) { block = await rpc.call<RpcBlock>('eth_getBlockByNumber', [receipt.blockNumber, false]); blocks.set(receipt.blockNumber, block); }
    state.flows[hash] = decodeRelayReceipt(chainId, wallet, receipt, block, expected, state.history.requests);
    await save();
  }
  const flows = Object.values(state.flows).flat();
  const reads = new Set<string>();
  for (const flow of flows) {
    reads.add(`${flow.token}:${BigInt(fromBlock) - 1n}`); reads.add(`${flow.token}:${BigInt(snapshot.number)}`);
    reads.add(`${flow.token}:${BigInt(flow.blockNumber) - 1n}`); reads.add(`${flow.token}:${flow.blockNumber}`);
  }
  for (const key of reads) {
    if (state.balances[key] !== undefined || state.balanceErrors[key] !== undefined) continue;
    const [token, block] = key.split(':');
    try {
      const value = await rpc.call<string>('eth_call', [{ to: token, data: `0x70a08231${wallet.slice(2).padStart(64, '0')}` }, hex(BigInt(block))]);
      if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new ProviderError('invalid_contract_response');
      state.balances[key] = BigInt(value).toString();
    } catch (error) {
      // Known archive/contract limitations are evidence gaps. Quota, transport and cancellation still pause the run.
      if (!(error instanceof ProviderError) || !['rpc_error_-32000', 'rpc_error_-32601', 'contract_reverted', 'invalid_contract_response'].includes(error.code)) throw error;
      state.balanceErrors[key] = error.code;
    }
    await save();
  }
  const evidence = { chainId, wallet, fromBlock, snapshot, historyComplete: true, relayHistoryComplete: state.history.complete,
    flows, balances: state.balances, balanceErrors: state.balanceErrors };
  return { ...analyzeRelay(evidence, days), evidence };
}
