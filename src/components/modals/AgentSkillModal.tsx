'use client';

import { useEffect, useRef, useState } from 'react';
import { useModal } from '@/context/GameContext';
import ModalOverlay from './ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import StoneButton from '@/components/ui/StoneButton';
import InsetBlock from '@/components/ui/InsetBlock';
import { getAgentAshInstallPath } from '@/lib/agent-ash-install';

export default function AgentSkillModal() {
  const { close } = useModal();
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  if (isMobile) return null;

  const getAgentAshInstallUrl = () => `${window.location.origin}${getAgentAshInstallPath()}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
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
            PAUSED AGENT SKILL
          </h2>

          <p style={{ fontSize: 14, color: '#aaa9a0', margin: '0 0 20px', lineHeight: 1.65, textAlign: 'center' }}>
            The GitLawb / Agent Ash experiment is paused until the cemetery is more populated.
            This is not the human /bury CLI.
          </p>

          <div style={{ marginBottom: 16 }}>
            <InsetBlock>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#e8d5a3', fontSize: 15, marginBottom: 6 }}>
                    Archived Hermes / OpenClaw Agent Ashes
                  </div>
                  <div style={{ color: '#77746a', fontSize: 13, lineHeight: 1.55 }}>
                    The legacy URL is retained for direct links and future audit work. Do not install it for normal VibeCemetery use.
                  </div>
                </div>
                <StoneButton onClick={() => handleCopy(getAgentAshInstallUrl())}>
                  {copied ? 'COPIED!' : 'COPY ARCHIVE URL'}
                </StoneButton>
                <div style={{ color: '#77746a', fontSize: 13, lineHeight: 1.5, textAlign: 'center' }}>
                  If revived, Agent Ash must keep ash_ ingest tokens separate from human vc_cli_ /bury keys.
                </div>
              </div>
            </InsetBlock>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
