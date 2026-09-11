import { decodeEventLog, encodeFunctionData, parseAbi, parseAbiItem } from 'viem';
import type { Abi, Hex } from 'viem';
import type { Trade } from '../scanner/types.ts';
import { BASE_QUOTES, HistoricalPrices } from './prices.ts';
import { ProviderError, Rpc, TRANSFER_TOPIC, hex } from './rpc.ts';
import type { RpcLog, RpcReceipt, RpcBlock, RpcTransaction } from './rpc.ts';

const FACTORY = '0x33128a8fc17869897dce68ed026d694621f6fdfd';
const SWAP_TOPIC = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const SWAP = parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)');
const ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function token0() view returns (address)', 'function token1() view returns (address)',
  'function fee() view returns (uint24)', 'function factory() view returns (address)',
  'function getPool(address,address,uint24) view returns (address)',
]);

export interface Transfer { token: string; from: string; to: string; amount: bigint; log: RpcLog }
export function transfer(log: RpcLog): Transfer | undefined {
  if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || log.topics.length !== 3 || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) return undefined;
  if (log.topics.slice(1).some(topic => !/^0x0{24}[0-9a-fA-F]{40}$/.test(topic))) return undefined;
  return { token: log.address.toLowerCase(), from: `0x${log.topics[1].slice(-40)}`.toLowerCase(), to: `0x${log.topics[2].slice(-40)}`.toLowerCase(), amount: BigInt(log.data), log };
}

export class UniswapV3Decoder {
  private blocks = new Map<string, RpcBlock>();
  private rpc: Rpc;
  private prices: HistoricalPrices;
  constructor(rpc: Rpc, prices: HistoricalPrices) { this.rpc = rpc; this.prices = prices; }

  private async read(contract: string, functionName: string, args: unknown[], block: string): Promise<string> {
    const data = encodeFunctionData({ abi: ABI as Abi, functionName, args });
    const value = await this.rpc.call<string>('eth_call', [{ to: contract, data }, block]);
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new ProviderError('invalid_contract_response');
    return value;
  }

  async balance(token: string, wallet: string, block: bigint): Promise<bigint> {
    return BigInt(await this.read(token, 'balanceOf', [wallet], hex(block)));
  }

  async decode(wallet: string, txHash: string, expectedLogs: RpcLog[], repeatedTokenBlock: Set<string>): Promise<Trade[]> {
    const receipt = await this.rpc.call<RpcReceipt>('eth_getTransactionReceipt', [txHash]);
    if (receipt.status !== '0x1' || receipt.transactionHash.toLowerCase() !== txHash) throw new ProviderError('invalid_receipt');
    let block = this.blocks.get(receipt.blockNumber);
    if (!block) {
      block = await this.rpc.call<RpcBlock>('eth_getBlockByNumber', [receipt.blockNumber, false]);
      this.blocks.set(receipt.blockNumber, block);
    }
    if (block.hash !== receipt.blockHash || expectedLogs.some(x => x.blockHash !== block.hash)) throw new ProviderError('reorg_detected');
    const allTransfers = receipt.logs.map(transfer).filter((t): t is Transfer => !!t);
    const walletTransfers = allTransfers.filter(t => t.from === wallet || t.to === wallet);
    // Compare the complete receipt's wallet ERC-20 events against the history index.
    const expected = expectedLogs.filter(x => !!transfer(x)).map(x => `${x.logIndex}:${x.address.toLowerCase()}:${x.data.toLowerCase()}`).sort();
    const actual = walletTransfers.map(x => `${x.log.logIndex}:${x.token}:${x.log.data.toLowerCase()}`).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new ProviderError('receipt_history_mismatch');
    const deltas = new Map<string, bigint>();
    for (const t of walletTransfers) deltas.set(t.token, (deltas.get(t.token) ?? 0n) + (t.to === wallet ? t.amount : 0n) - (t.from === wallet ? t.amount : 0n));
    const targets = [...deltas.keys()].filter(token => !BASE_QUOTES[token]);
    const output: Trade[] = [];
    const transaction = targets.length ? await this.rpc.call<RpcTransaction>('eth_getTransactionByHash', [txHash]) : undefined;
    for (const token of targets) {
      const targetTransfers = walletTransfers.filter(t => t.token === token);
      const trade: Trade = {
        kind: 'unsupported', reason: 'unsupported_swap', token, txHash,
        blockNumber: BigInt(receipt.blockNumber).toString(), blockHash: receipt.blockHash,
        timestamp: Number(BigInt(block.timestamp)), transactionIndex: Number(BigInt(receipt.transactionIndex)),
        eventIds: targetTransfers.map(t => `${txHash}:${BigInt(t.log.logIndex)}`), deltaRaw: deltas.get(token)!.toString(),
        balanceBeforeRaw: '0', balanceAfterRaw: '0',
      };
      // Unsupported/nonstandard tokens still receive an exclusion, never a fabricated candidate.
      try {
        const bn = BigInt(receipt.blockNumber);
        trade.balanceBeforeRaw = (await this.balance(token, wallet, bn - 1n)).toString();
        trade.balanceAfterRaw = (await this.balance(token, wallet, bn)).toString();
      } catch (error) {
        if (error instanceof ProviderError && ['contract_reverted', 'invalid_contract_response'].includes(error.code)) {
          trade.reason = 'unreadable_token_balance'; output.push(trade); continue;
        }
        throw error;
      }
      const reject = (reason: string) => { trade.reason = reason; output.push(trade); };
      if (repeatedTokenBlock.has(`${token}:${receipt.blockNumber}`)) { reject('multiple_token_transactions_in_block'); continue; }
      if (!transaction || transaction.hash.toLowerCase() !== txHash || transaction.blockHash !== receipt.blockHash) throw new ProviderError('transaction_receipt_mismatch');
      if (transaction.from.toLowerCase() !== wallet) { reject('external_or_smart_account_transaction'); continue; }
      if (BigInt(transaction.value) !== 0n) { reject('native_eth_requires_trace_adapter'); continue; }
      const nonzero = [...deltas].filter(([, amount]) => amount !== 0n);
      const quotes = nonzero.filter(([address]) => !!BASE_QUOTES[address]);
      if (targets.length !== 1 || nonzero.length !== 2 || quotes.length !== 1) { reject('ambiguous_asset_flows'); continue; }
      const [quote, quoteDelta] = quotes[0];
      const targetDelta = deltas.get(token)!;
      if (targetDelta === 0n || quoteDelta === 0n || (targetDelta > 0n) === (quoteDelta > 0n)) { reject('invalid_swap_direction'); continue; }
      const swaps = receipt.logs.filter(l => l.topics[0]?.toLowerCase() === SWAP_TOPIC);
      if (swaps.length !== 1) { reject('unsupported_route'); continue; }
      const pool = swaps[0].address.toLowerCase();
      let token0: string; let token1: string; let amount0: bigint; let amount1: bigint;
      try {
        const poolFactory = `0x${(await this.read(pool, 'factory', [], receipt.blockNumber)).slice(-40)}`.toLowerCase();
        if (poolFactory !== FACTORY) { reject('unsupported_dex'); continue; }
        token0 = `0x${(await this.read(pool, 'token0', [], receipt.blockNumber)).slice(-40)}`.toLowerCase();
        token1 = `0x${(await this.read(pool, 'token1', [], receipt.blockNumber)).slice(-40)}`.toLowerCase();
        const fee = Number(BigInt(await this.read(pool, 'fee', [], receipt.blockNumber)));
        const registered = `0x${(await this.read(FACTORY, 'getPool', [token0, token1, fee], receipt.blockNumber)).slice(-40)}`.toLowerCase();
        if (registered !== pool || ![token0, token1].includes(token) || ![token0, token1].includes(quote)) { reject('unverified_pool'); continue; }
        const decoded = decodeEventLog({ abi: [SWAP], data: swaps[0].data as Hex, topics: swaps[0].topics as [Hex, ...Hex[]] });
        ({ amount0, amount1 } = decoded.args);
      } catch (error) {
        if (error instanceof ProviderError && ['contract_reverted', 'invalid_contract_response'].includes(error.code)) { reject('unsupported_pool_contract'); continue; }
        if (error instanceof ProviderError) throw error;
        reject('invalid_swap_event'); continue;
      }
      const poolTargetDelta = token === token0 ? amount0 : amount1;
      const poolQuoteDelta = quote === token0 ? amount0 : amount1;
      // A single wallet-target transfer must go directly to/from the verified pool.
      // Matching both swap deltas prevents donations, tax and mixed operations being priced as a swap.
      const relevantTarget = targetTransfers.filter(t => t.amount !== 0n);
      const quoteTransfers = walletTransfers.filter(t => t.token === quote && t.amount !== 0n);
      const relevant = allTransfers.filter(t => t.token === token && t.amount !== 0n);
      if (relevantTarget.length !== 1 || relevant.length !== 1 || quoteTransfers.length !== 1
        || (targetDelta > 0n ? relevantTarget[0].from !== pool : relevantTarget[0].to !== pool)
        || poolTargetDelta !== -targetDelta || poolQuoteDelta !== -quoteDelta) { reject('nonstandard_or_mixed_flows'); continue; }
      const price = await this.prices.get(quote, trade.timestamp);
      if (!price) { reject('missing_historical_price'); continue; }
      const reserve = await this.balance(quote, pool, BigInt(receipt.blockNumber));
      trade.kind = targetDelta > 0n ? 'buy' : 'sell';
      delete trade.reason;
      trade.pool = pool;
      // Include the actual quote event so downstream overlap checks cover both legs.
      trade.eventIds.push(...quoteTransfers.map(t => `${txHash}:${BigInt(t.log.logIndex)}`));
      trade.quote = { token: quote, amountRaw: (quoteDelta < 0n ? -quoteDelta : quoteDelta).toString(), decimals: BASE_QUOTES[quote].decimals, price, poolReserveRaw: reserve.toString() };
      output.push(trade);
    }
    return output;
  }
}
