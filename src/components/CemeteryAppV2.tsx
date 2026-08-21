'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { CemeteryMapVersionContext, createModalInstanceId, GameProvider, useGame, useGraves, useCremated, useFStatus, useModal, type ModalType } from '@/context/GameContext';
import { cemeteryEvents } from '@/game/events';
import { removeBuryModalIntentFromUrl, shouldOpenBuryModalFromSearchParams } from '@/lib/bury-intent';
import { consumePendingBurialCeremony } from '@/lib/pending-burial-ceremony';

const PhaserCanvasV2 = dynamic(() => import('./PhaserCanvasV2'), { ssr: false });
const HoverTooltip = dynamic(() => import('./HoverTooltip'), { ssr: false });
const GraveModal = dynamic(() => import('./modals/GraveModal'), { ssr: false });
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

export function GameDataLoadersV2() {
  useGraves({ mapVersion: 'v2' });
  useCremated();
  useFStatus();
  return null;
}

function DeepLinkOpenerV2() {
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

    navigatedFor.current = graveId;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const halve = (ms: number) => isMobile ? Math.ceil(ms / 2) : ms;

    if (graveId === 'meta') {
      const metaSlot = state.slotPositions.find(s => s.id === 105);
      if (metaSlot) {
        timers.push(setTimeout(() => {
          cemeteryEvents.emit('minimap_click', {
            worldX: metaSlot.x + metaSlot.width / 2,
            worldY: metaSlot.y + metaSlot.height / 2,
          });
        }, halve(2100)));
        timers.push(setTimeout(() => {
          cemeteryEvents.emit('highlight_slot', { slotId: 105 });
        }, halve(2450)));
        timers.push(setTimeout(() => {
          if (activeModalRef.current) return;
          dispatch({ type: 'OPEN_MODAL', id: createModalInstanceId(), modal: 'grave', data: { slotId: 105, slotType: 'meta_grave' } });
        }, halve(4700)));
      }
    } else {
      for (const g of state.graves.values()) {
        if (g.id !== graveId) continue;
        const slot = state.slotPositions.find(s => s.id === g.slot_id);
        if (!slot) continue;

        timers.push(setTimeout(() => {
          cemeteryEvents.emit('minimap_click', {
            worldX: slot.x + slot.width / 2,
            worldY: slot.y + slot.height / 2,
          });
        }, halve(2100)));
        timers.push(setTimeout(() => {
          cemeteryEvents.emit('highlight_slot', { slotId: slot.id });
        }, halve(2450)));
        timers.push(setTimeout(() => {
          if (activeModalRef.current) return;
          dispatch({ type: 'OPEN_MODAL', id: createModalInstanceId(), modal: 'grave', data: { slotId: slot.id } });
        }, halve(4700)));
        break;
      }
    }

    return () => { for (const t of timers) clearTimeout(t); };
  }, [state.gravesLoading, state.slotPositions.length, state.slotPositions, state.graves, searchParams, dispatch]);

  useEffect(() => {
    if (state.slotPositions.length === 0) return;
    const urnId = searchParams.get('urn');
    if (!urnId || urnId === urnHandled.current) return;
    urnHandled.current = urnId;

    const item = state.cremated.find(c => String(c.id) === urnId);
    if (!item) return;

    const timer = setTimeout(() => {
      if (activeModalRef.current) return;
      dispatch({ type: 'OPEN_MODAL', id: createModalInstanceId(), modal: 'urn', data: { crematedItem: item } });
    }, 500);
    return () => clearTimeout(timer);
  }, [state.slotPositions.length, state.cremated, searchParams, dispatch]);

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODAL_MAP: Record<ModalType, React.ComponentType<any>> = {
  grave: GraveModal,
  mausoleum: MausoleumModal,
  bury: BuryFlowModal,
  burger: BurgerMenu,
  leaderboard: LeaderboardModal,
  agentAshes: AgentAshesModal,
  agentSkill: AgentSkillModal,
  skill: SkillModal,
  profile: ProfileModal,
  urn: UrnModal,
  crematory: MausoleumModal,
};

function ModalLayer() {
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

export default function CemeteryAppV2() {
  return (
    <CemeteryMapVersionContext.Provider value="v2">
      <GameProvider>
        <GameDataLoadersV2 />
        <Suspense fallback={null}>
          <DeepLinkOpenerV2 />
        </Suspense>

        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', overflow: 'hidden', background: '#1a1918' }}>
          <header style={{ flexShrink: 0, position: 'relative', zIndex: 10 }}>
            <TopBar mapVersion="v2" />
          </header>
          <main style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
            <PhaserCanvasV2 />
            <GateEpitaph />
            <HoverTooltip />
            <Minimap mapVersion="v2" />
            <CTAButtons />
            <ChatLog />
            <ZoomButtons />
            <ModalLayer />
          </main>
        </div>
      </GameProvider>
    </CemeteryMapVersionContext.Provider>
  );
}
