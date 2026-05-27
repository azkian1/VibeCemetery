'use client';

import type { DeadRepo } from '@/types/game';

const DEATH_CAUSES = [
  'Developer lost interest',
  'Zero users',
  'Claude refused to help',
  'Ran out of API credits',
  'Found the same project on ProductHunt',
  'Cursor broke the entire codebase',
  'Token never took off',
  'Developer burned out on day 3',
  'Too ambitious for one evening',
  'Deploy never happened',
  'Only worked on localhost',
  'README longer than the code',
  'Stack went obsolete during development',
];

interface StepCauseProps {
  repos: DeadRepo[];
  selected: Set<number>;
  graveSet: Set<number>;
  causes: Map<number, string>;
  onSetCause: (id: number, cause: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
  burialOnly?: boolean;
}

export default function StepCause({
  repos,
  selected,
  graveSet,
  causes,
  onSetCause,
  onSubmit,
  onBack,
  loading,
  burialOnly = false,
}: StepCauseProps) {
  const selectedRepos = repos.filter((r) => selected.has(r.id));
  const graveCount = burialOnly ? selectedRepos.length : [...selected].filter(id => graveSet.has(id)).length;
  const cremateCount = burialOnly ? 0 : selected.size - graveCount;
  
  const getButtonText = () => {
    if (loading) {
      if (graveCount > 0 && cremateCount > 0) return 'Processing...';
      if (graveCount > 0) return 'Burying...';
      return 'Cremating...';
    }
    if (graveCount > 0 && cremateCount > 0) {
      return `Bury ${graveCount} & Cremate ${cremateCount}`;
    }
    if (graveCount > 0) {
      return `Bury ${graveCount} project${graveCount !== 1 ? 's' : ''}`;
    }
    return `Cremate ${cremateCount} project${cremateCount !== 1 ? 's' : ''}`;
  };

  return (
    <div>
      <div
        style={{
          maxHeight: 300,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {selectedRepos.map((repo) => {
          const current = causes.get(repo.id) ?? DEATH_CAUSES[0];
          const isCustom = !DEATH_CAUSES.includes(current);

          return (
            <div key={repo.id} style={{ borderBottom: '1px solid rgba(58, 57, 53, 0.5)', paddingBottom: 8 }}>
              <p style={{ color: '#aaa9a0', fontSize: 13, margin: '0 0 4px' }}>
                <strong>{repo.name}</strong>
              </p>
              <select
                aria-label={`Cause of death for ${repo.name}`}
                value={isCustom ? '__custom__' : current}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    onSetCause(repo.id, '');
                  } else {
                    onSetCause(repo.id, e.target.value);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  background: '#22211f',
                  border: '1px solid #3a3530',
                  borderRadius: 2,
                  color: '#aaa9a0',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  marginBottom: 4,
                }}
              >
                {DEATH_CAUSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="__custom__">Custom...</option>
              </select>
              {isCustom && (
                <input
                  type="text"
                  aria-label={`Custom cause of death for ${repo.name}`}
                  value={current}
                  placeholder="Custom cause of death..."
                  maxLength={100}
                  onChange={(e) => onSetCause(repo.id, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    background: '#22211f',
                    border: '1px solid #3a3530',
                    borderRadius: 2,
                    color: '#aaa9a0',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <button
          onClick={onBack}
          disabled={loading}
          style={{
            padding: '8px 16px',
            border: '1px solid #3a3530',
            borderRadius: 2,
            background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
            color: '#6a6960',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          style={{
            padding: '8px 24px',
            border: '1px solid #3a3530',
            borderRadius: 2,
            background: loading
              ? 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)'
              : 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)',
            color: loading ? '#4a4944' : '#e8d5a3',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        >
          {getButtonText()}
        </button>
      </div>
      <p style={{ color: '#6a6960', fontSize: 12, lineHeight: 1.5, margin: '12px 0 0', textAlign: 'center' }}>
        {burialOnly
          ? 'Buried projects appear on the cemetery map. One project, one grave.'
          : 'Buried projects appear on the cemetery map. Cremated projects go to the Crematory.'}
      </p>
    </div>
  );
}
