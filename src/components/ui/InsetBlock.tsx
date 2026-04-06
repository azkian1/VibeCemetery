'use client';

import type { CSSProperties, ReactNode } from 'react';

interface InsetBlockProps {
  children: ReactNode;
  label?: string;
  style?: CSSProperties;
}

export default function InsetBlock({ children, label, style }: InsetBlockProps) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #121010 0%, #161414 100%)',
      border: '1px solid #2a2520',
      borderRadius: 2,
      padding: '10px 14px',
      boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(200,160,80,0.04)',
      ...style,
    }}>
      {label && (
        <span style={{
          fontSize: 11,
          color: '#aaa9a0',
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          display: 'block',
          marginBottom: 8,
          textAlign: 'center',
          fontWeight: 'bold',
        }}>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
