'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ModalOverlayProps {
  children: ReactNode;
  onClose: () => void;
}

export const ModalOverlayTopContext = createContext(true);

export function shouldHandleModalOverlayEscape(isTop: boolean, key: string): boolean {
  return isTop && key === 'Escape';
}

export default function ModalOverlay({ children, onClose }: ModalOverlayProps) {
  const isTop = useContext(ModalOverlayTopContext);
  const [visible, setVisible] = useState(false);
  const outerIdRef = useRef(0);
  const innerIdRef = useRef(0);

  useEffect(() => {
    // Double rAF ensures browser paints the initial (hidden) frame first
    outerIdRef.current = requestAnimationFrame(() => {
      innerIdRef.current = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(outerIdRef.current);
      cancelAnimationFrame(innerIdRef.current);
    };
  }, []);

  // Focus trap: keep Tab cycling within the dialog
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTop) return;
    const el = dialogRef.current;
    if (!el) return;
    el.focus();
  }, [isTop]);

  // Global Escape listener — works regardless of focus position
  useEffect(() => {
    if (!isTop) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (!shouldHandleModalOverlayEscape(isTop, e.key)) return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isTop, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const el = dialogRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(8, 6, 4, 0.60)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease-out',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'transform 200ms ease-out, opacity 200ms ease-out',
          maxHeight: '100vh',
          overflowY: 'auto',
          outline: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
