'use client';

import { useState, useEffect, useRef } from 'react';
import { cemeteryEvents } from '@/game/events';

type Phase = 'dusk' | 'night' | 'dawn' | 'day';

const PHASE_CONFIG: Record<Phase, { symbol: string; color: string; glow: string }> = {
  day:   { symbol: '☀', color: '#e8d5a3', glow: 'rgba(232,213,163,0.25)' },
  dawn:  { symbol: '☀', color: '#c8a050', glow: 'rgba(200,160,80,0.20)' },
  dusk:  { symbol: '☽', color: '#8a7a50', glow: 'rgba(138,122,80,0.15)' },
  night: { symbol: '☽', color: '#88aadd', glow: 'rgba(136,170,221,0.20)' },
};

export default function DayCycleIcon() {
  const [phase, setPhase] = useState<Phase>('dusk');
  const [displaySymbol, setDisplaySymbol] = useState(PHASE_CONFIG['dusk'].symbol);
  const [symbolOpacity, setSymbolOpacity] = useState(1);
  const pendingSymbolRef = useRef<string | null>(null);

  useEffect(() => {
    const onPhase = (data: { phase: Phase }) => setPhase(data.phase);
    cemeteryEvents.on('day_phase', onPhase);
    return () => { cemeteryEvents.off('day_phase', onPhase); };
  }, []);

  // When phase changes and symbol differs — fade out, swap, fade in
  useEffect(() => {
    const newSymbol = PHASE_CONFIG[phase].symbol;
    if (newSymbol === displaySymbol) return;

    pendingSymbolRef.current = newSymbol;
    setSymbolOpacity(0);

    const timer = setTimeout(() => {
      setDisplaySymbol(pendingSymbolRef.current!);
      setSymbolOpacity(1);
      pendingSymbolRef.current = null;
    }, 400);

    return () => clearTimeout(timer);
  }, [phase, displaySymbol]);

  const cfg = PHASE_CONFIG[phase];

  return (
    <div
      title={phase.charAt(0).toUpperCase() + phase.slice(1)}
      style={{
        width: 53,
        height: 53,
        borderRadius: '50%',
        background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
        border: '1px solid #3a3530',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 25,
        color: cfg.color,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 0 12px ${cfg.glow}, 0 2px 6px rgba(0,0,0,0.5)`,
        transition: 'color 0.8s, box-shadow 0.8s',
        flexShrink: 0,
      }}
    >
      <span style={{
        display: 'inline-block',
        transform: displaySymbol === '☽' ? 'rotate(36deg)' : undefined,
        opacity: symbolOpacity,
        transition: 'opacity 0.4s ease',
      }}>
        {displaySymbol}
      </span>
    </div>
  );
}
