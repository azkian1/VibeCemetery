'use client';

export default function OrnamentDivider() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      margin: '14px 0',
      userSelect: 'none',
    }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #5a4a30, transparent)' }} />
      <span style={{ color: '#5a4a30', fontSize: 10, lineHeight: 1 }}>✦</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #5a4a30, transparent)' }} />
    </div>
  );
}
