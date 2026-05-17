'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { GameProvider, useGame, useGraves, useCremated, useFStatus, useModal, type ModalType } from '@/context/GameContext';
import { cemeteryEvents } from '@/game/events';

const PhaserCanvas = dynamic(() => import('../components/PhaserCanvas'), {
  ssr: false,
});
const HoverTooltip = dynamic(() => import('../components/HoverTooltip'), {
  ssr: false,
});
const GraveModal = dynamic(
  () => import('../components/modals/GraveModal'),
  { ssr: false },
);
const CrematoryModal = dynamic(
  () => import('../components/modals/CrematoryModal'),
  { ssr: false },
);
const MausoleumModal = dynamic(
  () => import('../components/modals/MausoleumModal'),
  { ssr: false },
);
const TopBar = dynamic(() => import('../components/hud/TopBar'), {
  ssr: false,
});
const BuryFlowModal = dynamic(
  () => import('../components/modals/BuryFlowModal'),
  { ssr: false },
);
const BurgerMenu = dynamic(() => import('../components/hud/BurgerMenu'), {
  ssr: false,
});
const CTAButtons = dynamic(() => import('../components/hud/CTAButtons'), {
  ssr: false,
});
const ChatLog = dynamic(() => import('../components/hud/ChatLog'), {
  ssr: false,
});
const Minimap = dynamic(() => import('../components/hud/Minimap'), {
  ssr: false,
});
const GateEpitaph = dynamic(() => import('../components/hud/GateEpitaph'), {
  ssr: false,
});
const ZoomButtons = dynamic(() => import('../components/hud/ZoomButtons'), {
  ssr: false,
});
const LeaderboardModal = dynamic(
  () => import('../components/modals/LeaderboardModal'),
  { ssr: false },
);
const AgentAshesModal = dynamic(
  () => import('../components/modals/AgentAshesModal'),
  { ssr: false },
);
const SkillModal = dynamic(
  () => import('../components/modals/SkillModal'),
  { ssr: false },
);
const ProfileModal = dynamic(
  () => import('../components/modals/ProfileModal'),
  { ssr: false },
);
const UrnModal = dynamic(
  () => import('../components/modals/UrnModal'),
  { ssr: false },
);

/** Mounts inside GameProvider to trigger grave loading on app start */
function GravesLoader() {
  useGraves();
  return null;
}

/** Mounts inside GameProvider to trigger cremated loading on app start */
function CrematedLoader() {
  useCremated();
  return null;
}

/** Fetches all F vote statuses once after graves are loaded */
function FStatusLoader() {
  useFStatus();
  return null;
}

/** Navigates camera to grave, highlights it, then opens modal when ?grave=<uuid> is in the URL */
function DeepLinkOpener() {
  const searchParams = useSearchParams();
  const { state, dispatch } = useGame();
  const navigatedFor = useRef<string | null>(null);
  const urnHandled = useRef<string | null>(null);
  const activeModalRef = useRef(state.activeModal);

  useEffect(() => {
    activeModalRef.current = state.activeModal;
  }, [state.activeModal]);

  // Deep link: ?grave=<uuid>
  useEffect(() => {
    if (state.gravesLoading || state.slotPositions.length === 0) return;
    const graveId = searchParams.get('grave');
    if (!graveId || graveId === navigatedFor.current) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    const isMob = window.innerWidth < 640;
    const d = (ms: number) => isMob ? Math.round(ms / 2) : ms;

    // Meta grave deep link: ?grave=meta → slot 105
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
          dispatch({ type: 'OPEN_MODAL', modal: 'grave', data: { slotId: META_SLOT, slotType: 'meta_grave' } });
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
        // Pan camera after initial zoom-in tween (2000ms)
        timers.push(setTimeout(() => {
          if (cancelled) return;
          cemeteryEvents.emit('minimap_click', { worldX: wx, worldY: wy });
        }, d(2100)));
        // Highlight after camera pan (2100 + 300ms tween)
        timers.push(setTimeout(() => {
          if (cancelled) return;
          cemeteryEvents.emit('highlight_slot', { slotId });
        }, d(2450)));
        // Open grave modal — skip if user already interacted with something
        timers.push(setTimeout(() => {
          if (cancelled || activeModalRef.current) return;
          dispatch({ type: 'OPEN_MODAL', modal: 'grave', data: { slotId } });
        }, d(4700)));
        break;
      }
    }

    // Grave UUID not in map — mark as handled to stop retrying
    if (!found) navigatedFor.current = graveId;

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [state.gravesLoading, state.graves, state.slotPositions, searchParams, dispatch]);

  // Deep link: ?urn=<id>
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
      dispatch({ type: 'OPEN_MODAL', modal: 'urn', data: { crematedItem: item } });
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
  bury: BuryFlowModal,
  skill: SkillModal,
  profile: ProfileModal,
  urn: UrnModal,
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
            key={entry.modal}
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


export default function Home() {
  return (
    <GameProvider>
      <GravesLoader />
      <CrematedLoader />
      <FStatusLoader />
      <Suspense><DeepLinkOpener /></Suspense>
      <div data-testid="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
        {/* TopBar — separate zone above the map */}
        <header>
          <TopBar />
        </header>

        {/* Map area — fills remaining height */}
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <PhaserCanvas />
          <GateEpitaph />
          <HoverTooltip />
          <Minimap />
          <ChatLog />
          <CTAButtons />
          <ZoomButtons />
          <ModalLayer />
        </main>
      </div>
    </GameProvider>
  );
}
