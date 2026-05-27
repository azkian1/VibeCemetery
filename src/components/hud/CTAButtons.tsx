'use client';

import { useSession } from 'next-auth/react';
import { useGame, useModal } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { calculateUserSlotEconomy, isAutoAssignableGraveSlotType } from '@/lib/slot-economy';
import { getDemoGraveBonusSlots } from '@/demo/mode';

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
        slotsUsed: countUserAutoAssignableGraves(state, username),
        hasSharedFirstGrave,
        bonusSlots: getDemoGraveBonusSlots(username),
      }).availableSlots
    : 0;
  const { shovelDisabled, fireDisabled } = decideCemeteryCtaState(availableGraveSlots);

  if (isMobile) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 40,
        width: 340,
        height: 94,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        border: '1px solid #3a3530',
        borderRadius: 2,
        background: 'rgba(20, 18, 16, 0.60)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.3)',
        padding: 8,
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
      }}
    >
      <div style={{ margin: '0 0 6px', color: '#e8d5a3', fontSize: 13, fontWeight: 700, letterSpacing: 0.7 }}>
        Choose a ritual:
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ display: 'grid', gap: 5 }}>
          <button
            onClick={() => open('bury', { flowMode: 'cemetery-shovel' })}
            disabled={shovelDisabled}
            title={shovelDisabled ? 'No grave slots left. Cremation is available.' : 'Bury repos in grave slots'}
            style={ritualButtonStyle('bury', shovelDisabled)}
            onMouseEnter={(e) => {
              if (shovelDisabled) return;
              Object.assign(e.currentTarget.style, ritualButtonHoverStyle);
            }}
            onMouseLeave={(e) => {
              Object.assign(e.currentTarget.style, ritualButtonStyle('bury', shovelDisabled));
            }}
          >
            Bury
          </button>
          <span style={ritualHintStyle}>Puts it on the map.</span>
        </div>
        <div style={{ display: 'grid', gap: 5 }}>
          <button
            onClick={() => open('bury', { flowMode: 'cemetery-fire' })}
            disabled={fireDisabled}
            title={fireDisabled ? 'Use your available grave slots before cremating.' : 'Cremate repos into the Crematory'}
            style={ritualButtonStyle('cremate', fireDisabled)}
            onMouseEnter={(e) => {
              if (fireDisabled) return;
              Object.assign(e.currentTarget.style, ritualButtonHoverStyle);
            }}
            onMouseLeave={(e) => {
              Object.assign(e.currentTarget.style, ritualButtonStyle('cremate', fireDisabled));
            }}
          >
            Cremate
          </button>
          <span style={ritualHintStyle}>Saves it as ashes.</span>
        </div>
      </div>
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

function ritualButtonStyle(kind: 'bury' | 'cremate', disabled: boolean): React.CSSProperties {
  const activeBackground = kind === 'bury'
    ? 'linear-gradient(180deg, #5a3b20 0%, #2f2112 100%)'
    : 'linear-gradient(180deg, #5a2020 0%, #3a1010 100%)';

  return {
    width: '100%',
    height: 34,
    border: disabled ? '1px solid #302c27' : '1px solid #6a3020',
    borderRadius: 2,
    background: disabled ? 'linear-gradient(180deg, #24221f 0%, #171512 100%)' : activeBackground,
    color: disabled ? '#4a4944' : '#e8d5a3',
    fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
    fontSize: 13,
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

const ritualButtonHoverStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #6a2828 0%, #4a1818 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(90, 32, 32, 0.3), 0 0 20px rgba(139, 105, 20, 0.15)',
};

const ritualHintStyle: React.CSSProperties = {
  color: '#8f897d',
  fontFamily: "var(--font-geist-sans), Arial, sans-serif",
  fontSize: 10.5,
  lineHeight: 1.2,
  textAlign: 'center',
};
