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
  getHermesAgentInstallPath,
  getSkillAgentInstallPrompt,
  getSkillInstallSecondaryLink,
} from './skillInstall';

type CopiedTarget = 'cli' | 'hermes' | null;

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

  const cliPrompt = getSkillAgentInstallPrompt();

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

  const getHermesAgentInstallUrl = () => `${window.location.origin}${getHermesAgentInstallPath()}`;

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile}>
        <div style={{ padding: isMobile ? '20px 16px' : '24px 28px' }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 14px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            Install skill
          </h2>

          <p style={{ fontSize: 13, color: '#aaa9a0', margin: '0 0 18px', lineHeight: 1.55, textAlign: 'center' }}>
            Copy the prompt and paste it into your local AI coding CLI. Your agent will read the docs,
            pick the right installer for your OS, and set up <code style={{ color: '#c8a050' }}>/bury</code>.
          </p>

          <div style={{ marginBottom: 16 }}>
            <InsetBlock>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#e8d5a3', fontSize: 14, marginBottom: 4 }}>
                    Claude Code / OpenCode / Cursor
                  </div>
                  <div style={{ color: '#77746a', fontSize: 12, lineHeight: 1.45 }}>
                    The install prompt is built into the button. Click it, then paste into your agent chat.
                  </div>
                </div>
                <StoneButton onClick={() => handleCopy('cli', cliPrompt)}>
                  {copiedTarget === 'cli' ? 'Copied!' : 'Copy Install Command'}
                </StoneButton>
              </div>
            </InsetBlock>
          </div>

          <p style={{ fontSize: 12, color: '#6f6c63', margin: '0 0 16px', lineHeight: 1.5, textAlign: 'center' }}>
            Paste it into your local agent chat. After install, run <code style={{ color: '#c8a050' }}>/bury</code>.
          </p>

          <div style={{ marginBottom: 16 }}>
            <InsetBlock>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#e8d5a3', fontSize: 14, marginBottom: 4 }}>
                    Hermes / OpenClaw Agent Ashes
                  </div>
                  <div style={{ color: '#77746a', fontSize: 12, lineHeight: 1.45 }}>
                    Give Hermes one URL. It reads the install contract from the site and sets up Agent Ashes itself.
                  </div>
                </div>
                <StoneButton onClick={() => handleCopy('hermes', getHermesAgentInstallUrl())}>
                  {copiedTarget === 'hermes' ? 'COPIED!' : 'COPY AGENT URL'}
                </StoneButton>
                <div style={{ color: '#77746a', fontSize: 12, lineHeight: 1.4, textAlign: 'center' }}>
                  Agent Ash uses ash_ ingest tokens. Human vc_cli_ keys stay only in the CLI /bury branch.
                </div>
              </div>
            </InsetBlock>
          </div>

          <div style={{ textAlign: 'center' }}>
            <a
              href={getSkillInstallSecondaryLink()}
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
              Manual install on GitHub ↗
            </a>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
