'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useModal, useGame } from '@/context/GameContext';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import StepScan from './bury/StepScan';
import StepSelect from './bury/StepSelect';
import StepCause from './bury/StepCause';
import StepDone from './bury/StepDone';
import type { DeadRepo, GraveData, BuryResult } from '@/types/game';
import { GRAVEDIGGER_BURIAL, GRAVEDIGGER_MASS_BURIAL } from '@/gravedigger/phrases';
import { cemeteryEvents } from '@/game/events';

const DEATH_CAUSES_DEFAULT = 'Developer lost interest';
const SLOT_THRESHOLDS = [30, 80, 150, 300] as const;

export default function BuryFlowModal() {
  const { close, open } = useModal();
  const { state, dispatch } = useGame();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const username = session?.user?.github_username ?? null;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [repos, setRepos] = useState<DeadRepo[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [graveSet, setGraveSet] = useState<Set<number>>(new Set());
  const [causes, setCauses] = useState<Map<number, string>>(new Map());
  const [results, setResults] = useState<BuryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buryDone, setBuryDone] = useState(0);
  const [buryTotal, setBuryTotal] = useState(0);
  const [burying, setBurying] = useState(false);
  const ceremonyRef = useRef<{ slot_id: number; id: string; name: string; chatText: string; gravediggerPhrase: string } | null>(null);

  // ── Slot economy ──
  const userGravesCount = useMemo(() => {
    if (!username) return 0;
    let count = 0;
    state.graves.forEach(g => { if (g.author_github === username) count++; });
    return count;
  }, [state.graves, username]);

  const userCrematedCount = useMemo(() => {
    if (!username) return 0;
    return state.cremated.filter(c => c.author_github === username).length;
  }, [state.cremated, username]);

  const souls = userCrematedCount * 3;
  const slotsUnlocked = 1 + SLOT_THRESHOLDS.filter(t => souls >= t).length;
  const availableSlots = Math.max(0, slotsUnlocked - userGravesCount);

  // ── Cremation daily limit ──
  const dailyCremationsLeft = useMemo(() => {
    if (!username) return 0;
    if (userCrematedCount < 50) return Infinity; // first 50 unlimited
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = state.cremated.filter(
      c => c.author_github === username && new Date(c.created_at) >= todayStart
    ).length;
    return Math.max(0, 3 - todayCount);
  }, [state.cremated, username, userCrematedCount]);

  // ── Handlers ──
  const handleScanned = useCallback((deadRepos: DeadRepo[]) => {
    // Filter out repos already buried (graves) or cremated
    const buriedRepoIds = new Set<number>();
    state.graves.forEach(g => buriedRepoIds.add(g.github_repo_id));
    const crematedNames = new Set(
      state.cremated
        .filter(c => c.author_github === username)
        .map(c => c.name.toLowerCase())
    );

    const fresh = deadRepos.filter(r => {
      if (buriedRepoIds.has(r.id)) return false;
      if (crematedNames.has(r.name.toLowerCase())) return false;
      return true;
    });

    setFilteredCount(deadRepos.length - fresh.length);
    setRepos(fresh);
  }, [state.graves, state.cremated, username]);

  const handleToggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Cleanup graveSet separately — idempotent, safe outside setSelected
    setGraveSet((gs) => {
      if (!gs.has(id)) return gs;
      const ng = new Set(gs);
      ng.delete(id);
      return ng;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelected((prev) => {
      const deselectAll = prev.size === repos.length;
      if (deselectAll) {
        setGraveSet(new Set());
        return new Set();
      }
      // Select all — prune stale graveSet ids
      setGraveSet((gs) => {
        if (gs.size === 0) return gs;
        const repoIds = new Set(repos.map((r) => r.id));
        const pruned = new Set([...gs].filter((id) => repoIds.has(id)));
        return pruned.size === gs.size ? gs : pruned;
      });
      return new Set(repos.map((r) => r.id));
    });
  }, [repos]);

  const handleToggleGrave = useCallback((id: number) => {
    setGraveSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < availableSlots) {
        next.add(id);
      }
      return next;
    });
  }, [availableSlots]);

  const handleSetCause = useCallback((id: number, cause: string) => {
    setCauses((prev) => {
      const next = new Map(prev);
      next.set(id, cause);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (burying) return;
    const selectedRepos = repos.filter((r) => selected.has(r.id));
    setBurying(true);
    setBuryTotal(selectedRepos.length);
    setBuryDone(0);
    setResults([]);
    setStep(4);

    const buryResults: BuryResult[] = [];
    let rateLimited = false;

    for (const repo of selectedRepos) {
      const cause = causes.get(repo.id) || DEATH_CAUSES_DEFAULT;
      const isGrave = graveSet.has(repo.id);

      // Stop sending cremation requests after rate limit
      if (rateLimited && !isGrave) {
        buryResults.push({ name: repo.name, success: false, type: 'cremated', error: 'daily limit reached — come back tomorrow' });
        setBuryDone((d) => d + 1);
        setResults([...buryResults]);
        continue;
      }

      try {
        // Fetch last commit message
        let last_commit_message: string | undefined;
        try {
          const urlParts = new URL(repo.html_url).pathname.split('/').filter(Boolean);
          const [owner, repoName] = urlParts;
          if (owner && repoName) {
            const lcRes = await fetch(`/api/github/last-commit?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repoName)}`);
            if (lcRes.ok) {
              const lcData = await lcRes.json();
              if (lcData.message) last_commit_message = lcData.message;
            }
          }
        } catch {
          // Non-critical
        }

        if (isGrave) {
          // ── Grave burial ──
          const res = await fetch('/api/graves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              github_url: repo.html_url,
              github_repo_id: repo.id,
              name: repo.name,
              cause,
              born_at: repo.created_at || undefined,
              died_at: repo.pushed_at || undefined,
              description: repo.description || undefined,
              stack: repo.language ? [repo.language] : undefined,
              last_commit_message,
            }),
          });

          if (res.status === 409) {
            buryResults.push({ name: repo.name, success: false, type: 'grave', error: 'already buried' });
          } else if (res.status === 507) {
            // Fallback: server says no slots — cremate instead
            if (rateLimited) {
              buryResults.push({ name: repo.name, success: false, type: 'cremated', error: 'daily limit reached — come back tomorrow' });
            } else try {
              const cremRes = await fetch('/api/cremated', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: repo.name, cause, github_url: repo.html_url, last_commit_message }),
              });
              if (cremRes.ok) {
                const cremData = await cremRes.json();
                dispatch({ type: 'ADD_CREMATED', cremated: cremData });
                buryResults.push({ name: repo.name, success: true, type: 'cremated', error: 'no grave slots — cremated' });
              } else if (cremRes.status === 429) {
                rateLimited = true;
                buryResults.push({ name: repo.name, success: false, type: 'cremated', error: 'daily limit reached — come back tomorrow' });
              } else {
                buryResults.push({ name: repo.name, success: false, type: 'cremated', error: 'cremation failed' });
              }
            } catch {
              buryResults.push({ name: repo.name, success: false, type: 'cremated', error: 'cremation failed' });
            }
          } else if (!res.ok) {
            buryResults.push({ name: repo.name, success: false, type: 'grave', error: `HTTP ${res.status}` });
          } else {
            const grave: GraveData = await res.json();
            // Emit ceremony BEFORE dispatch so PhaserCanvas pre-registers the slot_id
            const chatText = `${repo.name} has been buried. Rest in peace.`;
            const gravediggerPhrase = GRAVEDIGGER_BURIAL[Math.floor(Math.random() * GRAVEDIGGER_BURIAL.length)];
            const ceremonyData = { slot_id: grave.slot_id, id: grave.id, name: grave.name, chatText, gravediggerPhrase };
            cemeteryEvents.emit('burial_ceremony', ceremonyData);
            ceremonyRef.current = ceremonyData;
            dispatch({ type: 'ADD_GRAVE', grave });
            buryResults.push({ name: repo.name, success: true, type: 'grave', grave });
          }
        } else {
          // ── Cremation ──
          try {
            const cremRes = await fetch('/api/cremated', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: repo.name, cause, github_url: repo.html_url, last_commit_message }),
            });
            if (cremRes.ok) {
              const cremData = await cremRes.json();
              dispatch({ type: 'ADD_CREMATED', cremated: cremData });
              buryResults.push({ name: repo.name, success: true, type: 'cremated' });

              dispatch({
                type: 'ADD_CHAT_MESSAGE',
                message: {
                  id: crypto.randomUUID(),
                  type: 'burial',
                  text: `${repo.name} has been cremated. Ashes to ashes.`,
                  timestamp: Date.now(),
                },
              });
            } else if (cremRes.status === 409) {
              buryResults.push({ name: repo.name, success: false, type: 'cremated', error: 'already cremated' });
            } else if (cremRes.status === 429) {
              rateLimited = true;
              buryResults.push({ name: repo.name, success: false, type: 'cremated', error: 'daily limit reached — come back tomorrow' });
            } else {
              buryResults.push({ name: repo.name, success: false, type: 'cremated', error: `HTTP ${cremRes.status}` });
            }
          } catch {
            buryResults.push({ name: repo.name, success: false, type: 'cremated', error: 'network error' });
          }
        }
      } catch {
        buryResults.push({ name: repo.name, success: false, type: isGrave ? 'grave' : 'cremated', error: 'network error' });
      }

      setBuryDone((d) => d + 1);
      setResults([...buryResults]);
    }

    setBurying(false);

    // Mass burial gravedigger comment if 4+ successful burials
    const successCount = buryResults.filter(r => r.success).length;
    if (successCount > 3) {
      const phrase = GRAVEDIGGER_MASS_BURIAL[Math.floor(Math.random() * GRAVEDIGGER_MASS_BURIAL.length)];
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        message: {
          id: crypto.randomUUID(),
          type: 'gravedigger',
          text: phrase,
          timestamp: Date.now(),
        },
      });
    }

    // If there's a pending ceremony and no other results worth showing, close immediately
    const hasCeremony = ceremonyRef.current !== null;
    ceremonyRef.current = null; // reset after reading
    const hasOtherResults = buryResults.some(r => r.type === 'cremated' && r.success);
    if (hasCeremony && !hasOtherResults) {
      close();
    }
  }, [repos, selected, graveSet, causes, dispatch, burying, close]);

  if (isMobile) return null;

  return (
    <ModalOverlay onClose={burying ? (() => {}) : close}>
      <StoneFrame isMobile={isMobile} maxWidth={520}>
        <div style={{
          padding: isMobile ? '20px 16px' : '24px 28px',
          maxHeight: isMobile ? '100vh' : undefined,
          overflowY: isMobile ? 'auto' : undefined,
        }}>
          {!burying && <CloseButton onClick={close} />}

          <h2 style={{ margin: '0 0 16px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            {step === 1 && 'Scan Repositories'}
            {step === 2 && 'Select for Burial'}
            {step === 3 && 'Cause of Death'}
            {step === 4 && (burying
              ? 'Burying...'
              : results.some(r => r.success)
                ? 'Burial Complete'
                : 'Burial Failed')}
          </h2>

          {step === 1 && (
            <StepScan
              repos={repos}
              loading={loading}
              error={error}
              username={username}
              filteredCount={filteredCount}
              onScanned={handleScanned}
              onError={setError}
              onNext={() => setStep(2)}
              setLoading={setLoading}
            />
          )}

          {step === 2 && (
            <StepSelect
              repos={repos}
              selected={selected}
              graveSet={graveSet}
              availableSlots={availableSlots}
              slotsUnlocked={slotsUnlocked}
              dailyCremationsLeft={dailyCremationsLeft}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
              onToggleGrave={handleToggleGrave}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <StepCause
              repos={repos}
              selected={selected}
              causes={causes}
              onSetCause={handleSetCause}
              onSubmit={handleSubmit}
              onBack={() => setStep(2)}
              loading={burying}
            />
          )}

          {step === 4 && (
            <StepDone
              results={results}
              total={buryTotal}
              done={buryDone}
              burying={burying}
              onClose={close}
              onOpenSkill={() => open('skill')}
              onOpenProfile={() => open('profile')}
            />
          )}

        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
