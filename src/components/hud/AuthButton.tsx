'use client';

import { useSession, signIn } from 'next-auth/react';
import { useModal } from '@/context/GameContext';

const btnBase: React.CSSProperties = {
  background: 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)',
  border: '1px solid #3a3530',
  borderRadius: 2,
  cursor: 'pointer',
  fontFamily: "var(--font-cinzel), 'Cinzel', Georgia, serif",
  fontSize: 14,
  color: '#aaa9a0',
  transition: 'all 0.15s',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.3)',
};

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.borderColor = '#5a4a30';
  e.currentTarget.style.color = '#e8d5a3';
  e.currentTarget.style.background = 'linear-gradient(180deg, #302e28 0%, #242018 100%)';
}

function hoverOut(e: React.MouseEvent<HTMLButtonElement>, defaultColor: string) {
  e.currentTarget.style.borderColor = '#3a3530';
  e.currentTarget.style.color = defaultColor;
  e.currentTarget.style.background = 'linear-gradient(180deg, #2a2825 0%, #1e1c18 100%)';
}

export default function AuthButton() {
  const { data: session } = useSession();
  const { open } = useModal();

  if (session?.user) {
    return (
      <button
        onClick={() => open('profile')}
        style={{
          ...btnBase,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
        }}
        onMouseEnter={hoverIn}
        onMouseLeave={(e) => hoverOut(e, '#aaa9a0')}
      >
        {session.user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt={`${session.user.name ?? 'User'} avatar`}
            width={24}
            height={24}
            style={{ borderRadius: '50%' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <span>{session.user.github_username ?? session.user.name}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn('github')}
      style={{
        ...btnBase,
        padding: '5px 12px',
      }}
      onMouseEnter={hoverIn}
      onMouseLeave={(e) => hoverOut(e, '#8a8980')}
    >
      Login
    </button>
  );
}
