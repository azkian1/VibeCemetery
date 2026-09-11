import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, parseAbiParameters, encodeEventTopics, parseAbiItem, decodeFunctionData, parseAbi } from 'viem';
import type { Hex, Abi } from 'viem';
import { UniswapV3Decoder, transfer } from '../../src/lib/rekt/providers/uniswap-v3.ts';
import { HistoricalPrices } from '../../src/lib/rekt/providers/prices.ts';
import { Rpc, Transport } from '../../src/lib/rekt/providers/rpc.ts';
import type { RpcLog, RpcReceipt } from '../../src/lib/rekt/providers/rpc.ts';

const a = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Hex;
const h = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const wallet = a(1), token = a(2), pool = a(4), quote = '0x4200000000000000000000000000000000000006';
const factory = '0x33128a8fc17869897dce68ed026d694621f6fdfd';
const transferAbi = parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
const swapAbi = parseAbiItem('event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)');
const callAbi = parseAbi(['function balanceOf(address) view returns(uint256)', 'function token0() view returns(address)', 'function token1() view returns(address)', 'function fee() view returns(uint24)', 'function factory() view returns(address)', 'function getPool(address,address,uint24) view returns(address)']);

function setup(change?: (receipt: RpcReceipt) => void, wrongPool = false, native = false) {
  const rawQuote = 1000n * 10n ** 18n;
  function log(contract: Hex, topics: readonly (Hex | readonly Hex[] | null)[], data: Hex, n: number): RpcLog {
    return { address: contract, topics: topics as string[], data, logIndex: `0x${n}`, blockNumber: '0x2', blockHash: h(12), transactionHash: h(2), transactionIndex: '0x0' };
  }
  const logs = [
    log(quote, encodeEventTopics({ abi: [transferAbi], args: { from: wallet, to: pool } }), encodeAbiParameters(parseAbiParameters('uint256'), [rawQuote]), 1),
    log(token, encodeEventTopics({ abi: [transferAbi], args: { from: pool, to: wallet } }), encodeAbiParameters(parseAbiParameters('uint256'), [100n]), 2),
    log(pool, encodeEventTopics({ abi: [swapAbi], args: { sender: wallet, recipient: wallet } }), encodeAbiParameters(parseAbiParameters('int256,int256,uint160,uint128,int24'), [-100n, rawQuote, 1n, 10000n, 0]), 3),
  ];
  const receipt: RpcReceipt = { status: '0x1', blockNumber: '0x2', blockHash: h(12), transactionHash: h(2), transactionIndex: '0x0', from: wallet, to: a(5), logs };
  change?.(receipt);
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).includes('coins.llama.fi')) return Response.json({ coins: { [`base:${quote}`]: { price: '1', timestamp: 1700000000, confidence: 0.99 } } });
    const body = JSON.parse(String(init!.body));
    let result: unknown;
    switch (body.method) {
      case 'eth_getTransactionReceipt': result = receipt; break;
      case 'eth_getBlockByNumber': result = { number: '0x2', hash: h(12), timestamp: '0x6553f100' }; break;
      case 'eth_getTransactionByHash': result = { from: wallet, to: a(5), value: native ? '0x1' : '0x0', hash: h(2), blockHash: h(12) }; break;
      case 'eth_call': {
        const decoded = decodeFunctionData({ abi: callAbi as Abi, data: body.params[0].data });
        const args = decoded.args as string[];
        switch (decoded.functionName) {
          case 'balanceOf': result = encodeAbiParameters(parseAbiParameters('uint256'), [args[0].toLowerCase() === pool ? 20000n * 10n ** 18n : body.params[1] === '0x1' ? 0n : 100n]); break;
          case 'token0': result = encodeAbiParameters(parseAbiParameters('address'), [token]); break;
          case 'token1': result = encodeAbiParameters(parseAbiParameters('address'), [quote]); break;
          case 'factory': result = encodeAbiParameters(parseAbiParameters('address'), [factory]); break;
          case 'fee': result = encodeAbiParameters(parseAbiParameters('uint24'), [3000]); break;
          case 'getPool': result = encodeAbiParameters(parseAbiParameters('address'), [wrongPool ? a(999) : pool]); break;
          default: throw new Error('unexpected_contract_call');
        }
        break;
      }
      default: throw new Error('unexpected_rpc_call');
    }
    return Response.json({ result });
  };
  const transport = new Transport({ fetch: fetcher, wait: async () => {}, retries: 0 });
  return { decoder: new UniswapV3Decoder(new Rpc('https://rpc.invalid', transport), new HistoricalPrices(transport)), receipt,
    expected: receipt.logs.filter(l => { const t = transfer(l); return t && (t.from === wallet || t.to === wallet); }) };
}

test('verified V3 buy derives wallet amounts, historical USD and both proof legs', async () => {
  const s = setup(); const [trade] = await s.decoder.decode(wallet, h(2), s.expected, new Set());
  assert.equal(trade.kind, 'buy'); assert.equal(trade.deltaRaw, '100'); assert.equal(trade.quote!.amountRaw, '1000000000000000000000');
  assert.equal(trade.quote!.price.usd, '1'); assert.equal(trade.balanceAfterRaw, '100'); assert.equal(trade.eventIds.length, 2);
});
test('contract spoofing factory() does not pass getPool verification', async () => {
  const s = setup(undefined, true); const [trade] = await s.decoder.decode(wallet, h(2), s.expected, new Set()); assert.equal(trade.reason, 'unverified_pool');
});
test('transfer tax or mixed wallet amounts rejected', async () => {
  const s = setup(r => { r.logs[1].data = encodeAbiParameters(parseAbiParameters('uint256'), [99n]); });
  const [trade] = await s.decoder.decode(wallet, h(2), s.expected, new Set()); assert.equal(trade.kind, 'unsupported'); assert.equal(trade.reason, 'nonstandard_or_mixed_flows');
});
test('native value is not silently treated as a WETH transfer', async () => {
  const s = setup(undefined, false, true); const [trade] = await s.decoder.decode(wallet, h(2), s.expected, new Set()); assert.equal(trade.reason, 'native_eth_requires_trace_adapter');
});
test('multiple same-token transactions in a block cannot use block balances as tx balances', async () => {
  const s = setup(); const [trade] = await s.decoder.decode(wallet, h(2), s.expected, new Set([`${token}:0x2`])); assert.equal(trade.reason, 'multiple_token_transactions_in_block');
});
test('missing indexed transfer fails the scan instead of reducing the cost basis', async () => {
  const s = setup(); await assert.rejects(s.decoder.decode(wallet, h(2), s.expected.slice(1), new Set()), /receipt_history_mismatch/);
});
test('changed block hash is a reorg failure', async () => {
  const s = setup(r => { r.blockHash = h(999); }); await assert.rejects(s.decoder.decode(wallet, h(2), s.expected, new Set()), /reorg_detected/);
});
