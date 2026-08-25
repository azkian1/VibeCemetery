'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createConfig, custom, http, WagmiProvider } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { WEB3_GRAVE_BURNS_VISIBLE } from './config'

type InjectedProvider = {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>
}

function getInjectedProvider(): InjectedProvider {
  const provider = (window as Window & { ethereum?: InjectedProvider }).ethereum
  if (!provider) throw new Error('No injected EVM wallet is available')
  return provider
}

const walletReadProvider: InjectedProvider = {
  request: (args) => getInjectedProvider().request(args),
}

const browserReadRpc = process.env.NEXT_PUBLIC_BASE_READ_RPC_URL?.trim()

export const graveWagmiConfig = createConfig({
  chains: [base],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [base.id]: browserReadRpc ? http(browserReadRpc) : custom(walletReadProvider),
  },
  ssr: true,
})

const graveQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
})

export default function Web3Provider({ children }: { children: ReactNode }) {
  if (!WEB3_GRAVE_BURNS_VISIBLE) return children

  return (
    <WagmiProvider config={graveWagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={graveQueryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
