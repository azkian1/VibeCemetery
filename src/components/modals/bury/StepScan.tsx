'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import type { DeadRepo, GitHubScanResult } from '@/types/game';

interface StepScanProps {
  repos: DeadRepo[];
  loading: boolean;
  error: string | null;
  username: string | null;
  filteredCount: number;
  onScanned: (repos: DeadRepo[], total: number) => void;
  onError: (err: string) => void;
  onNext: () => void;
  setLoading: (v: boolean) => void;
}

export default function StepScan({
  repos,
  loading,
  error,
  username: defaultUsername,
  filteredCount,
  onScanned,
  onError,
  onNext,
  setLoading,
}: StepScanProps) {
  const { status } = useSession();
  const [dots, setDots] = useState('');
  const [scanPhase, setScanPhase] = useState('Connecting to GitHub...');

  const runScan = useCallback((forceRefresh = false) => {
    if (!defaultUsername) return () => {};

    const controller = new AbortController();
    setLoading(true);
    onError('');

    const params = new URLSearchParams({ username: defaultUsername });
    if (forceRefresh) params.set('refresh', '1');

    fetch(`/api/github/scan?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 429) {
            onError('Rate limited by GitHub. Try again in a minute.');
          } else {
            onError(`Scan failed (${res.status})`);
          }
          return;
        }
        const data: GitHubScanResult = await res.json();
        onScanned(data.dead_repos, data.total_repos);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') onError('Network error — check your connection.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [defaultUsername, onError, onScanned, setLoading]);

  // Animated dots
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(id);
  }, [loading]);

  // Progress messages
  useEffect(() => {
    if (!loading) return;
    const phases = [
      { delay: 1500, msg: 'Fetching repositories...' },
      { delay: 4000, msg: 'Checking last commit dates...' },
      { delay: 7000, msg: 'Filtering dead repos...' },
    ];
    const timers = phases.map(p => setTimeout(() => setScanPhase(p.msg), p.delay));
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  // Auto-scan own repos on mount (only own GitHub)
  useEffect(() => {
    if (!defaultUsername) return;
    return runScan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultUsername, runScan]);

  // Not authenticated
  if (status === 'loading') {
    return <p style={{ color: '#6a6960', textAlign: 'center' }}>Checking session...</p>;
  }

  if (status !== 'authenticated') {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <p style={{ color: '#aaa9a0', marginBottom: 16 }}>Sign in to scan your GitHub repos</p>
        <button
          onClick={() => signIn('github')}
          style={{
            padding: '8px 24px',
            border: '1px solid #3a3530',
            borderRadius: 2,
            background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
            color: '#e8d5a3',
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        >
          Login with GitHub
        </button>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <p style={{ color: '#e8d5a3', fontSize: 15, marginBottom: 8 }}>
          Scanning GitHub{dots}
        </p>
        <p style={{ color: '#6a6960', fontSize: 13 }}>
          {scanPhase}
        </p>
      </div>
    );
  }

  const rescanButton = (
    <button
      onClick={() => { void runScan(true); }}
      style={{
        marginTop: 16,
        padding: '6px 16px',
        border: '1px solid #3a3530',
        borderRadius: 2,
        background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
        color: '#e8d5a3',
        cursor: 'pointer',
        fontSize: 13,
        fontFamily: 'inherit',
      }}
    >
      Rescan
    </button>
  );

  // Error
  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <p style={{ color: '#b86858' }}>
          {error}
        </p>
        {rescanButton}
      </div>
    );
  }

  // Results
  if (repos.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <p style={{ color: '#8a8980' }}>
          All alive! Either you&apos;re productive, or you&apos;ve hidden the evidence.
        </p>
        {rescanButton}
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <p style={{ color: '#e8d5a3', fontSize: 16, marginBottom: filteredCount > 0 ? 6 : 16 }}>
        Found <strong>{repos.length}</strong> dead repo{repos.length !== 1 ? 's' : ''}
      </p>
      {filteredCount > 0 && (
        <p style={{ color: '#6a6960', fontSize: 12, marginBottom: 16 }}>
          {filteredCount} already buried or cremated
        </p>
      )}
      <button
        onClick={onNext}
        style={{
          padding: '8px 24px',
          border: '1px solid #3a3530',
          borderRadius: 2,
          background: 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)',
          color: '#e8d5a3',
          cursor: 'pointer',
          fontSize: 14,
          fontFamily: 'inherit',
        }}
      >
        Next
      </button>
      {rescanButton}
    </div>
  );
}
