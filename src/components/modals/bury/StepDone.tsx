'use client';

import type { BuryResult } from '@/types/game';
import { LOCAL_TERMINAL_CREMATION_COPY } from './StepScan';

interface StepDoneProps {
  results: BuryResult[];
  total: number;
  done: number;
  burying: boolean;
  onClose: () => void;
  onOpenSkill?: () => void;
  onOpenProfile?: () => void;
  onOpenUrn?: (cremated: NonNullable<BuryResult['cremated']>) => void;
}

export function getStepDonePrimaryAction(results: BuryResult[]): 'urn' | 'profile' | null {
  if (results.some((r) => r.success && r.type === 'grave')) return 'profile';
  if (results.some((r) => r.success && r.type === 'cremated' && r.cremated)) return 'urn';
  return null;
}

export default function StepDone({
  results,
  total,
  done,
  burying,
  onClose,
  onOpenSkill,
  onOpenProfile,
  onOpenUrn,
}: StepDoneProps) {

  const graves = results.filter((r) => r.success && r.type === 'grave');
  const cremated = results.filter((r) => r.success && r.type === 'cremated');
  const failures = results.filter((r) => !r.success);
  const anySuccess = graves.length > 0 || cremated.length > 0;
  const allFailed = failures.length > 0 && !anySuccess;
  const primaryAction = getStepDonePrimaryAction(results);
  const firstCrematedRecord = cremated.find((r) => r.cremated)?.cremated;

  if (burying) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <p style={{ color: '#6a6960', fontSize: 14 }}>
          {done}/{total} processed
        </p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      {allFailed ? (
        <p style={{ color: '#b86858', fontSize: 15, margin: '0 0 12px' }}>
          The dead will have to wait.
        </p>
      ) : graves.length > 0 ? (
        <p style={{ color: '#e8d5a3', fontSize: 18, margin: '0 0 12px' }}>
          Rest in peace
        </p>
      ) : null}

      {graves.length > 0 && (
        <div style={{ marginBottom: 8, textAlign: 'left' }}>
          <p style={{ color: '#e8d5a3', fontSize: 13, margin: '0 0 4px' }}>&#x26B0; Buried:</p>
          {graves.map((r, i) => (
            <p key={`${r.name}-${i}`} style={{ color: '#8a8980', fontSize: 13, margin: '2px 0', paddingLeft: 12 }}>
              {r.name}
            </p>
          ))}
        </div>
      )}

      {cremated.length > 0 && (
        <div style={{ marginBottom: 8, textAlign: 'center' }}>
          <p style={{ color: '#b86858', fontSize: 13, margin: '0 0 4px' }}>&#x1F525; Cremated:</p>
          {cremated.map((r, i) => (
            <p key={`${r.name}-${i}`} style={{ color: '#8a8980', fontSize: 13, margin: '2px 0' }}>
              {r.name}{r.error ? ` — ${r.error}` : ' — cremation recorded'}
            </p>
          ))}
        </div>
      )}

      {failures.length > 0 && (
        <div style={{ marginBottom: 12, textAlign: 'left' }}>
          <p style={{ color: '#b86858', fontSize: 13, margin: '8px 0 4px' }}>
            {failures.length} skipped:
          </p>
          {failures.map((r, i) => (
            <p key={`${r.name}-${i}`} style={{ color: '#6a6960', fontSize: 12, margin: '2px 0' }}>
              {r.name} — {r.error}
            </p>
          ))}
        </div>
      )}

      {cremated.length > 0 && onOpenSkill && (
        <button
          onClick={onOpenSkill}
          aria-label="Open instructions for AI agents"
          style={{
            color: '#7898b8',
            fontSize: 13,
            cursor: 'pointer',
            textDecoration: 'none',
            margin: '12px 0 0',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid rgba(120,152,184,0.3)',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          {LOCAL_TERMINAL_CREMATION_COPY}
        </button>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
        {primaryAction === 'urn' && firstCrematedRecord && onOpenUrn && (
          <button
            onClick={() => onOpenUrn(firstCrematedRecord)}
            style={{
              padding: '8px 24px',
              border: '1px solid #3a3530',
              borderRadius: 2,
              background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
              color: '#aaa9a0',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          >
            View Urn
          </button>
        )}
        {primaryAction === 'profile' && onOpenProfile && (
          <button
            onClick={onOpenProfile}
            style={{
              padding: '8px 24px',
              border: '1px solid #3a3530',
              borderRadius: 2,
              background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
              color: '#aaa9a0',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          >
            View Profile
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            padding: '8px 24px',
            border: '1px solid #3a3530',
            borderRadius: 2,
            background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
            color: '#aaa9a0',
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
