'use client';

import type { DeadRepo } from '@/types/game';

interface StepSelectProps {
  repos: DeadRepo[];
  selected: Set<number>;
  graveSet: Set<number>;
  availableSlots: number;
  slotsUnlocked: number;
  dailyCremationsLeft: number;
  singleSelection?: boolean;
  cremationOnly?: boolean;
  burialOnly?: boolean;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onToggleGrave: (id: number) => void;
  onNext: () => void;
  onBack: () => void;
}

function monthsAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
  if (months < 1) return 'recently';
  return `${months} month${months !== 1 ? 's' : ''} ago`;
}

export function shouldShowStepSelectActionToggles(cremationOnly: boolean, burialOnly = false): boolean {
  return !cremationOnly && !burialOnly;
}

export function shouldShowStepSelectBulkToggle(burialOnly: boolean, cremationOnly: boolean): boolean {
  return !burialOnly && !cremationOnly;
}

export function shouldShowStepSelectCheckboxes(burialOnly: boolean): boolean {
  return !burialOnly;
}

export function shouldShowStepSelectStatusBlock(
  cremationOnly: boolean,
  burialOnly: boolean,
  singleSelection: boolean,
  overLimit: boolean,
  limitReached: boolean,
  noBurialSlots: boolean,
): boolean {
  return (!cremationOnly && !burialOnly && !singleSelection) || overLimit || limitReached || noBurialSlots;
}

export default function StepSelect({
  repos,
  selected,
  graveSet,
  availableSlots,
  slotsUnlocked,
  dailyCremationsLeft,
  singleSelection = false,
  cremationOnly = false,
  burialOnly = false,
  onToggle,
  onToggleAll,
  onToggleGrave,
  onNext,
  onBack,
}: StepSelectProps) {
  const allSelected = singleSelection ? selected.size > 0 : repos.every((r) => selected.has(r.id));
  const graveCount = singleSelection ? selected.size : [...selected].filter(id => graveSet.has(id)).length;
  const cremateCount = singleSelection ? 0 : selected.size - graveCount;
  const limitReached = dailyCremationsLeft === 0;
  const overLimit = cremateCount > dailyCremationsLeft && dailyCremationsLeft !== Infinity;
  const noBurialSlots = singleSelection && availableSlots <= 0;
  const showStatusBlock = shouldShowStepSelectStatusBlock(cremationOnly, burialOnly, singleSelection, overLimit, limitReached, noBurialSlots);
  const showActionToggles = shouldShowStepSelectActionToggles(cremationOnly, burialOnly);
  const showBulkToggle = shouldShowStepSelectBulkToggle(burialOnly, cremationOnly);
  const showCheckboxes = shouldShowStepSelectCheckboxes(burialOnly);

  return (
    <div>
      {/* Status block */}
      {showStatusBlock && (
        <div style={{
          padding: '10px 14px',
          marginBottom: 10,
          background: 'rgba(58, 57, 53, 0.3)',
          border: '1px solid #3a3530',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          {!cremationOnly && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: availableSlots > 0 ? '#e8d5a3' : '#8a8980', fontSize: 14 }}>
                &#x26B0;&#xFE0F; Graves: {availableSlots > 0
                  ? <>{availableSlots} free</>
                  : <>full</>
                }
              </span>
              <span>
                <span style={{ color: '#aaa9a0', fontSize: 13, fontWeight: 600 }}>{slotsUnlocked - availableSlots}/{slotsUnlocked}</span>
                <span style={{ color: '#6a6960', fontSize: 12 }}> used</span>
              </span>
            </div>
          )}
          {!singleSelection && !cremationOnly && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: limitReached ? '#b86858' : dailyCremationsLeft === Infinity ? '#e8d5a3' : '#aaa9a0', fontSize: 14 }}>
                &#x1F525; Crematory: {limitReached
                  ? <>closed today</>
                  : dailyCremationsLeft === Infinity
                    ? <>open</>
                    : <>{dailyCremationsLeft} left today</>
                }
              </span>
              {dailyCremationsLeft !== Infinity && (
                <span>
                  <span style={{ color: '#aaa9a0', fontSize: 13, fontWeight: 600 }}>{3 - dailyCremationsLeft}/3</span>
                  <span style={{ color: '#6a6960', fontSize: 12 }}> today</span>
                </span>
              )}
            </div>
          )}
          {limitReached && cremationOnly && (
            <div style={{ color: '#b86858', fontSize: 12, textAlign: 'center' }}>
              Crematory is closed today. Come back tomorrow.
            </div>
          )}
          {overLimit && !limitReached && (
            <div style={{ color: '#8a8980', fontSize: 12, textAlign: 'center', marginTop: 2, borderTop: '1px solid #3a3530', paddingTop: 6 }}>
              {cremateCount - dailyCremationsLeft} selected will be skipped
            </div>
          )}
          {noBurialSlots && (
            <div style={{ color: '#b86858', fontSize: 12, textAlign: 'center', marginTop: 2, borderTop: '1px solid #3a3530', paddingTop: 6 }}>
              No grave slots left. Cremation is available from FIRE.
            </div>
          )}
          {!cremationOnly && !burialOnly && (
            <div style={{ color: '#6a6960', fontSize: 12, lineHeight: 1.5, textAlign: 'center', marginTop: 2, borderTop: '1px solid #3a3530', paddingTop: 6 }}>
              {singleSelection
                ? 'SHOVEL creates graves only. Use FIRE for cremation.'
                : 'Coffin = grave on the map. Fire = crematory record.'}
            </div>
          )}
        </div>
      )}

      {!burialOnly && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#e8d5a3', fontSize: 14 }}>{singleSelection ? 'Select one project' : 'Select projects'}</span>
          {showBulkToggle && (
            <button
              onClick={onToggleAll}
              style={{
                background: 'none',
                border: 'none',
                color: '#7898b8',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'inherit',
                textDecoration: 'underline',
              }}
            >
              {singleSelection ? (allSelected ? 'Clear' : 'Select first') : (allSelected ? 'Deselect all' : 'Select all')}
            </button>
          )}
        </div>
      )}

      <div
        style={{
          maxHeight: 260,
          overflowY: 'auto',
          border: '1px solid #3a3530',
          borderRadius: 2,
          padding: 4,
        }}
      >
        {repos.map((repo) => {
          const isSelected = selected.has(repo.id);
          const isGrave = graveSet.has(repo.id);
          const canGrave = availableSlots > 0 && (isGrave || graveCount < availableSlots);

          return (
            <div
              key={repo.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderBottom: '1px solid rgba(58, 57, 53, 0.5)',
                fontSize: burialOnly ? 16 : 13,
              }}
            >
              {showCheckboxes && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => onToggle(repo.id)}
                  style={{
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${isSelected ? '#d8c891' : '#5a554c'}`,
                    borderRadius: 3,
                    background: isSelected ? 'linear-gradient(180deg, #e8d5a3 0%, #b79a55 100%)' : 'rgba(20,18,16,0.84)',
                    color: isSelected ? '#211b12' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0,
                    boxShadow: isSelected ? '0 0 10px rgba(232,213,163,0.18)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}
                >
                  &#10003;
                </button>
              )}
              <span style={{ color: burialOnly ? '#f4efe2' : '#aaa9a0', flex: 1, minWidth: 0, lineHeight: burialOnly ? 1.45 : undefined }}>
                <strong style={{ color: burialOnly ? '#fff7df' : undefined, fontSize: burialOnly ? 18 : undefined }}>{repo.name}</strong>
                {repo.language && (
                  <span style={{ color: burialOnly ? '#d8cfba' : '#6a6960' }}> — {repo.language}</span>
                )}
                <span style={{ color: burialOnly ? '#c6bca8' : '#4a4944' }}> — {monthsAgo(repo.pushed_at)}</span>
              </span>
              {isSelected && showActionToggles && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => onToggleGrave(repo.id)}
                    disabled={!isGrave && !canGrave}
                    title={isGrave ? 'Marked for grave' : canGrave ? 'Mark for grave' : 'No slots'}
                    style={{
                      width: 28,
                      height: 24,
                      border: '1px solid',
                      borderColor: isGrave ? '#c8a84880' : '#3a3530',
                      borderRadius: 2,
                      background: isGrave
                        ? 'linear-gradient(180deg, #5a4a20 0%, #3a3010 100%)'
                        : 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
                      color: isGrave ? '#e8d5a3' : (!canGrave ? '#3a3530' : '#6a6960'),
                      cursor: !isGrave && !canGrave ? 'default' : 'pointer',
                      fontSize: 14,
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    &#x26B0;
                  </button>
                  {!singleSelection && (
                    <button
                      onClick={() => { if (isGrave) onToggleGrave(repo.id); }}
                      title={!isGrave ? 'Marked for cremation' : 'Mark for cremation'}
                      style={{
                        width: 28,
                        height: 24,
                        border: '1px solid',
                        borderColor: !isGrave ? '#b8685850' : '#3a3530',
                        borderRadius: 2,
                        background: !isGrave
                          ? 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)'
                          : 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
                        color: !isGrave ? '#e8b8a3' : '#6a6960',
                        cursor: isGrave ? 'pointer' : 'default',
                        fontSize: 14,
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      &#x1F525;
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px',
            border: '1px solid #3a3530',
            borderRadius: 2,
            background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
            color: '#6a6960',
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        >
          Back
        </button>
        <span style={{ color: '#6a6960', fontSize: 12, textAlign: 'center' }}>
          {selected.size === 0
            ? '0 selected'
            : <>{graveCount > 0 && <span style={{ color: '#e8d5a3' }}>{graveCount} to bury</span>}
                {graveCount > 0 && cremateCount > 0 && ', '}
                {cremateCount > 0 && <span style={{ color: '#b86858' }}>{cremateCount} to cremate</span>}
              </>
          }
        </span>
        <button
          onClick={onNext}
          disabled={selected.size === 0 || noBurialSlots || (limitReached && graveCount === 0)}
          style={{
            padding: '8px 24px',
            border: '1px solid #3a3530',
            borderRadius: 2,
            background: selected.size === 0 || noBurialSlots || (limitReached && graveCount === 0)
              ? 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)'
              : 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)',
            color: selected.size === 0 || noBurialSlots || (limitReached && graveCount === 0) ? '#4a4944' : '#e8d5a3',
            cursor: selected.size === 0 || noBurialSlots || (limitReached && graveCount === 0) ? 'default' : 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
