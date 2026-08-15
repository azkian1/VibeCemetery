'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useConnection,
  useReadContract,
  useSignTypedData,
  useWriteContract,
} from 'wagmi'
import { formatUnits, parseUnits, type Hex } from 'viem'
import { cemeteryEvents } from '@/game/events'
import type { GraveBurnStats } from '@/lib/web3/graveBurnStats'
import { graveTokenAbi } from './abi'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
  GRAVE_TOKEN_DECIMALS,
} from './config'

export type GraveBurnUiState =
  | 'idle'
  | 'creating_intent'
  | 'signing'
  | 'transferring'
  | 'verifying'
  | 'pending'
  | 'verified'
  | 'failed'

const EMPTY_STATS: GraveBurnStats = {
  totalBurnedRaw: '0',
  totalBurnedDisplay: '0',
  burnCount: 0,
  topMourners: [],
}

function publicError(error: unknown): string {
  if (error instanceof Error && /reject|denied|cancel/i.test(error.message)) {
    return 'Transaction rejected / failed'
  }
  return 'The offering ritual failed. No public total was changed.'
}

function abortError(): Error {
  const error = new Error('Burn flow aborted')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function waitForPoll(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError())

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)
    const handleAbort = () => {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', handleAbort)
      reject(abortError())
    }
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

async function readApiJson(response: Response) {
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok && response.status !== 202) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Ritual request failed')
  }
  return data
}

export function useGraveBurn({
  graveId,
  slotId,
}: {
  graveId: string
  slotId: number
}) {
  const connection = useConnection()
  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync } = useWriteContract()
  const [amountWhole, setAmountWhole] = useState('100')
  const [customAmount, setCustomAmount] = useState('')
  const [usingCustom, setUsingCustom] = useState(false)
  const [state, setState] = useState<GraveBurnUiState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<GraveBurnStats>(EMPTY_STATS)
  const [statsLoading, setStatsLoading] = useState(true)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null)
  const highlightedTxRef = useRef<string | null>(null)
  const activeBurnAbortRef = useRef<AbortController | null>(null)
  const connectionRef = useRef({
    address: connection.address,
    chainId: connection.chainId,
  })

  const selectedAmount = usingCustom ? customAmount : amountWhole
  const amountRaw = useMemo(() => {
    if (!/^[1-9][0-9]*$/.test(selectedAmount) || selectedAmount.length > 60) return null
    try {
      return parseUnits(selectedAmount, GRAVE_TOKEN_DECIMALS)
    } catch {
      return null
    }
  }, [selectedAmount])

  const balance = useReadContract({
    address: GRAVE_TOKEN_ADDRESS,
    abi: graveTokenAbi,
    functionName: 'balanceOf',
    args: connection.address ? [connection.address] : undefined,
    chainId: GRAVE_CHAIN_ID,
    query: {
      enabled:
        connection.status === 'connected'
        && connection.chainId === GRAVE_CHAIN_ID
        && Boolean(connection.address),
    },
  })

  const refreshStats = useCallback(async (signal?: AbortSignal) => {
    setStatsLoading(true)
    try {
      const response = await fetch(`/api/graves/${graveId}/burns`, {
        method: 'GET',
        cache: 'no-store',
        signal,
      })
      if (!response.ok) throw new Error('Stats unavailable')
      setStats(await response.json() as GraveBurnStats)
    } catch (cause) {
      if (isAbortError(cause)) return
      setStats(EMPTY_STATS)
    } finally {
      if (!signal?.aborted) setStatsLoading(false)
    }
  }, [graveId])

  useEffect(() => {
    connectionRef.current = {
      address: connection.address,
      chainId: connection.chainId,
    }
  }, [connection.address, connection.chainId])

  useEffect(() => {
    const statsController = new AbortController()
    activeBurnAbortRef.current?.abort()
    activeBurnAbortRef.current = null
    setState('idle')
    setError(null)
    setTxHash(null)
    setExplorerUrl(null)
    highlightedTxRef.current = null
    void refreshStats(statsController.signal)

    return () => {
      statsController.abort()
      activeBurnAbortRef.current?.abort()
      activeBurnAbortRef.current = null
    }
  }, [graveId, refreshStats])

  const submitToServer = useCallback(async (
    intentId: string,
    hash: Hex,
    signal?: AbortSignal,
  ) => {
    const response = await fetch(`/api/graves/${graveId}/burns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intentId, txHash: hash }),
      signal,
    })
    return readApiJson(response)
  }, [graveId])

  const completeVerified = useCallback(async (hash: Hex, signal: AbortSignal) => {
    if (signal.aborted) throw abortError()
    setState('verified')
    await refreshStats(signal)
    if (signal.aborted) throw abortError()
    if (highlightedTxRef.current !== hash) {
      highlightedTxRef.current = hash
      cemeteryEvents.emit('highlight_slot', { slotId })
    }
  }, [refreshStats, slotId])

  const pollPending = useCallback(async (
    intentId: string,
    hash: Hex,
    expiresAt: string,
    initiallyBound: boolean,
    signal: AbortSignal,
  ) => {
    setState(initiallyBound ? 'pending' : 'verifying')
    while (Date.now() < new Date(expiresAt).getTime()) {
      await waitForPoll(signal, 3_000)
      const result = await submitToServer(intentId, hash, signal)
      if (signal.aborted) throw abortError()
      if (result.status === 'verified') {
        await completeVerified(hash, signal)
        return
      }
      if (result.status === 'failed' || result.status === 'orphaned') {
        throw new Error('Transaction rejected / failed')
      }
      setState(result.bound === true ? 'pending' : 'verifying')
    }
    throw new Error('Verification is still pending. Check the grave again shortly.')
  }, [completeVerified, submitToServer])

  const burn = useCallback(async () => {
    if (
      connection.status !== 'connected'
      || !connection.address
      || connection.chainId !== GRAVE_CHAIN_ID
      || amountRaw === null
    ) {
      return
    }
    if (typeof balance.data === 'bigint' && balance.data < amountRaw) {
      setError('Not enough GRAVE')
      return
    }

    setError(null)
    setTxHash(null)
    activeBurnAbortRef.current?.abort()
    const controller = new AbortController()
    activeBurnAbortRef.current = controller
    const { signal } = controller
    try {
      setState('creating_intent')
      const created = await readApiJson(await fetch(`/api/graves/${graveId}/burn-intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: connection.address,
          amountWhole: selectedAmount,
        }),
        signal,
      }))

      const intentId = String(created.intentId)
      const expiresAt = String(created.expiresAt)
      if (connectionRef.current.chainId !== GRAVE_CHAIN_ID) {
        throw new Error('Switch to Base before signing')
      }
      setState('signing')
      const signature = await signTypedDataAsync(created.typedData as never)

      await readApiJson(await fetch(
        `/api/graves/${graveId}/burn-intents/${intentId}/authorize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature }),
          signal,
        },
      ))

      if (
        connectionRef.current.chainId !== GRAVE_CHAIN_ID
        || connectionRef.current.address?.toLowerCase() !== connection.address.toLowerCase()
      ) {
        throw new Error('Wallet or network changed before transfer')
      }
      setState('transferring')
      const hash = await writeContractAsync({
        address: GRAVE_TOKEN_ADDRESS,
        abi: graveTokenAbi,
        functionName: 'transfer',
        args: [GRAVE_BURN_ADDRESS, amountRaw],
        chainId: GRAVE_CHAIN_ID,
      })
      setTxHash(hash)
      setState('verifying')

      const submitted = await submitToServer(intentId, hash, signal)
      if (typeof submitted.explorerUrl === 'string') setExplorerUrl(submitted.explorerUrl)
      if (submitted.status === 'verified') {
        await completeVerified(hash, signal)
        return
      }
      if (submitted.status === 'pending') {
        await pollPending(intentId, hash, expiresAt, submitted.bound === true, signal)
        return
      }
      throw new Error('Transaction rejected / failed')
    } catch (cause) {
      if (isAbortError(cause)) return
      setState('failed')
      setError(publicError(cause))
    } finally {
      if (activeBurnAbortRef.current === controller) {
        activeBurnAbortRef.current = null
      }
    }
  }, [
    amountRaw,
    balance.data,
    completeVerified,
    connection.address,
    connection.chainId,
    connection.status,
    graveId,
    pollPending,
    selectedAmount,
    signTypedDataAsync,
    submitToServer,
    writeContractAsync,
  ])

  const busy = ['creating_intent', 'signing', 'transferring', 'verifying', 'pending']
    .includes(state)
  const insufficientBalance =
    amountRaw !== null
    && typeof balance.data === 'bigint'
    && balance.data < amountRaw

  return {
    state,
    busy,
    error,
    stats,
    statsLoading,
    txHash,
    explorerUrl,
    amountWhole,
    setAmountWhole,
    customAmount,
    setCustomAmount,
    usingCustom,
    setUsingCustom,
    amountRaw,
    balanceDisplay:
      typeof balance.data === 'bigint'
        ? formatUnits(balance.data, GRAVE_TOKEN_DECIMALS)
        : null,
    insufficientBalance,
    burn,
  }
}
