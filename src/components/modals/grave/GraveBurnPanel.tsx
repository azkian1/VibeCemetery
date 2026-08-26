'use client'

import { useEffect, useState } from 'react'
import { useConnection } from 'wagmi'
import StoneButton from '@/components/ui/StoneButton'
import WalletButton from '@/components/web3/WalletButton'
import { useCemeteryMapVersion } from '@/context/GameContext'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_BURN_PRESET_RAW,
  GRAVE_BURN_PRESETS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
  WEB3_GRAVE_BURNS_VISIBLE,
} from '@/web3/config'
import { useGraveBurn } from '@/web3/useGraveBurn'

const STATE_COPY = {
  idle: 'Choose an offering amount',
  creating_intent: 'Preparing the grave intent',
  signing: 'Sign the grave intent',
  transferring: 'Confirm the transfer in your wallet',
  recovering: 'Checking Base for a previous transfer',
  verifying: 'Transaction submitted — verifying on Base',
  pending: 'Confirmed — indexing pending',
  verified: 'Ritual accepted',
  failed: 'Transaction rejected / failed',
} as const

function wholeGraveDisplay(value: string): string {
  return value.split('.', 1)[0] || '0'
}

export default function GraveBurnPanel({
  graveId,
  slotId,
}: {
  graveId: string
  slotId: number
}) {
  const mapVersion = useCemeteryMapVersion()

  if (!WEB3_GRAVE_BURNS_VISIBLE || mapVersion !== 'v1') return null

  return <EnabledGraveBurnPanel key={graveId} graveId={graveId} slotId={slotId} />
}

function EnabledGraveBurnPanel({
  graveId,
  slotId,
}: {
  graveId: string
  slotId: number
}) {
  const connection = useConnection()
  const burn = useGraveBurn({ graveId, slotId })
  const { amount: burnAmount, maxAmount, setAmount: setBurnAmount } = burn
  const [expanded, setExpanded] = useState(false)
  const [usingMax, setUsingMax] = useState(false)
  const controlsId = `grave-burn-controls-${graveId}`
  const controlsExpanded = expanded || burn.hasPendingTransfer

  const maxSelected =
    usingMax
    && maxAmount !== null
    && burnAmount === maxAmount

  useEffect(() => {
    if (usingMax && maxAmount !== null && burnAmount !== maxAmount) {
      setBurnAmount(maxAmount)
    }
  }, [burnAmount, maxAmount, setBurnAmount, usingMax])

  const ready =
    connection.status === 'connected'
    && connection.chainId === GRAVE_CHAIN_ID
    && burn.amountRaw !== null
    && burn.balanceRaw !== null
    && !burn.insufficientBalance
    && (!usingMax || maxSelected)
    && !burn.hasPendingTransfer
    && !burn.busy

  return (
    <section
      aria-label="GRAVE burn offering"
      style={{
        margin: '16px 0 0',
        padding: '14px',
        border: '1px solid #332b22',
        borderRadius: 5,
        background: 'linear-gradient(180deg, rgba(95,55,35,0.12), rgba(0,0,0,0.18))',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <span style={{ color: '#c8a050', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          BURN $GRAVE
        </span>
        <p aria-live="polite" style={{ margin: '6px 0 10px', color: '#aaa296', fontSize: 13, lineHeight: 1.3 }}>
          <strong style={{ color: '#d7b96e' }}>
            {burn.statsLoading ? '…' : wholeGraveDisplay(burn.stats.totalBurnedDisplay)}
          </strong>
          {' $GRAVE BURNED'}
        </p>
      </div>

      <StoneButton
        type="button"
        aria-expanded={controlsExpanded}
        aria-controls={controlsId}
        aria-label={burn.hasPendingTransfer
          ? 'Burn recovery controls expanded'
          : controlsExpanded
            ? 'Collapse burn controls'
            : 'Expand burn controls'}
        disabled={burn.busy || burn.hasPendingTransfer}
        onClick={() => setExpanded((current) => !current)}
        style={{ width: '100%' }}
      >
        BURN
      </StoneButton>

      {controlsExpanded && (
        <div id={controlsId} style={{ marginTop: 12 }}>
          <p style={{ margin: '0', color: '#77736a', fontSize: 11, lineHeight: 1.4, textAlign: 'center' }}>
            Irreversibly transfers GRAVE to the dead address on Base. This removes the
            tokens from circulation but does not reduce the token&apos;s totalSupply.
          </p>
          <div style={{ marginTop: 7, color: '#625f58', fontSize: 10, lineHeight: 1.45, textAlign: 'center' }}>
            <div style={{ overflowWrap: 'anywhere' }}>Token: GRAVE · {GRAVE_TOKEN_ADDRESS}</div>
            <div style={{ color: '#c1bab0', fontSize: 12, overflowWrap: 'anywhere' }}>
              Destination: {GRAVE_BURN_ADDRESS}
            </div>
          </div>
          <p style={{ margin: '6px 0 10px', color: '#625f58', fontSize: 10, lineHeight: 1.4, textAlign: 'center' }}>
            Your wallet and optional GitHub display name become public after independent verification.
          </p>
          <WalletButton disabled={burn.busy} />

      {connection.status !== 'connected' && burn.hasPendingTransfer && (
        <p role="status" aria-live="polite" style={{
          margin: '9px 0',
          textAlign: 'center',
          color: '#d79b78',
          fontSize: 12,
        }}>
          {burn.error ?? STATE_COPY[burn.state]}
        </p>
      )}

      {connection.status === 'connected' && connection.chainId === GRAVE_CHAIN_ID && (
        <>
          <fieldset
            disabled={burn.busy}
            style={{ border: 0, padding: 0, margin: '12px 0 0' }}
          >
            <legend style={{ width: '100%', fontSize: 11, color: '#77736a', marginBottom: 6, textAlign: 'center' }}>
              Choose an offering amount
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {GRAVE_BURN_PRESETS.map((amount) => (
                <StoneButton
                  key={amount}
                  type="button"
                  active={!maxSelected && burn.amount === amount}
                  aria-pressed={!maxSelected && burn.amount === amount}
                  aria-label={`Offer ${Number(amount).toLocaleString('en-US')} GRAVE`}
                  disabled={
                    burn.busy
                    || burn.balanceRaw === null
                    || burn.balanceRaw < GRAVE_BURN_PRESET_RAW[amount]
                  }
                  onClick={() => {
                    setUsingMax(false)
                    burn.setAmount(amount)
                  }}
                >
                  {amount === '1000' ? '1K' : '10K'}
                </StoneButton>
              ))}
              <StoneButton
                type="button"
                active={maxSelected}
                aria-pressed={maxSelected}
                aria-label={burn.maxAmount
                  ? `Offer maximum ${burn.maxAmount} GRAVE`
                  : 'Maximum GRAVE unavailable'}
                disabled={burn.busy || burn.maxAmount === null}
                onClick={() => {
                  if (burn.maxAmount === null) return
                  setUsingMax(true)
                  burn.setAmount(burn.maxAmount)
                }}
              >
                MAX
              </StoneButton>
            </div>
          </fieldset>

          <p role="status" aria-live="polite" style={{
            margin: '9px 0',
            minHeight: 16,
            textAlign: 'center',
            color: burn.state === 'failed' ? '#b86858' : burn.state === 'verified' ? '#8fa878' : '#8b877d',
            fontSize: 12,
          }}>
            {burn.insufficientBalance ? 'Not enough GRAVE' : burn.error ?? STATE_COPY[burn.state]}
          </p>

          {burn.balanceDisplay && (
            <p style={{ margin: '-5px 0 9px', textAlign: 'center', color: '#56534d', fontSize: 10 }}>
              Wallet balance: {burn.balanceDisplay} GRAVE
            </p>
          )}

          <StoneButton
            type="button"
            aria-label="BURN $GRAVE"
            disabled={!ready}
            onClick={() => void burn.burn()}
            style={{ width: '100%' }}
          >
            {burn.busy ? STATE_COPY[burn.state] : 'BURN $GRAVE'}
          </StoneButton>

          {burn.hasKnownPendingTransfer && burn.state === 'failed' && (
            <>
              <p role="alert" style={{ margin: '9px 0', color: '#d79b78', fontSize: 11, lineHeight: 1.45 }}>
                A wallet transfer was already submitted. Do not send another offering.
                Check BaseScan, then retry verification of the same transaction.
              </p>
              <StoneButton
                type="button"
                aria-label="Retry burn verification"
                disabled={burn.busy}
                onClick={() => void burn.retryVerification()}
                style={{ width: '100%' }}
              >
                Retry Verification
              </StoneButton>
            </>
          )}
        </>
      )}

      {burn.explorerUrl && (
        <a
          href={burn.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', marginTop: 8, textAlign: 'center', color: '#7898b8', fontSize: 11 }}
        >
          View transaction on BaseScan
        </a>
      )}

      {burn.stats.topMourners.length > 0 && (
        <div style={{ marginTop: 13, borderTop: '1px solid #2d2822', paddingTop: 10 }}>
            <div style={{ color: '#77736a', fontSize: 11, textAlign: 'center' }}>Top mourners</div>
            <ol style={{ margin: '8px 0 0', paddingLeft: 20, color: '#77736a', fontSize: 11 }}>
              {burn.stats.topMourners.map((mourner) => (
                <li key={mourner.walletAddress} style={{ marginTop: 3 }}>
                  <span style={{ color: '#aaa296' }}>{mourner.displayName}</span>
                  {' — '}
                  {mourner.amountDisplay} GRAVE
                </li>
              ))}
            </ol>
        </div>
      )}
        </div>
      )}
    </section>
  )
}
