import type { Price } from '../scanner/types.ts';
import { decimal } from '../scanner/decimal.ts';
import { Transport } from './rpc.ts';
import { fundingTokenDecimals } from './funding-chains.ts';
import { quoteAssets } from './deployments.ts';

export const BASE_QUOTES: Record<string, { symbol: string; decimals: number }> = {
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
};

export class HistoricalPrices {
  private transport: Transport;
  private cache: Record<string, Price>;
  private chainId: number;
  constructor(transport: Transport, cache: Record<string, Price> = {}, chainId = 8453) { this.transport = transport; this.cache = cache; this.chainId = chainId; }
  async get(token: string, timestamp: number): Promise<Price | undefined> {
    const asset = quoteAssets(this.chainId)[token];
    if (!asset) return undefined;
    const key = asset.priceKey;
    const cacheKey = `${key}:${timestamp}`;
    if (this.cache[cacheKey]) return this.cache[cacheKey];
    const response = await this.transport.json(`https://coins.llama.fi/prices/historical/${timestamp}/${key}?searchWidth=1h`) as {
      coins?: Record<string, { price?: string; timestamp?: string; confidence?: string }>;
    };
    if (!response.coins || typeof response.coins !== 'object') throw new Error('invalid_price_response');
    const item = response.coins[key];
    if (!item) return undefined;
    const usd = item.price ?? '';
    const confidence = Number(item.confidence);
    const priceTimestamp = Number(item.timestamp);
    if (!/^\d+(?:\.\d{1,36})?$/.test(usd) || decimal(usd) <= 0n || !Number.isFinite(confidence) || confidence < 0.9 || confidence > 1
      || !Number.isSafeInteger(priceTimestamp) || Math.abs(timestamp - priceTimestamp) > 3600) return undefined;
    return this.cache[cacheKey] = { usd, timestamp: priceTimestamp, confidence, source: `defillama:historical:${key.split(':')[0]}` };
  }
}

// Funding uses each token's own historical market price, including stablecoin
// depegs. Missing coverage is never replaced with an assumed one-dollar price.
export class HistoricalFundingPrices {
  private transport: Transport;
  private cache: Record<string, Price>;
  constructor(transport: Transport, cache: Record<string, Price> = {}) { this.transport = transport; this.cache = cache; }
  async get(chainId: number, token: string, timestamp: number): Promise<Price | undefined> {
    const chains: Record<number, string> = { 8453: 'base', 4663: 'robinhood', 56: 'bsc', 1: 'ethereum' };
    if (fundingTokenDecimals(chainId, token) === undefined) return undefined;
    const key = `${chains[chainId]}:${token}`, cacheKey = `${key}:${timestamp}`;
    if (this.cache[cacheKey]) return this.cache[cacheKey];
    const response = await this.transport.json(`https://coins.llama.fi/prices/historical/${timestamp}/${key}?searchWidth=1h`) as {
      coins?: Record<string, { price?: string; timestamp?: string; confidence?: string }>;
    };
    if (!response.coins || typeof response.coins !== 'object') throw new Error('invalid_price_response');
    const item = response.coins[key];
    if (!item) return undefined;
    const usd = item.price ?? '', confidence = Number(item.confidence), priceTimestamp = Number(item.timestamp);
    if (!/^\d+(?:\.\d{1,36})?$/.test(usd) || decimal(usd) <= 0n || !Number.isFinite(confidence) || confidence < 0.9 || confidence > 1
      || !Number.isSafeInteger(priceTimestamp) || Math.abs(timestamp - priceTimestamp) > 3600) return undefined;
    return this.cache[cacheKey] = { usd, timestamp: priceTimestamp, confidence, source: `defillama:historical:${chains[chainId]}` };
  }
}
