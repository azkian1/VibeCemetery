'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useModal } from '@/context/GameContext'
import { useAccountGraves } from '@/hooks/useAccountGraves'
import { useIsMobile } from '@/hooks/useIsMobile'
import ModalOverlay from './ModalOverlay'
import StoneFrame from '@/components/ui/StoneFrame'
import CloseButton from '@/components/ui/CloseButton'
import OrnamentDivider from '@/components/ui/OrnamentDivider'
import InsetBlock from '@/components/ui/InsetBlock'
import StoneButton from '@/components/ui/StoneButton'
import LoadErrorState from '@/components/ui/LoadErrorState'

function SlotRow({ label, detail, used, available, icon }: {
  label: string
  detail: string
  used: number
  available: number
  icon: string
}) {
  const filled = used > 0
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 2px' }}>
    <span aria-hidden="true" style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', flexShrink: 0, color: filled ? '#c8a050' : '#8a8980', border: '1px solid #3a3530', background: '#1e1b18', borderRadius: 2, fontSize: 15 }}>{icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <strong style={{ color: '#e8d5a3', fontSize: 13, fontWeight: 600 }}>{label}</strong>
        <span style={{ color: filled ? '#c8a050' : '#68a060', fontSize: 12, whiteSpace: 'nowrap' }}>{used} / 1</span>
      </div>
      <div style={{ height: 4, margin: '7px 0 5px', border: '1px solid #302a22', background: '#100e0d' }}>
        <div style={{ height: '100%', width: filled ? '100%' : '0%', background: 'linear-gradient(90deg, #8a7a50, #c8a050)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#8a8980' }}>
        <span>{detail}</span>
        <span style={{ color: available > 0 ? '#68a060' : '#8a8980', whiteSpace: 'nowrap' }}>{available > 0 ? 'Available' : 'Used'}</span>
      </div>
    </div>
  </div>
}

export default function ProfileModal() {
  const { close, open } = useModal()
  const { data: session } = useSession()
  const account = useAccountGraves()
  const isMobile = useIsMobile()
  const username = session?.user?.github_username
  const displayName = session?.user?.name || username || 'Gravedigger'
  const image = session?.user?.image
  const data = account.data

  return <ModalOverlay onClose={close}><StoneFrame isMobile={isMobile} maxWidth={520}>
    <CloseButton onClick={close} />
    <div style={{ padding: isMobile ? '22px 16px 18px' : '24px 28px 20px', color: '#aaa9a0', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, paddingRight: 24, minWidth: 0 }}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={`${displayName} avatar`} width={48} height={48} style={{ width: 48, height: 48, borderRadius: 3, border: '2px solid #5a4a30', objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 12px rgba(0,0,0,0.5)' }} />
        ) : <div aria-hidden="true" style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', flexShrink: 0, border: '2px solid #5a4a30', borderRadius: 3, color: '#c8a050', fontSize: 22, background: '#1e1b18' }}>{displayName.slice(0, 1).toUpperCase()}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#8a7a50', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3 }}>Gravedigger&apos;s record</div>
          {username ? <a href={`https://github.com/${encodeURIComponent(username)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#e8d5a3', fontSize: 17, fontWeight: 'bold', textDecoration: 'none', overflowWrap: 'anywhere' }}>{displayName}</a>
            : <strong style={{ color: '#e8d5a3', fontSize: 17, overflowWrap: 'anywhere' }}>{displayName}</strong>}
          {username && <div style={{ color: '#8a8980', fontSize: 11, marginTop: 2, overflowWrap: 'anywhere' }}>@{username}</div>}
        </div>
        {data && <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 48 }}>
          <div style={{ color: '#c8a050', fontSize: 20, lineHeight: 1 }}>{data.graves.length}</div>
          <div style={{ color: '#6a6960', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>graves</div>
        </div>}
      </div>

      <OrnamentDivider />

      {account.loading && <InsetBlock><p style={{ margin: '6px 0', textAlign: 'center' }}>Loading your burial record...</p></InsetBlock>}
      {account.error && <InsetBlock><LoadErrorState message={account.error} onRetry={account.refetch} /></InsetBlock>}

      {data && <>
        <InsetBlock label="Burial Rights" style={{ marginBottom: 14 }}>
          <SlotRow label="GitHub project" detail="One primary burial" used={data.githubSlotsUsed} available={data.githubAvailableSlots} icon="⌘" />
          <div style={{ height: 1, background: '#2a2520' }} />
          <SlotRow label="Local AI agent" detail="One primary burial" used={data.localSlotsUsed} available={data.localAvailableSlots} icon="✦" />
        </InsetBlock>

        <InsetBlock label="Your Projects" style={{ marginBottom: 14 }}>
          {data.graves.length ? <div style={{ maxHeight: 'min(180px, 30vh)', overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#5a4a30 transparent' }}>
            {data.graves.map((grave, index) => <Link key={grave.id} href={`/grave/${grave.id}`} onClick={close} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 2px', borderBottom: index < data.graves.length - 1 ? '1px solid #2a2520' : 'none', textDecoration: 'none', minWidth: 0 }}>
              <span aria-hidden="true" style={{ color: '#c8a050', fontSize: 16 }}>⚰</span>
              <span style={{ flex: 1, minWidth: 0, color: '#e8d5a3', fontSize: 13, overflowWrap: 'anywhere' }}>{grave.name}</span>
              <span style={{ color: '#8a8980', fontSize: 10, whiteSpace: 'nowrap' }}>{grave.source === 'local' ? 'AGENT' : 'GITHUB'} ↗</span>
            </Link>)}
          </div> : <p style={{ margin: '4px 0', color: '#8a8980', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>No projects laid to rest yet.</p>}
        </InsetBlock>

        {data.canCreateGithubGrave && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
          <StoneButton onClick={() => open('bury', { flowMode: 'cemetery-shovel' })}>Bury GitHub project</StoneButton>
        </div>}
      </>}

      <OrnamentDivider />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button onClick={() => signOut()} style={{ background: 'none', border: 0, color: '#8a8980', cursor: 'pointer', fontFamily: 'var(--font-cinzel)', fontSize: 13, padding: '4px 12px' }}>Sign out</button>
      </div>
    </div>
  </StoneFrame></ModalOverlay>
}
