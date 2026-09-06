'use client'
import { useModal } from '@/context/GameContext'
import { useSession } from 'next-auth/react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAccountGraves } from '@/hooks/useAccountGraves'
import StoneButton from '@/components/ui/StoneButton'
export default function CTAButtons() {
  const { open } = useModal()
  const { data: session } = useSession()
  const account = useAccountGraves()
  if (useIsMobile()) return null
  const disabled = Boolean(session?.user && (!account.data?.canCreateGrave || account.loading))
  return <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 40, width: 340, height: 94, boxSizing: 'border-box', background: 'rgba(20,18,16,0.85)', border: '1px solid #3a3530', padding: 12, textAlign: 'center' }}>
    <StoneButton onClick={() => open('bury', { flowMode: 'cemetery-shovel' })} disabled={disabled}>Bury a project</StoneButton>
    <p style={{ color: '#8f897d', fontSize: 11, margin: '7px 0 0' }}>{account.error || (account.loading ? 'Checking grave slots...' : disabled ? 'No grave slots left.' : 'One project. One grave.')}</p>
  </div>
}
