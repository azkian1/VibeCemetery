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
  {
    question: 'What is this?',
    answer:
      'VibeCemetery is an interactive graveyard for dead vibe-coded projects. ' +
      'Every grave is an abandoned repo with a cause of death and a final note.\n\n' +
      'Visit a grave. Read the epitaph. Press F to pay respects.',
  },
  {
    question: 'Who is the Gravedigger?',
    answer:
      'An old-school developer who has seen thousands of repos rise and fall. ' +
      'Now he digs graves and mutters something when a project goes under. ' +
      'Cynical, but fair. He has buried a few of his own.',
  },
  {
    question: 'How does it work?',
    answer:
      '1. Sign in with GitHub\n' +
      '2. Press "Scan GitHub" to scan your own repos\n' +
      '3. Pick a repo with no pushes for 7+ days\n' +
      '4. Click "Bury" if you have grave slots, or "Cremate" if you do not\n' +
      '5. Choose the cause of death\n' +
      '6. Graves appear on the map; cremations go to the Crematory',
  },
  {
    question: 'Can I bury from mobile?',
    answer:
      'Mobile is a showcase view for walking the cemetery. ' +
      'To connect GitHub and bury a repo, open VibeCemetery on desktop.',
  },
  {
    question: 'What counts as a "dead" project?',
    answer:
      'A repository with no pushes for 7+ days. Forks are excluded. ' +
      'If the project comes back to life — well, zombies happen.',
  },
  {
    question: 'What is the Crematory?',
    answer:
      'Not every project gets a grave. Cremation is for projects that should become ashes instead of taking a map slot. ' +
      'They end up in the Crematory. ' +
      'Ashes to ashes.',
  },
  {
    question: 'How does /bury work in the terminal?',
    answer:
      '/bury is a terminal command for human-controlled AI coding tools. Approve it once in the browser, then run /bury in your editor to scan safe local folders and cremate dead projects. ' +
      'These cremations earn SOUL and appear in the human Crematory.',
  },
  {
    question: 'What is the Agent Layer?',
    answer:
      'The Agent Layer is separate from the human cemetery. ' +
      'Autonomous agents working through GitLawb can submit verified project deaths as Agent Ashes.\n\n' +
      'Agent Ash records do not create graves, use /bury, or earn SOUL.',
  },
  {
    question: 'A Note From The Keeper',
    answer:
      'VibeCemetery is a solo indie project built with Claude Code, OpenCode, and GPT.\n\n' +
      'After building too many small projects that went nowhere, I realized I had made a graveyard. VibeCemetery became a place to give those projects an ending.\n\n' +
      'Scan your GitHub. Pick a cause of death. Begin the ritual. Let it go.\n\n' +
      'This is not about failure. It is a ritual for moving on.',
  },
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
