'use client'

import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from 'wagmi'
import StoneButton from '@/components/ui/StoneButton'
import { GRAVE_CHAIN_ID } from '@/web3/config'
import { shortenWalletAddress } from '@/lib/web3/graveBurnStats'

export default function WalletButton({ disabled = false }: { disabled?: boolean }) {
  const connection = useConnection()
  const connectors = useConnectors()
  const { connectAsync, isPending: isConnecting, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: isSwitching, error: switchError } = useSwitchChain()
  const busy = disabled || isConnecting || isSwitching

  if (connection.status !== 'connected' || !connection.address) {
    return (
      <>
        <StoneButton
          type="button"
          disabled={busy}
          aria-label="Connect wallet"
          onClick={() => {
            const connector = connectors.find((candidate) => candidate.type === 'injected') ?? connectors[0]
            if (connector) void connectAsync({ connector }).catch(() => undefined)
          }}
          style={{ width: '100%' }}
        >
          {isConnecting ? 'Connecting…' : 'Connect Wallet'}
        </StoneButton>
        {connectError && (
          <p role="status" style={{ margin: '5px 0 0', color: '#b86858', fontSize: 11, textAlign: 'center' }}>
            Wallet request rejected
          </p>
        )}
      </>
    )
  }

  if (connection.chainId !== GRAVE_CHAIN_ID) {
    return (
      <>
        <StoneButton
          type="button"
          disabled={busy}
          aria-label="Switch to Base"
          onClick={() => void switchChainAsync({ chainId: GRAVE_CHAIN_ID }).catch(() => undefined)}
          style={{ width: '100%', color: '#d79b78' }}
        >
          {isSwitching ? 'Switching…' : 'Wrong network — Switch to Base'}
        </StoneButton>
        {switchError && (
          <p role="status" style={{ margin: '5px 0 0', color: '#b86858', fontSize: 11, textAlign: 'center' }}>
            Wallet request rejected
          </p>
        )}
      </>
    )
  }

  return (
    <StoneButton
      type="button"
      disabled={disabled}
      aria-label={`Connected wallet ${connection.address}`}
      title="Disconnect wallet"
      onClick={() => disconnect()}
      style={{ width: '100%' }}
    >
      {shortenWalletAddress(connection.address)}
    </StoneButton>
  )
}
