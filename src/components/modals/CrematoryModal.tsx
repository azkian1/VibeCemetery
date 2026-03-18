'use client';

import { useEffect, useState, useMemo } from 'react';
import { useModal, useCremated } from '@/context/GameContext';
import type { CrematedData } from '@/types/game';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import InsetBlock from '@/components/ui/InsetBlock';
import OrnamentDivider from '@/components/ui/OrnamentDivider';

type Tab = 'columbarium' | 'ashpit';
const TABS: { key: Tab; label: string }[] = [
  { key: 'columbarium', label: 'Columbarium' },
  { key: 'ashpit', label: 'Ash Pit' },
];

function timeAgo(dateStr: string): string {
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return '—';
  const seconds = Math.floor((Date.now() - t) / 1000);
  const days = Math.floor(seconds / 86400);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

export default function CrematoryModal() {
  const { close, push } = useModal();
  const { cremated, loading, refetch } = useCremated();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>('columbarium');

  useEffect(() => { refetch(); }, [refetch]);

  const { urns, ashes } = useMemo(() => {
    const urns: CrematedData[] = [];
    const ashes: CrematedData[] = [];
    for (const c of cremated) {
      if (c.github_url) {
        urns.push(c);
      } else {
        ashes.push(c);
      }
    }
    return { urns, ashes };
  }, [cremated]);

  const handleUrnClick = (item: CrematedData) => {
    push('urn', { crematedItem: item });
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #c8a050' : '2px solid transparent',
    color: active ? '#e8d5a3' : '#6a6960',
    fontSize: 13,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.2s',
    textAlign: 'center',
  });

  const headerCell: React.CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: '#6a6960',
    padding: '6px 8px',
  };

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const idx = TABS.findIndex((t) => t.key === tab);
      const next = e.key === 'ArrowRight'
        ? TABS[(idx + 1) % TABS.length].key
        : TABS[(idx - 1 + TABS.length) % TABS.length].key;
      setTab(next);
    }
  };

  const renderTable = (items: CrematedData[], clickable: boolean) => {
    if (items.length === 0) return null;
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
      }}>
        <span style={headerCell}>#</span>
        <span style={headerCell}>Project</span>
        <span style={headerCell}>Author</span>
        <span style={{ ...headerCell, textAlign: 'right' }}>When</span>
        <span style={{ gridColumn: '1 / -1', borderBottom: '1px solid #3a3935' }} />

        {items.map((c, i) => {
          const border = i < items.length - 1 ? '1px solid rgba(58,57,53,0.3)' : 'none';
          return (
            <div
              key={c.id}
              style={{
                display: 'contents',
                cursor: clickable ? 'pointer' : 'default',
              }}
              onClick={clickable ? () => handleUrnClick(c) : undefined}
              onMouseEnter={clickable ? (e) => {
                const parent = e.currentTarget;
                for (const child of Array.from(parent.children) as HTMLElement[]) {
                  child.style.background = 'rgba(200,160,80,0.06)';
                }
              } : undefined}
              onMouseLeave={clickable ? (e) => {
                const parent = e.currentTarget;
                for (const child of Array.from(parent.children) as HTMLElement[]) {
                  child.style.background = 'transparent';
                }
              } : undefined}
            >
              <span style={{
                fontSize: 12,
                color: '#8a8980',
                padding: '8px 12px 8px 8px',
                borderBottom: border,
              }}>
                {i + 1}
              </span>
              <span style={{
                padding: '8px',
                borderBottom: border,
                overflow: 'hidden',
                minWidth: 0,
              }}>
                <div style={{
                  fontSize: 13,
                  color: '#e8d5a3',
                  fontWeight: 'bold',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {c.name}
                </div>
                <div style={{
                  fontSize: 12,
                  color: '#c87868',
                  fontStyle: 'italic',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: 2,
                }}>
                  {c.cause}
                </div>
              </span>
              <span style={{
                fontSize: 12,
                color: '#7898b8',
                padding: '8px',
                borderBottom: border,
                whiteSpace: 'nowrap',
              }}>
                {c.author_github}
              </span>
              <span style={{
                fontSize: 11,
                color: '#6a6960',
                padding: '8px',
                borderBottom: border,
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}>
                {timeAgo(c.created_at)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={600}>
        <div style={{
          padding: isMobile ? '20px 16px' : '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
        }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            Crematory
          </h2>
          <p style={{ fontSize: 12, color: '#8a8980', textAlign: 'center', margin: '0 0 16px' }}>
            Dust to dust. No grave, no stone — just a name in the ash.
          </p>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Crematory sections"
            onKeyDown={handleTabKeyDown}
            style={{ display: 'flex', justifyContent: 'center', borderBottom: '1px solid #3a3935', marginBottom: 12 }}
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                id={`crem-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls="crem-panel"
                tabIndex={tab === t.key ? 0 : -1}
                style={tabStyle(tab === t.key)}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                <span style={{
                  marginLeft: 6,
                  fontSize: 13,
                  fontWeight: 'bold',
                  color: tab === t.key ? '#e8d5a3' : '#8a8980',
                }}>
                  {t.key === 'columbarium' ? urns.length : ashes.length}
                </span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div
            role="tabpanel"
            id="crem-panel"
            aria-labelledby={`crem-tab-${tab}`}
            style={{ height: 300, overflowY: 'auto' }}
          >
            {loading && (
              <p style={{ color: '#8a8980', textAlign: 'center', padding: 40, margin: 0 }}>
                Sweeping the ashes...
              </p>
            )}

            {/* Columbarium — GitHub projects with urns */}
            {!loading && tab === 'columbarium' && (
              <InsetBlock>
                {urns.length === 0 ? (
                  <p style={{ color: '#6a6960', textAlign: 'center', padding: 20, margin: 0, fontStyle: 'italic' }}>
                    The niches are empty. No urns placed yet.
                  </p>
                ) : (
                  renderTable(urns, true)
                )}
              </InsetBlock>
            )}

            {/* Ash Pit — CLI cremations without GitHub */}
            {!loading && tab === 'ashpit' && (
              <InsetBlock>
                {ashes.length === 0 ? (
                  <p style={{ color: '#6a6960', textAlign: 'center', padding: 20, margin: 0, fontStyle: 'italic' }}>
                    The pit is clean. No ashes scattered here.
                  </p>
                ) : (
                  renderTable(ashes, false)
                )}
              </InsetBlock>
            )}
          </div>

          {/* Footer */}
          <OrnamentDivider />
          <div style={{ textAlign: 'center' }}>
            <span style={{ color: '#8a8980', fontSize: 13 }}>
              {cremated.length > 0
                ? <><div style={{ fontSize: 20, fontWeight: 'bold', color: '#e8d5a3', marginBottom: 2 }}>{cremated.length}</div>{cremated.length === 1 ? 'soul' : 'souls'} reduced to ash</>
                : 'The furnace awaits its first offering'}
            </span>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
