'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { GameProvider, useModal } from '@/context/GameContext';
import { useGame } from '@/context/GameContext';
import { GameDataLoaders, ModalLayer } from '@/components/CemeteryApp';
import type { CrematedData, DeadRepo, GitHubScanResult, GraveData } from '@/types/game';

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

function ScannerShell() {
  const { data: session, status } = useSession();
  const { open } = useModal();
  const { state } = useGame();
  const authenticatedUsername = session?.user?.github_username ?? null;
  const recordsLoading = state.gravesLoading || state.crematedLoading;
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [repos, setRepos] = useState<DeadRepo[] | null>(null);
  const [totalRepos, setTotalRepos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      <nav style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px clamp(16px, 5vw, 48px)' }}>
        <Link href="/" style={{ color: '#e8d5a3', textDecoration: 'none', fontWeight: 700, letterSpacing: 1.2 }}>VibeCemetery</Link>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button style={navButtonStyle} type="button">Connect Wallet</button>
        </div>
      </nav>

      <section style={{ position: 'relative', zIndex: 1, minHeight: isCompactViewport ? 'calc(100dvh - 115px)' : 'calc(100dvh - 73px)', display: 'grid', placeItems: isCompactViewport ? 'start center' : 'center', padding: isCompactViewport ? '42px 16px 40px' : '18px 16px 40px' }}>
        <div style={{ width: 'min(100%, 430px)', border: '1px solid rgba(232,213,163,0.16)', borderRadius: 18, background: 'linear-gradient(180deg, rgba(42,40,37,0.96), rgba(20,18,16,0.98))', boxShadow: '0 18px 44px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)', padding: 'clamp(20px, 4vw, 28px)', textAlign: 'center' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: isCompactViewport ? '1fr' : '1fr 1fr', gap: 10, marginTop: 14 }}>
            <Link href="/cemetery" style={secondaryLinkStyle}>Enter Cemetery</Link>
            <Link href="/agents/gitlawb" style={secondaryLinkStyle}>Agent / GitLawb Layer</Link>
          </div>

          <p style={{ margin: '16px 0 0', color: '#777168', fontSize: 12, fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}>Dead repos = non-forks inactive for 7+ days. Only your connected GitHub can be scanned.</p>
          {message && <p style={{ margin: '14px 0 0', color: '#c78373', fontSize: 13, fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}>{message}</p>}

          {repos && (
            <section style={{ marginTop: 24, display: 'grid', gap: 10 }}>
              {repos.length > 0 ? (
                <>
                  <h2 style={{ margin: 0, fontSize: 18 }}>Found {repos.length} dead repo{repos.length === 1 ? '' : 's'}</h2>
                  {repos.map((repo) => (
                    <article key={repo.id} style={{ border: '1px solid #34302a', borderRadius: 12, background: 'rgba(13,12,11,0.64)', padding: 14 }}>
                      <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
                        <div>
                          <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>{repo.name}</h3>
                          <p style={repoMetaStyle}>Last push: {formatLastPushAge(repo.pushed_at)}</p>
                          <p style={repoMetaStyle}>Language: {repo.language ?? 'Unknown'}</p>
                          <p style={repoMetaStyle}>Status: Dead</p>
                        </div>
                        <button type="button" onClick={() => open('bury', { initialDeadRepos: [repo], suppressCeremony: true })} style={{ ...navButtonStyle, color: '#e8d5a3' }}>Bury</button>
                      </div>
                    </article>
                  ))}
                </>
              ) : (
                <div style={{ border: '1px solid #34302a', padding: 16, background: 'rgba(13,12,11,0.64)' }}>
                  <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>No dead repos found.</h2>
                  <p style={{ ...repoMetaStyle, marginBottom: 14 }}>A repo must be inactive for 7+ days and not be a fork. Scanned {totalRepos} non-fork repo{totalRepos === 1 ? '' : 's'}.</p>
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
