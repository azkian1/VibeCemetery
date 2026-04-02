import Link from 'next/link';

const GRAVEDIGGER_QUOTES = [
  "I checked the records. No one by that name here.",
  "Even the dead have addresses. This isn't one.",
  "Wrong turn. The cemetery is that way.",
  "I've dug every grave here. This plot is empty.",
  "Not every URL leads to a grave. Some lead nowhere.",
];

// Pick a deterministic quote based on the current day
const quote = GRAVEDIGGER_QUOTES[new Date().getDay() % GRAVEDIGGER_QUOTES.length];

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0a09',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
      }}
    >
      <div style={{ fontSize: '72px', marginBottom: '1rem', opacity: 0.6 }}>
        &#x271D;
      </div>

      <h1
        style={{
          color: '#d4d0c4',
          fontSize: '2rem',
          fontWeight: 600,
          marginBottom: '0.75rem',
        }}
      >
        This grave does not exist... yet.
      </h1>

      <p
        style={{
          color: '#a09888',
          fontSize: '1rem',
          fontStyle: 'italic',
          maxWidth: '400px',
          marginBottom: '2rem',
          lineHeight: 1.6,
        }}
      >
        &ldquo;{quote}&rdquo;
        <br />
        <span style={{ fontSize: '0.85rem', color: '#706860' }}>
          &mdash; The Gravedigger
        </span>
      </p>

      <Link
        href="/"
        style={{
          display: 'inline-block',
          padding: '12px 32px',
          background: 'linear-gradient(180deg, #4a4540 0%, #2a2725 100%)',
          color: '#e8d5a3',
          fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
          fontSize: '0.95rem',
          fontWeight: 600,
          border: '1px solid #5a534a',
          borderRadius: '2px',
          textDecoration: 'none',
          letterSpacing: '0.05em',
        }}
      >
        Return to the Cemetery
      </Link>
    </div>
  );
}
