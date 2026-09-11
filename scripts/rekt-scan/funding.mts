import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getAddress, isAddress } from 'viem';
import { fundingChains, FUNDING_POLICY, fundingTokenDecimals } from '../../src/lib/rekt/providers/funding-chains.ts';
import { HistoricalFundingPrices } from '../../src/lib/rekt/providers/prices.ts';
import type { Price } from '../../src/lib/rekt/scanner/types.ts';
import { collectHistory, ProviderError, Rpc, Transport } from '../../src/lib/rekt/providers/rpc.ts';
import type { HistoryCheckpoint, RpcBlock, RpcReceipt } from '../../src/lib/rekt/providers/rpc.ts';
import { collectRelayHistory } from '../../src/lib/rekt/providers/relay.ts';
import type { RelayHistory } from '../../src/lib/rekt/providers/relay.ts';
import { decodeFundingReceipt, externalRelayAccounts } from '../../src/lib/rekt/providers/funding.ts';
import type { FundingTransaction } from '../../src/lib/rekt/providers/funding.ts';
import { analyzeFunding } from '../../src/lib/rekt/scanner/funding.ts';
import type { FundingEvidence, FundingObservation } from '../../src/lib/rekt/scanner/funding.ts';

interface ChainCheckpoint {
  snapshot?: RpcBlock; history?: HistoryCheckpoint;
  decoded: Record<string, FundingObservation[]>;
  prices?: Record<string, Price>;
  receipts: Record<string, { receipt: RpcReceipt; tx: FundingTransaction; block: RpcBlock }>;
}
interface Checkpoint {
  version: string; wallet: string; createdAt: number; cycleOpenedAt?: number;
  chains: Record<string, ChainCheckpoint>; relay: RelayHistory;
}
const errorCode = (error: unknown) => error instanceof ProviderError ? error.code : 'funding_scan_failed';
async function atomicJson(path: string, value: unknown) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(tmp, path);
}
function positive(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error('invalid_positive_integer');
  return Number(value);
}

export async function fundingMain(args = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    wallet: { type: 'string' }, output: { type: 'string' }, resume: { type: 'boolean' }, help: { type: 'boolean' },
    'max-requests': { type: 'string' }, 'timeout-ms': { type: 'string' }, 'chunk-size': { type: 'string' }, 'cycle-opened-at': { type: 'string' },
  } });
  if (values.help) {
    console.log(`REKT FOMO first-funding discovery (read only, Node >=22.18)
  npm run rekt:funding -- --wallet 0x... --output .local-archive/rekt/funding.json
  npm run rekt:funding -- --wallet 0x... --output .local-archive/rekt/funding.json --resume
Checks Base, Robinhood, BNB Smart Chain, Ethereum from genesis; no loss-chain filter.
Significant funding: >= $10 per deposit at historical USD price. Smaller credits are retained as context.
--max-requests 1000    HTTP budget PER CHAIN; separate Relay budget capped at 100
--chunk-size 1000000   Adaptive log range; explicit value resets range size on resume
--timeout-ms 15000     Request timeout
--cycle-opened-at SEC  Optional opening timestamp (Unix seconds); funding must precede it
--resume              Same snapshots, 24-hour TTL; v1 evidence is re-evaluated under the $10 v2 policy
RPC overrides: REKT_BASE_RPC_URL, REKT_ROBINHOOD_RPC_URL, REKT_BNB_RPC_URL, REKT_ETHEREUM_RPC_URL.
REKT_RELAY_API_KEY selects v3; without a key compatibility v2 is used. No implicit env-file loading.
Reports identify direct cash sources within the stated scope, never verify signatures or authorize burials.
Unsupported routes/assets and incomplete history remain unresolved. Exit: 0 complete, 2 partial, 1 failure, 130 cancelled.`);
    return 0;
  }
  if (!values.wallet || !isAddress(values.wallet, { strict: true })) throw new Error('invalid_wallet');
  if (!values.output) throw new Error('output_required');
  const wallet = getAddress(values.wallet).toLowerCase(), output = resolve(values.output);
  const maxRequests = positive(values['max-requests'], 1000), timeoutMs = positive(values['timeout-ms'], 15000);
  const chunkSize = positive(values['chunk-size'], 1000000);
  const cycleOpenedAt = values['cycle-opened-at'] === undefined ? undefined : positive(values['cycle-opened-at'], 1);
  const checkpointPath = `${output}.checkpoint.json`, lockPath = `${output}.lock`;
  await mkdir(dirname(output), { recursive: true });
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch { throw new Error('scan_locked'); }
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  const startedAt = Date.now();
  let state: Checkpoint | undefined;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    if (values.resume) {
      state = JSON.parse(await readFile(checkpointPath, 'utf8')) as Checkpoint;
      if (![FUNDING_POLICY, 'first_funding_source_v1'].includes(state.version) || state.wallet !== wallet || !Number.isSafeInteger(state.createdAt)
        || startedAt - state.createdAt > 86400000 || state.createdAt > startedAt
        || (values['cycle-opened-at'] !== undefined && cycleOpenedAt !== state.cycleOpenedAt)
        || !state.chains || !state.relay || !['v2', 'v3'].includes(state.relay.apiVersion)) throw new ProviderError('checkpoint_mismatch_or_expired');
      // Checkpoints contain raw history/receipts, not a cached ownership decision.
      state.version = FUNDING_POLICY;
    } else {
      for (const path of [output, checkpointPath]) {
        try { await readFile(path); throw new ProviderError('output_exists_use_resume_or_new_output'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      state = { version: FUNDING_POLICY, wallet, createdAt: startedAt, cycleOpenedAt, chains: {},
        relay: { apiVersion: process.env.REKT_RELAY_API_KEY ? 'v3' : 'v2', requests: [], seenContinuations: [], complete: false } };
    }
    const checkpoint = state, save = () => atomicJson(checkpointPath, checkpoint);
    await save();
    const evidence: FundingEvidence = { wallet, coverage: [], observations: [], externalAccounts: [], relayComplete: false };
    const metrics: Record<string, number> = {};
    const valuationErrors: Record<string, string> = {};
    for (const chain of fundingChains()) {
      controller.signal.throwIfAborted();
      const transport = new Transport({ maxRequests, timeoutMs, signal: controller.signal });
      const saved = checkpoint.chains[chain.id] ??= { decoded: {}, receipts: {} };
      let problem: string | undefined, verifiedSnapshot = false;
      console.error(JSON.stringify({ phase: 'funding_history', chain: chain.name, nextToBlock: saved.history?.nextToBlock }));
      try {
        const rpc = new Rpc(chain.rpcUrl, transport);
        if (BigInt(await rpc.call<string>('eth_chainId', [])) !== BigInt(chain.id)) throw new ProviderError('rpc_chain_mismatch');
        if (saved.snapshot) {
          const block = await rpc.call<RpcBlock>('eth_getBlockByNumber', [saved.snapshot.number, false]);
          if (block.hash.toLowerCase() !== saved.snapshot.hash.toLowerCase()) throw new ProviderError('reorg_detected');
        } else {
          saved.snapshot = await rpc.call<RpcBlock>('eth_getBlockByNumber', ['finalized', false]);
          saved.history = { nextToBlock: BigInt(saved.snapshot.number).toString(), chunkSize: String(chunkSize), logs: [], complete: false };
          await save();
        }
        if (!saved.history) throw new ProviderError('invalid_funding_checkpoint');
        if (values.resume && values['chunk-size']) saved.history.chunkSize = String(chunkSize);
        // Reserve half the budget for receipts so partial history still produces
        // useful observed sources; history gaps remain visible and block primacy.
        transport.options.maxRequests = Math.max(transport.requests, Math.floor(maxRequests / 2));
        let lastProgress = Date.now();
        try {
          await collectHistory(rpc, wallet, 0n, saved.history, async () => {
            await save();
            if (Date.now() - lastProgress >= 5000) {
              console.error(JSON.stringify({ phase: 'funding_history', chain: chain.name, nextToBlock: saved.history!.nextToBlock, logs: saved.history!.logs.length, requests: transport.requests }));
              lastProgress = Date.now();
            }
          });
        } catch (error) { problem = errorCode(error); }
        transport.options.maxRequests = maxRequests;
        const groups = new Map<string, typeof saved.history.logs>();
        for (const log of saved.history.logs) {
          const key = log.transactionHash.toLowerCase();
          groups.set(key, [...(groups.get(key) ?? []), log]);
        }
        for (const [txHash, logs] of groups) {
          if (saved.decoded[txHash]) continue;
          // Keep receipts for audit/replay; never save URL credentials.
          const receipt = await rpc.call<RpcReceipt>('eth_getTransactionReceipt', [txHash]);
          const tx = await rpc.call<FundingTransaction>('eth_getTransactionByHash', [txHash]);
          const block = await rpc.call<RpcBlock>('eth_getBlockByNumber', [receipt.blockNumber, false]);
          saved.decoded[txHash] = decodeFundingReceipt(chain, wallet, logs, receipt, tx, block);
          saved.receipts[txHash] = { receipt, tx, block };
          await save();
        }
        if ((await rpc.call<RpcBlock>('eth_getBlockByNumber', [saved.snapshot.number, false])).hash.toLowerCase() !== saved.snapshot.hash.toLowerCase()) throw new ProviderError('reorg_detected');
        verifiedSnapshot = true;
      } catch (error) { controller.signal.throwIfAborted(); problem = errorCode(error); }
      transport.options.maxRequests = maxRequests;
      const prices = new HistoricalFundingPrices(transport, saved.prices ??= {});
      if (problem !== 'reorg_detected' && problem !== 'rpc_chain_mismatch') {
        for (const credit of Object.values(saved.decoded).flat()) {
          if (credit.price || fundingTokenDecimals(chain.id, credit.token) === undefined) continue;
          const key = `${chain.id}:${credit.txHash}:${credit.logIndex}`;
          try {
            credit.price = await prices.get(chain.id, credit.token, credit.creditedAt);
            if (!credit.price) valuationErrors[key] = 'missing_historical_price';
          } catch (error) { controller.signal.throwIfAborted(); valuationErrors[key] = errorCode(error); }
          await save();
        }
      }
      evidence.coverage.push({ chainId: chain.id, fromBlock: '0', snapshot: saved.snapshot,
        complete: Boolean(saved.history?.complete && verifiedSnapshot && !problem), ...(problem ? { error: problem } : {}) });
      // A reorg or chain mismatch invalidates even previously cached discoveries.
      if (problem !== 'reorg_detected' && problem !== 'rpc_chain_mismatch') evidence.observations.push(...Object.values(saved.decoded).flat());
      metrics[chain.name] = transport.requests;
      await save();
    }
    const relayTransport = new Transport({ maxRequests: Math.min(maxRequests, 100), timeoutMs, signal: controller.signal });
    let relayError: string | undefined;
    try {
      await collectRelayHistory(relayTransport, wallet, checkpoint.relay, save, { apiKey: process.env.REKT_RELAY_API_KEY });
      evidence.relayComplete = checkpoint.relay.complete;
    } catch (error) { controller.signal.throwIfAborted(); relayError = errorCode(error); }
    // Preserve already discovered counterpart accounts even on a failed page.
    try { evidence.externalAccounts = externalRelayAccounts(wallet, checkpoint.relay.requests); }
    catch (error) { evidence.relayComplete = false; relayError = errorCode(error); }
    metrics.relay = relayTransport.requests;
    const analysis = analyzeFunding(evidence, checkpoint.cycleOpenedAt);
    const report = { schemaVersion: 1, mode: 'live_first_funding_discovery', generatedAt: new Date().toISOString(),
      ...analysis, coverage: evidence.coverage, externalAccounts: evidence.externalAccounts,
      valuationErrors,
      relay: { complete: evidence.relayComplete, error: relayError, apiVersion: checkpoint.relay.apiVersion, deprecation: checkpoint.relay.deprecation },
      assetPolicy: fundingChains().map(c => ({ chainId: c.id, tokens: c.cashTokens })),
      metrics: { requestsBySource: metrics, elapsedMs: Date.now() - startedAt } };
    let previous: { methodVersion?: string; status?: string; observations?: FundingObservation[]; coverage?: FundingEvidence['coverage'] } | undefined;
    try { previous = JSON.parse(await readFile(output, 'utf8')); } catch { /* first report */ }
    const observationKey = (o: FundingObservation) => `${o.chainId}:${o.txHash}:${o.logIndex}`;
    const currentKeys = new Set(analysis.observations.map(observationKey));
    const lostEvidence = previous?.observations?.some(o => !currentKeys.has(observationKey(o)))
      || previous?.coverage?.some(c => c.complete && !evidence.coverage.find(next => next.chainId === c.chainId)?.complete);
    const migrated = previous?.methodVersion === 'first_funding_source_v1';
    if (migrated) await atomicJson(`${output}.policy-v1.json`, previous);
    const reportPath = !migrated && (lostEvidence || (previous?.status === 'complete' && analysis.status !== 'complete')) ? `${output}.error.json` : output;
    await atomicJson(reportPath, report);
    console.log(JSON.stringify({ status: analysis.status, sourceStatus: analysis.sourceStatus, observedSources: analysis.observedDirectSources.length, output: reportPath }));
    return analysis.status === 'complete' ? 0 : 2;
  } catch (error) {
    const report = { status: controller.signal.aborted ? 'cancelled' : 'failed', error: errorCode(error), burialAuthorized: false };
    // Invalid resumes, cancellation and filesystem failures never replace an
    // existing analytical report or checkpoint with a generic error.
    await atomicJson(`${output}.error.json`, report);
    console.error(JSON.stringify(report));
    return controller.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    await lock.close(); await unlink(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fundingMain().then(code => { process.exitCode = code; }).catch(() => { console.error('invalid_funding_scan_arguments'); process.exitCode = 1; });
}
