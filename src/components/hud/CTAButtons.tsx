'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useModal } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export function shouldShowBuryOnboardingPrompt({
  status,
  isMobile,
  dismissed,
}: {
  status: SessionStatus;
  isMobile: boolean;
  dismissed: boolean;
}) {
  return status === 'unauthenticated' && !isMobile && !dismissed;
}

export default function CTAButtons() {
  const { open } = useModal();
  const { status } = useSession();
  const isMobile = useIsMobile();
  const [buryPromptDismissed, setBuryPromptDismissed] = useState(false);
  const showBuryPrompt = shouldShowBuryOnboardingPrompt({
    status,
    isMobile,
    dismissed: buryPromptDismissed,
  });

  if (isMobile) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 45,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'auto',
        padding: 8,
      }}
    >
      {showBuryPrompt && (
        <>
          <style>{`
            @media (prefers-reduced-motion: no-preference) {
              @keyframes vc-bury-pulse {
                0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 10px rgba(0,0,0,0.45), 0 0 24px rgba(232,213,163,0.38), 0 0 42px rgba(140,70,28,0.22); }
                50% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 14px rgba(0,0,0,0.5), 0 0 38px rgba(232,213,163,0.72), 0 0 64px rgba(140,70,28,0.38); }
              }
              @keyframes vc-start-label-pulse {
                0%, 100% { opacity: 0.82; text-shadow: 0 0 10px rgba(232,213,163,0.34), 0 0 18px rgba(140,70,28,0.2); }
                50% { opacity: 1; text-shadow: 0 0 18px rgba(232,213,163,0.76), 0 0 30px rgba(140,70,28,0.34); }
              }
            }
          `}</style>
          <div
            id="bury-start-hint"
            style={{
              width: 160,
              marginBottom: 2,
              color: '#e8d5a3',
              fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
              fontSize: 12,
              letterSpacing: 0.8,
              textAlign: 'center',
              animation: 'vc-start-label-pulse 2.4s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          >
            Start here
          </div>
        </>
      )}
      {/* BURY */}
      <button
        onClick={() => {
          setBuryPromptDismissed(true);
          open('bury');
        }}
        style={{
          width: 160,
          height: 52,
          border: '1px solid #6a3020',
          borderRadius: 2,
          background: 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)',
          color: '#e8d5a3',
          fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
          fontSize: 14,
          fontWeight: 'bold',
          letterSpacing: 1,
          cursor: 'pointer',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.4), 0 0 18px rgba(200,160,80,0.22)',
          transition: 'all 0.15s',
          animation: showBuryPrompt ? 'vc-bury-pulse 2.4s ease-in-out infinite' : undefined,
        }}
        aria-describedby={showBuryPrompt ? 'bury-start-hint' : undefined}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'linear-gradient(180deg, #6a2828 0%, #4a1818 100%)';
          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(90, 32, 32, 0.3), 0 0 20px rgba(139, 105, 20, 0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)';
          e.currentTarget.style.borderColor = '#6a3020';
          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.4), 0 0 18px rgba(200,160,80,0.22)';
        }}
      >
        BURY
      </button>

      {/* CLI SKILL */}
      <button
        onClick={() => open('skill')}
        style={{
          width: 160,
          height: 48,
          border: '1px solid #3a3935',
          borderRadius: 2,
          background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
          color: '#aaa9a0',
          fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
          fontSize: 14,
          letterSpacing: 1,
          cursor: 'pointer',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 2px 6px rgba(0,0,0,0.3)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#5a4a30';
          e.currentTarget.style.color = '#e8d5a3';
          e.currentTarget.style.background = 'linear-gradient(180deg, #302e28 0%, #242018 100%)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#3a3935';
          e.currentTarget.style.color = '#aaa9a0';
          e.currentTarget.style.background = 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)';
        }}
      >
        CLI SKILL
      </button>

      {/* AGENT SKILL */}
      <button
        onClick={() => open('agentSkill')}
        style={{
          width: 160,
          height: 42,
          border: '1px solid #30384a',
          borderRadius: 2,
          background: 'linear-gradient(180deg, #20242d 0%, #171a20 100%)',
          color: '#8fa8c0',
          fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
          fontSize: 12,
          letterSpacing: 1,
          cursor: 'pointer',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 2px 6px rgba(0,0,0,0.3)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#52647a';
          e.currentTarget.style.color = '#c6d8e8';
          e.currentTarget.style.background = 'linear-gradient(180deg, #252b36 0%, #1b2028 100%)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#30384a';
          e.currentTarget.style.color = '#8fa8c0';
          e.currentTarget.style.background = 'linear-gradient(180deg, #20242d 0%, #171a20 100%)';
        }}
      >
        AGENT SKILL
      </button>
    </div>
  );
}
