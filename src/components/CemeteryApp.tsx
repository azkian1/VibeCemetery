'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createModalInstanceId, GameProvider, useGame, useGraves, useCremated, useFStatus, useModal, type ModalType } from '@/context/GameContext';
import { cemeteryEvents } from '@/game/events';
import { removeBuryModalIntentFromUrl, shouldOpenBuryModalFromSearchParams } from '@/lib/bury-intent';
import { consumePendingBurialCeremony } from '@/lib/pending-burial-ceremony';
import Web3Provider from '@/web3/Web3Provider';

const PhaserCanvas = dynamic(() => import('./PhaserCanvas'), { ssr: false });
const HoverTooltip = dynamic(() => import('./HoverTooltip'), { ssr: false });
const GraveModal = dynamic(() => import('./modals/GraveModal'), { ssr: false });
const CrematoryModal = dynamic(() => import('./modals/CrematoryModal'), { ssr: false });
const MausoleumModal = dynamic(() => import('./modals/MausoleumModal'), { ssr: false });
const TopBar = dynamic(() => import('./hud/TopBar'), { ssr: false });
const BuryFlowModal = dynamic(() => import('./modals/BuryFlowModal'), { ssr: false });
const BurgerMenu = dynamic(() => import('./hud/BurgerMenu'), { ssr: false });
const CTAButtons = dynamic(() => import('./hud/CTAButtons'), { ssr: false });
const ChatLog = dynamic(() => import('./hud/ChatLog'), { ssr: false });
const Minimap = dynamic(() => import('./hud/Minimap'), { ssr: false });
const GateEpitaph = dynamic(() => import('./hud/GateEpitaph'), { ssr: false });
const ZoomButtons = dynamic(() => import('./hud/ZoomButtons'), { ssr: false });
const LeaderboardModal = dynamic(() => import('./modals/LeaderboardModal'), { ssr: false });
const AgentAshesModal = dynamic(() => import('./modals/AgentAshesModal'), { ssr: false });
const SkillModal = dynamic(() => import('./modals/SkillModal'), { ssr: false });
const AgentSkillModal = dynamic(() => import('./modals/AgentSkillModal'), { ssr: false });
const ProfileModal = dynamic(() => import('./modals/ProfileModal'), { ssr: false });
const UrnModal = dynamic(() => import('./modals/UrnModal'), { ssr: false });

export function GameDataLoaders() {
  useGraves();
  useCremated();
  useFStatus();
  return null;
}

function DeepLinkOpener() {
  const searchParams = useSearchParams();
  const { state, dispatch } = useGame();
  const navigatedFor = useRef<string | null>(null);
  const urnHandled = useRef<string | null>(null);
  const buryIntentHandled = useRef(false);
  const pendingCeremonyHandled = useRef(false);
  const activeModalRef = useRef(state.activeModal);

  useEffect(() => {
    activeModalRef.current = state.activeModal;
  }, [state.activeModal]);

  useEffect(() => {
    if (buryIntentHandled.current) return;
    if (!shouldOpenBuryModalFromSearchParams(searchParams)) return;

    buryIntentHandled.current = true;
    dispatch({ type: 'OPEN_MODAL', id: createModalInstanceId(), modal: 'bury', data: { flowMode: 'default-scanner' } });
    window.history.replaceState(
      window.history.state,
      '',
      removeBuryModalIntentFromUrl(window.location.href),
    );
  }, [searchParams, dispatch]);

  useEffect(() => {
    if (pendingCeremonyHandled.current) return;
    if (state.slotPositions.length === 0) return;

    const data = consumePendingBurialCeremony();
    if (!data) return;

    pendingCeremonyHandled.current = true;
    cemeteryEvents.emit('burial_ceremony', data);
  }, [state.slotPositions.length]);

  useEffect(() => {
    if (state.gravesLoading || state.slotPositions.length === 0) return;
    const graveId = searchParams.get('grave');
    if (!graveId || graveId === navigatedFor.current) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    const isMob = window.innerWidth < 640;
    const d = (ms: number) => isMob ? Math.round(ms / 2) : ms;

    if (graveId === 'meta') {
      const META_SLOT = 105;
      const slot = state.slotPositions.find((s) => s.id === META_SLOT);
      if (slot) {
        navigatedFor.current = graveId;
        const wx = slot.x + slot.width / 2;
        const wy = slot.y + slot.height / 2;
        timers.push(setTimeout(() => {
          if (cancelled) return;
          cemeteryEvents.emit('minimap_click', { worldX: wx, worldY: wy });
        }, d(2100)));
        timers.push(setTimeout(() => {
          if (cancelled) return;
          cemeteryEvents.emit('highlight_slot', { slotId: META_SLOT });
        }, d(2450)));
        timers.push(setTimeout(() => {
          if (cancelled || activeModalRef.current) return;
          dispatch({ type: 'OPEN_MODAL', id: createModalInstanceId(), modal: 'grave', data: { slotId: META_SLOT, slotType: 'meta_grave' } });
        }, d(4700)));
      } else {
        navigatedFor.current = graveId;
      }
      return () => { cancelled = true; timers.forEach(clearTimeout); };
    }

    let found = false;
    for (const [, g] of state.graves) {
      if (g.id === graveId) {
        found = true;
        const slot = state.slotPositions.find((s) => s.id === g.slot_id);
        if (!slot) break;
        navigatedFor.current = graveId;
        const slotId = g.slot_id;
        const wx = slot.x + slot.width / 2;
        const wy = slot.y + slot.height / 2;
        timers.push(setTimeout(() => {
          if (cancelled) return;
          cemeteryEvents.emit('minimap_click', { worldX: wx, worldY: wy });
        }, d(2100)));
        timers.push(setTimeout(() => {
          if (cancelled) return;
          cemeteryEvents.emit('highlight_slot', { slotId });
        }, d(2450)));
        timers.push(setTimeout(() => {
          if (cancelled || activeModalRef.current) return;
          dispatch({ type: 'OPEN_MODAL', id: createModalInstanceId(), modal: 'grave', data: { slotId } });
        }, d(4700)));
        break;
      }
    }

    if (!found) navigatedFor.current = graveId;

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [state.gravesLoading, state.graves, state.slotPositions, searchParams, dispatch]);

  useEffect(() => {
    if (state.crematedLoading) return;
    const urnId = searchParams.get('urn');
    if (!urnId || urnId === urnHandled.current) return;
    const numId = parseInt(urnId, 10);
    if (isNaN(numId) || numId < 0 || numId > 999999) return;

    const item = state.cremated.find((c) => c.id === numId);
    if (!item) return;

    urnHandled.current = urnId;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || activeModalRef.current) return;
      dispatch({ type: 'OPEN_MODAL', id: createModalInstanceId(), modal: 'urn', data: { crematedItem: item } });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.crematedLoading, state.cremated, searchParams, dispatch]);

  return null;
}

const MODAL_MAP: Record<ModalType, React.ComponentType> = {
  grave: GraveModal,
  crematory: CrematoryModal,
  mausoleum: MausoleumModal,
  burger: BurgerMenu,
  leaderboard: LeaderboardModal,
  agentAshes: AgentAshesModal,
  agentSkill: AgentSkillModal,
  bury: BuryFlowModal,
  skill: SkillModal,
  profile: ProfileModal,
  urn: UrnModal,
};

export function ModalLayer() {
  const { modalStack } = useModal();
  if (modalStack.length === 0) return null;
  return (
    <>
      {modalStack.map((entry, i) => {
        const C = MODAL_MAP[entry.modal];
        if (!C) return null;
        const isTop = i === modalStack.length - 1;
        return (
          <div
            key={entry.id}
            style={{ display: isTop ? 'contents' : 'none' }}
            aria-hidden={!isTop}
            inert={!isTop || undefined}
          >
            <C />
          </div>
        );
      })}
    </>
  );
}

export default function CemeteryApp() {
  return (
    <Web3Provider>
      <GameProvider>
        <GameDataLoaders />
        <Suspense><DeepLinkOpener /></Suspense>
        <div data-testid="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
          <header>
            <TopBar />
          </header>
          <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <PhaserCanvas />
            <GateEpitaph />
            <HoverTooltip />
            <Minimap />
            <CTAButtons />
            <ChatLog />
            <ZoomButtons />
            <ModalLayer />
          </main>
        </div>
      </GameProvider>
    </Web3Provider>
  );
}
