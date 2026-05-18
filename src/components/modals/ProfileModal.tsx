'use client';

import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useModal, useGame, useCremated, useGraves } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cemeteryEvents } from '@/game/events';
import ModalOverlay from './ModalOverlay';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import OrnamentDivider from '@/components/ui/OrnamentDivider';
import StoneButton from '@/components/ui/StoneButton';
import InsetBlock from '@/components/ui/InsetBlock';
import LoadErrorState from '@/components/ui/LoadErrorState';
import { calculateSouls, calculateUserSlotEconomy, getSlotUnlockProgress, isAutoAssignableGraveSlotType, SOUL_SLOT_THRESHOLDS } from '@/lib/slot-economy';

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
  const {
    error: crematedError,
    loading: crematedLoading,
    refetch: refetchCremated,
  } = useCremated({ auto: false });
  const {
    error: gravesError,
    loading: gravesLoading,
    refetch: refetchGraves,
  } = useGraves({ auto: false });
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const user = session?.user;
  const username = user?.github_username;
  const hasSharedFirstGrave = Boolean(user?.x_first_grave_shared_at);
  const loadError = gravesError || crematedError;
  const loading = gravesLoading || crematedLoading;

  useEffect(() => {
    refetchGraves();
    refetchCremated();
  }, [refetchGraves, refetchCremated]);

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
  const souls = calculateSouls(userCremated);

  // Slot calculation — single pass over thresholds
  const slotsUsed = useMemo(() => {
    if (state.slotPositions.length === 0) return userGraves.length;
    const autoSlotIds = new Set(
      state.slotPositions
        .filter((slot) => isAutoAssignableGraveSlotType(slot.type))
        .map((slot) => slot.id)
    );
    return userGraves.filter((grave) => autoSlotIds.has(grave.slotId)).length;
  }, [state.slotPositions, userGraves]);
  const slotEconomy = calculateUserSlotEconomy({
    souls,
    slotsUsed,
    hasSharedFirstGrave,
  });
  const unlocked = SOUL_SLOT_THRESHOLDS.filter(t => souls >= t);
  const slotsUnlocked = slotEconomy.slotsUnlocked;
  const allSlotsMaxed = slotEconomy.allSlotsMaxed;
  const nextThreshold = slotEconomy.nextSoulThreshold;
  const prevThreshold = unlocked.length > 0 ? unlocked[unlocked.length - 1] : 0;
  const progressToNext = nextThreshold
    ? ((souls - prevThreshold) / (nextThreshold - prevThreshold)) * 100
    : 100;
  const slotUnlockProgress = getSlotUnlockProgress({ souls, hasSharedFirstGrave });

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
  const [earnSlotsExpanded, setEarnSlotsExpanded] = useState(false);

  if (!user) return null;

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={520}>
        <CloseButton onClick={close} />

        <div style={{ padding: isMobile ? '20px 16px' : '22px 24px 18px' }}>
          {loadError && (
            <div style={{ marginBottom: 12 }}>
              <InsetBlock>
                <LoadErrorState
                  compact
                  message="Your burial records failed to load."
                  onRetry={() => {
                    refetchGraves();
                    refetchCremated();
                  }}
                />
              </InsetBlock>
            </div>
          )}

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
          {!loading && !loadError && (
            <InsetBlock label="Grave Slots" style={{ marginBottom: 10 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'baseline',
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 13, color: '#aaa9a0' }}>
                  Used: <strong style={{ color: '#e8d5a3' }}>{slotsUsed}</strong> / {slotsUnlocked}
                </span>
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
                      color: '#aaa9a0',
                      marginBottom: 3,
                      cursor: 'help',
                      position: 'relative',
                      display: 'inline-block',
                      borderBottom: '1px dotted #aaa9a0',
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
          )}

          {/* Earn Slots */}
          {!loading && !loadError && !isMobile && !allSlotsMaxed && (
            <>
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => setEarnSlotsExpanded(v => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8a8980',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: '4px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'color 0.15s',
                    fontFamily: 'var(--font-cinzel)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#c8a050'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#8a8980'; }}
                >
                  <span style={{
                    fontSize: 10,
                    transition: 'transform 0.2s',
                    transform: earnSlotsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>
                    ▼
                  </span>
                  How to unlock more slots?
                </button>
              </div>

              <div style={{
                overflow: 'hidden',
                maxHeight: earnSlotsExpanded ? 600 : 0,
                transition: 'max-height 0.3s ease',
                marginBottom: 10,
              }}>
                <InsetBlock>
                  {/* Missions */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#c8a050', marginBottom: 6, fontWeight: 'bold' }}>
                      Missions
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      background: 'rgba(0,0,0,0.12)',
                      border: '1px solid #2a2520',
                      borderRadius: 2,
                    }}>
                      <span style={{ fontSize: 16, color: hasSharedFirstGrave ? '#68a060' : '#6a6960' }}>
                        {hasSharedFirstGrave ? '✓' : '☐'}
                      </span>
                      <span style={{ fontSize: 12, color: hasSharedFirstGrave ? '#68a060' : '#8a8980', fontStyle: 'italic' }}>
                        {slotUnlockProgress.socialLabel}
                      </span>
                    </div>
                  </div>

                  {/* Cremation Progress */}
                  <div>
                    <div style={{ fontSize: 11, color: '#c8a050', marginBottom: 6, fontWeight: 'bold' }}>
                      Cremation Progress
                    </div>

                    {/* Show unlocked slots */}
                    {slotUnlockProgress.unlockedSoulLabels.map((label) => (
                      <div key={label} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: '#68a060', marginBottom: 2 }}>
                          ✓ {label}
                        </div>
                      </div>
                    ))}

                    {/* Show next slot progress */}
                    {nextThreshold && slotUnlockProgress.nextSoulLabel && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: '#aaa9a0', marginBottom: 3 }}>
                          {slotUnlockProgress.nextSoulLabel}
                        </div>
                        <ProgressBar
                          percent={progressToNext}
                          label={`${souls}/${nextThreshold}`}
                        />
                      </div>
                    )}

                    {/* Helper text */}
                    <div style={{
                      fontSize: 11,
                      color: '#6a6960',
                      marginTop: 8,
                      padding: '6px 8px',
                      background: 'rgba(0,0,0,0.08)',
                      borderRadius: 2,
                      lineHeight: 1.5,
                    }}>
                      GitHub cremation = <strong style={{ color: '#c8a050' }}>3 Souls</strong>
                      <br />
                      Skill cremation = <strong style={{ color: '#c8a050' }}>1 Soul</strong>
                    </div>
                  </div>
                </InsetBlock>
              </div>
            </>
          )}

          {/* YOUR PROJECTS */}
          {loading && !loadError ? (
            <InsetBlock style={{ marginBottom: 10 }}>
              <div style={{ textAlign: 'center', color: '#8a8980', fontSize: 13, padding: '8px 0' }}>
                Loading burial records...
              </div>
            </InsetBlock>
          ) : !loadError && totalBurials > 0 ? (
            <InsetBlock label="Your Projects" style={{ marginBottom: 10 }}>
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
            </InsetBlock>
          ) : !loadError ? (
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
                No projects laid to rest yet. The cemetery awaits your offerings.
              </p>
              <StoneButton onClick={openBury}>
                Bury or Cremate Your First Project
              </StoneButton>
            </div>
          ) : null}

          {/* CTA — bury flow handles slot/cremation logic internally */}
          {!loading && !loadError && totalBurials > 0 && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              {slotsUsed >= slotsUnlocked && !allSlotsMaxed && (
                <div style={{ fontSize: 11, color: '#6a6960', marginBottom: 6, fontStyle: 'italic' }}>
                  Cremate projects to earn Souls and unlock more grave slots
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
