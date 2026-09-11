import { setTimeout as sleep } from 'node:timers/promises';

export class ProviderError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, retryable = false) { super(code); this.code = code; this.retryable = retryable; }
}

export interface RpcLog {
  address: string; topics: string[]; data: string; blockNumber: string;
  blockHash: string; transactionHash: string; transactionIndex: string; logIndex: string; removed?: boolean;
}
export interface RpcBlock { number: string; hash: string; timestamp: string }
export interface RpcReceipt {
  status: string; blockNumber: string; blockHash: string; transactionHash: string;
  transactionIndex: string; from: string; to: string | null; logs: RpcLog[];
}
export interface RpcTransaction { from: string; to: string | null; value: string; hash: string; blockHash: string }

export class Transport {
  requests = 0;
  private gates = new Map<string, Promise<void>>();
  options: {
    maxRequests?: number; timeoutMs?: number; retries?: number; intervalMs?: number;
    signal?: AbortSignal; fetch?: typeof fetch; wait?: (ms: number) => Promise<void>;
  };
  constructor(options: Transport['options'] = {}) { this.options = options; }

  async json(url: string, body?: unknown, headers: Record<string, string> = {}): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      this.options.signal?.throwIfAborted();
      if (this.requests >= (this.options.maxRequests ?? 2000)) throw new ProviderError('request_budget_exhausted');
      const origin = new URL(url).origin;
      const gate = (this.gates.get(origin) ?? Promise.resolve()).then(() => this.wait(this.options.intervalMs ?? 250));
      this.gates.set(origin, gate.catch(() => {}));
      await gate;
      this.options.signal?.throwIfAborted();
      if (this.requests >= (this.options.maxRequests ?? 2000)) throw new ProviderError('request_budget_exhausted');
      this.requests++;
      try {
        const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 15000);
        const signal = this.options.signal ? AbortSignal.any([timeout, this.options.signal]) : timeout;
        const response = await (this.options.fetch ?? fetch)(url, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body === undefined ? undefined : JSON.stringify(body), signal,
        });
        if (!response.ok) {
          // Some RPC gateways (including dRPC's public tier) encode an
          // oversized eth_getLogs range as HTTP 400 instead of JSON-RPC 200.
          // Only this specific error may shrink a range; auth/configuration
          // errors must never trigger thousands of pointless small queries.
          if ([400, 403].includes(response.status) && (body as { method?: string } | undefined)?.method === 'eth_getLogs') {
            const errorBody = await response.text();
            try {
              const message = JSON.parse(errorBody)?.error?.message;
              if (typeof message === 'string' && /range.{0,80}(?:block|large)|(?:maximum|at most|limit).{0,40}blocks/i.test(message)) {
                throw new ProviderError('rpc_range_limit');
              }
              if (typeof message === 'string' && /archive requests require/i.test(message)) throw new ProviderError('rpc_archive_access_required');
              if (typeof message === 'string' && /route your request to suitable provider/i.test(message)) throw new ProviderError('rpc_history_provider_unavailable');
            } catch (error) { if (error instanceof ProviderError) throw error; }
            throw new ProviderError(`http_${response.status}`);
          }
          const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          if (retryable && attempt < (this.options.retries ?? 3)) {
            const seconds = Number(response.headers.get('retry-after'));
            await response.body?.cancel();
            await this.wait(Math.min(10000, Math.max(500 * 2 ** attempt, Number.isFinite(seconds) ? seconds * 1000 : 0)));
            continue;
          }
          throw new ProviderError(`http_${response.status}`, retryable);
        }
        // Preserve JSON number lexemes as strings. Provider USD values never pass
        // through a floating-point number before decimal arithmetic.
        const source = await response.text();
        return JSON.parse(source.replace(/"(?:[^"\\]|\\.)*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
          (match, number: string | undefined) => number === undefined ? match : JSON.stringify(number)));
      } catch (error) {
        this.options.signal?.throwIfAborted();
        if (error instanceof ProviderError && !error.retryable) throw error;
        if (attempt >= (this.options.retries ?? 3)) throw error instanceof ProviderError ? error : new ProviderError('network_or_invalid_response', true);
        await this.wait(Math.min(10000, 500 * 2 ** attempt));
      }
    }
  }

  async wait(ms: number) {
    if (this.options.wait) return this.options.wait(ms);
    await sleep(ms, undefined, { signal: this.options.signal });
  }
}

export class Rpc {
  private url: string;
  transport: Transport;
  constructor(url: string, transport: Transport) {
    this.url = url; this.transport = transport;
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new ProviderError('invalid_rpc_url');
  }
  async call<T>(method: string, params: unknown[]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
    const payload = await this.transport.json(this.url, { jsonrpc: '2.0', id: 1, method, params }) as { result?: T; error?: { code?: string; message?: string } };
    if (payload.error) {
      // Do not expose provider text; it may echo an endpoint credential.
      const message = payload.error.message ?? '';
      if (method === 'eth_getLogs' && /(?:log )?query timed out|query timeout/i.test(message)) throw new ProviderError('rpc_range_limit');
      if (/execution reverted|revert(?:ed)?\b/i.test(message)) throw new ProviderError('contract_reverted');
      if (/rate.?limit|too many requests|requests per|compute units/i.test(message)) {
        if (attempt >= (this.transport.options.retries ?? 3)) throw new ProviderError('rpc_rate_limited', true);
        await this.transport.wait(Math.min(10000, 500 * 2 ** attempt));
        continue;
      }
      if (/range|too many|limit|response size|more than|maximum.*block/i.test(message)) throw new ProviderError('rpc_range_limit');
      throw new ProviderError(`rpc_error_${payload.error.code ?? 'unknown'}`);
    }
    if (payload.result === undefined || payload.result === null) throw new ProviderError('rpc_missing_result');
    return payload.result;
    }
  }
}

export const hex = (value: bigint) => `0x${value.toString(16)}`;
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface HistoryCheckpoint {
  nextToBlock: string;
  chunkSize: string;
  logs: RpcLog[];
  complete: boolean;
}

export function canonicalLogs(logs: RpcLog[]): RpcLog[] {
  const unique = new Map<string, RpcLog>();
  for (const log of logs) {
    if (log.removed || !/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash) || !/^0x[0-9a-fA-F]+$/.test(log.logIndex)) throw new ProviderError('invalid_log');
    const key = `${log.transactionHash.toLowerCase()}:${BigInt(log.logIndex)}`;
    if (unique.has(key) && JSON.stringify(unique.get(key)) !== JSON.stringify(log)) throw new ProviderError('conflicting_duplicate_log');
    unique.set(key, log);
  }
  return [...unique.values()].sort((a, b) => {
    for (const field of ['blockNumber', 'transactionIndex', 'logIndex'] as const) {
      if (BigInt(a[field]) !== BigInt(b[field])) return BigInt(a[field]) < BigInt(b[field]) ? -1 : 1;
    }
    return 0;
  });
}

export async function collectHistory(rpc: Rpc, wallet: string, fromBlock: bigint, state: HistoryCheckpoint, save: () => Promise<void>) {
  const ownerTopic = `0x${wallet.slice(2).padStart(64, '0')}`;
  while (!state.complete) {
    const to = BigInt(state.nextToBlock);
    const chunk = BigInt(state.chunkSize);
    const from = to - chunk + 1n > fromBlock ? to - chunk + 1n : fromBlock;
    try {
      const outgoing = await rpc.call<RpcLog[]>('eth_getLogs', [{ fromBlock: hex(from), toBlock: hex(to), topics: [TRANSFER_TOPIC, ownerTopic] }]);
      const incoming = await rpc.call<RpcLog[]>('eth_getLogs', [{ fromBlock: hex(from), toBlock: hex(to), topics: [TRANSFER_TOPIC, null, ownerTopic] }]);
      if (!Array.isArray(outgoing) || !Array.isArray(incoming)) throw new ProviderError('invalid_history_response');
      // A response at a common result cap must be split, even if RPC reports success.
      if (outgoing.length >= 1000 || incoming.length >= 1000) throw new ProviderError('rpc_range_limit');
      for (const log of [...outgoing, ...incoming]) {
        if (BigInt(log.blockNumber) < from || BigInt(log.blockNumber) > to || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC
          || ![log.topics[1]?.toLowerCase(), log.topics[2]?.toLowerCase()].includes(ownerTopic)) throw new ProviderError('history_filter_mismatch');
      }
      state.logs = canonicalLogs([...state.logs, ...outgoing, ...incoming]);
      state.nextToBlock = (from - 1n).toString();
      state.complete = from === fromBlock;
      await save();
    } catch (error) {
      if (error instanceof ProviderError && ['rpc_range_limit', 'http_413'].includes(error.code) && chunk > 1n) {
        state.chunkSize = (chunk / 2n).toString();
        await save();
        continue;
      }
      throw error;
    }
  }
}
