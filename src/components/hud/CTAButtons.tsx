'use client';

import { useModal } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function CTAButtons() {
  const { open } = useModal();
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: isMobile ? 0 : 16,
        right: isMobile ? 0 : 16,
        left: isMobile ? 0 : 'auto',
        zIndex: 45,
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        alignItems: isMobile ? 'stretch' : 'flex-end',
        gap: isMobile ? 0 : 8,
        pointerEvents: 'auto',
        padding: isMobile ? 0 : 8,
        ...(isMobile ? {
          background: 'rgba(20, 18, 16, 0.90)',
          borderTop: '1px solid #3a3935',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        } : {}),
      }}
    >
      {/* BURY */}
      <button
        onClick={() => open('bury')}
        style={{
          width: isMobile ? '100%' : 160,
          height: 48,
          flex: isMobile ? 1 : undefined,
          border: '1px solid #6a3020',
          borderRadius: isMobile ? 0 : 2,
          background: 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)',
          color: '#e8d5a3',
          fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
          fontSize: 14,
          fontWeight: 'bold',
          letterSpacing: 1,
          cursor: 'pointer',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.4)',
          transition: 'all 0.15s',
        }}
        {...(!isMobile ? {
          onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = 'linear-gradient(180deg, #6a2828 0%, #4a1818 100%)';
            e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(90, 32, 32, 0.3), 0 0 20px rgba(139, 105, 20, 0.15)';
          },
          onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)';
            e.currentTarget.style.borderColor = '#6a3020';
            e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.4)';
          },
        } : {})}
      >
        ☠️ BURY
      </button>

      {/* SKILL */}
      <button
        onClick={() => open('skill')}
        style={{
          width: isMobile ? '100%' : 160,
          height: 48,
          flex: isMobile ? 1 : undefined,
          border: '1px solid #3a3935',
          borderRadius: isMobile ? 0 : 2,
          background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
          color: '#aaa9a0',
          fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
          fontSize: 14,
          letterSpacing: 1,
          cursor: 'pointer',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 2px 6px rgba(0,0,0,0.3)',
          transition: 'all 0.15s',
        }}
        {...(!isMobile ? {
          onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.borderColor = '#5a4a30';
            e.currentTarget.style.color = '#e8d5a3';
            e.currentTarget.style.background = 'linear-gradient(180deg, #302e28 0%, #242018 100%)';
          },
          onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.borderColor = '#3a3935';
            e.currentTarget.style.color = '#aaa9a0';
            e.currentTarget.style.background = 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)';
          },
        } : {})}
      >
        ⚡ SKILL
      </button>
    </div>
  );
}
