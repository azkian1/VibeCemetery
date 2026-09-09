import { usd, type RektCandidate } from './contracts';
import styles from './RektFlow.module.css';

export function positionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export default function RektCandidateCard({ candidate: c, selectable = false, selected = false, onSelect }: {
  candidate: RektCandidate; selectable?: boolean; selected?: boolean; onSelect?: () => void;
}) {
  return <article className={styles.card} data-selected={selected}>
    <div className={styles.cardTop}><div><span className={styles.eyebrow}>REKT · {c.network === 'base' ? 'Base' : 'Robinhood Chain'}</span><h3>{selectable && c.eligibility === 'eligible' ? <label className={styles.candidateChoice}><input type="radio" name="rekt-candidate" checked={selected} onChange={onSelect} aria-label={`Bury this loss: ${c.token}`} />{c.token}</label> : c.token}</h3></div><div><strong className={styles.amount}>−{usd(c.lossUsd)}</strong><div className={styles.meta}>{c.lossPercent}% of cost · USD estimate</div></div></div>
    <dl className={styles.facts}>
      <div><dt>Cost</dt><dd>{usd(c.costUsd)}</dd></div><div><dt>Returned</dt><dd>{usd(c.proceedsUsd)}</dd></div>

    </dl>
    <p className={styles.meta}>{positionDate(c.openedAt)} — {positionDate(c.closedAt)}</p>
    {c.eligibility === 'already_buried' && (c.graveId ? <a href={`/grave/${encodeURIComponent(c.graveId)}`}>Already buried ↗</a> : <p>Already buried</p>)}
    {c.eligibility === 'ineligible' && <p className={styles.meta}>{c.explanation || 'This history cannot be buried.'}</p>}
  </article>;
}
