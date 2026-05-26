'use client';

import { useState, useMemo } from 'react';
import { useModal, useGame, useGraves } from '@/context/GameContext';
import { filterGravesByAuthor } from '@/lib/crypt-filter';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import OrnamentDivider from '@/components/ui/OrnamentDivider';
import LoadErrorState from '@/components/ui/LoadErrorState';


type SortCol = 'tier' | 'project' | 'cause' | 'f' | 'died';
type SortDir = 'asc' | 'desc';

function getTierRank(slotType: string | undefined): number {
  if (slotType === 'grave_largeX' || slotType === 'grave_largetop') return 4;
  if (slotType === 'grave_large' || slotType === 'grave_wide') return 3;
  if (slotType === 'grave_tall') return 2;
  if (slotType === 'grave_special') return 0;
  return 1;
}

function getTier(slotType: string | undefined): { label: string; color: string; bg: string } {
  if (slotType === 'grave_largeX' || slotType === 'grave_largetop')
    return { label: 'T3', color: '#c04040', bg: 'rgba(192,64,64,0.12)' };
  if (slotType === 'grave_large' || slotType === 'grave_wide')
    return { label: 'T2', color: '#b07030', bg: 'rgba(176,112,48,0.12)' };
  if (slotType === 'grave_tall')
    return { label: 'T1', color: '#c8a050', bg: 'rgba(200,160,80,0.12)' };
  if (slotType === 'grave_special')
    return { label: 'S', color: '#a070c0', bg: 'rgba(160,112,192,0.12)' };
  return { label: 'T0', color: '#6a6960', bg: 'rgba(106,105,96,0.15)' };
}

export default function MausoleumModal() {
  const { close, push, modalData } = useModal();
  const { state } = useGame();
  const { error, refetch } = useGraves({ auto: false });
  const isMobile = useIsMobile();
  const graves = state.graves;
  const [sortCol, setSortCol] = useState<SortCol>('f');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loading = state.gravesLoading;
  const authorFilter = modalData?.authorFilter;

  const slotTypeMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of state.slotPositions) m.set(s.id, s.type);
    return m;
  }, [state.slotPositions]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'project' || col === 'cause' ? 'asc' : 'desc');
    }
  };

  const sortedGraves = useMemo(() => {
    const arr = filterGravesByAuthor([...graves.values()], authorFilter);
    const dir = sortDir === 'asc' ? 1 : -1;
    return arr.sort((a, b) => {
      switch (sortCol) {
        case 'tier': {
          const ta = getTierRank(slotTypeMap.get(a.slot_id));
          const tb = getTierRank(slotTypeMap.get(b.slot_id));
          return (ta - tb) * dir;
        }
        case 'project':
          return (a.name || '').localeCompare(b.name || '') * dir;
        case 'cause':
          return (a.cause || 'Unknown').localeCompare(b.cause || 'Unknown') * dir;
        case 'f':
          return ((a.f_count ?? 0) - (b.f_count ?? 0)) * dir;
        case 'died': {
          const da = a.died_at ? new Date(a.died_at).getTime() : 0;
          const db = b.died_at ? new Date(b.died_at).getTime() : 0;
          return (da - db) * dir;
        }
        default:
          return 0;
      }
    });
  }, [graves, authorFilter, sortCol, sortDir, slotTypeMap]);

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const headerCell: React.CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: '#8a8980',
    padding: '6px 8px',
  };

  const thStyle = (col: SortCol, align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties => ({
    ...headerCell,
    borderBottom: '1px solid #3a3935',
    textAlign: align,
    cursor: 'pointer',
    userSelect: 'none',
    color: sortCol === col ? '#e8d5a3' : '#8a8980',
    transition: 'color 0.15s',
    position: 'sticky',
    top: 0,
    zIndex: 1,
    background: '#1a1a18',
  });

  const staticThStyle: React.CSSProperties = {
    ...headerCell,
    borderBottom: '1px solid #3a3935',
    background: '#1a1a18',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  };

  const ariaSort = (col: SortCol): 'ascending' | 'descending' | 'none' => {
    if (sortCol !== col) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const sortArrow = (col: SortCol) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' \u25B4' : ' \u25BE';
  };

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={720}>
        <div style={{
          padding: isMobile ? '20px 16px' : '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
        }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            The Crypt
          </h2>
          <p style={{ fontSize: 12, color: '#9a998f', textAlign: 'center', margin: '0 0 16px' }}>
            {authorFilter
              ? <>The Gravedigger&apos;s ledger for <span style={{ color: '#e8d5a3' }}>{authorFilter}</span>.</>
              : 'The Gravedigger\'s ledger. Only the buried are recorded here.'}
          </p>

          {loading ? (
            <p style={{ textAlign: 'center', color: '#8a8980' }}>Checking the records...</p>
          ) : error ? (
            <LoadErrorState
              message="The Crypt ledger failed to load."
              onRetry={refetch}
            />
          ) : (
            <>
              {/* Table */}
              <div
                style={{
                  flex: 1,
                  maxHeight: isMobile ? '60vh' : '50vh',
                  overflowY: 'auto',
                  minHeight: 0,
                  border: '1px solid #3a3935',
                  borderRadius: 2,
                }}
              >
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                }}>
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col />
                    {!isMobile && <col style={{ width: 130 }} />}
                    <col />
                    <col style={{ width: 48 }} />
                    {!isMobile && <col style={{ width: 100 }} />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" aria-sort={ariaSort('tier')} style={thStyle('tier', 'center')} onClick={() => toggleSort('tier')}>Tier{sortArrow('tier')}</th>
                      <th scope="col" aria-sort={ariaSort('project')} style={thStyle('project')} onClick={() => toggleSort('project')}>Project{sortArrow('project')}</th>
                      {!isMobile && <th scope="col" style={staticThStyle}>Reaper</th>}
                      <th scope="col" aria-sort={ariaSort('cause')} style={thStyle('cause')} onClick={() => toggleSort('cause')}>Cause{sortArrow('cause')}</th>
                      <th scope="col" aria-sort={ariaSort('f')} style={thStyle('f', 'center')} onClick={() => toggleSort('f')}>F{sortArrow('f')}</th>
                      {!isMobile && <th scope="col" aria-sort={ariaSort('died')} style={thStyle('died', 'right')} onClick={() => toggleSort('died')}>Died{sortArrow('died')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedGraves.map((g) => {
                      const tier = getTier(slotTypeMap.get(g.slot_id));
                      return (
                        <tr
                          key={g.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => push('grave', { slotId: g.slot_id })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              push('grave', { slotId: g.slot_id });
                            }
                          }}
                          style={{
                            cursor: 'pointer',
                            borderBottom: '1px solid rgba(58,57,53,0.3)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(200,160,80,0.04)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 'bold',
                              color: tier.color,
                              background: tier.bg,
                              padding: '1px 5px',
                              borderRadius: 2,
                              letterSpacing: 0.5,
                            }}>
                              {tier.label}
                            </span>
                          </td>
                          <td style={{
                            padding: '8px',
                            fontSize: 14, color: '#e8d5a3', fontWeight: 'bold',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 0,
                          }}>
                            {g.name}
                          </td>
                          {!isMobile && (
                            <td style={{
                              padding: '8px',
                              fontSize: 12,
                              color: '#7898b8',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {g.author_github || 'anonymous'}
                            </td>
                          )}
                          <td style={{
                            padding: '8px',
                            fontSize: 14, color: '#d07868', fontStyle: 'italic',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 0,
                          }}>
                            {g.cause || 'Unknown'}
                          </td>
                          <td style={{ padding: '8px', fontSize: 12, color: '#aaa99f', textAlign: 'center' }}>
                            {g.f_count ?? 0}
                          </td>
                          {!isMobile && (
                            <td style={{ padding: '8px', fontSize: 12, color: '#aaa99f', textAlign: 'right' }}>
                              {formatDate(g.died_at)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <OrnamentDivider />
              <p style={{ margin: '0', fontSize: 12, color: '#9a998f', textAlign: 'center', letterSpacing: 1.5 }}>
                {authorFilter ? `${sortedGraves.length} by ${authorFilter}` : `${graves.size} at rest`}
              </p>
            </>
          )}
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
