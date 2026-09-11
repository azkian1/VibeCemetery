import type { Evidence, Trade } from "../../src/lib/rekt/scanner/types.ts";

const address = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
export function fixture(returnUsd = '700'): Evidence {
  const t = (n: number, buy: boolean): Trade => ({
    kind: buy ? 'buy' : 'sell', token: address(2), txHash: hash(n), blockNumber: String(n), blockHash: hash(n + 10),
    timestamp: 1700000000 + n * 100, transactionIndex: 0, eventIds: [`${hash(n)}:1`, `${hash(n)}:2`],
    deltaRaw: buy ? '1000000000000000000000000000000' : '-1000000000000000000000000000000',
    balanceBeforeRaw: buy ? '0' : '1000000000000000000000000000000', balanceAfterRaw: buy ? '1000000000000000000000000000000' : '0',
    pool: address(4), quote: { token: address(3), amountRaw: buy ? '1000' : returnUsd.replace('.', ''), decimals: buy ? 0 : (returnUsd.split('.')[1]?.length ?? 0),
      price: { usd: '1', timestamp: 1700000000 + n * 100, confidence: 0.99, source: 'test_historical_price' }, poolReserveRaw: buy ? '1000000' : '1000000' + '0'.repeat(returnUsd.split('.')[1]?.length ?? 0) },
  });
  return { schemaVersion: 1, chainId: 8453, wallet: address(1), fromBlock: '1', toBlock: '100', toBlockHash: hash(100), snapshotTimestamp: 1700001000, historyComplete: true, snapshotBalances: { [address(2)]: '0' }, trades: [t(1, true), t(2, false)] };
}
