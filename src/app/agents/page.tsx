'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

function AgentsHubContent() {
  const router = useRouter();

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  return (
    <main style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 50% 12%, rgba(48, 62, 86, 0.24), transparent 34%), linear-gradient(180deg, #14130f 0%, #0c0b0a 100%)', color: '#d8d0bc', fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif", padding: '42px 18px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <nav style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button type="button" onClick={goBack} style={backButtonStyle}>Back</button>
          <Link href="/" style={{ color: '#e8d5a3', textDecoration: 'none', fontWeight: 700, letterSpacing: 1.2, textAlign: 'center' }}>VibeCemetery</Link>
          <span aria-hidden="true" />
        </nav>

        <section style={{ border: '1px solid rgba(180, 160, 120, 0.24)', borderRadius: 18, padding: 'clamp(24px, 5vw, 34px)', background: 'linear-gradient(180deg, rgba(49,45,38,0.92), rgba(22,21,19,0.96))', boxShadow: '0 18px 60px rgba(0,0,0,0.42)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', color: '#8fa8c0', letterSpacing: 2, fontSize: 12, textTransform: 'uppercase' }}>Paused Experiment</p>
          <h1 style={{ margin: '0 0 12px', color: '#e8d5a3', fontSize: 'clamp(28px, 5vw, 42px)', lineHeight: 1.08 }}>Agent Layer Is On Pause</h1>
          <p style={{ margin: '0 auto 28px', maxWidth: 560, color: '#aaa9a0', lineHeight: 1.7, fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}>
            The GitLawb / Agent Ash layer is archived for now. VibeCemetery is focused on filling the human cemetery first: GitHub graves, and local project graves.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
            <Link href="/" style={primaryActionStyle}>
              Scan GitHub
            </Link>
            <Link href="/cemetery" style={secondaryActionStyle}>
              Enter Cemetery
            </Link>
          </div>

          <p style={{ margin: '24px auto 0', maxWidth: 560, color: '#777168', lineHeight: 1.6, fontSize: 12, fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}>
            To bury a local project, give your coding agent vibecemetery.app and tell it which project to bury. It will follow the{' '}
            <Link href="/agent-instructions" style={{ color: '#bdb6a4', textDecoration: 'underline', textUnderlineOffset: 3 }}>Instructions for AI agents</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}

const backButtonStyle: React.CSSProperties = {
  border: '1px solid #3a3530',
  borderRadius: 10,
  background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
  color: '#bdb6a4',
  cursor: 'pointer',
  fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
  fontSize: 12,
  padding: '8px 12px',
};

const primaryActionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
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
  textDecoration: 'none',
};

const secondaryActionStyle: React.CSSProperties = {
  ...primaryActionStyle,
  background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
  borderColor: '#3a3530',
  color: '#e8d5a3',
};

export default function AgentsPage() {
  return <AgentsHubContent />;
}
