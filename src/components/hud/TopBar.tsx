'use client';

import { useModal } from '@/context/GameContext';
import AuthButton from './AuthButton';
import DayCycleIcon from './DayCycleIcon';
import { useIsMobile } from '@/hooks/useIsMobile';

export const TOPBAR_ACTIONS = [
  { modal: 'leaderboard', label: 'Necropolis', ariaLabel: 'Open Necropolis leaderboard' },
  { modal: 'agentAshes', label: 'Agent Ashes', ariaLabel: 'Open Agent Ashes' },
] as const;

export default function TopBar() {
  const { open } = useModal();
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        minHeight: 44,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '0 8px' : '0 16px',
        paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : undefined,
        background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
        borderBottom: '1px solid #3a3530',
        boxShadow: 'inset 0 -1px 0 rgba(200,160,80,0.06), 0 2px 8px rgba(0,0,0,0.4)',
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
        pointerEvents: 'auto',
        position: 'relative',
        overflow: 'visible',
        zIndex: 10,
      }}
    >
      {/* Gold accent line at bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 20,
        right: 20,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(200,160,80,0.15), transparent)',
        pointerEvents: 'none',
      }} />

      {/* Left zone */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <button
          onClick={() => open('burger')}
          aria-label="Menu"
          style={{
            background: 'none',
            border: '1px solid transparent',
            borderRadius: 2,
            color: '#4a4944',
            fontSize: 18,
            cursor: 'pointer',
            padding: '6px 8px',
            lineHeight: 1,
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#5a4a30';
            e.currentTarget.style.color = '#e8d5a3';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.color = '#4a4944';
          }}
        >
          ☰
        </button>
        {TOPBAR_ACTIONS.map((action) => (
          <button
            key={action.modal}
            onClick={() => open(action.modal)}
            aria-label={action.ariaLabel}
            style={{
              cursor: 'pointer',
              color: '#aaa9a0',
              fontSize: isMobile ? 12 : 14,
              padding: isMobile ? '5px 8px' : '5px 12px',
              borderRadius: 2,
              transition: 'all 0.15s',
              background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
              border: '1px solid #3a3530',
              fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
              letterSpacing: 0.5,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#e8d5a3';
              e.currentTarget.style.borderColor = '#5a4a30';
              e.currentTarget.style.background = 'linear-gradient(180deg, #302e28 0%, #242018 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#aaa9a0';
              e.currentTarget.style.borderColor = '#3a3530';
              e.currentTarget.style.background = 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)';
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Center — medallion hanging below HUD */}
      {!isMobile && (
        <div style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          top: 0,
          pointerEvents: 'auto',
        }}>
          <DayCycleIcon />
        </div>
      )}

      {/* Right zone */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
        <AuthButton />
      </div>
    </div>
  );
}
