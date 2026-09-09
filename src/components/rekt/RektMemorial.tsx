import type { RektCandidate } from './contracts';
import { shortAddress, usd } from './contracts';
import { positionDate } from './RektCandidateCard';
import styles from './RektFlow.module.css';

export interface RektMemorialView {
  candidate: RektCandidate;
  epitaph: string;
}

export default function RektMemorial({ candidate, epitaph }: RektMemorialView) {
  return <article className={styles.stone} aria-label="REKT memorial">
    <span className={styles.eyebrow}>REKT · {candidate.network === 'base' ? 'Base' : 'Robinhood Chain'}</span>
    <h3>${candidate.token.replace(/^\$/, '')}</h3>
    <p className={styles.memorialLead}>Here lie my</p>
    <strong className={styles.amount}>−{usd(candidate.lossUsd)}</strong>
    <p className={styles.meta}>{positionDate(candidate.openedAt)} — {positionDate(candidate.closedAt)}</p>
    <blockquote>“{epitaph}”</blockquote>
    <p className={styles.meta}>{shortAddress(candidate.wallet)}</p>
  </article>;
}
