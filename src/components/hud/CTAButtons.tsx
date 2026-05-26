'use client';

import { useSession } from 'next-auth/react';
import { useGame, useModal } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { calculateSouls, calculateUserSlotEconomy, isAutoAssignableGraveSlotType } from '@/lib/slot-economy';

export function decideCemeteryCtaState(availableGraveSlots: number): { shovelDisabled: boolean; fireDisabled: boolean } {
  return {
    shovelDisabled: availableGraveSlots <= 0,
    fireDisabled: availableGraveSlots > 0,
  };
}

export default function CTAButtons() {
  const { open } = useModal();
  const { state } = useGame();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const username = session?.user?.github_username ?? null;
  const hasSharedFirstGrave = Boolean(session?.user?.x_first_grave_shared_at);
  const availableGraveSlots = username
    ? calculateUserSlotEconomy({
        souls: calculateSouls(state.cremated.filter((item) => item.author_github.toLowerCase() === username.toLowerCase())),
        slotsUsed: countUserAutoAssignableGraves(state, username),
        hasSharedFirstGrave,
      }).availableSlots
    : 1;
  const { shovelDisabled, fireDisabled } = decideCemeteryCtaState(availableGraveSlots);

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
      {/* SHOVEL */}
      <button
        onClick={() => open('bury', { initialMode: 'burial' })}
        disabled={shovelDisabled}
        title={shovelDisabled ? 'No grave slots left. Cremation is available.' : 'Bury repos in grave slots'}
        style={ritualButtonStyle('shovel', shovelDisabled)}
        onMouseEnter={(e) => {
          if (shovelDisabled) return;
          e.currentTarget.style.background = 'linear-gradient(180deg, #6a2828 0%, #4a1818 100%)';
          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(90, 32, 32, 0.3), 0 0 20px rgba(139, 105, 20, 0.15)';
        }}
        onMouseLeave={(e) => {
          Object.assign(e.currentTarget.style, ritualButtonStyle('shovel', shovelDisabled));
        }}
      >
        SHOVEL
      </button>

      {/* FIRE */}
      <button
        onClick={() => open('bury', { initialMode: 'cremation' })}
        disabled={fireDisabled}
        title={fireDisabled ? 'Use your available grave slots before cremating.' : 'Cremate repos into the Crematory'}
        style={ritualButtonStyle('fire', fireDisabled)}
        onMouseEnter={(e) => {
          if (fireDisabled) return;
          e.currentTarget.style.background = 'linear-gradient(180deg, #6a2828 0%, #4a1818 100%)';
          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(90, 32, 32, 0.3), 0 0 20px rgba(139, 105, 20, 0.15)';
        }}
        onMouseLeave={(e) => {
          Object.assign(e.currentTarget.style, ritualButtonStyle('fire', fireDisabled));
        }}
      >
        FIRE
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
    </div>
  );
}

function countUserAutoAssignableGraves(state: ReturnType<typeof useGame>['state'], username: string): number {
  const normalizedUsername = username.toLowerCase();
  if (state.slotPositions.length === 0) {
    let count = 0;
    state.graves.forEach((grave) => {
      if (grave.author_github?.toLowerCase() === normalizedUsername) count++;
    });
    return count;
  }

  const autoSlotIds = new Set(
    state.slotPositions
      .filter((slot) => isAutoAssignableGraveSlotType(slot.type))
      .map((slot) => slot.id),
  );
  let count = 0;
  state.graves.forEach((grave) => {
    if (grave.author_github?.toLowerCase() === normalizedUsername && autoSlotIds.has(grave.slot_id)) count++;
  });
  return count;
}

function ritualButtonStyle(kind: 'shovel' | 'fire', disabled: boolean): React.CSSProperties {
  const activeBackground = kind === 'shovel'
    ? 'linear-gradient(180deg, #5a3b20 0%, #2f2112 100%)'
    : 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)';

  return {
    width: 160,
    height: 52,
    border: disabled ? '1px solid #302c27' : '1px solid #6a3020',
    borderRadius: 2,
    background: disabled ? 'linear-gradient(180deg, #24221f 0%, #171512 100%)' : activeBackground,
    color: disabled ? '#4a4944' : '#e8d5a3',
    fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
    cursor: disabled ? 'default' : 'pointer',
    boxShadow: disabled
      ? 'inset 0 1px 0 rgba(255,255,255,0.02), 0 2px 6px rgba(0,0,0,0.24)'
      : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.4), 0 0 18px rgba(200,160,80,0.22)',
    opacity: disabled ? 0.62 : 1,
    transition: 'all 0.15s',
  };
}
