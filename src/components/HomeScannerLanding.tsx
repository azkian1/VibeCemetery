'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { GameProvider, useModal } from '@/context/GameContext';
import { useGame } from '@/context/GameContext';
import { GameDataLoaders, ModalLayer } from '@/components/CemeteryApp';
import { calculateUserSlotEconomy, isAutoAssignableGraveSlotType } from '@/lib/slot-economy';
import type { BuryFlowMode } from '@/components/modals/BuryFlowModal';
import type { CrematedData, DeadRepo, GitHubScanResult, GraveData } from '@/types/game';
import type { SlotPositionData } from '@/game/events';

const AUTH_GATE_COPY = 'Connect GitHub to scan and bury your own repos.';

export function formatLastPushAge(value: string, now = new Date()): string {
  const pushedAt = new Date(value);
  if (!value || Number.isNaN(pushedAt.getTime())) return 'unknown';

  const days = Math.max(0, Math.floor((now.getTime() - pushedAt.getTime()) / 86_400_000));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function filterFreshDeadRepos({
  repos,
  graves,
  cremated,
  username,
}: {
  repos: DeadRepo[];
  graves: Map<number, GraveData>;
  cremated: CrematedData[];
  username: string | null;
}): DeadRepo[] {
  const buriedRepoIds = new Set<number>();
  graves.forEach((grave) => buriedRepoIds.add(grave.github_repo_id));

  const crematedNames = new Set(
    cremated
      .filter((item) => !username || item.author_github.toLowerCase() === username.toLowerCase())
      .map((item) => item.name.toLowerCase()),
  );

  return repos.filter((repo) => {
    if (buriedRepoIds.has(repo.id)) return false;
    if (crematedNames.has(repo.name.toLowerCase())) return false;
    return true;
  });
}

export function calculateAvailableGraveSlotsForHome({
  graves,
  username,
  hasSharedFirstGrave,
  slotPositions = [],
}: {
  graves: Map<number, GraveData>;
  username: string | null;
  hasSharedFirstGrave: boolean;
  slotPositions?: SlotPositionData[];
}): number {
  if (!username) return 0;

  const autoSlotIds = slotPositions.length > 0
    ? new Set(slotPositions.filter((slot) => isAutoAssignableGraveSlotType(slot.type)).map((slot) => slot.id))
    : null;
  let slotsUsed = 0;
  graves.forEach((grave) => {
    if (grave.author_github?.toLowerCase() !== username.toLowerCase()) return;
    if (autoSlotIds && !autoSlotIds.has(grave.slot_id)) return;
    slotsUsed++;
  });

  return calculateUserSlotEconomy({ slotsUsed, hasSharedFirstGrave }).availableSlots;
}

export function decideHomeRepoAction(availableSlots: number): { label: 'Bury' | 'Cremate'; flowMode: BuryFlowMode } {
  return availableSlots > 0
    ? { label: 'Bury', flowMode: 'home-preselected-burial' }
    : { label: 'Cremate', flowMode: 'home-preselected-cremation' };
}

export function shouldShowHomeScannerChrome(repos: DeadRepo[] | null): boolean {
  return repos === null;
}

function ScannerShell() {
  const { data: session, status } = useSession();
  const { open } = useModal();
  const { state, dispatch } = useGame();
  const authenticatedUsername = session?.user?.github_username ?? null;
  const hasSharedFirstGrave = Boolean(session?.user?.x_first_grave_shared_at);
  const [mapSlotsLoading, setMapSlotsLoading] = useState(true);
  const recordsLoading = state.gravesLoading || state.crematedLoading || mapSlotsLoading;
  const availableGraveSlots = calculateAvailableGraveSlotsForHome({
    graves: state.graves,
    username: authenticatedUsername,
    hasSharedFirstGrave,
    slotPositions: state.slotPositions,
  });
  const repoAction = decideHomeRepoAction(availableGraveSlots);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [repos, setRepos] = useState<DeadRepo[] | null>(null);
  const [totalRepos, setTotalRepos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const showScannerChrome = shouldShowHomeScannerChrome(repos);

  useEffect(() => {
    if (state.slotPositions.length > 0) {
      setMapSlotsLoading(false);
      return;
    }

    let cancelled = false;
    fetch('/map/az.tmj')
      .then((res) => res.ok ? res.json() : null)
      .then((map: { layers?: Array<{ name?: string; objects?: Array<{ id: number; type: string; name?: string; x?: number; y?: number; width?: number; height?: number }> }> } | null) => {
        if (cancelled) return;
        const objects = map?.layers?.find((layer) => layer.name === 'slots')?.objects ?? [];
        dispatch({
          type: 'SET_SLOT_POSITIONS',
          slots: objects
            .filter((slot) => slot.type?.startsWith('grave'))
            .map((slot) => ({
              id: slot.id,
              type: slot.type,
              name: slot.name ?? '',
              x: slot.x ?? 0,
              y: slot.y ?? 0,
              width: slot.width ?? 0,
              height: slot.height ?? 0,
            })),
        });
      })
      .catch(() => {
        if (!cancelled) setMessage('The grave slot map could not be loaded. Slot routing may be delayed.');
      })
      .finally(() => {
        if (!cancelled) setMapSlotsLoading(false);
      });

    return () => { cancelled = true; };
  }, [dispatch, state.slotPositions.length]);

  useEffect(() => {
    const updateViewport = () => setIsCompactViewport(window.innerWidth < 640);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const runScan = async () => {
    if (status !== 'authenticated' || !authenticatedUsername) {
      setMessage(AUTH_GATE_COPY);
      setRepos(null);
      void signIn('github');
      return;
    }

    if (recordsLoading) {
      setMessage('Opening cemetery ledger before scanning...');
      return;
    }

    setLoading(true);
    setMessage(null);
    setRepos(null);

    try {
      const res = await fetch(`/api/github/scan?username=${encodeURIComponent(authenticatedUsername)}`);
      const data = await res.json().catch(() => null) as GitHubScanResult | { error?: string } | null;
      if (!res.ok) {
        setMessage(data && 'error' in data && data.error ? data.error : `Scan failed (${res.status})`);
        return;
      }
      const scan = data as GitHubScanResult;
      setRepos(filterFreshDeadRepos({
        repos: scan.dead_repos,
        graves: state.graves,
        cremated: state.cremated,
        username: authenticatedUsername,
      }));
      setTotalRepos(scan.total_repos);
    } catch {
      setMessage('Network error. The cemetery gates could not reach GitHub.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100dvh',
        color: '#e8d5a3',
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
        background: 'radial-gradient(circle at 50% 18%, rgba(120, 38, 30, 0.2), transparent 34%), linear-gradient(180deg, #151412 0%, #0c0b0a 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: 0.22, background: 'linear-gradient(0deg, rgba(0,0,0,0.38), transparent 42%)', pointerEvents: 'none' }} />
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes vc-enter-cemetery-glint {
            0%, 58%, 100% { border-color: #3a3530; color: #bdb6a4; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.3); }
            68% { border-color: rgba(232,213,163,0.42); color: #e8d5a3; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 18px rgba(232,213,163,0.24), 0 0 34px rgba(200,160,80,0.14); }
            78% { border-color: rgba(200,160,80,0.7); color: #f2dfad; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 0 26px rgba(232,213,163,0.36), 0 0 48px rgba(200,160,80,0.2); }
            88% { border-color: rgba(232,213,163,0.32); color: #d8c891; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 14px rgba(232,213,163,0.18); }
          }
        }
      `}</style>
      <nav style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, padding: '18px clamp(16px, 5vw, 48px)' }}>
        <span style={{ gridColumn: 2, color: '#e8d5a3', fontWeight: 700, letterSpacing: 1.2, textAlign: 'center' }}>VibeCemetery</span>
        <div style={{ gridColumn: 3, justifySelf: 'end', display: 'none', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button style={navButtonStyle} type="button">Connect Wallet</button>
        </div>
      </nav>

      <section style={{ position: 'relative', zIndex: 1, minHeight: isCompactViewport ? 'calc(100dvh - 115px)' : 'calc(100dvh - 73px)', display: 'grid', placeItems: isCompactViewport ? 'start center' : 'center', padding: isCompactViewport ? '42px 16px 40px' : '18px 16px 40px' }}>
        <div style={{ width: repos ? 'min(100%, 1040px)' : 'min(100%, 430px)', border: '1px solid rgba(232,213,163,0.16)', borderRadius: 18, background: 'linear-gradient(180deg, rgba(42,40,37,0.96), rgba(20,18,16,0.98))', boxShadow: '0 18px 44px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)', padding: 'clamp(20px, 4vw, 28px)', textAlign: 'center' }}>
          {showScannerChrome && (
            <>
              <p style={{ margin: '0 0 10px', color: '#9a7562', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>GitHub scanner</p>
              <h1 style={{ margin: '0 auto 12px', maxWidth: 360, fontSize: 'clamp(24px, 3.2vw, 27px)', lineHeight: 1.16, letterSpacing: -0.1 }}>Bury your abandoned GitHub repos</h1>
              <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
                <button
                  type="button"
                  onClick={() => { void runScan(); }}
                  disabled={loading || status === 'loading' || recordsLoading}
                  style={{ border: '1px solid #6a3020', borderRadius: 12, background: loading ? '#3a2520' : 'linear-gradient(180deg, #7a2a24 0%, #421512 100%)', color: '#f4dfaa', padding: '16px 18px', fontWeight: 700, letterSpacing: 1, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 15, boxShadow: '0 0 28px rgba(122,42,36,0.25)' }}
                >
                  {loading ? 'Scanning GitHub...' : recordsLoading ? 'Opening Ledger...' : authenticatedUsername ? `Scan @${authenticatedUsername}` : 'Scan GitHub'}
                </button>
              </div>
            </>
          )}

          {showScannerChrome && (
            <div style={{ display: 'grid', gridTemplateColumns: isCompactViewport ? '1fr' : '1fr 1fr', gap: 10, marginTop: 14 }}>
              <Link href="/cemetery" style={enterCemeteryLinkStyle}>Enter Cemetery</Link>
              <Link href="/agents" style={secondaryLinkStyle}>Agent Layer</Link>
            </div>
          )}

          {showScannerChrome && (
            <p style={{ margin: '16px 0 0', color: '#777168', fontSize: 12, fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}>Dead repos = non-forks inactive for 7+ days. Only your connected GitHub can be scanned.</p>
          )}
          {message && <p style={{ margin: '14px 0 0', color: '#c78373', fontSize: 13, fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}>{message}</p>}

          {repos && (
            <section style={{ marginTop: showScannerChrome ? 24 : 0, display: 'grid', gap: 10 }}>
              {repos.length > 0 ? (
                <>
                  <h2 style={{ margin: 0, fontSize: 18 }}>Found {repos.length} dead repo{repos.length === 1 ? '' : 's'}</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: isCompactViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    {repos.map((repo) => (
                      <article key={repo.id} style={{ border: '1px solid #34302a', borderRadius: 12, background: 'rgba(13,12,11,0.64)', padding: 14 }}>
                        <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
                          <div>
                            <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>{repo.name}</h3>
                            <p style={repoMetaStyle}>Last push: {formatLastPushAge(repo.pushed_at)}</p>
                            <p style={repoMetaStyle}>Language: {repo.language ?? 'Unknown'}</p>
                            <p style={repoMetaStyle}>Status: Dead</p>
                          </div>
                          <button type="button" onClick={() => open('bury', { initialDeadRepos: [repo], flowMode: repoAction.flowMode })} style={{ ...navButtonStyle, color: repoAction.flowMode === 'home-preselected-burial' ? '#e8d5a3' : '#e8b8a3' }}>{repoAction.label}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ border: '1px solid #34302a', padding: 16, background: 'rgba(13,12,11,0.64)' }}>
                  <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>No suitable projects found.</h2>
                  <p style={{ ...repoMetaStyle, marginBottom: 14 }}>You do not have eligible projects to bury right now. A repo must be inactive for 7+ days and not be a fork. Scanned {totalRepos} non-fork repo{totalRepos === 1 ? '' : 's'}.</p>
                  <Link href="/cemetery" style={secondaryLinkStyle}>Enter Cemetery</Link>
                </div>
              )}
            </section>
          )}
        </div>
      </section>
      <ModalLayer />
    </main>
  );
}

const navButtonStyle: React.CSSProperties = {
  border: '1px solid #3a3530',
  borderRadius: 10,
  background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
  color: '#aaa9a0',
  padding: '8px 12px',
  cursor: 'pointer',
  fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
  fontSize: 12,
  textAlign: 'center',
};

const secondaryLinkStyle: React.CSSProperties = {
  ...navButtonStyle,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#bdb6a4',
  textDecoration: 'none',
};

const enterCemeteryLinkStyle: React.CSSProperties = {
  ...secondaryLinkStyle,
  animation: 'vc-enter-cemetery-glint 5s ease-in-out infinite',
};

const repoMetaStyle: React.CSSProperties = {
  margin: '3px 0',
  color: '#8f897d',
  fontSize: 12,
  fontFamily: "var(--font-geist-sans), Arial, sans-serif",
};

export default function HomeScannerLanding() {
  return (
    <GameProvider>
      <GameDataLoaders />
      <ScannerShell />
    </GameProvider>
  );
}
