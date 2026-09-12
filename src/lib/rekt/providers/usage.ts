// Alchemy reference snapshot, 2026-09-12. Attempt-based estimates, not billing.
// https://www.alchemy.com/docs/reference/compute-unit-costs
const COSTS: Record<string, readonly [number, number]> = {
  eth_chainId: [0, 5], eth_blockNumber: [10, 10],
  eth_getBlockByNumber: [20, 20], eth_getBlockByHash: [20, 20],
  eth_getTransactionReceipt: [20, 20], eth_getTransactionByHash: [20, 20],
  eth_getTransactionCount: [20, 20], eth_getBalance: [20, 20], eth_getCode: [20, 20],
  eth_call: [26, 26], eth_getLogs: [60, 60], alchemy_getAssetTransfers: [120, 120],
};

export function requestCost(url: string, body: unknown) {
  // Batch requests are deliberately unsupported: silently charging one method
  // would allow the caller to bypass both the budget and throughput limit.
  if (Array.isArray(body)) throw new Error('rpc_batch_accounting_unsupported');
  const method = body && typeof body === 'object' && 'method' in body ? body.method : undefined;
  const rpc = typeof method === 'string';
  const known = rpc && Object.hasOwn(COSTS, method);
  const [cu, throughputCu] = known ? COSTS[method] : rpc ? [120, 120] : [0, 0];
  const hostname = new URL(url).hostname;
  const provider = rpc ? (hostname.endsWith('.alchemy.com') || hostname === 'alchemy.com' ? 'alchemy' : 'other_rpc') : 'external_http';
  // Unknown names, endpoints, headers and request parameters never enter reports.
  return { rpc, method: known ? method : rpc ? 'unknown_rpc' : 'external_http', provider, cu, throughputCu, known: !rpc || known };
}

export class Usage {
  estimatedRpcCu = 0;
  estimatedAlchemyCu = 0;
  estimatedThroughputCu = 0;
  unknownCostRequests = 0;
  retryRequests = 0;
  http429Responses = 0;
  rpcRateLimitResponses = 0;
  pacingWaitMs = 0;
  private methods = new Map<string, { provider: string; method: string; requests: number; estimatedCu: number; throughputCu: number }>();

  record(cost: ReturnType<typeof requestCost>, retry: boolean) {
    this.estimatedRpcCu += cost.cu;
    if (cost.provider === 'alchemy') this.estimatedAlchemyCu += cost.cu;
    this.estimatedThroughputCu += cost.throughputCu;
    if (!cost.known) this.unknownCostRequests++;
    if (retry) this.retryRequests++;
    const key = `${cost.provider}:${cost.method}`;
    const row = this.methods.get(key) ?? { provider: cost.provider, method: cost.method, requests: 0, estimatedCu: 0, throughputCu: 0 };
    row.requests++; row.estimatedCu += cost.cu; row.throughputCu += cost.throughputCu;
    this.methods.set(key, row);
  }

  snapshot() {
    return { costTableDate: '2026-09-12', basis: 'attempt_estimate_not_provider_billing',
      estimatedRpcCu: this.estimatedRpcCu, estimatedAlchemyCu: this.estimatedAlchemyCu,
      estimatedThroughputCu: this.estimatedThroughputCu, unknownCostRequests: this.unknownCostRequests,
      retryRequests: this.retryRequests, http429Responses: this.http429Responses, rpcRateLimitResponses: this.rpcRateLimitResponses,
      pacingWaitMs: this.pacingWaitMs, byMethod: [...this.methods.values()].map(row => ({ ...row })) };
  }
}
