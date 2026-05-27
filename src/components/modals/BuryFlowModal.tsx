'use client';

import { useState, useCallback, useMemo, useRef, type SetStateAction } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
import { calculateSouls, calculateUserSlotEconomy, isAutoAssignableGraveSlotType } from '@/lib/slot-economy';
import { getDemoGraveBonusSlots } from '@/demo/mode';
import { savePendingBurialCeremony } from '@/lib/pending-burial-ceremony';
import type { SlotPositionData } from '@/game/events';

const DEATH_CAUSES_DEFAULT = 'Developer lost interest';
const USER_GRAVE_SLOTS_EXHAUSTED = 'USER_GRAVE_SLOTS_EXHAUSTED';

type InitialMode = 'burial' | 'cremation';
export type BuryFlowMode = 'default-scanner' | 'home-preselected-burial' | 'home-preselected-cremation' | 'cemetery-shovel' | 'cemetery-fire';

export function resolveBuryFlowMode(modalData: { flowMode?: BuryFlowMode; initialDeadRepos?: DeadRepo[]; initialMode?: InitialMode } | null | undefined): BuryFlowMode {
  if (modalData?.flowMode) return modalData.flowMode;
  const hasInitialRepos = (modalData?.initialDeadRepos?.length ?? 0) > 0;
  if (hasInitialRepos && modalData?.initialMode === 'burial') return 'home-preselected-burial';
  if (hasInitialRepos && modalData?.initialMode === 'cremation') return 'home-preselected-cremation';
  if (modalData?.initialMode === 'burial') return 'cemetery-shovel';
  if (modalData?.initialMode === 'cremation') return 'cemetery-fire';
  return 'default-scanner';
}

export function getBuryFlowUi(flowMode: BuryFlowMode) {
  const isBurial = flowMode === 'home-preselected-burial' || flowMode === 'cemetery-shovel';
  const isCremation = flowMode === 'home-preselected-cremation' || flowMode === 'cemetery-fire';
  const selectedProjectOnly = flowMode === 'home-preselected-burial';
  return {
    isBurial,
    isCremation,
    isSingleSelection: isBurial,
    startsAtSelect: flowMode === 'home-preselected-burial' || flowMode === 'home-preselected-cremation',
    selectedProjectOnly,
    closeSelectBack: selectedProjectOnly,
    initialMode: isBurial ? 'burial' as const : isCremation ? 'cremation' as const : undefined,
  };
}

export async function shouldFallbackGraveToCremation(res: Response): Promise<boolean> {
  if (res.status === 507) return true;
  if (res.status !== 403) return false;

  try {
    const data = await res.clone().json();
    return data?.code === USER_GRAVE_SLOTS_EXHAUSTED;
  } catch {
    return false;
  }
}

export function withDefaultGraveForSelectedRepo(graveSet: Set<number>, repoId: number, availableSlots: number): Set<number> {
  if (availableSlots <= 0 || graveSet.has(repoId) || graveSet.size >= availableSlots) return graveSet;
  const next = new Set(graveSet);
  next.add(repoId);
  return next;
}

export function getDefaultGraveSetForSelectAll(repoIds: number[], availableSlots: number): Set<number> {
  if (availableSlots <= 0) return new Set();
  return new Set(repoIds.slice(0, availableSlots));
}

export function shouldAutoAssignGraveOnSelection(initialMode?: InitialMode): boolean {
  return initialMode !== 'cremation';
}

export function shouldAllowGraveToggle(initialMode?: InitialMode): boolean {
  return initialMode !== 'burial' && initialMode !== 'cremation';
}

export function getInitialSelectedRepoSet(repoIds: number[], initialMode?: InitialMode): Set<number> {
  return new Set(initialMode === 'burial' ? repoIds.slice(0, 1) : repoIds);
}

export function getNextSelectedRepoSet({
  selected,
  repoId,
  initialMode,
}: {
  selected: Set<number>;
  repoId: number;
  initialMode?: InitialMode;
}): Set<number> {
  if (initialMode === 'burial') {
    return selected.has(repoId) ? new Set() : new Set([repoId]);
  }

  const next = new Set(selected);
  if (next.has(repoId)) next.delete(repoId);
  else next.add(repoId);
  return next;
}

export function getSelectedReposForSubmit({
  repos,
  selected,
  initialMode,
}: {
  repos: DeadRepo[];
  selected: Set<number>;
  initialMode?: InitialMode;
}): DeadRepo[] {
  return repos.filter((repo) => selected.has(repo.id)).slice(0, initialMode === 'burial' ? 1 : undefined);
}

export function getRepoSubmissionType({
  repoId,
  graveSet,
  initialMode,
}: {
  repoId: number;
  graveSet: Set<number>;
  initialMode?: InitialMode;
}): 'grave' | 'cremated' {
  return initialMode === 'burial' || graveSet.has(repoId) ? 'grave' : 'cremated';
}

export function shouldCremateAfterSlotExhaustion(initialMode?: InitialMode): boolean {
  return initialMode !== 'burial';
}

export function countUserAutoAssignableGraves({
  graves,
  slotPositions,
  username,
}: {
  graves: Map<number, GraveData>;
  slotPositions: SlotPositionData[];
  username: string | null;
}): number {
  if (!username) return 0;
  const normalizedUsername = username.toLowerCase();

  if (slotPositions.length === 0) {
    let count = 0;
    graves.forEach((grave) => {
      if (grave.author_github?.toLowerCase() === normalizedUsername) count++;
    });
    return count;
  }

  const autoSlotIds = new Set(
    slotPositions
      .filter((slot) => isAutoAssignableGraveSlotType(slot.type))
      .map((slot) => slot.id)
  );
  let count = 0;
  graves.forEach((grave) => {
    if (grave.author_github?.toLowerCase() === normalizedUsername && autoSlotIds.has(grave.slot_id)) count++;
  });
  return count;
}

function toEnglishSafeProjectLabel(name: string): string {
  return /[^\x00-\x7F]/.test(name) ? 'A project' : name;
}

export default function BuryFlowModal() {
  const { close, open, modalData } = useModal();
  const { state, dispatch } = useGame();
  const { data: session } = useSession();
  const router = useRouter();
  const isMobile = useIsMobile();
  const username = session?.user?.github_username ?? null;
  const hasSharedFirstGrave = Boolean(session?.user?.x_first_grave_shared_at);
  const flowMode = resolveBuryFlowMode(modalData);
  const flowUi = getBuryFlowUi(flowMode);
  const initialDeadRepos = modalData?.initialDeadRepos;
  const initialMode = flowUi.initialMode;
  const initialRepos = useMemo(() => initialDeadRepos ?? [], [initialDeadRepos]);
  const suppressCeremony = modalData?.suppressCeremony === true;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(flowUi.startsAtSelect ? 2 : 1);
  const [repos, setRepos] = useState<DeadRepo[]>(initialRepos);
  const [filteredCount, setFilteredCount] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(() => getInitialSelectedRepoSet(initialRepos.map((repo) => repo.id), initialMode));
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
    return countUserAutoAssignableGraves({
      graves: state.graves,
      slotPositions: state.slotPositions,
      username,
    });
  }, [state.graves, state.slotPositions, username]);

  const userCremated = useMemo(() => {
    if (!username) return [];
    return state.cremated.filter(c => c.author_github === username);
  }, [state.cremated, username]);

  const userCrematedCount = userCremated.length;

  const souls = calculateSouls(userCremated);
  const slotEconomy = calculateUserSlotEconomy({
    souls,
    slotsUsed: userGravesCount,
    hasSharedFirstGrave,
    bonusSlots: getDemoGraveBonusSlots(username),
  });
  const slotsUnlocked = slotEconomy.slotsUnlocked;
  const availableSlots = slotEconomy.availableSlots;
  const selectableGraveSlots = initialMode === 'cremation' ? 0 : availableSlots;
  const defaultGraveSet = useMemo(
    () => getDefaultGraveSetForSelectAll(repos.map((repo) => repo.id), selectableGraveSlots),
    [repos, selectableGraveSlots]
  );
  const [graveSetOverride, setGraveSetOverride] = useState<Set<number> | null>(null);
  const graveSet = graveSetOverride ?? defaultGraveSet;
  const setGraveSet = useCallback((next: SetStateAction<Set<number>>) => {
    setGraveSetOverride((currentOverride) => {
      const current = currentOverride ?? defaultGraveSet;
      return typeof next === 'function' ? next(current) : next;
    });
  }, [defaultGraveSet]);

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
    const wasSelected = selected.has(id);
    setSelected(getNextSelectedRepoSet({ selected, repoId: id, initialMode }));
    setGraveSet((gs) => {
      if (!shouldAutoAssignGraveOnSelection(initialMode)) return gs;
      if (initialMode === 'burial') {
        return wasSelected ? new Set() : withDefaultGraveForSelectedRepo(new Set(), id, availableSlots);
      }
      if (!wasSelected) return withDefaultGraveForSelectedRepo(gs, id, availableSlots);
      if (!gs.has(id)) return gs;
      const ng = new Set(gs);
      ng.delete(id);
      return ng;
    });
  }, [availableSlots, initialMode, selected, setGraveSet]);

  const handleToggleAll = useCallback(() => {
    const repoIds = repos.map((r) => r.id);
    const deselectAll = initialMode === 'burial' ? selected.size > 0 : selected.size === repos.length;
    const nextSelected = deselectAll
      ? new Set<number>()
      : new Set(initialMode === 'burial' ? repoIds.slice(0, 1) : repoIds);
    setSelected(nextSelected);
    setGraveSet(getDefaultGraveSetForSelectAll([...nextSelected], selectableGraveSlots));
  }, [initialMode, repos, selectableGraveSlots, selected, setGraveSet]);

  const handleToggleGrave = useCallback((id: number) => {
    if (!shouldAllowGraveToggle(initialMode)) return;
    setGraveSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < availableSlots) {
        next.add(id);
      }
      return next;
    });
  }, [availableSlots, initialMode, setGraveSet]);

  const handleSetCause = useCallback((id: number, cause: string) => {
    setCauses((prev) => {
      const next = new Map(prev);
      next.set(id, cause);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (burying) return;
    const selectedRepos = getSelectedReposForSubmit({ repos, selected, initialMode });
    setBurying(true);
    setBuryTotal(selectedRepos.length);
    setBuryDone(0);
    setResults([]);
    setStep(4);

    const buryResults: BuryResult[] = [];
    let rateLimited = false;

    for (const repo of selectedRepos) {
      const cause = causes.get(repo.id) || DEATH_CAUSES_DEFAULT;
      const isGrave = getRepoSubmissionType({ repoId: repo.id, graveSet, initialMode }) === 'grave';

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
          } else if (await shouldFallbackGraveToCremation(res)) {
            if (!shouldCremateAfterSlotExhaustion(initialMode)) {
              buryResults.push({ name: repo.name, success: false, type: 'grave', error: 'no grave slots left' });
              continue;
            }
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
                buryResults.push({ name: repo.name, success: true, type: 'cremated', cremated: cremData, error: 'no grave slots - cremated' });
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
            const chatText = `${toEnglishSafeProjectLabel(repo.name)} has been buried. Rest in peace.`;
            const gravediggerPhrase = GRAVEDIGGER_BURIAL[Math.floor(Math.random() * GRAVEDIGGER_BURIAL.length)];
            if (!suppressCeremony) {
              const ceremonyData = { slot_id: grave.slot_id, id: grave.id, name: grave.name, chatText, gravediggerPhrase };
              let ceremonyScheduled = false;
              if (typeof window !== 'undefined' && window.location.pathname !== '/cemetery') {
                ceremonyScheduled = savePendingBurialCeremony(ceremonyData);
                if (ceremonyScheduled) router.push('/cemetery');
                else router.push(`/cemetery?grave=${encodeURIComponent(grave.id)}`);
              } else {
                cemeteryEvents.emit('burial_ceremony', ceremonyData);
                ceremonyScheduled = true;
              }
              if (ceremonyScheduled) ceremonyRef.current = ceremonyData;
            }
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
              buryResults.push({ name: repo.name, success: true, type: 'cremated', cremated: cremData });

              dispatch({
                type: 'ADD_CHAT_MESSAGE',
                message: {
                  id: crypto.randomUUID(),
                  type: 'burial',
                  text: `${toEnglishSafeProjectLabel(repo.name)} has been cremated. Ashes to ashes.`,
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
  }, [repos, selected, graveSet, causes, dispatch, burying, close, suppressCeremony, initialMode, router]);

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
            {step === 2 && (flowUi.selectedProjectOnly ? 'Selected Project' : 'Select Projects')}
            {step === 3 && 'Cause of Death'}
            {step === 4 && (() => {
              if (burying) return 'Processing...';
              const hasSuccess = results.some(r => r.success);
              if (!hasSuccess) return 'Failed';
              const graves = results.filter(r => r.success && r.type === 'grave').length;
              const cremations = results.filter(r => r.success && r.type === 'cremated').length;
              if (graves > 0 && cremations > 0) return 'Complete';
              if (graves > 0) return 'Burial Complete';
              return 'Cremation Complete';
            })()}
          </h2>

          {step === 1 && (
            <p style={{ color: '#aaa9a0', fontSize: 13, lineHeight: 1.5, margin: '-6px 0 18px', textAlign: 'center' }}>
              {initialMode === 'burial'
                ? 'The Gravedigger scans your GitHub for non-fork repos with no pushes for 7+ days. Pick one project for one grave.'
                : initialMode === 'cremation'
                  ? 'The Gravedigger scans your GitHub for non-fork repos with no pushes for 7+ days. Pick projects for cremation.'
                  : 'The Gravedigger scans your GitHub for non-fork repos with no pushes for 7+ days. Pick which ones become graves or cremations.'}
            </p>
          )}

          {step === 1 && (
            <StepScan
              repos={repos}
              loading={loading}
              error={error}
              username={username}
              filteredCount={filteredCount}
              recordsLoading={state.gravesLoading || state.crematedLoading}
              burialOnly={flowUi.isBurial}
              cremationOnly={flowUi.isCremation}
              onOpenSkill={() => open('skill')}
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
              availableSlots={selectableGraveSlots}
              slotsUnlocked={slotsUnlocked}
              dailyCremationsLeft={dailyCremationsLeft}
              singleSelection={flowUi.isSingleSelection}
              cremationOnly={flowUi.isCremation}
              burialOnly={flowUi.selectedProjectOnly}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
              onToggleGrave={handleToggleGrave}
              onNext={() => setStep(3)}
              onBack={() => { if (flowUi.closeSelectBack) close(); else setStep(1); }}
            />
          )}

          {step === 3 && (
            <StepCause
              repos={repos}
              selected={selected}
              graveSet={graveSet}
              causes={causes}
              onSetCause={handleSetCause}
              onSubmit={handleSubmit}
              onBack={() => setStep(2)}
              loading={burying}
              burialOnly={initialMode === 'burial'}
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
              onOpenUrn={(cremated) => open('urn', { crematedItem: cremated })}
            />
          )}

        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
