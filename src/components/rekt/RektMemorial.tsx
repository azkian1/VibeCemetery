import type { RektCandidate } from './contracts';
import { shortAddress, usd } from './contracts';
import { positionDate } from './RektCandidateCard';
import styles from './RektFlow.module.css';

export interface RektMemorialView {
  candidate: RektCandidate;
  epitaph: string;
}

// Public presentation accepts a shortened label, never a private scan or proof.
export interface RektMemorialData extends Pick<RektCandidate, 'network' | 'token' | 'lossUsd' | 'openedAt' | 'closedAt'> {
  walletLabel: string;
  epitaph: string;
}

export function memorialData({ candidate, epitaph }: RektMemorialView): RektMemorialData {
  return { network: candidate.network, token: candidate.token, lossUsd: candidate.lossUsd,
    openedAt: candidate.openedAt, closedAt: candidate.closedAt, walletLabel: shortAddress(candidate.wallet), epitaph };
}

export function RektMemorialContent({ data, buried = false }: { data: RektMemorialData; buried?: boolean }) {
  return <>
    <span className={styles.eyebrow}>REKT · {data.network === 'base' ? 'Base' : 'Robinhood Chain'}</span>
    <h3>${data.token.replace(/^\$/, '')}</h3>
    <p className={styles.memorialLead}>Here lie my</p>
    <strong className={styles.amount}>−{usd(data.lossUsd)}</strong>
    <p className={styles.meta}>{positionDate(data.openedAt)} — {positionDate(data.closedAt)}</p>
    <blockquote>“{data.epitaph}”</blockquote>
    <p className={styles.meta}>{buried && 'Buried by '}{data.walletLabel}</p>
  </>;
}

export default function RektMemorial({ candidate, epitaph }: RektMemorialView) {
  return <article className={styles.stone} aria-label="REKT memorial">
    <RektMemorialContent data={memorialData({ candidate, epitaph })} />
  </article>;
}
