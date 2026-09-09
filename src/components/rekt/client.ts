import type { RektAdapter } from './contracts';
import { isWalletAddress } from './contracts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'This service is unavailable. Please try again later.');
  }
  return response.json() as Promise<T>;
}
type WalletProvider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
function wallet(): WalletProvider {
  const provider = (window as unknown as { ethereum?: WalletProvider }).ethereum;
  if (!provider) throw new Error('No browser wallet found. You can still enter an address to scan.');
  return provider;
}
async function connect(): Promise<string> {
  try {
    const accounts = await wallet().request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || !isWalletAddress(accounts[0] ?? '')) throw new Error('No wallet address was returned.');
    return accounts[0];
  } catch (error) {
    if ((error as { code?: number }).code === 4001) throw new Error('Wallet connection cancelled. Your results are still here.');
    throw error;
  }
}

// Auth and creation are deliberately unavailable until their server blocks land.
// Replace verify with the reviewed wallet-auth adapter, not a client-side verified flag.
export const rektClient: RektAdapter = {
  capabilities: signal => request('/api/rekt/capabilities', { signal }),
  connect,
  scan: (address, networks, requestId, signal) => request('/api/rekt/scans', { method: 'POST', signal, body: JSON.stringify({ address, networks, requestId }) }),
  readScan: (id, signal, cursor) => request(`/api/rekt/scans/${encodeURIComponent(id)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
  verify: async () => { throw new Error('Wallet verification is not available yet. Your scan results are preserved.'); },
  bury: async () => { throw new Error('REKT burial is not available yet. No grave has been created.'); },
};
