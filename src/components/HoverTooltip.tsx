'use client';

import { useState, useEffect } from 'react';
import { cemeteryEvents, type SlotEventData } from '@/game/events';
import { useGame } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function HoverTooltip() {
  const [hovered, setHovered] = useState<SlotEventData | null>(null);
  const { state } = useGame();
  const isMobile = useIsMobile();

  useEffect(() => {
    const onHover = (data: SlotEventData) => setHovered(data);
    const onHoverEnd = () => setHovered(null);
    cemeteryEvents.on('grave_hover', onHover);
    cemeteryEvents.on('grave_hover_end', onHoverEnd);
    return () => {
      cemeteryEvents.off('grave_hover', onHover);
      cemeteryEvents.off('grave_hover_end', onHoverEnd);
    };
  }, []);

  const grave = hovered ? state.graves.get(hovered.slotId) : undefined;

  if (!hovered || state.activeModal || isMobile || hovered.type === 'Building') return null;
  if (!grave && hovered.type !== 'meta_grave') return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: hovered.screenX,
        top: hovered.screenY - 8,
        transform: 'translate(-50%, -100%)',
        background: 'rgba(20,18,16,0.85)',
        color: '#aaa9a0',
        padding: '9px 18px',
        borderRadius: 3,
        fontSize: 18,
        pointerEvents: 'none',
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
        textAlign: 'center',
        whiteSpace: 'nowrap',
        border: '1px solid #3a3530',
        zIndex: 5,
      }}
    >
      {grave ? (
        <>
          <div style={{ fontWeight: 'bold', color: '#e8d5a3' }}>{grave.name}</div>
          <div style={{ color: '#8a8980', fontSize: 16 }}>
            {grave.born_at ? new Date(grave.born_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '???'}
            {' — '}
            {grave.died_at ? new Date(grave.died_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '???'}
          </div>
          {grave.cause && (
            <div style={{ color: '#b86858', fontSize: 16, fontStyle: 'italic' }}>
              {grave.cause}
            </div>
          )}
        </>
      ) : (
        <div style={{ color: '#aaa9a0', fontSize: 13 }}>
          Reserved for VibeCemetery
        </div>
      )}
    </div>
  );
}
