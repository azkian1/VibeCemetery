'use client';

import { useModal } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { AGENT_INSTRUCTIONS_PATH, AGENT_INSTRUCTIONS_TITLE, AGENT_INSTRUCTIONS_SUBTITLE } from '@/lib/agent-instructions';
import ModalOverlay from './ModalOverlay';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';

// Keep the existing modal key working for saved links and ceremony callbacks.
export default function SkillModal() {
  const { close } = useModal();
  const isMobile = useIsMobile();
  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={560}>
        <div style={{ padding: isMobile ? '24px 20px' : '32px 36px', textAlign: 'center' }}>
          <CloseButton onClick={close} />
          <h2 style={{ margin: '0 0 12px', color: '#e8d5a3', fontSize: 22 }}>{AGENT_INSTRUCTIONS_TITLE}</h2>
          <p style={{ color: '#aaa9a0', fontSize: 14 }}>{AGENT_INSTRUCTIONS_SUBTITLE}</p>
          <p style={{ color: '#aaa9a0', lineHeight: 1.7, margin: '20px 0' }}>
            Give your coding agent <a href="https://vibecemetery.app" style={{ color: '#e8d5a3' }}>vibecemetery.app</a> and tell it which project you want to bury. It will find the instructions and ask for your confirmation before publishing.
          </p>
          <a href={AGENT_INSTRUCTIONS_PATH} style={{ display: 'inline-block', color: '#b7c4cf', padding: '10px 0', textUnderlineOffset: 4 }}>Read the instructions ↗</a>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
