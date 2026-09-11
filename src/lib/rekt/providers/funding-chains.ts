import { scanChain, BASE_USDC } from './chains.ts';

export interface FundingChain { id: number; name: string; rpcUrl: string; cashTokens: Record<string, string> }
// Versioned policy: symbols are display labels only, never evidence of token identity.
export const FUNDING_POLICY = 'first_funding_source_v2';
export const MIN_FUNDING_USD = '10';
export const FUNDING_CHAIN_IDS = [8453, 4663, 56, 1] as const;
export function fundingChains(): FundingChain[] {
  return [
    { ...scanChain('base')!, cashTokens: { [BASE_USDC]: 'USDC' } },
    { ...scanChain('robinhood')!, cashTokens: { '0x5fc5360d0400a0fd4f2af552add042d716f1d168': 'USDG' } },
    { id: 56, name: 'bnb', rpcUrl: process.env.REKT_BNB_RPC_URL ?? 'https://bsc.drpc.org',
      cashTokens: { '0x55d398326f99059ff775485246999027b3197955': 'Binance-Peg BSC-USD',
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'Binance-Peg USDC' } },
    { id: 1, name: 'ethereum', rpcUrl: process.env.REKT_ETHEREUM_RPC_URL ?? 'https://eth.drpc.org',
      cashTokens: { '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC', '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT' } },
  ];
}

export function fundingTokenDecimals(chainId: number, token: string): number | undefined {
  if (!fundingChains().find(c => c.id === chainId)?.cashTokens[token]) return undefined;
  return chainId === 56 ? 18 : 6;
}
