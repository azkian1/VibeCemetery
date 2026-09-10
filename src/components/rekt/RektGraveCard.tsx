'use client';

import StoneButton from '@/components/ui/StoneButton';
import OrnamentDivider from '@/components/ui/OrnamentDivider';
import { RektMemorialContent, type RektMemorialData } from './RektMemorial';
import styles from './RektFlow.module.css';

interface RektGraveCardProps {
  data: RektMemorialData;
  respects: number;
  voted?: boolean;
  onRespect?: () => void;
  onBurn?: () => void;
  onShare?: () => void;
  onFind?: () => void;
  status?: string;
}

// Actions are provided by the host; the card never makes requests or opens wallets.
export default function RektGraveCard({ data, respects, voted = false, onRespect, onBurn, onShare, onFind, status }: RektGraveCardProps) {
  return <article className={styles.graveCard} aria-label="REKT memorial">
    <div className={`${styles.stone} ${styles.graveInscription}`}>
      <RektMemorialContent data={data} buried />
    </div>
    <div className={styles.graveFooter}>
      <OrnamentDivider />
      <div className={styles.respects} aria-live="polite" aria-atomic="true">
        <span>Respects</span><strong>{respects.toLocaleString('en-US')}</strong>
      </div>
      <div className={styles.graveBurn}>
        <StoneButton onClick={() => onBurn?.()} disabled={!onBurn}>Burn GRAVE</StoneButton>
      </div>
      <div className={styles.graveActions}>
        <StoneButton onClick={() => onRespect?.()} disabled={voted || !onRespect} active={voted} aria-pressed={voted}>{voted ? 'F ✓' : 'Press F'}</StoneButton>
        <StoneButton onClick={() => onShare?.()} disabled={!onShare}>Share Grave</StoneButton>
        <StoneButton onClick={() => onFind?.()} disabled={!onFind}>Find on Map</StoneButton>
      </div>
      {status && <p className={styles.graveStatus} role="status">{status}</p>}
    </div>
  </article>;
}
