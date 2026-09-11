export interface ScanChain { id: number; name: string; rpcUrl: string; defaultSource: 'uniswap-v3' | 'relay' }

export function alchemyUrl(name: string): string | undefined {
  const network = name === 'base' ? 'base-mainnet' : name === 'robinhood' ? 'robinhood-mainnet' : undefined;
  const key = process.env.REKT_ALCHEMY_API_KEY;
  if (!network) return undefined;
  const explicit = process.env[`REKT_${name.toUpperCase()}_INDEXER_URL`];
  if (explicit) return explicit;
  if (key) return `https://${network}.g.alchemy.com/v2/${encodeURIComponent(key)}`;
  const rpc = process.env[`REKT_${name.toUpperCase()}_RPC_URL`] ?? (name === 'base' ? process.env.BASE_RPC_URL : undefined);
  if (rpc) { try { if (new URL(rpc).hostname === `${network}.g.alchemy.com`) return rpc; } catch { /* Validated by Rpc. */ } }
  return undefined;
}

export function scanChain(name: string): ScanChain | undefined {
  if (name === 'base') return { id: 8453, name, defaultSource: 'uniswap-v3',
    rpcUrl: process.env.REKT_BASE_RPC_URL ?? process.env.BASE_RPC_URL ?? alchemyUrl(name) ?? 'https://mainnet.base.org' };
  if (name === 'robinhood') return { id: 4663, name, defaultSource: 'relay',
    rpcUrl: process.env.REKT_ROBINHOOD_RPC_URL ?? alchemyUrl(name) ?? 'https://rpc.mainnet.chain.robinhood.com' };
}

export const SOLANA_RELAY_CHAIN_ID = 792703809;
export const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

// EVM addresses are case-insensitive; Solana addresses and signatures are not.
export function sameAddress(a: string, b: string, chainId: number): boolean {
  return chainId === SOLANA_RELAY_CHAIN_ID ? a === b : a.toLowerCase() === b.toLowerCase();
}
