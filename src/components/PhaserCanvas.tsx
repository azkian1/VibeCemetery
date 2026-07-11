'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { cemeteryEvents, type SlotEventData, type SlotsReadyData, type RenderGraveData } from '../game/events';
import { useGame } from '@/context/GameContext';
import { createModalInstanceId, type ModalType } from '@/context/GameContext';
import StoneButton from '@/components/ui/StoneButton';
import { readPendingBurialCeremony } from '@/lib/pending-burial-ceremony';

function getContainerSize(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.floor(rect.width),
    height: Math.floor(rect.height),
  };
}

async function waitForContainerSize(element: HTMLElement) {
  for (let i = 0; i < 10; i += 1) {
    const size = getContainerSize(element);
    if (size.width > 0 && size.height > 0) return size;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  return getContainerSize(element);
}

export default function PhaserCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [ready, setReady] = useState(false);
  const [assetLoadError, setAssetLoadError] = useState<{ assetKey: string; assetUrl: string } | null>(null);
  const [syncRevision, setSyncRevision] = useState(0);
  const { state, dispatch } = useGame();
  const ceremonySlotIdsRef = useRef(new Set<number>());
  const ceremonyChatsRef = useRef(new Map<number, { chatText: string; gravediggerPhrase: string }>());
  const ceremonyDoneTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const activeModalRef = useRef(state.activeModal);
  const gravesRef = useRef(state.graves);

  useEffect(() => {
    activeModalRef.current = state.activeModal;
  }, [state.activeModal]);

  useEffect(() => {
    gravesRef.current = state.graves;
  }, [state.graves]);

  useEffect(() => {
    const data = readPendingBurialCeremony();
    if (!data) return;
    ceremonySlotIdsRef.current.add(data.slot_id);
    if (data.chatText && data.gravediggerPhrase) {
      ceremonyChatsRef.current.set(data.slot_id, { chatText: data.chatText, gravediggerPhrase: data.gravediggerPhrase });
    }
  }, []);

  const handleGraveClick = useCallback((data: SlotEventData) => {
    if (!gravesRef.current.has(data.slotId) && data.type !== 'meta_grave') return;
    dispatch({
      type: 'OPEN_MODAL',
      id: createModalInstanceId(),
      modal: 'grave',
      data: { slotId: data.slotId, slotType: data.type },
    });
  }, [dispatch]);

  const handleBuildingClick = useCallback((data: SlotEventData) => {
    const modal: ModalType =
      data.name === 'Crematory' ? 'crematory' : 'mausoleum';
    dispatch({
      type: 'OPEN_MODAL',
      id: createModalInstanceId(),
      modal,
      data: { buildingName: data.name },
    });
  }, [dispatch]);

  const handleSlotsReady = useCallback((data: SlotsReadyData) => {
    dispatch({ type: 'SET_SLOT_POSITIONS', slots: data.slots });
  }, [dispatch]);

  const handleSceneReady = useCallback(() => {
    setReady(true);
    setSyncRevision((revision) => revision + 1);
    setAssetLoadError(null);
  }, []);

  const handleLoadError = useCallback((data: { assetKey: string; assetUrl: string }) => {
    setAssetLoadError(data);
    setReady(false);
  }, []);

  const handleBurialCeremony = useCallback((data: { slot_id: number; chatText: string; gravediggerPhrase: string }) => {
    // The ceremony owns this slot until it has rendered the grave itself.
    ceremonySlotIdsRef.current.add(data.slot_id);
    ceremonyChatsRef.current.set(data.slot_id, { chatText: data.chatText, gravediggerPhrase: data.gravediggerPhrase });
  }, []);

  const handleBurialCeremonyDone = useCallback((data: { slot_id: number; willContinue?: boolean }) => {
    ceremonySlotIdsRef.current.delete(data.slot_id);
    // State may be unchanged since the ceremony started; re-sync once the slot is safe to reconcile.
    setSyncRevision((revision) => revision + 1);

    const chat = ceremonyChatsRef.current.get(data.slot_id);
    if (!chat) return;
    ceremonyChatsRef.current.delete(data.slot_id);
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: { id: crypto.randomUUID(), type: 'burial', text: chat.chatText, timestamp: Date.now() },
    });
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: { id: crypto.randomUUID(), type: 'gravedigger', text: chat.gravediggerPhrase, timestamp: Date.now() },
    });
    if (data.willContinue) return;

    const scheduleCeremonyDoneTimer = (fn: () => void, delay: number) => {
      const timer = setTimeout(() => {
        ceremonyDoneTimersRef.current = ceremonyDoneTimersRef.current.filter((item) => item !== timer);
        fn();
      }, delay);
      ceremonyDoneTimersRef.current.push(timer);
    };

    const openWhenReady = (graveAttempt = 0) => {
      if (activeModalRef.current) {
        scheduleCeremonyDoneTimer(() => openWhenReady(graveAttempt), 250);
        return;
      }
      if (!gravesRef.current.has(data.slot_id)) {
        if (graveAttempt >= 20) return;
        scheduleCeremonyDoneTimer(() => openWhenReady(graveAttempt + 1), 250);
        return;
      }
      dispatch({
        type: 'OPEN_MODAL',
        id: createModalInstanceId(),
        modal: 'grave',
        data: { slotId: data.slot_id },
      });
    };

    scheduleCeremonyDoneTimer(() => openWhenReady(), 1000);
  }, [dispatch]);

  useEffect(() => {
    cemeteryEvents.on('grave_click', handleGraveClick);
    cemeteryEvents.on('building_click', handleBuildingClick);
    cemeteryEvents.on('slots_ready', handleSlotsReady);
    cemeteryEvents.on('scene_ready', handleSceneReady);
    cemeteryEvents.on('load_error', handleLoadError);
    cemeteryEvents.on('burial_ceremony', handleBurialCeremony);
    cemeteryEvents.on('burial_ceremony_done', handleBurialCeremonyDone);

    return () => {
      cemeteryEvents.off('grave_click', handleGraveClick);
      cemeteryEvents.off('building_click', handleBuildingClick);
      cemeteryEvents.off('slots_ready', handleSlotsReady);
      cemeteryEvents.off('scene_ready', handleSceneReady);
      cemeteryEvents.off('load_error', handleLoadError);
      cemeteryEvents.off('burial_ceremony', handleBurialCeremony);
      cemeteryEvents.off('burial_ceremony_done', handleBurialCeremonyDone);
      for (const timer of ceremonyDoneTimersRef.current) clearTimeout(timer);
      ceremonyDoneTimersRef.current = [];
    };
  }, [handleGraveClick, handleBuildingClick, handleSlotsReady, handleSceneReady, handleLoadError, handleBurialCeremony, handleBurialCeremonyDone]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    let cancelled = false;

    (async () => {
      const Phaser = await import('phaser');
      const { createGameConfig } = await import('../game/config');

      if (cancelled || !containerRef.current) return;

      const parent = containerRef.current;
      const initialSize = await waitForContainerSize(parent);
      if (cancelled || !containerRef.current || initialSize.width <= 0 || initialSize.height <= 0) return;

      const game = new Phaser.Game(createGameConfig(parent, initialSize));
      gameRef.current = game;

      const resizeObserver = new ResizeObserver(([entry]) => {
        if (!entry || gameRef.current !== game) return;
        const width = Math.floor(entry.contentRect.width);
        const height = Math.floor(entry.contentRect.height);
        if (width <= 0 || height <= 0) return;
        game.scale.resize(width, height);
      });
      resizeObserver.observe(parent);

      game.events.once(Phaser.Core.Events.DESTROY, () => resizeObserver.disconnect());
    })();

    return () => {
      cancelled = true;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Reconcile the complete React snapshot with Phaser, including removals and updates.
  useEffect(() => {
    if (!ready) return;

    const graves: RenderGraveData[] = [];
    for (const g of state.graves.values()) {
      graves.push({ slot_id: g.slot_id, id: g.id, name: g.name });
    }

    cemeteryEvents.emit('sync_graves', {
      graves,
      protectedSlotIds: [...ceremonySlotIdsRef.current],
      authoritative: !state.gravesLoading && !state.gravesError,
    });
  }, [ready, state.graves, state.gravesLoading, state.gravesError, syncRevision]);

  // Sync modal state to Phaser (disable input when modal is open)
  useEffect(() => {
    cemeteryEvents.emit('modal_state', { open: !!state.activeModal });
  }, [state.activeModal]);

  return (
    <>
      <div
        ref={containerRef}
        data-testid="phaser-stage"
        data-scene-ready={ready ? 'true' : 'false'}
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, touchAction: 'none', pointerEvents: state.activeModal ? 'none' : 'auto' }}
      />
      {assetLoadError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(10, 10, 10, 0.72)',
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              padding: '24px 22px',
              border: '1px solid #3a3530',
              borderRadius: 4,
              background: 'linear-gradient(180deg, rgba(28,26,24,0.96) 0%, rgba(20,18,16,0.98) 100%)',
              boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
              textAlign: 'center',
            }}
          >
            <h3 style={{ margin: '0 0 8px', color: '#e8d5a3', fontSize: 18 }}>Cemetery Assets Failed to Load</h3>
            <p style={{ margin: '0 0 8px', color: '#a09888', fontSize: 14, fontStyle: 'italic', lineHeight: 1.6 }}>
              The cemetery could not load one of its map assets. Please refresh and try again.
            </p>
            <p style={{ margin: '0 0 16px', color: '#6a6960', fontSize: 11, wordBreak: 'break-word' }}>
              {assetLoadError.assetKey}: {assetLoadError.assetUrl}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <StoneButton onClick={() => window.location.reload()}>Reload</StoneButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
