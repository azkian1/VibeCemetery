'use client';

import type { CSSProperties } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cemeteryEvents } from '@/game/events';

export default function ZoomButtons() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  const btnStyle: CSSProperties = {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #5a4a30',
    borderRadius: 2,
    background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
    color: '#c8a050',
    fontSize: 20,
    fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.3)',
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      right: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      zIndex: 5,
      pointerEvents: 'auto',
    }}>
      <button
        style={btnStyle}
        onClick={() => cemeteryEvents.emit('zoom_change', { delta: 0.2 })}
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        style={btnStyle}
        onClick={() => cemeteryEvents.emit('zoom_change', { delta: -0.2 })}
        aria-label="Zoom out"
      >
        −
      </button>
    </div>
  );
}
