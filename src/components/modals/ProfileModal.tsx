'use client';

import React, { useMemo, useCallback, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useModal, useGame, useCremated } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cemeteryEvents } from '@/game/events';
import ModalOverlay from './ModalOverlay';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import OrnamentDivider from '@/components/ui/OrnamentDivider';
import StoneButton from '@/components/ui/StoneButton';
import InsetBlock from '@/components/ui/InsetBlock';

const SLOT_THRESHOLDS = [30, 80, 150] as const;

const sectionHeader: React.CSSProperties = {
  fontSize: 11,
  color: '#4a4944',
  textTransform: 'uppercase',
  letterSpacing: 1.5,
  marginBottom: 6,
  textAlign: 'center',
};

function ProjectRow({ emoji, name, color, onClick, title, ariaLabel }: {
  emoji: string; name: string; color: string;
  onClick: () => void; title: string; ariaLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
        fontSize: 14, background: 'none', border: 'none',
        borderBottomStyle: 'solid', borderBottomWidth: 1, borderBottomColor: '#2a2520',
        width: '100%', cursor: 'pointer', textAlign: 'left',
        transition: 'color 0.15s', color,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#e8d5a3'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = color; }}
    >
      <span style={{ fontSize: 14, padding: '0 2px', lineHeight: 1 }}>{emoji}</span>
      <span>{name}</span>
    </button>
  );
}

function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1,
        height: 8,
        background: 'linear-gradient(180deg, #121010 0%, #161414 100%)',
        border: '1px solid #2a2520',
        borderRadius: 1,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #8a7a50, #c8a050)',
          borderRadius: 1,
          transition: 'width 0.3s ease',
        }} />
      </div>
      {label && (
        <span style={{ fontSize: 11, color: '#6a6960', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
    </div>
  );
}

export default function ProfileModal() {
  const { close, open, push } = useModal();
  const { state } = useGame();
  useCremated(); // ensure cremated data is loaded
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const user = session?.user;
  const username = user?.github_username;

  // Filter user's graves and cremations (case-insensitive — CLI may send different casing)
  const lowerUsername = username?.toLowerCase();

  const userGraves = useMemo(() => {
    if (!lowerUsername) return [];
    const result: { id: string; name: string; slotId: number }[] = [];
    state.graves.forEach((g) => {
      if (g.author_github?.toLowerCase() === lowerUsername) {
        result.push({ id: g.id, name: g.name, slotId: g.slot_id });
      }
    });
    return result;
  }, [state.graves, lowerUsername]);

  const userCremated = useMemo(() => {
    if (!lowerUsername) return [];
    return state.cremated.filter((c) => c.author_github?.toLowerCase() === lowerUsername);
  }, [state.cremated, lowerUsername]);

  const totalBurials = userGraves.length + userCremated.length;

  // Cremation Souls drive slot unlocks (github = 3 Souls, skill = 1 Soul)
  const souls = userCremated.reduce(
    (acc, c) => acc + (c.source === 'skill' ? 1 : 3), 0
  );

  // Slot calculation — single pass over thresholds
  const slotsUsed = userGraves.length;
  const unlocked = SLOT_THRESHOLDS.filter(t => souls >= t);
  const slotsUnlocked = 1 + unlocked.length;
  const allSlotsMaxed = unlocked.length === SLOT_THRESHOLDS.length;
  const nextThreshold = SLOT_THRESHOLDS[unlocked.length] ?? null;
  const prevThreshold = unlocked.length > 0 ? unlocked[unlocked.length - 1] : 0;
  const progressToNext = nextThreshold
    ? ((souls - prevThreshold) / (nextThreshold - prevThreshold)) * 100
    : 100;

  // Navigate camera to a grave slot and close modal
  const navigateToGrave = useCallback((slotId: number) => {
    const slot = state.slotPositions.find((s) => s.id === slotId);
    if (!slot) return;
    close();
    setTimeout(() => {
      cemeteryEvents.emit('minimap_click', {
        worldX: slot.x + slot.width / 2,
        worldY: slot.y + slot.height / 2,
      });
      setTimeout(() => {
        cemeteryEvents.emit('highlight_slot', { slotId });
      }, 350);
    }, 250);
  }, [state.slotPositions, close]);

  const openBury = useCallback(() => { close(); open('bury'); }, [close, open]);
  const [soulsTipVisible, setSoulsTipVisible] = useState(false);

  if (!user) return null;

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={520}>
        <CloseButton onClick={close} />

        <div style={{ padding: isMobile ? '20px 16px' : '22px 24px 18px' }}>
          {/* Header — Avatar + Name + Stats */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: 'center',
            gap: isMobile ? 8 : 12,
            marginBottom: 4,
          }}>
            {user.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={`${user.name ?? 'User'} avatar`}
                width={48}
                height={48}
                style={{
                  borderRadius: 3,
                  border: '3px solid #4a4238',
                  boxShadow: '0 0 12px rgba(0,0,0,0.5), inset 0 0 4px rgba(0,0,0,0.3)',
                  flexShrink: 0,
                }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0, textAlign: isMobile ? 'center' : 'left' }}>
              {username ? (
                <a
                  href={`https://github.com/${username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    margin: 0,
                    fontSize: 17,
                    color: '#e8d5a3',
                    letterSpacing: 0.5,
                    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                    textDecoration: 'none',
                    borderBottom: '1px solid rgba(232,213,163,0.2)',
                    transition: 'color 0.15s, border-color 0.15s',
                    fontFamily: 'var(--font-cinzel)',
                    fontWeight: 'bold',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#f0e0b8';
                    e.currentTarget.style.borderColor = 'rgba(232,213,163,0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#e8d5a3';
                    e.currentTarget.style.borderColor = 'rgba(232,213,163,0.2)';
                  }}
                >
                  {user.name ?? username}
                </a>
              ) : (
                <h2 style={{
                  margin: 0,
                  fontSize: 17,
                  color: '#e8d5a3',
                  letterSpacing: 0.5,
                  textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                }}>
                  {user.name ?? 'Gravedigger'}
                </h2>
              )}
            </div>
            {/* Stats inline on desktop, below name on mobile */}
            <div style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 15, color: '#68a060', fontWeight: 'bold' }}>
                {userGraves.length} <span style={{ fontSize: 13 }}>⚰️</span>
              </span>
              <span style={{ fontSize: 15, color: '#b86858', fontWeight: 'bold' }}>
                {userCremated.length} <span style={{ fontSize: 13 }}>🔥</span>
              </span>
            </div>
          </div>

          <OrnamentDivider />

          {/* Grave Slots */}
          <InsetBlock label="Grave Slots" style={{ marginBottom: 10 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 13, color: '#aaa9a0' }}>
                Used: <strong style={{ color: '#e8d5a3' }}>{slotsUsed}</strong> / {slotsUnlocked}
              </span>
              {slotsUsed < slotsUnlocked && (
                <span style={{ fontSize: 11, color: '#68a060' }}>
                  {slotsUnlocked - slotsUsed} avail
                </span>
              )}
            </div>
            <ProgressBar
              percent={slotsUnlocked > 0 ? (slotsUsed / slotsUnlocked) * 100 : 0}
            />
            {allSlotsMaxed ? (
              <div style={{
                textAlign: 'center',
                fontSize: 11,
                color: '#c8a050',
                marginTop: 6,
                fontStyle: 'italic',
              }}>
                All slots unlocked
              </div>
            ) : nextThreshold && (
              <div style={{ marginTop: 6 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: '#6a6960',
                    marginBottom: 3,
                    cursor: 'help',
                    position: 'relative',
                    display: 'inline-block',
                    borderBottom: '1px dotted #6a6960',
                  }}
                  onMouseEnter={() => setSoulsTipVisible(true)}
                  onMouseLeave={() => setSoulsTipVisible(false)}
                  onClick={() => setSoulsTipVisible(v => !v)}
                >
                  Next slot at {nextThreshold} Souls
                  {soulsTipVisible && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginBottom: 6,
                      padding: '6px 10px',
                      background: '#1a1816',
                      border: '1px solid #3a3530',
                      borderRadius: 3,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                      color: '#c8b888',
                      lineHeight: 1.5,
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}>
                      <div>GitHub cremation = <strong style={{ color: '#e8d5a3' }}>3 Souls</strong></div>
                      <div>Skill cremation = <strong style={{ color: '#e8d5a3' }}>1 Soul</strong></div>
                    </div>
                  )}
                </div>
                <ProgressBar
                  percent={progressToNext}
                  label={`${souls}/${nextThreshold}`}
                />
              </div>
            )}
          </InsetBlock>

          {/* YOUR PROJECTS */}
          {totalBurials > 0 ? (
            <div style={{ marginBottom: 10 }}>
              <div style={sectionHeader}>Your Projects</div>
              <div style={{
                maxHeight: 160,
                overflowY: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(100, 90, 60, 0.5) transparent',
              }}>
                {userGraves.map((g) => (
                  <ProjectRow
                    key={`grave-${g.id}`}
                    emoji="⚰️" name={g.name} color="#aaa9a0"
                    onClick={() => navigateToGrave(g.slotId)}
                    title="Navigate to grave" ariaLabel={`Navigate to ${g.name}`}
                  />
                ))}
                {userCremated.map((c) => (
                  <ProjectRow
                    key={`crem-${c.id}`}
                    emoji="🔥" name={c.name} color="#6a6960"
                    onClick={() => push('urn', { crematedItem: c })}
                    title="View urn" ariaLabel={`View urn for ${c.name}`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              marginBottom: 10,
              padding: '8px 0',
            }}>
              <p style={{
                color: '#4a4944',
                fontStyle: 'italic',
                fontSize: 13,
                margin: '0 0 8px',
              }}>
                No burials yet. The cemetery awaits your offerings.
              </p>
              <StoneButton onClick={openBury}>
                Bury Your First Project
              </StoneButton>
            </div>
          )}

          {/* CTA — bury flow handles slot/cremation logic internally */}
          {totalBurials > 0 && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              {slotsUsed >= slotsUnlocked && !allSlotsMaxed && (
                <div style={{ fontSize: 11, color: '#6a6960', marginBottom: 6, fontStyle: 'italic' }}>
                  Bury &amp; cremate projects to unlock more grave slots
                </div>
              )}
              <StoneButton onClick={openBury}>
                Bury Another
              </StoneButton>
            </div>
          )}

          <OrnamentDivider />

          {/* Logout — ghost style */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => signOut()}
              style={{
                background: 'none',
                border: 'none',
                color: '#6a6960',
                fontSize: 13,
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 2,
                transition: 'color 0.15s, background 0.15s',
                fontFamily: 'var(--font-cinzel)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#e8d5a3';
                e.currentTarget.style.background = 'rgba(200,160,80,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#6a6960';
                e.currentTarget.style.background = 'none';
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
