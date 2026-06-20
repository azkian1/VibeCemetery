'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cemeteryEvents } from '@/game/events';
import { useIsMobile } from '@/hooks/useIsMobile';
import { hasPendingBurialCeremony } from '@/lib/pending-burial-ceremony';

export default function GateEpitaph() {
  const isMobile = useIsMobile();
  const [visible, setVisible] = useState(() => !hasPendingBurialCeremony());
  const [fading, setFading] = useState(false);
  const fadingRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (fadingRef.current) return;
    fadingRef.current = true;
    setFading(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setVisible(false);
    }, 800);
  }, []);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (sceneReadyTimerRef.current) clearTimeout(sceneReadyTimerRef.current);
  }, []);

  useEffect(() => {
    const onReady = () => {
      // Scene is ready, zoom-in tween takes 2000ms — start fade near the end
      if (sceneReadyTimerRef.current) clearTimeout(sceneReadyTimerRef.current);
      sceneReadyTimerRef.current = setTimeout(() => {
        sceneReadyTimerRef.current = null;
        dismiss();
      }, 1600);
    };

    const onLoadError = () => {
      if (sceneReadyTimerRef.current) clearTimeout(sceneReadyTimerRef.current);
      dismiss();
    };

    cemeteryEvents.on('scene_ready', onReady);
    cemeteryEvents.on('load_error', onLoadError);
    return () => {
      cemeteryEvents.off('scene_ready', onReady);
      cemeteryEvents.off('load_error', onLoadError);
    };
  }, [dismiss]);

  // Dismiss on any user interaction (click, tap, key)
  useEffect(() => {
    const handler = () => dismiss();
    window.addEventListener('pointerdown', handler);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [dismiss]);

  if (!visible) return null;

  return (
    <div
      data-testid="gate-epitaph"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1918',
        cursor: 'default',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.8s ease-in-out',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <p style={{
        margin: 0,
        fontSize: 28,
        color: '#e8d5a3',
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
        letterSpacing: 1,
        textAlign: 'center',
        textShadow: '0 1px 4px rgba(0,0,0,0.6)',
      }}>
        {isMobile ? 'Walk the cemetery on mobile.' : 'We bury slop, lol.'}
      </p>
      <p style={{
        margin: '12px 0 0',
        fontSize: 18,
        color: '#6a6960',
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
        letterSpacing: 0.5,
        textAlign: 'center',
        maxWidth: 400,
        padding: '0 24px',
        lineHeight: 1.6,
      }}>
        {isMobile ? 'Bury repos from desktop.' : 'You burned electricity, water, your time and energy — at least bury it.'}
      </p>
    </div>
  );
}
