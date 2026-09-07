'use client'

import { useMemo, useState } from 'react'
import { useModal } from '@/context/GameContext'
import { useOfferingLedger } from '@/hooks/useOfferingLedger'
import { useIsMobile } from '@/hooks/useIsMobile'
import { compareRawAmounts, formatGraveAmount } from '@/lib/web3/offeringLedger'
import ModalOverlay from './ModalOverlay'
import StoneFrame from '@/components/ui/StoneFrame'
import CloseButton from '@/components/ui/CloseButton'
import OrnamentDivider from '@/components/ui/OrnamentDivider'
import LoadErrorState from '@/components/ui/LoadErrorState'
import styles from './LedgerModal.module.css'

export const LEADERBOARD_TABS = [{ key: 'killers', label: 'Serial Killers' }, { key: 'causes', label: 'Causes of Death' }] as const

export default function LeaderboardModal() {
  const { close, push } = useModal()
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<'killers' | 'causes'>('killers')
  const [sort, setSort] = useState<'buried' | 'burned'>('buried')
  const [descending, setDescending] = useState(true)
  const { data, error, loading, refetch } = useOfferingLedger()
  const authors = useMemo(() => [...(data?.authors ?? [])].sort((a, b) => {
    const value = sort === 'burned' ? compareRawAmounts(a.offeringsRaw, b.offeringsRaw) : a.buried - b.buried
    return value * (descending ? -1 : 1) || a.author.localeCompare(b.author)
  }), [data, sort, descending])
  const toggleSort = (column: typeof sort) => {
    setDescending(sort === column ? !descending : true)
    setSort(column)
  }
  const arrow = (column: typeof sort) => sort === column ? descending ? ' ▾' : ' ▴' : ''

  return <ModalOverlay onClose={close}>
    <StoneFrame isMobile={isMobile} maxWidth={720}>
      <div className={styles.body}>
        <CloseButton onClick={close} />
        <h2 className={styles.title}>Necropolis</h2>
        <p className={styles.subtitle}>The Gravedigger’s ledger. Those who laid their projects to rest.</p>
        <div role="tablist" aria-label="Necropolis sections" className={styles.tabs}>
          {LEADERBOARD_TABS.map(t => <button key={t.key} type="button" role="tab"
            id={'necropolis-tab-' + t.key} aria-controls="necropolis-panel"
            aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>)}
        </div>
        {loading && <p className={styles.empty}>Checking the records...</p>}
        {error && <LoadErrorState message={error} onRetry={refetch} />}
        {data && !error && <>
          <div role="tabpanel" id="necropolis-panel" aria-labelledby={'necropolis-tab-' + tab} className={styles.tableFrame}>
            {tab === 'killers' ? <table className={styles.table} aria-label="Gravediggers">
              <colgroup><col style={{ width: 32 }} /><col /><col style={{ width: 84 }} /><col style={{ width: isMobile ? 114 : 160 }} /></colgroup>
              <thead><tr>
                <th scope="col" className={styles.rank}>#</th>
                <th scope="col">Gravedigger</th>
                <th scope="col" className={styles.numeric} aria-sort={sort === 'buried' ? descending ? 'descending' : 'ascending' : 'none'}>
                  <button type="button" onClick={() => toggleSort('buried')}>Buried{arrow('buried')}</button>
                </th>
                <th scope="col" className={styles.numeric} aria-sort={sort === 'burned' ? descending ? 'descending' : 'ascending' : 'none'}>
                  <button type="button" onClick={() => toggleSort('burned')}>Burned{arrow('burned')}<span className={styles.unit}>$GRAVE</span></button>
                </th>
              </tr></thead>
              <tbody>{authors.map((author, index) => <tr key={author.author}>
                <td className={styles.rank}>{index + 1}</td>
                <td><button type="button" className={styles.author} title={'View graves by @' + author.author}
                  onClick={() => push('mausoleum', { authorFilter: author.author })}>@{author.author}</button></td>
                <td className={styles.numeric}>{author.buried}</td>
                <td className={styles.amount}>{formatGraveAmount(author.offeringsRaw)}</td>
              </tr>)}</tbody>
            </table> : <table className={styles.table} aria-label="Causes of Death">
              <thead><tr><th scope="col">Cause</th><th scope="col" className={styles.numeric}>Buried</th></tr></thead>
              <tbody>{data.causes.map(c => <tr key={c.cause}><td className={styles.cause}>{c.cause}</td><td className={styles.numeric}>{c.count}</td></tr>)}</tbody>
            </table>}
            {!(tab === 'killers' ? authors.length : data.causes.length) && <p className={styles.empty}>No projects buried yet.</p>}
          </div>
          <OrnamentDivider />
          <p className={styles.footer}>{tab === 'killers' ? 'Burned: verified $GRAVE sent to each gravedigger’s graves.' : 'Every project has a cause of death.'}</p>
        </>}
      </div>
    </StoneFrame>
  </ModalOverlay>
}
