'use client'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useModal } from '@/context/GameContext'
import { useAccountGraves } from '@/hooks/useAccountGraves'
import { useIsMobile } from '@/hooks/useIsMobile'
import ModalOverlay from './ModalOverlay'
import StoneFrame from '@/components/ui/StoneFrame'
import CloseButton from '@/components/ui/CloseButton'
import InsetBlock from '@/components/ui/InsetBlock'
import StoneButton from '@/components/ui/StoneButton'
import LoadErrorState from '@/components/ui/LoadErrorState'
import { getSlotUnlockProgress } from '@/lib/slot-economy'
export function getSlotsAvailableLabel(n: number) { return n + ' slot' + (n === 1 ? '' : 's') + ' available' }
export default function ProfileModal() {
  const { close, open } = useModal()
  const { data: session } = useSession()
  const account = useAccountGraves()
  const isMobile = useIsMobile()
  const shared = Boolean(session?.user?.x_first_grave_shared_at)
  return <ModalOverlay onClose={close}><StoneFrame isMobile={isMobile} maxWidth={520}>
    <CloseButton onClick={close} />
    <div style={{ padding: '24px', color: '#aaa9a0' }}>
      <h2 style={{ color: '#e8d5a3' }}>@{session?.user?.github_username ?? 'Gravedigger'}</h2>
      {account.loading && <p>Loading your graves...</p>}
      {account.error && <LoadErrorState message={account.error} onRetry={account.refetch} />}
      {account.data && <>
        <InsetBlock label="Grave Slots"><p>{getSlotsAvailableLabel(account.data.availableSlots)}</p><p>{account.data.slotsUsed} / {account.data.slotsUnlocked} used across your account</p></InsetBlock>
        <InsetBlock label="Mission"><p>{getSlotUnlockProgress({ hasSharedFirstGrave: shared }).socialLabel}</p></InsetBlock>
        <InsetBlock label="Your Projects"><div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 12 }}>
          {account.data.graves.length ? account.data.graves.map(grave => <Link key={grave.id} href={'/grave/' + grave.id} onClick={close} style={{ color: '#e8d5a3' }}>🪦 {grave.name}</Link>) : <p>No projects laid to rest yet.</p>}
        </div></InsetBlock>
        <StoneButton onClick={() => open('bury', { flowMode: 'cemetery-shovel' })} disabled={!account.data.canCreateGrave}>Bury a project</StoneButton>
      </>}
      <div style={{ textAlign: 'center', marginTop: 20 }}><button onClick={() => signOut()} style={{ background: 'none', border: 0, color: '#8a8980', cursor: 'pointer' }}>Sign out</button></div>
    </div>
  </StoneFrame></ModalOverlay>
}
