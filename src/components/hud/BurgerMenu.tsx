'use client';

import { useState } from 'react';
import { useModal } from '@/context/GameContext';
import ModalOverlay from '@/components/modals/ModalOverlay';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import OrnamentDivider from '@/components/ui/OrnamentDivider';
import StoneButton from '@/components/ui/StoneButton';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  { question: 'What is this?', answer: 'VibeCemetery is a graveyard for abandoned projects. Every project gets a grave, an epitaph and a link to share. Visit a grave and press F to pay respects.' },
  { question: 'How do I bury a project?', answer: 'Connect GitHub, scan your repositories, choose an eligible project and a cause of death, then confirm the burial. Your grave appears on the map. Burial does not delete your code.' },
  { question: 'Can my AI agent bury a local project?', answer: 'Give your coding agent vibecemetery.app and identify the project. It reads the agent instructions, inspects the project locally and asks you to approve the public details and GitHub account access. Your source stays on your computer or VPS. The result is a normal grave with the same epitaph and sharing features.' },
  { question: 'How many graves do I get?', answer: 'Your GitHub account starts with 4 grave slots. Sharing your first grave unlocks 1 more, up to 5. GitHub and local projects share this account allowance. When it is used, new burials are unavailable; existing graves stay.' },
  { question: 'What counts as an abandoned project?', answer: 'GitHub repositories must belong to your connected account, contain a project, not be forks and have no pushes for at least 7 days. For local projects, the agent checks Git history and uncommitted changes; you decide which project is abandoned.' },
  { question: 'What is the Crematory?', answer: 'The Crematory records GRAVE burned in memory of projects. Burned shows the total at the burn address and its share of the token supply, including transfers outside the cemetery. Tributes lists graves by the verified amount burned for each one.' },
  { question: 'How do GRAVE tributes work?', answer: 'Open a grave, connect your wallet on Base and choose an amount. Confirm the tribute and transfer GRAVE permanently to the burn address. No tokens go to the project owner. Only verified burns appear in Tributes. Tributes grant no rewards or extra grave slots. Transfers to the burn address do not reduce the token contract’s total supply.' },
  { question: 'Can I visit on mobile?', answer: 'Yes. You can explore the cemetery and read graves on mobile. The local agent workflow runs on the computer or VPS where your project lives; browser approval can happen on another device.' },
  { question: 'Who is the Gravedigger?', answer: 'An old-school developer who has seen thousands of projects rise and fall. Now he digs graves and mutters when a project goes under. He has buried a few of his own.' },
];

function FaqAccordion({ item, index }: { item: FaqItem; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid rgba(58, 57, 53, 0.5)', marginBottom: 2 }}>
      <button
        id={`faq-btn-${index}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`faq-${index}`}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: '10px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14, color: '#e8d5a3', fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif" }}>
          {item.question}
        </span>
        <span
          aria-hidden="true"
          style={{
            color: '#8a8980',
            fontSize: 12,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        >
          ▼
        </span>
      </button>
      <div
        id={`faq-${index}`}
        role="region"
        aria-labelledby={`faq-btn-${index}`}
        style={{
          overflow: 'hidden',
          maxHeight: open ? 2000 : 0,
          transition: 'max-height 0.2s ease',
        }}
      >
        <p
          style={{
            margin: '0 0 10px',
            fontSize: 13,
            color: '#aaa9a0',
            lineHeight: 1.6,
            paddingLeft: 4,
            whiteSpace: 'pre-line',
          }}
        >
          {item.answer}
        </p>
      </div>
    </div>
  );
}

export default function BurgerMenu() {
  const { close } = useModal();
  const isMobile = useIsMobile();

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={520}>
        <div style={{
          padding: isMobile ? '20px 16px' : '24px 28px',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}>
          <CloseButton onClick={close} />

          <h2 style={{ margin: '0 0 16px', fontSize: 20, color: '#e8d5a3', textAlign: 'center' }}>
            The Cemetery Guide
          </h2>
          <div style={{ marginBottom: 4 }}>
            {FAQ_ITEMS.map((item, index) => (
              <FaqAccordion key={item.question} item={item} index={index} />
            ))}
          </div>

          <OrnamentDivider />

          {/* Links */}
          <h3 style={{ fontSize: 13, color: '#4a4944', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center' }}>
            Links
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <a href="/agent-instructions" style={{ color: '#b7c4cf', padding: '8px 0' }}>Instructions for AI agents ↗</a>
            <StoneButton
              onClick={() => window.open('https://x.com/vibecmtry', '_blank', 'noopener,noreferrer')}
              style={{ width: '100%', maxWidth: 280 }}
            >
              @vibecmtry on 𝕏
            </StoneButton>
            <StoneButton
              onClick={() => window.open('https://github.com/azkian1/VibeCemetery', '_blank', 'noopener,noreferrer')}
              style={{ width: '100%', maxWidth: 280 }}
            >
              GitHub ↗
            </StoneButton>
          </div>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
