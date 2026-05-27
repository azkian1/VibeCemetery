'use client';

import { useState } from 'react';
import { useModal } from '@/context/GameContext';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import StoneButton from '@/components/ui/StoneButton';
import OrnamentDivider from '@/components/ui/OrnamentDivider';
import InsetBlock from '@/components/ui/InsetBlock';

export default function UrnModal() {
  const { modalData, close } = useModal();
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);

  const c = modalData?.crematedItem;
  if (!c) return null;

  const handleShare = () => {
    const url = `${window.location.origin}/urn/${c.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      window.prompt('Copy this:', url);
    });
  };

  const crematedDate = new Date(c.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const lastLine = c.last_commit_message?.split('\n').filter((l: string) => l.trim()).pop();

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={500}>
        <CloseButton onClick={close} />

        {/* ── Header — urn plate ── */}
        <div style={{
          padding: isMobile ? '18px 16px 14px' : '22px 28px 16px',
          borderBottom: '1px solid #2a2520',
          background: 'linear-gradient(180deg, rgba(200,160,80,0.04) 0%, transparent 100%)',
        }}>
          <p style={{
            margin: '0 0 4px',
            fontSize: 10,
            color: '#8a8980',
            textTransform: 'uppercase',
            letterSpacing: 2,
            textAlign: 'center',
          }}>
            Cremated
          </p>
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
            {c.name}
          </h2>

          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#aaa9a0', textAlign: 'center' }}>
            {crematedDate}
          </p>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: isMobile ? '14px 16px 18px' : '16px 28px 22px' }}>

          {/* Cause of death */}
          <div style={{ margin: '0 0 14px', textAlign: 'center' }}>
            <InsetBlock label="Cause of Death">
              <p style={{
                margin: 0,
                fontSize: 14,
                color: '#b86858',
                fontStyle: 'italic',
                textShadow: '0 0 8px rgba(184,104,88,0.15)',
                textAlign: 'center',
              }}>
                {c.cause}
              </p>
            </InsetBlock>
          </div>

          {/* Last commit message */}
          {lastLine && (
            <div style={{ margin: '0 0 14px' }}>
              <InsetBlock label="Last Words">
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  color: '#aaa9a0',
                  fontFamily: "'Consolas', 'Monaco', monospace",
                  textAlign: 'center',
                }}>
                  &ldquo;{lastLine}&rdquo;
                </p>
              </InsetBlock>
            </div>
          )}

          {/* Author + GitHub */}
          <div style={{ fontSize: 12, color: '#8a8980', margin: '0 0 4px', textAlign: 'center' }}>
            {c.author_github && (
              <span>
                Cremated by{' '}
                {c.author_github !== 'anonymous' ? (
                  <a
                    href={`https://github.com/${c.author_github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#7898b8',
                      textDecoration: 'none',
                      borderBottom: '1px solid rgba(120,152,184,0.3)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#90b0d0'; e.currentTarget.style.borderColor = '#90b0d0'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#7898b8'; e.currentTarget.style.borderColor = 'rgba(120,152,184,0.3)'; }}
                  >
                    {c.author_github}
                  </a>
                ) : (
                  <span style={{ color: '#8a8980' }}>{c.author_github}</span>
                )}
              </span>
            )}
          </div>

          <OrnamentDivider />

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <StoneButton onClick={handleShare} style={{ flex: 1 }}>
              {copied ? 'Copied. F.' : 'Share Urn'}
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
