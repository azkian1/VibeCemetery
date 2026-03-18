'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useModal, useGame } from '@/context/GameContext';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import StoneButton from '@/components/ui/StoneButton';
import OrnamentDivider from '@/components/ui/OrnamentDivider';
import InsetBlock from '@/components/ui/InsetBlock';
import { cemeteryEvents } from '@/game/events';

export default function GraveModal() {
  const { modalData, close, closeAll } = useModal();
  const { state, dispatch } = useGame();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const isLoggedIn = !!session?.user;
  const slotId = modalData?.slotId;
  const slotType = modalData?.slotType;
  const grave = slotId != null ? state.graves.get(slotId) : undefined;

  const voted = grave ? state.fVotes.has(grave.id) : false;
  const fCount = grave?.f_count ?? 0;
  const [copied, setCopied] = useState(false);

  const handleF = async () => {
    if (!grave || voted || !isLoggedIn || slotId == null) return;
    const prevCount = grave.f_count ?? 0;
    dispatch({ type: 'ADD_F_VOTE', graveId: grave.id, slotId });
    try {
      const res = await fetch(`/api/graves/${grave.id}/f`, { method: 'POST' });
      const data = await res.json();
      if (res.ok || res.status === 409) {
        if (typeof data.f_count === 'number') {
          dispatch({ type: 'UPDATE_F_COUNT', slotId, fCount: data.f_count });
        }
      } else {
        dispatch({ type: 'REMOVE_F_VOTE', graveId: grave.id, slotId, fCount: prevCount });
      }
    } catch {
      dispatch({ type: 'REMOVE_F_VOTE', graveId: grave.id, slotId, fCount: prevCount });
    }
  };

  const handleShare = () => {
    if (!grave) return;
    const url = `${window.location.origin}/grave/${grave.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      window.prompt('Copy this:', url);
    });
  };

  const navigateToGrave = useCallback(() => {
    if (slotId == null) return;
    const slot = state.slotPositions.find((s) => s.id === slotId);
    if (!slot) return;
    closeAll();
    setTimeout(() => {
      cemeteryEvents.emit('minimap_click', {
        worldX: slot.x + slot.width / 2,
        worldY: slot.y + slot.height / 2,
      });
      setTimeout(() => {
        cemeteryEvents.emit('highlight_slot', { slotId });
      }, 350);
    }, 250);
  }, [state.slotPositions, slotId, closeAll]);

  // ── Empty slot — modal should not open, but close gracefully as fallback ──
  useEffect(() => {
    if (!grave && slotType !== 'meta_grave') close();
  }, [grave, slotType, close]);

  if (!grave && slotType !== 'meta_grave') return null;

  // ── Meta grave ──
  if (!grave) {
    const totalGraves = state.graves.size;
    const totalCremated = state.cremated.length;
    let totalF = 0;
    state.graves.forEach((g) => { totalF += g.f_count ?? 0; });

    const handleMetaShare = () => {
      const url = `${window.location.origin}/?grave=meta`;
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        window.prompt('Copy this:', url);
      });
    };

    return (
      <ModalOverlay onClose={close}>
        <StoneFrame isMobile={isMobile} maxWidth={500}>
          <CloseButton onClick={close} />

          {/* ── Header — epitaph plate ── */}
          <div style={{
            padding: isMobile ? '18px 16px 14px' : '22px 28px 16px',
            borderBottom: '1px solid #2a2520',
            background: 'linear-gradient(180deg, rgba(200,160,80,0.04) 0%, transparent 100%)',
          }}>
            <h2 style={{
              margin: 0,
              fontSize: 20,
              color: '#e8d5a3',
              letterSpacing: 0.5,
              textShadow: '0 1px 3px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}>
              VibeCemetery
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6a6960', textAlign: 'center' }}>
              Est. March 2026 — Still decomposing...
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#aaa9a0', fontStyle: 'italic', textAlign: 'center' }}>
              &ldquo;It buried everything. Even itself.&rdquo;
            </p>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: isMobile ? '14px 16px 18px' : '16px 28px 22px' }}>

            {/* Cause of death */}
            <div style={{ margin: '0 0 14px', textAlign: 'center' }}>
              <InsetBlock label="Cause of Death">
                <p style={{ margin: 0, fontSize: 14, color: '#b86858', fontStyle: 'italic', textShadow: '0 0 8px rgba(184,104,88,0.15)', textAlign: 'center' }}>
                  Vibe-coded too close to the sun
                </p>
              </InsetBlock>
            </div>

            {/* Last commit words */}
            <div style={{ margin: '0 0 14px' }}>
              <InsetBlock label="Last Commit Words">
                <p style={{ margin: 0, fontSize: 13, color: '#6a6960', fontFamily: "'Consolas', 'Monaco', monospace", textAlign: 'center' }}>
                  &ldquo;fix: fix the fix that fixed the fix&rdquo;
                </p>
              </InsetBlock>
            </div>

            {/* Gravedigger comment */}
            <div style={{ margin: '0 0 14px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#7898b8', fontStyle: 'italic' }}>
                &ldquo;The only grave I dug with a README. F.&rdquo;
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#5a7898', textAlign: 'right' }}>
                — The Gravedigger
              </p>
            </div>

            <OrnamentDivider />

            {/* Live stats */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '0 0 14px' }}>
              {[
                { label: 'Graves buried', value: totalGraves },
                { label: 'Souls cremated', value: totalCremated },
                { label: 'Respects paid', value: totalF },
              ].map((s) => (
                <div key={s.label} style={{
                  flex: 1,
                  background: 'rgba(0,0,0,0.15)',
                  border: '1px solid #2a2520',
                  borderRadius: 4,
                  padding: '8px 6px',
                  textAlign: 'center',
                }}>
                  <span style={{ display: 'block', fontSize: 18, color: '#c8a050', fontWeight: 'bold' }}>
                    {s.value}
                  </span>
                  <span style={{ display: 'block', fontSize: 10, color: '#7a7970', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <StoneButton onClick={handleMetaShare} style={{ flex: 1 }} aria-label="Share meta grave link">
                {copied ? 'Copied. F.' : 'Share Grave'}
              </StoneButton>
              <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
                {copied ? 'Link copied to clipboard' : ''}
              </span>
            </div>
          </div>
        </StoneFrame>
      </ModalOverlay>
    );
  }

  const g = grave as NonNullable<typeof grave>;

  const livedDays =
    g.born_at && g.died_at
      ? Math.ceil(
          (new Date(g.died_at).getTime() - new Date(g.born_at).getTime()) / 86400000,
        )
      : null;

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={500}>
        <CloseButton onClick={close} />

        {/* ── Header — epitaph plate ── */}
        <div style={{
          padding: isMobile ? '18px 16px 14px' : '22px 28px 16px',
          borderBottom: '1px solid #2a2520',
          background: 'linear-gradient(180deg, rgba(200,160,80,0.04) 0%, transparent 100%)',
        }}>
          <h2 style={{
            margin: 0,
            fontSize: 20,
            color: '#e8d5a3',
            letterSpacing: 0.5,
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {g.name}
          </h2>
          {g.name.length > 37 && (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#4a4944', fontStyle: 'italic', textAlign: 'center' }}>
              name longer than its life
            </p>
          )}

          {(g.born_at || g.died_at) && (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6a6960', textAlign: 'center' }}>
              {g.born_at ? new Date(g.born_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '???'}
              {' — '}
              {g.died_at ? new Date(g.died_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '???'}
              {livedDays != null && (
                <span style={{ marginLeft: 8, fontSize: 12, color: '#7a7970' }}>
                  ({livedDays} day{livedDays !== 1 ? 's' : ''})
                </span>
              )}
            </p>
          )}

          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#aaa9a0', fontStyle: 'italic', textAlign: 'center' }}>
            &ldquo;{g.epitaph || 'lol'}&rdquo;
          </p>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: isMobile ? '14px 16px 18px' : '16px 28px 22px' }}>

          {/* Cause of death */}
          {g.cause && (
            <div style={{ margin: '0 0 14px', textAlign: 'center' }}>
              <InsetBlock label="Cause of Death">
                <p style={{ margin: 0, fontSize: 14, color: '#b86858', fontStyle: 'italic', textShadow: '0 0 8px rgba(184,104,88,0.15)', textAlign: 'center' }}>
                  {g.cause}
                </p>
              </InsetBlock>
            </div>
          )}

          {/* Last commit message */}
          {(() => {
            const lastLine = g.last_commit_message?.split('\n').filter(l => l.trim()).pop();
            return lastLine ? (
              <div style={{ margin: '0 0 14px' }}>
                <InsetBlock label="Last Commit Words">
                  <p style={{ margin: 0, fontSize: 13, color: '#6a6960', fontFamily: "'Consolas', 'Monaco', monospace", textAlign: 'center' }}>
                    &ldquo;{lastLine}&rdquo;
                  </p>
                </InsetBlock>
              </div>
            ) : null;
          })()}

          {/* Gravedigger comment */}
          {g.gravedigger_comment && (
            <div style={{ margin: '0 0 14px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#7898b8', fontStyle: 'italic' }}>
                &ldquo;{g.gravedigger_comment}&rdquo;
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#5a7898', textAlign: 'right' }}>
                — The Gravedigger
              </p>
            </div>
          )}

          {/* Author + GitHub */}
          <div style={{ fontSize: 12, color: '#4a4944', margin: '0 0 4px', textAlign: 'center' }}>
            {g.author_github && (
              <span>
                Buried by <span style={{ color: '#6a6960' }}>{g.author_github}</span>
              </span>
            )}
            {g.github_url && /^https:\/\/github\.com\//.test(g.github_url) && (
              <>
                {g.author_github && <span style={{ margin: '0 6px' }}>·</span>}
                <a
                  href={g.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#7898b8',
                    textDecoration: 'none',
                    borderBottom: '1px solid rgba(120,152,184,0.3)',
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#90b0d0';
                    e.currentTarget.style.borderColor = '#90b0d0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#7898b8';
                    e.currentTarget.style.borderColor = 'rgba(120,152,184,0.3)';
                  }}
                >
                  View on GitHub
                </a>
              </>
            )}
          </div>

          <OrnamentDivider />

          {/* F counter */}
          <div style={{ textAlign: 'center', margin: '0 0 14px' }}>
            <span style={{ fontSize: 10, color: '#7a7970', textTransform: 'uppercase', letterSpacing: 1.5, display: 'block', marginBottom: 4 }}>
              Respects
            </span>
            <span style={{
              fontSize: 20,
              color: voted ? '#c8a050' : '#6a6960',
              fontWeight: 'bold',
              transition: 'color 0.3s',
            }}>
              {fCount}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <StoneButton
              onClick={handleF}
              disabled={voted || !isLoggedIn}
              active={voted}
              style={{ flex: 1 }}
              aria-label={voted ? `Paid respects (${fCount})` : !isLoggedIn ? 'Login to pay respects' : `Press F to pay respects (${fCount})`}
              aria-pressed={voted}
            >
              {voted ? 'F ✓' : !isLoggedIn ? 'Login to F' : 'Press F'}
            </StoneButton>

            <StoneButton onClick={handleShare} style={{ flex: 1 }} aria-label="Share grave link">
              {copied ? 'Copied. F.' : 'Share Grave'}
            </StoneButton>

            <StoneButton
              onClick={navigateToGrave}
              style={{ flex: 1 }}
              aria-label="Find this grave on the map"
            >
              Find on Map
            </StoneButton>

            <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
              {copied ? 'Link copied to clipboard' : ''}
            </span>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
