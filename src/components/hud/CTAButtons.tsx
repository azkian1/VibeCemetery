'use client'
import { useModal } from '@/context/GameContext'
import { useSession } from 'next-auth/react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAccountGraves } from '@/hooks/useAccountGraves'
import styles from './CTAButtons.module.css'
export default function CTAButtons() {
  const { open } = useModal()
  const { data: session } = useSession()
  const account = useAccountGraves()
  const isMobile = useIsMobile()
  if (isMobile) return null
  const disabled = Boolean(session?.user && (!account.data?.canCreateGrave || account.loading))
  const status = session?.user
    ? account.error || (account.loading ? 'Checking grave slots...' : disabled ? 'No grave slots left.' : '')
    : ''
  return <div className={styles.action}>
    {status && <p id="bury-slot-status" className={styles.status} role="status">{status}</p>}
    <button type="button" aria-label="Bury a project"
      aria-describedby={status ? 'bury-slot-status' : undefined}
      className={styles.button}
      onClick={() => open('bury', { flowMode: 'cemetery-shovel' })}
      disabled={disabled}>BURY</button>
  </div>
}
