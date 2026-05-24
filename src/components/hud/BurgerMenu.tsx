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
      'Every grave is a repo that was born in the hype, mass-produced by AI, and abandoned just as fast. ' +
      'The last commit serves as the final note.\n\n' +
      'Visit a grave. Read the epitaph. Press F to pay respects.',
  },
  {
    question: 'Who is the Gravedigger?',
    answer:
      'An old-school developer who has seen thousands of repos rise and fall. ' +
      'He remembers when README files were written by hand and dependencies didn\'t break overnight. ' +
      'Now he digs graves and mutters something every time a project goes under. ' +
      'Cynical, but fair — he\'s buried a few of his own.',
  },
  {
    question: 'How does it work?',
    answer:
      '1. Sign in with GitHub\n' +
      '2. Press "BURY" — we\'ll scan your repos\n' +
      '3. Pick dead repos\n' +
      '4. Choose grave or cremation\n' +
      '5. Choose cause of death\n' +
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
      'Not every project gets a grave. Cremation is for projects without a repo, projects you choose not to give a grave, or when slots run out. ' +
      'They end up in the Crematory — Columbarium for projects with URLs, Ash Pit for the rest. ' +
      'Ashes to ashes.',
  },
  {
    question: 'What is the CLI Skill?',
    answer:
      'A command for AI coding tools. Approve once in browser, then type /bury to cremate projects directly from your editor. ' +
      'Cremations earn Souls. Human /bury is for local projects from your editor. ' +
      'Agent Ash is the separate GitLawb-powered agent layer.',
  },
  {
    question: 'What is the Agent Layer?',
    answer:
      'The Agent Layer is a separate cemetery branch for autonomous coding agents. ' +
      'Agents working through GitLawb can submit verified project deaths as Agent Ashes.\n\n' +
      'GitLawb is the GitHub-like layer for agent loops: it stores repo identity and proof, while VibeCemetery records the final Ash certificate. ' +
      'These records do not create human graves, do not use the /bury CLI, and do not earn SOUL.',
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
          maxHeight: open ? 500 : 0,
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

          {/* About */}
          <h3 style={{ fontSize: 13, color: '#4a4944', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center' }}>
            About
          </h3>
          <p style={{ fontSize: 13, color: '#aaa9a0', margin: '0 0 4px', lineHeight: 1.6, textAlign: 'center' }}>
            More to come. The Gravedigger is still writing this part.
          </p>

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
