import type { GraveData } from '@/types/game';

// UI integration contract. Scanner research types remain independent.
export type RektNetwork = 'base' | 'robinhood';
export type RektStep = 'scan' | 'review' | 'verify' | 'select' | 'epitaph' | 'preview' | 'done';
export interface RektCapabilities {
  networks: { id: RektNetwork; name: string; available: boolean; reason?: string }[];
  verificationAvailable: boolean;
  creationAvailable: boolean;
}
export interface RektCandidate {
  id: string;
  network: RektNetwork;
  token: string;
  tokenAddress: string;
  wallet: string;
  lossUsd: string;
  lossPercent: string;
  costUsd: string;
  proceedsUsd: string;
  openedAt: string;
  closedAt: string;
  tradeCount: number;
  proof: { label: string; url: string }[];
  eligibility: 'eligible' | 'already_buried' | 'ineligible';
  graveId?: string;
  explanation?: string;
}
export interface RektScan {
  id: string;
  status: 'queued' | 'reading' | 'calculating' | 'complete' | 'partial' | 'failed' | 'expired';
  candidates: RektCandidate[];
  coverage: string;
  message?: string;
  nextCursor?: string | null;
  expiresAt: string;
}
export interface RektVerification {
  scanId: string;
  wallet: string;
  method: 'direct' | 'first_funding';
  availableSlots: number;
}
export interface RektBurialInput {
  candidateId: string;
  epitaph: string;
  reasonCode?: string;
  customReason?: string;
  idempotencyKey: string;
}
export interface RektAdapter {
  capabilities(signal: AbortSignal): Promise<RektCapabilities>;
  connect(): Promise<string>;
  scan(address: string, networks: RektNetwork[], requestId: string, signal: AbortSignal): Promise<RektScan>;
  readScan(id: string, signal: AbortSignal, cursor?: string): Promise<RektScan>;
  verify(scanId: string): Promise<RektVerification>;
  bury(input: RektBurialInput): Promise<{ grave: GraveData }>;
}

export const UNAVAILABLE_REKT: RektCapabilities = {
  networks: [
    { id: 'base', name: 'Base', available: false, reason: 'Scanning is not available yet.' },
    { id: 'robinhood', name: 'Robinhood Chain', available: false, reason: 'Scanning is not available yet.' },
  ],
  verificationAvailable: false,
  creationAvailable: false,
};

export const isWalletAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value.trim());
export const shortAddress = (value: string) => value.length > 16 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
// Decimal strings never pass through Number, including values above MAX_SAFE_INTEGER.
export function usd(value: string): string {
  if (!/^\d+(\.\d+)?$/.test(value)) return 'Unavailable';
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)) + (Number(fraction[2] || 0) >= 5 ? 1n : 0n);
  return `$${(cents / 100n).toLocaleString('en-US')}.${(cents % 100n).toString().padStart(2, '0')}`;
}
export function compareDecimal(a: string, b: string): number {
  if (!/^\d+(\.\d+)?$/.test(a) || !/^\d+(\.\d+)?$/.test(b)) return 0;
  const [ai, af = ''] = a.split('.'), [bi, bf = ''] = b.split('.');
  if (BigInt(ai) !== BigInt(bi)) return BigInt(ai) > BigInt(bi) ? 1 : -1;
  return af.padEnd(Math.max(af.length, bf.length), '0').localeCompare(bf.padEnd(Math.max(af.length, bf.length), '0'));
}
export function safeProofUrl(value: string): string | undefined {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}
