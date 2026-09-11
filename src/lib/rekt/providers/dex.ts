import { BaseError, decodeAbiParameters, decodeEventLog, encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, parseAbiItem, parseAbiParameters, toEventSelector } from 'viem';
import type { Hex } from 'viem';
import { DEX_DEPLOYMENTS } from './deployments.ts';
import { canonicalLogs, hex, ProviderError } from './rpc.ts';
import type { Rpc, RpcLog, RpcReceipt } from './rpc.ts';

export type DexProtocol = 'uniswap-v2' | 'uniswap-v3' | 'uniswap-v4';
export type PoolHistoryMode = 'full' | 'defer';
export const V2_SWAP = parseAbiItem('event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)');
export const V3_SWAP = parseAbiItem('event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)');
export const V4_SWAP = parseAbiItem('event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)');
export const V4_INITIALIZE = parseAbiItem('event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)');
const calls = parseAbi(['function token0() view returns(address)', 'function token1() view returns(address)',
  'function factory() view returns(address)', 'function fee() view returns(uint24)',
  'function getPool(address,address,uint24) view returns(address)', 'function getPair(address,address) view returns(address)']);
export interface PoolInfo { token0: string; token1: string; hooks?: string; fee?: number; tickSpacing?: number }
export interface DexCache { pools: Record<string, PoolInfo>; v4Search: Record<string, { next: string; chunk: string }> }
export interface SwapEdge extends PoolInfo {
  protocol: DexProtocol; pool: string; poolId?: string; eventId: string;
  // Positive means the trader receives the asset. V2/V3 pool signs are inverted.
  delta0: string; delta1: string;
}
export interface RouteObservation { swaps: SwapEdge[]; issues: string[] }
const pendingPools = new WeakMap<DexCache, Map<string, Promise<PoolInfo>>>();

export function poolId(info: PoolInfo): string {
  return keccak256(encodeAbiParameters(parseAbiParameters('address,address,uint24,int24,address'),
    [info.token0 as Hex, info.token1 as Hex, info.fee!, info.tickSpacing!, info.hooks as Hex]));
}

export class DexDecoder {
  private rpc: Rpc; private chainId: number; private cache: DexCache; private save: () => Promise<void>;
  private poolHistory: PoolHistoryMode;
  constructor(rpc: Rpc, chainId: number, cache: DexCache, save: () => Promise<void>, poolHistory: PoolHistoryMode = 'full') {
    this.rpc = rpc; this.chainId = chainId; this.cache = cache; this.save = save; this.poolHistory = poolHistory;
  }
  private async once(key: string, load: () => Promise<PoolInfo>): Promise<PoolInfo> {
    let pending = pendingPools.get(this.cache);
    if (!pending) { pending = new Map(); pendingPools.set(this.cache, pending); }
    const prior = pending.get(key); if (prior) return prior;
    const work = load(); pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  private async read(address: string, name: string, args: unknown[], block: string): Promise<string> {
    const data = encodeFunctionData({ abi: calls, functionName: name as 'token0', args: args as [] });
    let result: string;
    try { result = await this.rpc.call<string>('eth_call', [{ to: address, data }, block]); }
    catch (error) {
      if (!(error instanceof ProviderError) || !['rpc_error_-32000', 'rpc_error_-32601'].includes(error.code)) throw error;
      // These methods expose immutable pool identity/membership only. Never use
      // this fallback for balances, prices, reserves or historical liquidity.
      result = await this.rpc.call<string>('eth_call', [{ to: address, data }, 'latest']);
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(result)) throw new ProviderError('invalid_contract_response');
    return result.toLowerCase();
  }
  private async pool(protocol: 'uniswap-v2' | 'uniswap-v3', address: string, block: string): Promise<PoolInfo> {
    const cacheKey = `${this.chainId}:${protocol}:${address}`;
    if (this.cache.pools[cacheKey]) return this.cache.pools[cacheKey];
    const d = DEX_DEPLOYMENTS[this.chainId];
    const expectedFactory = protocol === 'uniswap-v2' ? d.v2Factory : d.v3Factory;
    const actualFactory = `0x${(await this.read(address, 'factory', [], block)).slice(-40)}`;
    if (actualFactory !== expectedFactory) throw new ProviderError('unsupported_dex_factory');
    const token0 = `0x${(await this.read(address, 'token0', [], block)).slice(-40)}`;
    const token1 = `0x${(await this.read(address, 'token1', [], block)).slice(-40)}`;
    if (BigInt(token0) >= BigInt(token1)) throw new ProviderError('invalid_pool_tokens');
    const fee = protocol === 'uniswap-v3' ? Number(BigInt(await this.read(address, 'fee', [], block))) : undefined;
    const registered = await this.read(expectedFactory, protocol === 'uniswap-v3' ? 'getPool' : 'getPair',
      fee === undefined ? [token0, token1] : [token0, token1, fee], block);
    if (`0x${registered.slice(-40)}` !== address) throw new ProviderError('unverified_pool');
    const info = { token0, token1, fee };
    this.cache.pools[cacheKey] = info; await this.save(); return info;
  }
  private async v4Pool(id: string, receipt: RpcReceipt): Promise<PoolInfo> {
    const manager = DEX_DEPLOYMENTS[this.chainId].v4Manager;
    const cacheKey = `${this.chainId}:uniswap-v4:${id}`;
    if (this.cache.pools[cacheKey]) return this.cache.pools[cacheKey];
    // PosM stores immutable PoolKeys by a truncated ID. Recompute the FULL ID,
    // so a truncation collision, wrong contract or mismatched currencies cannot pass.
    // Latest is sufficient for this immutable identity, never for historical balances/prices.
    try {
      const data = encodeFunctionData({ abi: parseAbi(['function poolKeys(bytes25) view returns(address,address,uint24,int24,address)']),
        functionName: 'poolKeys', args: [id.slice(0, 52) as Hex] });
      const raw = await this.rpc.call<string>('eth_call', [{ to: DEX_DEPLOYMENTS[this.chainId].v4PositionManager, data }, 'latest']);
      if (/^0x[0-9a-fA-F]{320}$/.test(raw)) {
        const [token0, token1, fee, tickSpacing, hooks] = decodeAbiParameters(parseAbiParameters('address,address,uint24,int24,address'), raw as Hex);
        const info = { token0: token0.toLowerCase(), token1: token1.toLowerCase(), fee, tickSpacing, hooks: hooks.toLowerCase() };
        if (tickSpacing > 0 && BigInt(token0) < BigInt(token1) && poolId(info) === id) { this.cache.pools[cacheKey] = info; await this.save(); return info; }
      }
    } catch (error) {
      if (error instanceof ProviderError && !['contract_reverted', 'rpc_error_-32000', 'rpc_error_-32601', 'rpc_missing_result'].includes(error.code)) throw error;
      if (!(error instanceof ProviderError) && !(error instanceof BaseError)) throw error;
    }
    let found = receipt.logs.filter(l => l.address.toLowerCase() === manager && l.topics[0] === toEventSelector(V4_INITIALIZE) && l.topics[1]?.toLowerCase() === id);
    // A preliminary list must not silently turn a missing PoolKey into verified
    // route evidence. Keep the gap explicit and let a later full job resolve it.
    if (!found.length && this.poolHistory === 'defer') throw new ProviderError('v4_pool_metadata_deferred');
    // Search backwards with durable progress; provider range limits and budgets are respected.
    const search = this.cache.v4Search[cacheKey] ??= { next: BigInt(receipt.blockNumber).toString(), chunk: '100000000' };
    while (!found.length && BigInt(search.next) >= 0n) {
      const to = BigInt(search.next), chunk = BigInt(search.chunk), from = to >= chunk ? to - chunk + 1n : 0n;
      try {
        found = await this.rpc.call<RpcLog[]>('eth_getLogs', [{ address: manager, fromBlock: hex(from), toBlock: hex(to), topics: [toEventSelector(V4_INITIALIZE), id] }]);
        if (!Array.isArray(found) || found.some(l => l.address.toLowerCase() !== manager || l.topics[0] !== toEventSelector(V4_INITIALIZE)
          || l.topics[1]?.toLowerCase() !== id || BigInt(l.blockNumber) < from || BigInt(l.blockNumber) > to)) throw new ProviderError('pool_history_filter_mismatch');
        if (!found.length) { search.next = (from - 1n).toString(); await this.save(); }
      } catch (error) {
        if (error instanceof ProviderError && ['rpc_range_limit', 'http_413'].includes(error.code) && chunk > 1n) {
          search.chunk = (chunk / 2n).toString(); await this.save(); continue;
        }
        throw error;
      }
    }
    found = canonicalLogs(found);
    if (found.length !== 1) throw new ProviderError('v4_pool_initialization_missing_or_ambiguous');
    const log = found[0];
    const block = await this.rpc.call<{ hash: string }>('eth_getBlockByNumber', [log.blockNumber, false]);
    if (block.hash !== log.blockHash || BigInt(log.blockNumber) > BigInt(receipt.blockNumber)) throw new ProviderError('reorg_detected');
    const args = decodeEventLog({ abi: [V4_INITIALIZE], data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] }).args;
    const info = { token0: args.currency0.toLowerCase(), token1: args.currency1.toLowerCase(), hooks: args.hooks.toLowerCase(), fee: args.fee, tickSpacing: args.tickSpacing };
    if (BigInt(info.token0) >= BigInt(info.token1) || info.tickSpacing <= 0 || poolId(info) !== id) throw new ProviderError('v4_pool_key_mismatch');
    this.cache.pools[cacheKey] = info; await this.save(); return info;
  }
  async observe(receipt: RpcReceipt, only?: DexProtocol): Promise<RouteObservation> {
    const swaps: SwapEdge[] = [], issues: string[] = [];
    if (!DEX_DEPLOYMENTS[this.chainId]) return { swaps, issues: ['unsupported_dex_chain'] };
    for (const log of canonicalLogs(receipt.logs)) {
      const protocol = log.topics[0] === toEventSelector(V2_SWAP) ? 'uniswap-v2' : log.topics[0] === toEventSelector(V3_SWAP) ? 'uniswap-v3' : log.topics[0] === toEventSelector(V4_SWAP) ? 'uniswap-v4' : undefined;
      if (!protocol) continue;
      if (only && protocol !== only) { issues.push('route_outside_selected_protocol'); continue; }
      try {
        const pool = log.address.toLowerCase();
        let info: PoolInfo, delta0: bigint, delta1: bigint, id: string | undefined;
        if (protocol === 'uniswap-v4') {
          if (pool !== DEX_DEPLOYMENTS[this.chainId].v4Manager) throw new ProviderError('unverified_v4_manager');
          const a = decodeEventLog({ abi: [V4_SWAP], data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] }).args;
          id = a.id.toLowerCase(); info = await this.once(`${this.chainId}:v4:${id}:${this.poolHistory}`, () => this.v4Pool(id!, receipt)); delta0 = a.amount0; delta1 = a.amount1;
        } else {
          info = await this.once(`${this.chainId}:${protocol}:${pool}`, () => this.pool(protocol, pool, receipt.blockNumber));
          if (protocol === 'uniswap-v2') {
            const a = decodeEventLog({ abi: [V2_SWAP], data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] }).args;
            if ((a.amount0In && a.amount0Out) || (a.amount1In && a.amount1Out)) throw new ProviderError('flash_or_mixed_swap');
            delta0 = a.amount0Out - a.amount0In; delta1 = a.amount1Out - a.amount1In;
          } else {
            const a = decodeEventLog({ abi: [V3_SWAP], data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] }).args;
            delta0 = -a.amount0; delta1 = -a.amount1;
          }
        }
        if (!delta0 || !delta1 || (delta0 > 0n) === (delta1 > 0n)) throw new ProviderError('invalid_swap_direction');
        swaps.push({ ...info, protocol, pool, poolId: id, delta0: delta0.toString(), delta1: delta1.toString(), eventId: `${receipt.transactionHash.toLowerCase()}:${BigInt(log.logIndex)}` });
      } catch (error) {
        // Only known evidence gaps are local exclusions. Transient transport errors pause the job.
        if (error instanceof ProviderError) {
          if (!['unsupported_dex_factory', 'unverified_pool', 'invalid_pool_tokens', 'unverified_v4_manager', 'v4_pool_key_mismatch',
            'v4_pool_initialization_missing_or_ambiguous', 'v4_pool_metadata_deferred', 'invalid_swap_direction', 'flash_or_mixed_swap', 'contract_reverted',
            'invalid_contract_response', 'rpc_error_-32000', 'rpc_error_-32601'].includes(error.code)) throw error;
          issues.push(error.code);
        } else if (error instanceof BaseError) issues.push('invalid_swap_event');
        else throw error;
      }
    }
    return { swaps, issues: [...new Set(issues)] };
  }
}

// Compare the whole route's net settlement, never sum intermediate pool volumes.
export function matchesWalletRoute(route: RouteObservation, walletDeltas: Map<string, bigint>): boolean {
  if (route.issues.length || !route.swaps.length) return false;
  const net = new Map<string, bigint>();
  const adjacent = new Map<string, Set<string>>();
  for (const s of route.swaps) {
    net.set(s.token0, (net.get(s.token0) ?? 0n) + BigInt(s.delta0));
    net.set(s.token1, (net.get(s.token1) ?? 0n) + BigInt(s.delta1));
    for (const [a, b] of [[s.token0, s.token1], [s.token1, s.token0]]) { const set = adjacent.get(a) ?? new Set(); set.add(b); adjacent.set(a, set); }
  }
  const visited = new Set<string>(), queue = [[...walletDeltas.keys()][0]];
  while (queue.length) { const a = queue.pop()!; if (visited.has(a)) continue; visited.add(a); queue.push(...adjacent.get(a) ?? []); }
  if ([...adjacent.keys()].some(k => !visited.has(k))) return false;
  return [...new Set([...net.keys(), ...walletDeltas.keys()])].every(k => (net.get(k) ?? 0n) === (walletDeltas.get(k) ?? 0n));
}
