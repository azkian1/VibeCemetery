'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { cemeteryEvents, type SlotEventData, type SlotsReadyData, type RenderGraveData } from '../game/events';
import { useGame } from '@/context/GameContext';
import type { ModalType } from '@/context/GameContext';

export default function PhaserCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [ready, setReady] = useState(false);
  const { state, dispatch } = useGame();
  const sentSlotIdsRef = useRef(new Set<number>());
  const ceremonyChatRef = useRef<{ chatText: string; gravediggerPhrase: string } | null>(null);

  const handleGraveClick = useCallback((data: SlotEventData) => {
    if (!state.graves.has(data.slotId) && data.type !== 'meta_grave') return;
    dispatch({
      type: 'OPEN_MODAL',
      modal: 'grave',
      data: { slotId: data.slotId, slotType: data.type },
    });
  }, [dispatch, state.graves]);

  const handleBuildingClick = useCallback((data: SlotEventData) => {
    const modal: ModalType =
      data.name === 'Crematory' ? 'crematory' : 'mausoleum';
    dispatch({
      type: 'OPEN_MODAL',
      modal,
      data: { buildingName: data.name },
    });
  }, [dispatch]);

  const handleSlotsReady = useCallback((data: SlotsReadyData) => {
    dispatch({ type: 'SET_SLOT_POSITIONS', slots: data.slots });
  }, [dispatch]);

  const handleSceneReady = useCallback(() => {
    setReady(true);
  }, []);

  const handleBurialCeremony = useCallback((data: { slot_id: number; chatText: string; gravediggerPhrase: string }) => {
    // Pre-register slot_id so graves-sync effect skips it (ceremony renders it later)
    sentSlotIdsRef.current.add(data.slot_id);
    ceremonyChatRef.current = { chatText: data.chatText, gravediggerPhrase: data.gravediggerPhrase };
  }, []);

  const handleBurialCeremonyDone = useCallback(() => {
    const chat = ceremonyChatRef.current;
    if (!chat) return;
    ceremonyChatRef.current = null;
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: { id: crypto.randomUUID(), type: 'burial', text: chat.chatText, timestamp: Date.now() },
    });
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: { id: crypto.randomUUID(), type: 'gravedigger', text: chat.gravediggerPhrase, timestamp: Date.now() },
    });
  }, [dispatch]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    let cancelled = false;

    (async () => {
      const Phaser = await import('phaser');
      const { createGameConfig } = await import('../game/config');

      if (cancelled || !containerRef.current) return;

      const game = new Phaser.Game(createGameConfig(containerRef.current));
      gameRef.current = game;
    })();

    return () => {
      cancelled = true;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    cemeteryEvents.on('grave_click', handleGraveClick);
    cemeteryEvents.on('building_click', handleBuildingClick);
    cemeteryEvents.on('slots_ready', handleSlotsReady);
    cemeteryEvents.on('scene_ready', handleSceneReady);
    cemeteryEvents.on('burial_ceremony', handleBurialCeremony);
    cemeteryEvents.on('burial_ceremony_done', handleBurialCeremonyDone);

    return () => {
      cemeteryEvents.off('grave_click', handleGraveClick);
      cemeteryEvents.off('building_click', handleBuildingClick);
      cemeteryEvents.off('slots_ready', handleSlotsReady);
      cemeteryEvents.off('scene_ready', handleSceneReady);
      cemeteryEvents.off('burial_ceremony', handleBurialCeremony);
      cemeteryEvents.off('burial_ceremony_done', handleBurialCeremonyDone);
    };
  }, [handleGraveClick, handleBuildingClick, handleSlotsReady, handleSceneReady, handleBurialCeremony, handleBurialCeremonyDone]);

  // Sync React graves → Phaser tilemap
  useEffect(() => {
    if (!ready || state.graves.size === 0) return;

    const newGraves: RenderGraveData[] = [];
    for (const [slotId, g] of state.graves) {
      if (!sentSlotIdsRef.current.has(slotId)) {
        newGraves.push({ slot_id: g.slot_id, id: g.id, name: g.name });
      }
    }
    if (newGraves.length === 0) return;

    if (sentSlotIdsRef.current.size === 0) {
      // Initial load — batch
      cemeteryEvents.emit('render_graves', { graves: newGraves });
    } else {
      // Incremental — only new graves
      for (const g of newGraves) {
        cemeteryEvents.emit('render_grave', g);
      }
    }

    for (const g of newGraves) sentSlotIdsRef.current.add(g.slot_id);

    // Cap: keep only IDs that still exist in graves to prevent unbounded growth
    if (sentSlotIdsRef.current.size > state.graves.size + 50) {
      const alive = new Set(state.graves.keys());
      sentSlotIdsRef.current = alive;
    }
  }, [ready, state.graves]);

  // Sync modal state to Phaser (disable input when modal is open)
  useEffect(() => {
    cemeteryEvents.emit('modal_state', { open: !!state.activeModal });
  }, [state.activeModal]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, touchAction: 'none', pointerEvents: state.activeModal ? 'none' : 'auto' }}
    />
  );
}
