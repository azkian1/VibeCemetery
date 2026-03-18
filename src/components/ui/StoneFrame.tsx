'use client';

import type { ReactNode } from 'react';

interface StoneFrameProps {
  isMobile: boolean;
  children: ReactNode;
  maxWidth?: number;
}

export default function StoneFrame({ isMobile, children, maxWidth = 440 }: StoneFrameProps) {
  return (
    <div style={{
      maxWidth: isMobile ? 'none' : maxWidth,
      width: isMobile ? '100vw' : '90vw',
      fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
      color: '#aaa9a0',
      position: 'relative',
      boxSizing: 'border-box',
      borderRadius: isMobile ? 0 : 4,
      overflow: 'hidden',
      border: isMobile ? 'none' : '2px solid #3a3530',
      boxShadow: isMobile ? 'none' : [
        'inset 0 0 0 1px #2a2520',
        'inset 0 1px 0 0 rgba(200,160,80,0.08)',
        '0 0 0 1px #1a1510',
        '0 0 0 3px #2e2820',
        '0 0 0 4px rgba(200,160,80,0.12)',
        '0 12px 40px rgba(0,0,0,0.7)',
        '0 4px 12px rgba(0,0,0,0.4)',
      ].join(', '),
    }}>
      {/* Stone texture background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, #1e1c1a 0%, #161412 40%, #1a1816 100%)',
        zIndex: 0,
      }} />

      {/* Subtle noise grain overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        backgroundSize: '128px 128px',
        zIndex: 1,
        pointerEvents: 'none',
      }} />

      {/* Vignette edges */}
      <div style={{
        position: 'absolute',
        inset: 0,
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4)',
        zIndex: 1,
        pointerEvents: 'none',
        borderRadius: isMobile ? 0 : 4,
      }} />

      {/* Gold accent line */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 20,
        right: 20,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(200,160,80,0.25), transparent)',
        zIndex: 2,
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
}
