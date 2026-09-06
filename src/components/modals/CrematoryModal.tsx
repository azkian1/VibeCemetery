'use client'
import Link from 'next/link'
import { useModal } from '@/context/GameContext'
import { useOfferingLedger } from '@/hooks/useOfferingLedger'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatGraveAmount } from '@/lib/web3/offeringLedger'
import { shortenWalletAddress } from '@/lib/web3/graveBurnStats'
import { BASE_EXPLORER_TX_URL } from '@/web3/config'
import ModalOverlay from './ModalOverlay'
import StoneFrame from '@/components/ui/StoneFrame'
import CloseButton from '@/components/ui/CloseButton'
import InsetBlock from '@/components/ui/InsetBlock'
import LoadErrorState from '@/components/ui/LoadErrorState'
export default function CrematoryModal() {
  const { close } = useModal()
  const { data, error, loading, refetch } = useOfferingLedger({ includeSupply: true })
  return <ModalOverlay onClose={close}><StoneFrame isMobile={useIsMobile()} maxWidth={720}>
    <CloseButton onClick={close} />
    <div style={{ padding: '28px 24px', color: '#aaa9a0', fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}>
      <h2 style={{ color: '#e8d5a3', textAlign: 'center', fontFamily: 'var(--font-cinzel), Georgia, serif', margin: '0 0 12px' }}>Crematory</h2>
      <p style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.6 }}>Offer GRAVE in memory of a project. Open a grave to make an offering. Tokens are sent permanently to the burn address; offerings grant no rewards or extra grave slots.</p>
      {loading && <p>Loading offerings...</p>}
      {error && <LoadErrorState message={error} onRetry={refetch} />}
      {data && !error && <>
        <InsetBlock label="Cemetery offerings"><strong style={{ color: '#e8d5a3', fontSize: 24, overflowWrap: 'anywhere' }}>{formatGraveAmount(data.totalBurnedRaw)} GRAVE</strong><p>{data.burnCount} verified transaction{data.burnCount === 1 ? '' : 's'}</p></InsetBlock>
        <InsetBlock label="GRAVE at the burn address">
          {data.supply ? <>
            <p>{formatGraveAmount(data.supply.burnAddressBalanceRaw)} / {formatGraveAmount(data.supply.totalSupplyRaw)} GRAVE</p>
            <div role="progressbar" aria-label="Share of token supply at the burn address" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.supply.percent} style={{ height: 12, background: '#1a1714', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: data.supply.percent + '%', background: 'linear-gradient(90deg, #8d3923, #d2a454)' }} /></div>
            <p>{data.supply.percent}% of current token supply</p>
            <p style={{ fontSize: 11, color: '#8a8980' }}>Includes all transfers to this burn address, including those outside the cemetery. These transfers do not reduce the contract’s totalSupply.</p>
          </> : <p>Supply data is temporarily unavailable.</p>}
        </InsetBlock>
        <h3 style={{ color: '#d9c79e', fontSize: 15 }}>Recent offerings</h3>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {data.recent.length ? data.recent.map(burn => <div key={burn.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, padding: '12px 0', borderBottom: '1px solid #302b24', fontSize: 13 }}>
            <div><Link onClick={close} href={'/grave/' + burn.graveId} style={{ color: '#e8d5a3' }}>{burn.graveName}</Link><div style={{ color: '#8a8980', fontSize: 11, marginTop: 5 }}>{burn.githubUsername ? '@' + burn.githubUsername : shortenWalletAddress(burn.walletAddress)}</div></div>
            <a href={BASE_EXPLORER_TX_URL + burn.txHash} target="_blank" rel="noopener noreferrer" style={{ color: '#c7a46a', overflowWrap: 'anywhere' }}>{formatGraveAmount(burn.amountRaw)} GRAVE ↗</a>
          </div>) : <p>No verified offerings yet.</p>}
        </div>
        {data.recent.length === 50 && <p style={{ fontSize: 11 }}>Showing the latest 50. Totals include all verified offerings.</p>}
      </>}
    </div>
  </StoneFrame></ModalOverlay>
}
