'use client'

import { useConnection } from 'wagmi'
import StoneButton from '@/components/ui/StoneButton'
import WalletButton from '@/components/web3/WalletButton'
import { useCemeteryMapVersion } from '@/context/GameContext'
import { GRAVE_BURN_PRESETS, GRAVE_CHAIN_ID, WEB3_GRAVE_BURNS_VISIBLE } from '@/web3/config'
import { useGraveBurn } from '@/web3/useGraveBurn'

const STATE_COPY = {
  idle: 'Choose an offering amount',
  creating_intent: 'Preparing the grave intent',
  signing: 'Sign the grave intent',
  transferring: 'Confirm the transfer in your wallet',
  verifying: 'Transaction submitted — verifying on Base',
  pending: 'Confirmed — indexing pending',
  verified: 'Ritual accepted',
  failed: 'Transaction rejected / failed',
} as const

export default function GraveBurnPanel({
  graveId,
  slotId,
}: {
  graveId: string
  slotId: number
}) {
  const mapVersion = useCemeteryMapVersion()

  if (!WEB3_GRAVE_BURNS_VISIBLE || mapVersion !== 'v1') return null

  return <EnabledGraveBurnPanel graveId={graveId} slotId={slotId} />
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

  const ready =
    connection.status === 'connected'
    && connection.chainId === GRAVE_CHAIN_ID
    && burn.amountRaw !== null
    && !burn.insufficientBalance
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
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <span style={{ color: '#c8a050', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Grave Offering
        </span>
        <p style={{ margin: '5px 0 0', color: '#77736a', fontSize: 11, lineHeight: 1.4 }}>
          Sends fixed GRAVE tokens to the burn address. Your wallet and optional GitHub
          display name will appear publicly after independent Base verification.
        </p>
      </div>

      <WalletButton disabled={burn.busy} />

      {connection.status === 'connected' && connection.chainId === GRAVE_CHAIN_ID && (
        <>
          <fieldset
            disabled={burn.busy}
            style={{ border: 0, padding: 0, margin: '12px 0 0' }}
          >
            <legend style={{ fontSize: 11, color: '#77736a', marginBottom: 6 }}>
              Choose an offering amount
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {GRAVE_BURN_PRESETS.map((amount) => (
                <StoneButton
                  key={amount}
                  type="button"
                  active={!burn.usingCustom && burn.amountWhole === amount}
                  aria-label={`Offer ${Number(amount).toLocaleString('en-US')} GRAVE`}
                  onClick={() => {
                    burn.setUsingCustom(false)
                    burn.setAmountWhole(amount)
                  }}
                >
                  {Number(amount).toLocaleString('en-US')}
                </StoneButton>
              ))}
            </div>
            <label
              htmlFor={`grave-burn-custom-${graveId}`}
              style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#77736a' }}
            >
              Custom GRAVE amount
            </label>
            <input
              id={`grave-burn-custom-${graveId}`}
              aria-label="Custom GRAVE amount"
              inputMode="numeric"
              pattern="[1-9][0-9]*"
              value={burn.customAmount}
              onFocus={() => burn.setUsingCustom(true)}
              onChange={(event) => {
                burn.setUsingCustom(true)
                burn.setCustomAmount(event.target.value)
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 4,
                padding: '8px 10px',
                color: '#d8c891',
                background: '#171513',
                border: `1px solid ${burn.usingCustom && burn.amountRaw === null ? '#7f493e' : '#3b342b'}`,
                borderRadius: 4,
                fontFamily: 'monospace',
              }}
            />
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
            aria-label="Burn offering"
            disabled={!ready}
            onClick={() => void burn.burn()}
            style={{ width: '100%' }}
          >
            {burn.busy ? STATE_COPY[burn.state] : 'Burn Offering'}
          </StoneButton>
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

      <div style={{ marginTop: 13, borderTop: '1px solid #2d2822', paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#77736a', fontSize: 11 }}>
          <span>Verified offerings</span>
          <strong style={{ color: '#c8a050' }}>
            {burn.statsLoading ? '…' : `${burn.stats.totalBurnedDisplay} GRAVE`}
          </strong>
        </div>
        {burn.stats.topMourners.length > 0 && (
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, color: '#77736a', fontSize: 11 }}>
            {burn.stats.topMourners.map((mourner) => (
              <li key={mourner.walletAddress} style={{ marginTop: 3 }}>
                <span style={{ color: '#aaa296' }}>{mourner.displayName}</span>
                {' — '}
                {mourner.amountDisplay} GRAVE
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
