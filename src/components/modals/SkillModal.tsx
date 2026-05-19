'use client';

import { useEffect, useRef, useState } from 'react';
import { useModal } from '@/context/GameContext';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import StoneButton from '@/components/ui/StoneButton';
import InsetBlock from '@/components/ui/InsetBlock';
import {
  getSkillContentsUrl,
  getSkillInstallCommand,
} from './skillInstall';

type CopiedTarget = 'macOS' | 'Windows' | null;

export default function SkillModal() {
  const { close } = useModal();
  const isMobile = useIsMobile();
  const [copiedTarget, setCopiedTarget] = useState<CopiedTarget>(null);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  if (isMobile) return null;

  const handleCopy = (target: Exclude<CopiedTarget, null>, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTarget(target);
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = window.setTimeout(() => setCopiedTarget(null), 2000);
    }).catch(() => {
      window.prompt('Copy this:', text);
    });
  };

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={560}>
        <div style={{ padding: isMobile ? '20px 16px' : '30px 36px' }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 16px', fontSize: 22, color: '#e8d5a3', textAlign: 'center' }}>
            Install skill
          </h2>

          <p style={{ fontSize: 14, color: '#aaa9a0', margin: '0 0 20px', lineHeight: 1.65, textAlign: 'center' }}>
            Install <code style={{ color: '#c8a050' }}>/bury</code> locally for Claude Code, OpenCode, or Cursor.
          </p>

          <div style={{ marginBottom: 16 }}>
            <InsetBlock>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#e8d5a3', fontSize: 15, marginBottom: 6 }}>
                    CLI SKILL
                  </div>
                  <div style={{ color: '#77746a', fontSize: 13, lineHeight: 1.55 }}>
                    Copy the terminal command for your operating system.
                  </div>
                </div>
                <StoneButton onClick={() => handleCopy('macOS', getSkillInstallCommand('macOS'))}>
                  {copiedTarget === 'macOS' ? 'Copied!' : 'Copy macOS/Linux command'}
                </StoneButton>
                <StoneButton onClick={() => handleCopy('Windows', getSkillInstallCommand('Windows'))}>
                  {copiedTarget === 'Windows' ? 'Copied!' : 'Copy Windows command'}
                </StoneButton>
              </div>
            </InsetBlock>
          </div>

          <p style={{ fontSize: 13, color: '#6f6c63', margin: '0 0 18px', lineHeight: 1.6, textAlign: 'center' }}>
            Paste it into your terminal. After install, restart Claude Code and run <code style={{ color: '#c8a050' }}>/bury</code>.
          </p>

          <div style={{ textAlign: 'center' }}>
            <a
              href={getSkillContentsUrl()}
              aria-label="View /skills/bury/v1 contents"
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
              View what will be installed
            </a>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
