'use client';

import { shortAddress, usd } from './contracts';
import StoneButton from '@/components/ui/StoneButton';
import styles from './RektFlow.module.css';

// Supplied by the canonical account service when wallet identity and quotas land.
export interface RektAccountView {
  displayName: string;
  code: { used: number; limit: number };
  rekt: { used: number; limit: number };
  bonus: 'code' | 'rekt' | null;
  wallets: { address: string; network: string; verified: boolean }[];
  graves: { id: string; token: string; network: string; lossUsd: string; epitaph: string }[];
}
export default function RektAccountPanel({ data, loading = false, error, onRetry, onScan }: {
  data?: RektAccountView; loading?: boolean; error?: string; onRetry?: () => void; onScan: () => void;
}) {
  return <section className={styles.body} aria-label="REKT account" style={{ padding: '20px 0' }}>
    <span className={styles.eyebrow}>REKT / Your ledger</span>
    {loading ? <p role="status">Loading your REKT records…</p> : error ? <div className={styles.error} role="alert">{error}{onRetry && <StoneButton onClick={onRetry}>Retry</StoneButton>}</div> : !data ? <p>Wallet scanning and REKT account records are not available yet.</p> : <>
      <h3>{data.displayName}</h3>
      <dl className={styles.facts}><div><dt>Code slots used</dt><dd>{data.code.used} / {data.code.limit}</dd></div><div><dt>REKT slots used</dt><dd>{data.rekt.used} / {data.rekt.limit}</dd></div></dl>
      <p className={styles.meta}>{data.bonus ? `Your one-time sharing bonus belongs to ${data.bonus === 'code' ? 'Code' : 'REKT'}.` : 'No sharing bonus recorded.'}</p>
      <h3>Linked wallets</h3>
      {data.wallets.length ? data.wallets.map(wallet => <p key={`${wallet.network}:${wallet.address}`} className={styles.meta}><span title={wallet.address}>{shortAddress(wallet.address)}</span> · {wallet.network} · {wallet.verified ? 'Verified' : 'Not verified'}</p>) : <p>No linked wallets yet.</p>}
      <h3>Your REKT memorials</h3>
      {data.graves.length ? data.graves.map(grave => <article key={grave.id} className={styles.card}><a href={`/grave/${encodeURIComponent(grave.id)}`}>{grave.token} · {usd(grave.lossUsd)}</a><p className={styles.meta}>{grave.network} · Realized loss</p><p>{grave.epitaph}</p></article>) : <p>No trading losses laid to rest yet.</p>}
    </>}
    <StoneButton onClick={onScan}>Scan Wallet</StoneButton>
  </section>;
}
