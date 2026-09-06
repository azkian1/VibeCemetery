'use client'

import Link from 'next/link'
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

export default function CrematoryModal() {
  const { close } = useModal()
  const isMobile = useIsMobile()
  const { data, error, loading, refetch } = useOfferingLedger({ includeSupply: true })
  const [descending, setDescending] = useState(true)
  const graves = useMemo(() => [...(data?.graves ?? [])].sort((a, b) =>
    compareRawAmounts(a.amountRaw, b.amountRaw) * (descending ? -1 : 1)
      || a.graveName.localeCompare(b.graveName) || a.graveId.localeCompare(b.graveId),
  ), [data, descending])

  return <ModalOverlay onClose={close}>
    <StoneFrame isMobile={isMobile} maxWidth={720}>
      <div className={styles.body}>
        <CloseButton onClick={close} />
        <h2 className={styles.title}>Crematory</h2>
        <p className={styles.subtitle}>Burn $GRAVE in memory of a project. Open a grave to pay tribute.</p>
        {loading && <p className={styles.empty}>Checking the records...</p>}
        {error && <LoadErrorState message={error} onRetry={refetch} />}
        {data && !error && <>
          <section className={styles.supply} aria-label="Burned supply">
            <h3 className={styles.sectionTitle}>Burned</h3>
            {data.supply ? <>
              <p className={styles.supplyAmount}>
                <strong>{formatGraveAmount(data.supply.burnAddressBalanceRaw)}</strong>
                <span> / {formatGraveAmount(data.supply.totalSupplyRaw)} $GRAVE</span>
              </p>
              <div role="progressbar" aria-label="Share of token supply at the burn address"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.supply.percent} className={styles.progress}>
                <div style={{ width: data.supply.percent + '%' }} />
              </div>
              <p className={styles.supplyPercent}>{data.supply.percent}% of token supply</p>
              <p className={styles.note}>Includes all transfers to the burn address, both inside and outside the cemetery. The contract’s total supply stays unchanged.</p>
            </> : <p className={styles.note}>Supply data is temporarily unavailable.</p>}
          </section>
          <h3 className={styles.sectionTitle} id="grave-offerings-title">Offerings</h3>
          <div className={styles.tableFrame}>
            <table className={styles.table} aria-labelledby="grave-offerings-title">
              <colgroup><col style={{ width: 32 }} /><col /><col style={{ width: isMobile ? 116 : 180 }} /></colgroup>
              <thead><tr>
                <th scope="col" className={styles.rank}>#</th>
                <th scope="col">Grave</th>
                <th scope="col" className={styles.numeric} aria-sort={descending ? 'descending' : 'ascending'}>
                  <button type="button" onClick={() => setDescending(value => !value)}>$GRAVE {descending ? '▾' : '▴'}</button>
                </th>
              </tr></thead>
              <tbody>{graves.map((grave, index) => <tr key={grave.graveId}>
                <td className={styles.rank}>{index + 1}</td>
                <td>
                  <Link className={styles.project} title={grave.graveName} onClick={close} href={'/grave/' + grave.graveId}>{grave.graveName}</Link>
                  <span className={styles.reaper}>{grave.author ? '@' + grave.author : 'anonymous'}</span>
                </td>
                <td className={styles.amount}>{formatGraveAmount(grave.amountRaw)}</td>
              </tr>)}</tbody>
            </table>
            {!graves.length && <p className={styles.empty}>No verified burns yet.</p>}
          </div>
          <OrnamentDivider />
          <p className={styles.footer}>Tokens are burned permanently. No rewards or extra grave slots.</p>
        </>}
      </div>
    </StoneFrame>
  </ModalOverlay>
}
