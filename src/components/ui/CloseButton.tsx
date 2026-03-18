'use client';

interface CloseButtonProps {
  onClick: () => void;
}

export default function CloseButton({ onClick }: CloseButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      style={{
        position: 'absolute',
        top: 10,
        right: 12,
        background: 'none',
        border: '1px solid transparent',
        color: '#4a4944',
        fontSize: 14,
        cursor: 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
        zIndex: 3,
        padding: '2px 6px',
        lineHeight: 1,
        borderRadius: 2,
        fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = '#e8d5a3';
        e.currentTarget.style.borderColor = '#5a4a30';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#4a4944';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      ✕
    </button>
  );
}
