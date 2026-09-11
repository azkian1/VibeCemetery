import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isAddress, getAddress } from 'viem';
import { analyze } from '../../src/lib/rekt/scanner/analyze.ts';
import type { Evidence, Trade, Price } from '../../src/lib/rekt/scanner/types.ts';
import { canonicalLogs, collectHistory, ProviderError, Rpc, Transport, hex } from '../../src/lib/rekt/providers/rpc.ts';
import type { HistoryCheckpoint, RpcBlock } from '../../src/lib/rekt/providers/rpc.ts';
import { HistoricalPrices } from '../../src/lib/rekt/providers/prices.ts';
import { transfer, UniswapV3Decoder } from '../../src/lib/rekt/providers/uniswap-v3.ts';
import { alchemyUrl, scanChain } from '../../src/lib/rekt/providers/chains.ts';
import { scanRelay } from './relay.mts';
import type { RelayCheckpoint } from './relay.mts';
import { newDiscoveryCheckpoint, reuseDiscoveryEvidence, scanDiscovery } from './discovery.mts';
import type { DiscoveryCheckpoint } from './discovery.mts';
import type { DexProtocol } from '../../src/lib/rekt/providers/dex.ts';
import { collectIndexedHistory, hydrateIndexedHistory, newIndexedHistory } from '../../src/lib/rekt/providers/alchemy.ts';
import type { IndexedHistory } from '../../src/lib/rekt/providers/alchemy.ts';
import { atomicJson, checkpointWriter } from './checkpoint.mts';

const TTL_MS = 24 * 60 * 60 * 1000;
interface Checkpoint {
  version: 1; createdAt: number; wallet: string; chainId: number;
  fromBlock: string; snapshot: RpcBlock; history: HistoryCheckpoint;
  decoded: Record<string, Trade[]>; prices: Record<string, Price>; snapshotBalances?: Record<string, string>;
  source?: 'uniswap-v2' | 'uniswap-v3' | 'uniswap-v4' | 'relay' | 'auto'; relay?: RelayCheckpoint;
  discovery?: DiscoveryCheckpoint;
  historyFromBlock?: string;
  historyProvider?: 'rpc' | 'alchemy'; indexed?: IndexedHistory;
}

function positive(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`invalid_${name}`);
  return Number(value);
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    wallet: { type: 'string' }, chain: { type: 'string', default: 'base' }, output: { type: 'string' }, source: { type: 'string' },
    'from-block': { type: 'string' }, 'to-block': { type: 'string' }, 'chunk-size': { type: 'string' }, 'seed-checkpoint': { type: 'string' },
    days: { type: 'string' }, 'max-requests': { type: 'string' }, 'timeout-ms': { type: 'string' }, 'request-interval-ms': { type: 'string' },
    resume: { type: 'boolean' }, 'retry-evidence': { type: 'boolean' }, input: { type: 'string' }, help: { type: 'boolean' },
    'history-provider': { type: 'string' }, concurrency: { type: 'string' }, 'cache-dir': { type: 'string' }, 'deadline-ms': { type: 'string' },
  } });
  if (values.help) {
    console.log(`REKT read-only closed-loss scanner (Node >=22.18)
  npm run rekt:scan -- --wallet 0x... --output .local-archive/rekt/report.json
  npm run rekt:scan -- --wallet 0x... --output .local-archive/rekt/report.json --resume

Options:
  --chain base|robinhood Network (default: base)
  --source auto|uniswap-v2|uniswap-v3|uniswap-v4|relay
                        auto: combined Uni V2/V3/V4 + Relay preliminary discovery (recommended)
                        Default remains Base strict V3 / Robinhood Relay for existing scripts
                        Base uniswap-v3 retains the strict single-pool verification path
  --days 90             Closure-date filter; purchases are not truncated by this window
  --from-block 1        Beginning of history; narrowed coverage is explicit in the report
  --to-block NUMBER     Snapshot <= finalized; defaults to current finalized block
  --chunk-size 1000000  Initial RPC log range; automatically reduced on provider limits
  --max-requests 2000   Per-run HTTP budget including retry attempts and price requests
  --timeout-ms 15000    Per-request timeout
  --request-interval-ms 250  Minimum delay before each request; increase for shared public RPC
  --resume              Resume the same snapshot/checkpoint (24-hour TTL)
  --retry-evidence      With --resume, recompute discovery and retry failed archive reads
  --seed-checkpoint FILE Reuse a complete older log history for a NEW snapshot; revalidate its block hash
  --history-provider rpc|alchemy  History source (default rpc); Alchemy requires configured access
  --concurrency 1       Discovery transaction workers, 1..16; start with 5 on a dedicated RPC
  --cache-dir DIR       Private per-wallet finalized evidence cache (discovery only)
  --deadline-ms NUMBER  Gracefully checkpoint an unfinished job when its time budget expires
  --input evidence.json Recalculate local normalized evidence offline (not authorization)

RPC: REKT_BASE_RPC_URL, then BASE_RPC_URL, then https://mainnet.base.org.
Robinhood RPC: REKT_ROBINHOOD_RPC_URL, then https://rpc.mainnet.chain.robinhood.com.
Relay: REKT_RELAY_API_KEY selects v3; without a key, public compatibility v2 is used.
FOMO first funding: npm run rekt:funding -- --wallet 0x... --output funding.json (all four funding networks).
No env files are loaded implicitly. Output has adjacent .checkpoint.json and .lock files.
REKT_ALCHEMY_API_KEY configures Alchemy RPC and indexed history for both chains.
Optional REKT_BASE_INDEXER_URL / REKT_ROBINHOOD_INDEXER_URL override the indexed endpoint.
Exit codes: 0 complete, 2 partial, 1 failed, 130 cancelled.`);
    return 0;
  }
  if (!values.output) throw new Error('output_required');
  const output = resolve(values.output);
  const checkpointPath = `${output}.checkpoint.json`;
  const lockPath = `${output}.lock`;
  const days = positive(values.days, 90, 'days');
  const maxRequests = positive(values['max-requests'], 2000, 'max_requests');
  const timeoutMs = positive(values['timeout-ms'], 15000, 'timeout_ms');
  const intervalMs = positive(values['request-interval-ms'], 250, 'request_interval_ms');
  const chunkSize = positive(values['chunk-size'], 1000000, 'chunk_size');
  const concurrency = positive(values.concurrency, 1, 'concurrency');
  if (concurrency > 16) throw new Error('invalid_concurrency');
  const deadlineMs = values['deadline-ms'] === undefined ? undefined : positive(values['deadline-ms'], 28000, 'deadline_ms');
  const historyProvider = values['history-provider'] ?? 'rpc';
  if (!['rpc', 'alchemy'].includes(historyProvider)) throw new Error('invalid_history_provider');
  const fromBlock = BigInt(positive(values['from-block'], 1, 'from_block'));
  const toBlock = values['to-block'] === undefined ? undefined : BigInt(positive(values['to-block'], 1, 'to_block'));
  if (!values.input && (!values.wallet || !isAddress(values.wallet, { strict: true }))) throw new Error('invalid_wallet');
  const wallet = values.wallet ? getAddress(values.wallet).toLowerCase() : '';
  const chain = scanChain(values.chain!);
  const source = values.source ?? chain?.defaultSource;
  const isDiscovery = source === 'auto' || source === 'uniswap-v2' || source === 'uniswap-v4' || (source === 'uniswap-v3' && chain?.id === 4663);
  if ((historyProvider === 'alchemy' || values['cache-dir'] || concurrency > 1) && (!isDiscovery || values.input)) throw new Error('fast_options_require_discovery');
  const indexerUrl = historyProvider === 'alchemy' ? alchemyUrl(values.chain!) : undefined;
  if (historyProvider === 'alchemy' && !indexerUrl) throw new Error('alchemy_configuration_required');
  const cachePath = values['cache-dir'] && chain ? resolve(values['cache-dir'], `${chain.id}-${wallet}-${fromBlock}.json`) : undefined;
  if (cachePath && [output, checkpointPath, lockPath].includes(cachePath)) throw new Error('cache_output_conflict');
  if (values.source && !['auto', 'uniswap-v2', 'uniswap-v3', 'uniswap-v4', 'relay'].includes(values.source)) throw new Error('invalid_source');
  if (values['retry-evidence'] && (!values.resume || values.input || source === 'relay' || (source === 'uniswap-v3' && chain?.id === 8453))) throw new Error('retry_evidence_requires_discovery_resume');
  if (values['seed-checkpoint'] && (values.resume || values.input)) throw new Error('seed_options_conflict');
  if (values.input && [output, checkpointPath].includes(resolve(values.input))) throw new Error('input_output_conflict');
  if (!values.resume) {
    for (const path of [output, checkpointPath]) {
      try { await readFile(path); throw new Error('output_exists_use_resume_or_new_output'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
  await mkdir(dirname(output), { recursive: true });
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch { throw new Error('scan_locked: another run may be active; inspect the lock before removing it'); }
  await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
  const controller = new AbortController();
  let deadlineReached = false;
  const timer = deadlineMs === undefined ? undefined : setTimeout(() => { deadlineReached = true; controller.abort(); }, deadlineMs);
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let state: Checkpoint | undefined;
  let cacheLock: Awaited<ReturnType<typeof open>> | undefined;
  let saveCheckpoint: (() => Promise<void>) | undefined;
  let cacheReceiptsReused = 0;
  let evidence: Evidence | undefined;
  const transport = new Transport({ maxRequests, timeoutMs, intervalMs, signal: controller.signal });
  const startedAt = Date.now();
  try {
    if (cachePath) {
      await mkdir(dirname(cachePath), { recursive: true });
      try { cacheLock = await open(`${cachePath}.lock`, 'wx', 0o600); }
      catch { throw new Error('cache_locked'); }
      await cacheLock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    }
    if (values.input) {
      if (values.resume || values.wallet || values['from-block'] || values['to-block']) throw new Error('input_options_conflict');
      if (resolve(values.input) === output || resolve(values.input) === checkpointPath) throw new Error('input_output_conflict');
      evidence = JSON.parse(await readFile(values.input, 'utf8')) as Evidence;
      const analysis = analyze(evidence, { days });
      const status = evidence.historyComplete ? 'complete' : 'partial';
      await atomicJson(output, { schemaVersion: 1, status, mode: 'offline_untrusted_evidence', ...analysis, evidence });
      console.log(JSON.stringify({ status, candidates: analysis.candidates.length, output }));
      return status === 'complete' ? 0 : 2;
    }
    if (!chain) {
      if (values.resume) throw new ProviderError('unsupported_network');
      const report = { schemaVersion: 1, status: 'unsupported_network', chain: values.chain,
        chainId: null,
        reason: 'No adapter for the requested chain and source combination', candidates: [] };
      await atomicJson(output, report);
      console.log(JSON.stringify(report));
      return 1;
    }
    const rpc = new Rpc(chain.rpcUrl, transport);
    if (BigInt(await rpc.call<string>('eth_chainId', [])) !== BigInt(chain.id)) throw new ProviderError('rpc_chain_mismatch');
    if (values.resume) {
      state = JSON.parse(await readFile(checkpointPath, 'utf8')) as Checkpoint;
      if (state.version !== 1 || state.chainId !== chain.id || state.wallet !== wallet || (state.source ?? 'uniswap-v3') !== source || !Number.isFinite(state.createdAt)
        || (state.historyProvider ?? 'rpc') !== historyProvider
        || Date.now() - state.createdAt > TTL_MS || state.createdAt > Date.now()
        || (values['from-block'] && state.fromBlock !== fromBlock.toString())
        || (toBlock !== undefined && BigInt(state.snapshot.number) !== toBlock)) throw new Error('checkpoint_mismatch_or_expired');
      const snapshot = await rpc.call<RpcBlock>('eth_getBlockByNumber', [state.snapshot.number, false]);
      if (snapshot.hash !== state.snapshot.hash) throw new ProviderError('reorg_detected');
      if (values['chunk-size'] && !state.history.complete) state.history.chunkSize = chunkSize.toString();
    } else {
      try { await readFile(checkpointPath); throw new Error('checkpoint_exists_use_resume_or_new_output'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const finalized = await rpc.call<RpcBlock>('eth_getBlockByNumber', ['finalized', false]);
      if (toBlock !== undefined && toBlock > BigInt(finalized.number)) throw new Error('to_block_not_finalized');
      const snapshot = toBlock === undefined ? finalized : await rpc.call<RpcBlock>('eth_getBlockByNumber', [hex(toBlock), false]);
      if (fromBlock > BigInt(snapshot.number)) throw new Error('invalid_block_range');
      state = { version: 1, createdAt: Date.now(), wallet, chainId: chain.id, source: source as Checkpoint['source'], historyProvider: historyProvider as Checkpoint['historyProvider'], fromBlock: fromBlock.toString(), snapshot,
        history: { nextToBlock: BigInt(snapshot.number).toString(), chunkSize: chunkSize.toString(), logs: [], complete: false }, decoded: {}, prices: {} };
      let seed: Checkpoint | undefined;
      if (values['seed-checkpoint']) seed = JSON.parse(await readFile(resolve(values['seed-checkpoint']), 'utf8')) as Checkpoint;
      else if (cachePath) {
        try { seed = JSON.parse(await readFile(cachePath, 'utf8')) as Checkpoint; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      if (seed) {
        if (seed.version !== 1 || seed.wallet !== wallet || seed.chainId !== chain.id || seed.fromBlock !== state.fromBlock || !seed.history.complete
          || BigInt(seed.snapshot.number) > BigInt(snapshot.number)) throw new ProviderError('invalid_seed_checkpoint');
        if ((await rpc.call<RpcBlock>('eth_getBlockByNumber', [seed.snapshot.number, false])).hash !== seed.snapshot.hash) throw new ProviderError('seed_reorg_detected');
        if (seed.history.logs.some(l => BigInt(l.blockNumber) < fromBlock || BigInt(l.blockNumber) > BigInt(seed.snapshot.number))) throw new ProviderError('seed_logs_outside_coverage');
        state.history.logs = canonicalLogs(seed.history.logs);
        state.historyFromBlock = (BigInt(seed.snapshot.number) + 1n).toString();
        state.history.complete = BigInt(seed.snapshot.number) === BigInt(snapshot.number);
        // Never promote indexer-derived coverage to a raw-RPC completeness claim.
        if (seed.historyProvider === 'alchemy' && historyProvider !== 'alchemy') throw new ProviderError('seed_history_provider_mismatch');
        if (seed.historyProvider === 'alchemy') {
          // Revisit recent finalized blocks because an indexer may catch up after
          // the previous response. Union with validated cached logs; never erase
          // known events merely because a later provider page omits them.
          const overlap = BigInt(seed.snapshot.number) - 9999n;
          state.historyFromBlock = (overlap > fromBlock ? overlap : fromBlock).toString();
          state.history.complete = false;
        }
        if (isDiscovery && seed.discovery) {
          state.discovery = reuseDiscoveryEvidence(seed.discovery, seed.snapshot);
          cacheReceiptsReused = Object.keys(state.discovery.receipts).length;
        }
      }
    }
    const checkpoint = state;
    const save = checkpointWriter(() => atomicJson(checkpointPath, checkpoint));
    saveCheckpoint = save;
    await save();
    let lastProgress = 0;
    const progress = () => {
      if (Date.now() - lastProgress > 5000) {
        console.error(JSON.stringify({ phase: checkpoint.history.complete ? 'decoding' : 'history', nextToBlock: checkpoint.history.nextToBlock,
          logs: checkpoint.history.logs.length, decodedTransactions: Object.keys(checkpoint.discovery?.flows ?? checkpoint.relay?.flows ?? checkpoint.decoded).length, requests: transport.requests }));
        lastProgress = Date.now();
      }
    };
    if (historyProvider === 'alchemy' && !checkpoint.history.complete) {
      const indexer = new Rpc(indexerUrl!, transport);
      if (BigInt(await indexer.call<string>('eth_chainId', [])) !== BigInt(chain.id)) throw new ProviderError('indexer_chain_mismatch');
      checkpoint.discovery ??= newDiscoveryCheckpoint();
      checkpoint.indexed ??= newIndexedHistory(BigInt(checkpoint.historyFromBlock ?? checkpoint.fromBlock), BigInt(checkpoint.snapshot.number));
      await collectIndexedHistory(indexer, wallet, checkpoint.indexed, async () => { await save(); progress(); });
      await hydrateIndexedHistory(rpc, wallet, checkpoint.indexed, checkpoint.discovery.receipts, checkpoint.history, concurrency, async () => { await save(); progress(); });
      checkpoint.history.complete = true; checkpoint.history.nextToBlock = (BigInt(checkpoint.historyFromBlock ?? checkpoint.fromBlock) - 1n).toString(); await save();
    } else await collectHistory(rpc, wallet, BigInt(checkpoint.historyFromBlock ?? checkpoint.fromBlock), checkpoint.history, async () => { await save(); progress(); });
    if (source === 'auto' || source === 'uniswap-v2' || source === 'uniswap-v4' || (source === 'uniswap-v3' && chain.id === 4663)) {
      checkpoint.discovery ??= newDiscoveryCheckpoint();
      await save();
      const result = await scanDiscovery(rpc, chain.id, wallet, checkpoint.fromBlock, checkpoint.snapshot, checkpoint.history.logs,
        checkpoint.discovery, days, async () => { await save(); progress(); }, { only: source === 'auto' ? undefined : source as DexProtocol, retryEvidence: values['retry-evidence'], concurrency });
      if ((await rpc.call<RpcBlock>('eth_getBlockByNumber', [checkpoint.snapshot.number, false])).hash !== checkpoint.snapshot.hash) throw new ProviderError('reorg_detected');
      await atomicJson(output, { schemaVersion: 2, status: 'partial', collectionComplete: true, mode: 'live_evm_discovery',
        generatedAt: new Date().toISOString(), coverage: { chainId: chain.id, fromBlock: checkpoint.fromBlock,
          toBlock: BigInt(checkpoint.snapshot.number).toString(), fromGenesis: checkpoint.fromBlock === '1', days, source,
          logs: checkpoint.history.logs.length, relayApiVersion: checkpoint.discovery.relay.apiVersion, historyProvider,
          fetchedFromBlock: checkpoint.historyFromBlock ?? checkpoint.fromBlock,
          historyCompleteness: historyProvider === 'alchemy' ? 'indexer_asserted_receipt_checked' : 'rpc_log_ranges' },
        metrics: { requests: transport.requests, elapsedMs: Date.now() - startedAt, concurrency, cacheReceiptsReused }, ...result });
      if (cachePath) await atomicJson(cachePath, checkpoint);
      console.log(JSON.stringify({ status: 'partial', collectionComplete: true, candidates: 0,
        preliminaryCandidates: result.preliminaryCandidates.length, closedCycles: result.cycles.length,
        protocols: result.discovery.protocolsByTransaction, requests: transport.requests, output }));
      return 2;
    }
    if (source === 'relay') {
      checkpoint.relay ??= { history: { apiVersion: process.env.REKT_RELAY_API_KEY ? 'v3' : 'v2',
        requests: [], seenContinuations: [], complete: false }, flows: {}, balances: {}, balanceErrors: {} };
      await save();
      const result = await scanRelay(rpc, chain.id, wallet, checkpoint.fromBlock, checkpoint.snapshot,
        checkpoint.history.logs, checkpoint.relay, days, async () => { await save(); progress(); });
      if ((await rpc.call<RpcBlock>('eth_getBlockByNumber', [checkpoint.snapshot.number, false])).hash !== checkpoint.snapshot.hash) throw new ProviderError('reorg_detected');
      await atomicJson(output, { schemaVersion: 1, status: 'partial', collectionComplete: true, mode: 'live_relay_discovery',
        generatedAt: new Date().toISOString(), coverage: { chainId: chain.id, fromBlock: checkpoint.fromBlock,
          toBlock: BigInt(checkpoint.snapshot.number).toString(), fromGenesis: checkpoint.fromBlock === '1', days,
          scope: 'erc20_wallet_flows_matched_to_relay', logs: checkpoint.history.logs.length,
          relayApiVersion: checkpoint.relay.history.apiVersion, relayDeprecation: checkpoint.relay.history.deprecation,
          relayRequests: checkpoint.relay.history.requests.length },
        metrics: { requests: transport.requests, elapsedMs: Date.now() - startedAt }, ...result });
      console.log(JSON.stringify({ status: 'partial', collectionComplete: true, candidates: 0,
        preliminaryCandidates: result.preliminaryCandidates.length, closedCycles: result.cycles.length,
        requests: transport.requests, output }));
      return 2;
    }
    const grouped = new Map<string, typeof checkpoint.history.logs>();
    const tokenBlocks = new Map<string, Set<string>>();
    for (const log of checkpoint.history.logs) {
      const hash = log.transactionHash.toLowerCase();
      const list = grouped.get(hash) ?? []; list.push(log); grouped.set(hash, list);
      const t = transfer(log);
      if (t) { const key = `${t.token}:${log.blockNumber}`; const hashes = tokenBlocks.get(key) ?? new Set(); hashes.add(hash); tokenBlocks.set(key, hashes); }
    }
    const repeated = new Set([...tokenBlocks].filter(([, hashes]) => hashes.size > 1).map(([key]) => key));
    const decoder = new UniswapV3Decoder(rpc, new HistoricalPrices(transport, checkpoint.prices));
    for (const [hash, logs] of grouped) {
      if (checkpoint.decoded[hash]) continue;
      checkpoint.decoded[hash] = await decoder.decode(wallet, hash, logs, repeated);
      await save(); progress();
    }
    checkpoint.snapshotBalances ??= {};
    for (const token of new Set(Object.values(checkpoint.decoded).flat().map(t => t.token))) {
      if (checkpoint.snapshotBalances[token] !== undefined) continue;
      try { checkpoint.snapshotBalances[token] = (await decoder.balance(token, wallet, BigInt(checkpoint.snapshot.number))).toString(); }
      catch (error) {
        if (!(error instanceof ProviderError) || !['contract_reverted', 'invalid_contract_response'].includes(error.code)) throw error;
        // No invented balance for a nonstandard token; analyzer excludes it.
      }
      await save(); progress();
    }
    // Confirm that the frozen snapshot has not changed during a long scan.
    if ((await rpc.call<RpcBlock>('eth_getBlockByNumber', [checkpoint.snapshot.number, false])).hash !== checkpoint.snapshot.hash) throw new ProviderError('reorg_detected');
    evidence = {
      schemaVersion: 1, chainId: 8453, wallet, fromBlock: checkpoint.fromBlock,
      toBlock: BigInt(checkpoint.snapshot.number).toString(), toBlockHash: checkpoint.snapshot.hash,
      snapshotTimestamp: Number(BigInt(checkpoint.snapshot.timestamp)), historyComplete: true,
      snapshotBalances: checkpoint.snapshotBalances,
      trades: Object.values(checkpoint.decoded).flat(),
    };
    const analysis = analyze(evidence, { days });
    await atomicJson(output, { schemaVersion: 1, status: 'complete', mode: 'live_rpc', generatedAt: new Date().toISOString(),
      coverage: { fromBlock: evidence.fromBlock, toBlock: evidence.toBlock, fromGenesis: evidence.fromBlock === '1', days, scope: 'base_uniswap_v3_single_pool_erc20' },
      metrics: { requests: transport.requests, elapsedMs: Date.now() - startedAt }, ...analysis, evidence });
    console.log(JSON.stringify({ status: 'complete', candidates: analysis.candidates.length, exclusions: analysis.exclusions.length, requests: transport.requests, output }));
    return 0;
  } catch (error) {
    // Workers are drained before this catch; preserve successfully fetched evidence too.
    if (saveCheckpoint) await saveCheckpoint();
    const cancelled = controller.signal.aborted && !deadlineReached;
    const code = deadlineReached ? 'scan_deadline_reached' : cancelled ? 'cancelled' : error instanceof ProviderError ? error.code : error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : 'scan_failed';
    const status = cancelled ? 'cancelled' : state ? 'partial' : 'failed';
    // A failed resume must not destroy the last successful analytical report.
    let failureOutput = output;
    try { const previous = JSON.parse(await readFile(output, 'utf8')); if (previous.status === 'complete' || previous.collectionComplete === true) failureOutput = `${output}.error.json`; } catch { /* No previous valid report. */ }
    await atomicJson(failureOutput, { schemaVersion: 1, status, error: code, candidates: [],
      coverage: state ? { fromBlock: state.fromBlock, toBlock: BigInt(state.snapshot.number).toString(), nextToBlock: state.history.nextToBlock, historyComplete: state.history.complete, decodedTransactions: Object.keys(state.decoded).length } : null,
      metrics: { requests: transport.requests, elapsedMs: Date.now() - startedAt },
      resume: state ? { checkpoint: checkpointPath, expiresAt: new Date(state.createdAt + TTL_MS).toISOString() } : null });
    console.error(JSON.stringify({ status, error: code, output: failureOutput }));
    return cancelled ? 130 : state ? 2 : 1;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    await lock.close(); await unlink(lockPath);
    if (cacheLock && cachePath) { await cacheLock.close(); await unlink(`${cachePath}.lock`); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    const message = error instanceof Error && /^[a-z_]+(?:: [a-zA-Z ;]+)?$/.test(error.message) ? error.message : 'invalid_arguments_or_local_io_error';
    console.error(JSON.stringify({ status: 'failed', error: message })); process.exitCode = 1;
  });
}
