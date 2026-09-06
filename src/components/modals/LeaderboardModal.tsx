'use client'
import { useState } from 'react'
import { useModal } from '@/context/GameContext'
import { useOfferingLedger } from '@/hooks/useOfferingLedger'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatGraveAmount } from '@/lib/web3/offeringLedger'
import ModalOverlay from './ModalOverlay'
import StoneFrame from '@/components/ui/StoneFrame'
import CloseButton from '@/components/ui/CloseButton'
import LoadErrorState from '@/components/ui/LoadErrorState'
export const LEADERBOARD_TABS = [{ key: 'killers', label: 'Serial Killers' }, { key: 'causes', label: 'Causes of Death' }] as const
export default function LeaderboardModal() {
  const { close } = useModal()
  const [tab, setTab] = useState<'killers' | 'causes'>('killers')
  const { data, error, loading, refetch } = useOfferingLedger()
  return <ModalOverlay onClose={close}><StoneFrame isMobile={useIsMobile()} maxWidth={680}>
    <CloseButton onClick={close} />
    <div style={{ padding: 24, color: '#aaa9a0' }}>
      <h2 style={{ textAlign: 'center', color: '#e8d5a3' }}>Necropolis</h2>
      <div role="tablist" aria-label="Necropolis sections" style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
        {LEADERBOARD_TABS.map(t => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} style={{ background: 'none', border: 0, borderBottom: tab === t.key ? '2px solid #c8a050' : '2px solid transparent', padding: 10, color: tab === t.key ? '#e8d5a3' : '#8a8980', cursor: 'pointer' }}>{t.label}</button>)}
      </div>
      {loading && <p>Loading the ledger...</p>}
      {error && <LoadErrorState message={error} onRetry={refetch} />}
      {data && !error && <div role="tabpanel" style={{ maxHeight: 430, overflow: 'auto', fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}>
        {tab === 'killers' ? <>
          <p style={{ fontSize: 12 }}>Offerings are verified GRAVE sent to these authors’ graves.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr>{['Gravedigger', 'Buried', 'Offerings (GRAVE)'].map(h => <th key={h} style={{ textAlign: 'left', padding: 10, color: '#b9a879' }}>{h}</th>)}</tr></thead>
            <tbody>{data.authors.map((u, i) => <tr key={u.author} style={{ borderTop: '1px solid #302b24' }}><td style={{ padding: 10 }}>{i + 1}. @{u.author}</td><td style={{ padding: 10 }}>{u.buried}</td><td style={{ padding: 10, color: '#c7a46a' }}>{formatGraveAmount(u.offeringsRaw)}</td></tr>)}</tbody>
          </table>{!data.authors.length && <p>No projects buried yet.</p>}
        </> : data.causes.map(c => <div key={c.cause} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: 12, borderBottom: '1px solid #302b24' }}><span>{c.cause}</span><strong>{c.count}</strong></div>)}
      </div>}
    </div>
  </StoneFrame></ModalOverlay>
}
