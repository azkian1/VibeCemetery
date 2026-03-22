'use client';

import { useState, useMemo } from 'react';
import { useModal, useGame, useCremated } from '@/context/GameContext';
import { useSession } from 'next-auth/react';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import InsetBlock from '@/components/ui/InsetBlock';
import OrnamentDivider from '@/components/ui/OrnamentDivider';

type Tab = 'killers' | 'causes' | 'bots';
const TABS: { key: Tab; label: string }[] = [
  { key: 'killers', label: 'Serial Killers' },
  { key: 'causes', label: 'Causes of Death' },
  { key: 'bots', label: 'AI-Bots' },
];

export default function LeaderboardModal() {
  const { close } = useModal();
  const { state } = useGame();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const graves = state.graves;
  const { cremated } = useCremated();
  const [tab, setTab] = useState<Tab>('killers');
  const loading = state.gravesLoading || state.crematedLoading;

  const currentUser = session?.user?.github_username ?? session?.user?.name ?? null;

  // Serial Killers
  const rankedUsers = useMemo(() => {
    const map = new Map<string, { buried: number; cremated: number }>();
    for (const g of graves.values()) {
      const a = g.author_github || 'anonymous';
      const e = map.get(a) || { buried: 0, cremated: 0 };
      e.buried++;
      map.set(a, e);
    }
    for (const c of cremated) {
      const a = c.author_github || 'anonymous';
      const e = map.get(a) || { buried: 0, cremated: 0 };
      e.cremated++;
      map.set(a, e);
    }
    return [...map.entries()]
      .map(([author, stats]) => ({ author, ...stats, total: stats.buried + stats.cremated }))
      .sort((a, b) => b.total - a.total);
  }, [graves, cremated]);

  // Causes of Death
  const rankedCauses = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of graves.values()) {
      const cause = g.cause || 'Unknown';
      map.set(cause, (map.get(cause) || 0) + 1);
    }
    for (const c of cremated) {
      const cause = c.cause || 'Unknown';
      map.set(cause, (map.get(cause) || 0) + 1);
    }
    const total = graves.size + cremated.length;
    return [...map.entries()]
      .map(([cause, count]) => ({ cause, count, pct: total > 0 ? ((count / total) * 100).toFixed(0) : '0' }))
      .sort((a, b) => b.count - a.count);
  }, [graves, cremated]);


  const userRank = currentUser
    ? rankedUsers.findIndex((u) => u.author === currentUser) + 1
    : 0;
  const userTotal = userRank ? rankedUsers[userRank - 1].total : 0;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #c8a050' : '2px solid transparent',
    color: active ? '#e8d5a3' : '#6a6960',
    fontSize: isMobile ? 14 : 13,
    padding: isMobile ? '10px 14px' : '6px 14px',
    minHeight: isMobile ? 44 : undefined,
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
            Necropolis
          </h2>
          <p style={{ fontSize: 12, color: '#6a6960', textAlign: 'center', margin: '0 0 16px' }}>
            Who digs the deepest. Who buries the most.
          </p>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Leaderboard categories"
            onKeyDown={handleTabKeyDown}
            style={{ display: 'flex', justifyContent: 'center', borderBottom: '1px solid #3a3935', marginBottom: 12 }}
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                id={`lb-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls="lb-panel"
                tabIndex={tab === t.key ? 0 : -1}
                style={tabStyle(tab === t.key)}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div
            role="tabpanel"
            id="lb-panel"
            aria-labelledby={`lb-tab-${tab}`}
            style={{ height: 300, overflowY: 'auto' }}
          >
            {loading && (
              <p style={{ color: '#6a6960', textAlign: 'center', padding: 40, margin: 0 }}>
                Unearthing the records...
              </p>
            )}

            {/* Serial Killers */}
            {!loading && tab === 'killers' && (
              <InsetBlock>
                {rankedUsers.length === 0 ? (
                  <p style={{ color: '#6a6960', textAlign: 'center', padding: 20, margin: 0 }}>
                    No gravediggers yet. The shovels gather dust.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto' }}>
                    <span style={headerCell}>#</span>
                    <span style={headerCell}>Gravedigger</span>
                    <span style={{ ...headerCell, textAlign: 'center' }}>Buried</span>
                    <span style={{ ...headerCell, textAlign: 'center' }}>Cremated</span>
                    <span style={{ ...headerCell, textAlign: 'center' }}>Total</span>
                    <span style={{ gridColumn: '1 / -1', borderBottom: '1px solid #3a3935' }} />
                    {rankedUsers.map((u, i) => {
                      const rank = i + 1;
                      const isCurrentUser = currentUser && u.author === currentUser;
                      const rowBg = isCurrentUser ? 'rgba(200,160,80,0.08)' : 'transparent';
                      const border = i < rankedUsers.length - 1 ? '1px solid rgba(58,57,53,0.3)' : 'none';
                      return (
                        <div key={u.author} style={{ display: 'contents' }}>
                          <span style={{ fontSize: 12, color: rank <= 3 ? '#c8a050' : '#6a6960', padding: '8px 12px 8px 8px', fontWeight: rank <= 3 ? 'bold' : 'normal', background: rowBg, borderBottom: border }}>{rank}</span>
                          <span style={{ fontSize: 13, color: isCurrentUser ? '#e8d5a3' : '#aaa9a0', padding: '8px', background: rowBg, borderBottom: border, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {u.author !== 'anonymous' ? (
                              <a
                                href={`https://github.com/${u.author}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#7898b8', textDecoration: 'none', borderBottom: '1px solid rgba(120,152,184,0.3)' }}
                                onMouseEnter={(e) => { (e.currentTarget.style.color) = '#90b0d0'; }}
                                onMouseLeave={(e) => { (e.currentTarget.style.color) = '#7898b8'; }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {u.author}
                              </a>
                            ) : u.author}
                          </span>
                          <span style={{ fontSize: 13, color: '#aaa9a0', textAlign: 'center', padding: '8px', background: rowBg, borderBottom: border }}>{u.buried}</span>
                          <span style={{ fontSize: 13, color: '#6a6960', textAlign: 'center', padding: '8px', background: rowBg, borderBottom: border }}>{u.cremated}</span>
                          <span style={{ fontSize: 13, color: '#e8d5a3', textAlign: 'center', padding: '8px', fontWeight: 'bold', background: rowBg, borderBottom: border }}>{u.total}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </InsetBlock>
            )}

            {/* Causes of Death */}
            {!loading && tab === 'causes' && (
              <InsetBlock>
                {rankedCauses.length === 0 ? (
                  <p style={{ color: '#6a6960', textAlign: 'center', padding: 20, margin: 0 }}>
                    No causes recorded. The dead keep their secrets.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto' }}>
                    <span style={headerCell}>#</span>
                    <span style={headerCell}>Cause</span>
                    <span style={{ ...headerCell, textAlign: 'center' }}>Count</span>
                    <span style={{ ...headerCell, textAlign: 'center' }}>%</span>
                    <span style={{ gridColumn: '1 / -1', borderBottom: '1px solid #3a3935' }} />
                    {rankedCauses.map((c, i) => {
                      const border = i < rankedCauses.length - 1 ? '1px solid rgba(58,57,53,0.3)' : 'none';
                      return (
                        <div key={c.cause} style={{ display: 'contents' }}>
                          <span style={{ fontSize: 12, color: i < 3 ? '#c8a050' : '#6a6960', padding: '8px 12px 8px 8px', fontWeight: i < 3 ? 'bold' : 'normal', borderBottom: border }}>{i + 1}</span>
                          <span style={{ fontSize: 13, color: '#b86858', fontStyle: 'italic', padding: '8px', borderBottom: border }}>{c.cause}</span>
                          <span style={{ fontSize: 13, color: '#aaa9a0', textAlign: 'center', padding: '8px', borderBottom: border }}>{c.count}</span>
                          <span style={{ fontSize: 12, color: '#6a6960', textAlign: 'center', padding: '8px', minWidth: 36, borderBottom: border }}>{c.pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </InsetBlock>
            )}

            {/* AI-Bots */}
            {!loading && tab === 'bots' && (
              <InsetBlock>
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.6 }}>🤖</div>
                  <p style={{ color: '#6a6960', fontSize: 14, margin: '0 0 6px', fontWeight: 'bold' }}>
                    AI-Bots Leaderboard
                  </p>
                  <p style={{ color: '#6a6960', fontSize: 12, fontStyle: 'italic', margin: 0 }}>
                    Coming soon. Bots that bury via Skills will be ranked here.
                  </p>
                </div>
              </InsetBlock>
            )}
          </div>

          {/* Footer */}
          <OrnamentDivider />
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ color: '#6a6960', fontSize: 13 }}>
              {!currentUser
                ? 'Log in to claim your rank among the gravediggers'
                : userRank > 0
                  ? <>Your rank: <span style={{ fontSize: 18, fontWeight: 'bold', color: '#c8a050' }}>#{userRank}</span> — {userTotal} {userTotal === 1 ? 'burial' : 'burials'}</>
                  : 'You haven\u2019t buried anyone yet. The shovel awaits.'}
            </span>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
