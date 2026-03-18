'use client';

import { useState, useEffect } from 'react';
import { cemeteryEvents } from '@/game/events';

export default function GateEpitaph() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const onReady = () => {
      // Scene is ready, zoom-in tween takes 2000ms — start fade near the end
      setTimeout(() => setFading(true), 1600);
      setTimeout(() => setVisible(false), 3200);
    };

    cemeteryEvents.on('scene_ready', onReady);
    return () => cemeteryEvents.off('scene_ready', onReady);
  }, []);

  // Fallback: if scene never fires ready (e.g. asset error), fade out after 6s
  useEffect(() => {
    const fallback = setTimeout(() => {
      setFading(true);
      setTimeout(() => setVisible(false), 1600);
    }, 6000);
    return () => clearTimeout(fallback);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1918',
        opacity: fading ? 0 : 1,
        transition: 'opacity 1.6s ease-in-out',
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
        We bury slop, lol.
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
        You burned electricity, water, your time and energy — at least bury it.
      </p>
    </div>
  );
}
