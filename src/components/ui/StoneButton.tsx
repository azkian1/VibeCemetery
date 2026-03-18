'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface StoneButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

export default function StoneButton({
  children,
  onClick,
  disabled,
  active,
  style,
  ...rest
}: StoneButtonProps) {
  const baseStyle: React.CSSProperties = {
    padding: '7px 18px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#3a3530',
    borderRadius: 2,
    background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
    color: active ? '#c8a050' : '#8a8980',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 13,
    fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
    transition: 'all 0.15s',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.3)',
    opacity: disabled ? 0.5 : 1,
    textAlign: 'center',
    ...(active ? { borderColor: '#5a4a30' } : {}),
    ...style,
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={baseStyle}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = '#5a4a30';
        e.currentTarget.style.color = '#e8d5a3';
        e.currentTarget.style.background = 'linear-gradient(180deg, #302e28 0%, #242018 100%)';
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = active ? '#5a4a30' : '#3a3530';
        e.currentTarget.style.color = active ? '#c8a050' : '#8a8980';
        e.currentTarget.style.background = 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)';
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
