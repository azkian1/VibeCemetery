export interface Price {
  usd: string;
  timestamp: number;
  confidence: number;
  source: string;
}

export interface Trade {
  kind: 'buy' | 'sell' | 'unsupported';
  reason?: string;
  token: string;
  txHash: string;
  blockNumber: string;
  blockHash: string;
  timestamp: number;
  transactionIndex: number;
  eventIds: string[];
  deltaRaw: string;
  balanceBeforeRaw: string;
  balanceAfterRaw: string;
  quote?: { token: string; amountRaw: string; decimals: number; price: Price; poolReserveRaw: string };
  pool?: string;
}

export interface Evidence {
  schemaVersion: 1;
  chainId: number;
  wallet: string;
  fromBlock: string;
  toBlock: string;
  toBlockHash: string;
  snapshotTimestamp: number;
  historyComplete: boolean;
  snapshotBalances: Record<string, string>;
  trades: Trade[];
}

export interface Candidate {
  id: string;
  chainId: number;
  wallet: string;
  token: string;
  openedAt: number;
  closedAt: number;
  costUsd: string;
  returnedUsd: string;
  lossUsd: string;
  lossPercent: string;
  eventIds: string[];
  txHashes: string[];
  analyzerVersion: string;
  status: 'eligible';
  gasIncluded: false;
  valuation: 'historical_usd_estimate';
  proof: Trade[];
}

export interface Exclusion { token: string; reason: string; txHash?: string }
export interface Analysis { candidates: Candidate[]; exclusions: Exclusion[] }
