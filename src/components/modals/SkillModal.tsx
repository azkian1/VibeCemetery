'use client';

import { useState } from 'react';
import { useModal } from '@/context/GameContext';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import StoneButton from '@/components/ui/StoneButton';
import InsetBlock from '@/components/ui/InsetBlock';

export default function SkillModal() {
  const { close } = useModal();
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();

  if (isMobile) return null;

  const command = 'claude skill add vibecemetery/gravedigger';

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      window.prompt('Copy this command:', command);
    });
  };

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile}>
        <div style={{ padding: isMobile ? '20px 16px' : '24px 28px' }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 16px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            Hire the Gravedigger
          </h2>

          <p style={{ fontSize: 13, color: '#aaa9a0', margin: '0 0 16px', lineHeight: 1.5, textAlign: 'center' }}>
            Install the Skill, then run <code style={{ color: '#c8a050' }}>/bury</code> from your agent.
            On first run the agent opens a browser approval page once. After that, future cremations stay silent.
          </p>

          {/* Command block */}
          <div style={{ marginBottom: 20 }}>
            <InsetBlock>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <code
                  style={{
                    fontSize: 13,
                    color: '#c8a050',
                    fontFamily: "'Consolas', 'Monaco', monospace",
                    textAlign: 'center',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-line',
                  }}
                >
                  <span style={{ color: '#6a6960' }}>claude skill add</span>
                  {'\n'}
                  <span>vibecemetery/gravedigger</span>
                </code>
                <StoneButton onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </StoneButton>
              </div>
            </InsetBlock>
          </div>

          {/* Features */}
          <ul
            style={{
              margin: '0 0 16px',
              paddingLeft: 20,
              fontSize: 13,
              color: '#6a6960',
              lineHeight: 1.7,
              listStyle: 'none',
              padding: 0,
              textAlign: 'center',
            }}
          >
            <li>Automatic GitHub scan for dead repos</li>
            <li>Run <code style={{ color: '#c8a050' }}>/bury</code> from your agent or editor</li>
            <li>The agent opens browser approval on first run</li>
            <li>Gravedigger commentary in character</li>
          </ul>

          <div style={{ textAlign: 'center' }}>
          <a
            href="https://github.com/azkian1/VibeCemetery"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#7898b8',
              fontSize: 13,
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
            Documentation ↗
          </a>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
