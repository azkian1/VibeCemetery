'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[VibeCemetery] Unhandled error:', error);
  }, [error]);

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
        &#x2620;
      </div>

      <h1
        style={{
          color: '#d4d0c4',
          fontSize: '2rem',
          fontWeight: 600,
          marginBottom: '0.75rem',
        }}
      >
        Something disturbed the dead.
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
        &ldquo;Even the cemetery breaks sometimes. I blame the living.&rdquo;
        <br />
        <span style={{ fontSize: '0.85rem', color: '#706860' }}>
          &mdash; The Gravedigger
        </span>
      </p>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={reset}
          style={{
            padding: '12px 32px',
            background: 'linear-gradient(180deg, #4a4540 0%, #2a2725 100%)',
            color: '#e8d5a3',
            fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
            fontSize: '0.95rem',
            fontWeight: 600,
            border: '1px solid #5a534a',
            borderRadius: '2px',
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          Try Again
        </button>

        <a
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '12px 32px',
            background: 'transparent',
            color: '#a09888',
            fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
            fontSize: '0.95rem',
            fontWeight: 400,
            border: '1px solid #3a3530',
            borderRadius: '2px',
            textDecoration: 'none',
            letterSpacing: '0.05em',
          }}
        >
          Return to Cemetery
        </a>
      </div>
    </div>
  );
}
