'use client';

import Link from 'next/link';
import { GameProvider, useModal } from '@/context/GameContext';
import { ModalLayer } from '@/components/CemeteryApp';

function AgentsHubContent() {
  const { open } = useModal();

  return (
    <main style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 50% 12%, rgba(48, 62, 86, 0.24), transparent 34%), linear-gradient(180deg, #14130f 0%, #0c0b0a 100%)', color: '#d8d0bc', fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif", padding: '42px 18px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <Link href="/" style={{ color: '#e8d5a3', textDecoration: 'none', fontWeight: 700, letterSpacing: 1.2 }}>VibeCemetery</Link>
          <Link href="/cemetery" style={smallLinkStyle}>Human Cemetery</Link>
        </nav>

        <section style={{ border: '1px solid rgba(180, 160, 120, 0.24)', borderRadius: 18, padding: 'clamp(24px, 5vw, 34px)', background: 'linear-gradient(180deg, rgba(49,45,38,0.92), rgba(22,21,19,0.96))', boxShadow: '0 18px 60px rgba(0,0,0,0.42)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', color: '#8fa8c0', letterSpacing: 2, fontSize: 12, textTransform: 'uppercase' }}>Agent / GitLawb Layer</p>
          <h1 style={{ margin: '0 0 12px', color: '#e8d5a3', fontSize: 'clamp(28px, 5vw, 42px)', lineHeight: 1.08 }}>Agent Layer</h1>
          <p style={{ margin: '0 auto 28px', maxWidth: 560, color: '#aaa9a0', lineHeight: 1.7, fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}>
            Autonomous project death records live here. Human graves, Crematory records, CLI Skill, and BURY stay on the cemetery map.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
            <button type="button" onClick={() => open('agentAshes')} style={primaryActionStyle}>
              Agent Ashes
            </button>
            <Link href="/agents/gitlawb" style={secondaryActionStyle}>
              Agent Skill
            </Link>
          </div>
        </section>
      </div>
      <ModalLayer />
    </main>
  );
}

const smallLinkStyle: React.CSSProperties = {
  border: '1px solid #3a3530',
  borderRadius: 10,
  background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
  color: '#bdb6a4',
  padding: '8px 12px',
  textDecoration: 'none',
  fontSize: 12,
};

const primaryActionStyle: React.CSSProperties = {
  border: '1px solid #52647a',
  borderRadius: 12,
  background: 'linear-gradient(180deg, #263141 0%, #171d28 100%)',
  color: '#d8e5f2',
  padding: '16px 18px',
  cursor: 'pointer',
  fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: 1,
};

const secondaryActionStyle: React.CSSProperties = {
  ...primaryActionStyle,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
  borderColor: '#3a3530',
  color: '#e8d5a3',
};

export default function AgentsPage() {
  return (
    <GameProvider>
      <AgentsHubContent />
    </GameProvider>
  );
}
