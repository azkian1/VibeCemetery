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
  BASE_EXPLORER_TX_URL,
  GRAVE_BURN_ADDRESS,
  GRAVE_BURN_PRESETS,
  GRAVE_BURN_VERIFICATION_GRACE_MS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
  GRAVE_TOKEN_DECIMALS,
  maxWholeGraveAmount,
} from './config'

class BurnApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

interface PendingTransfer {
  intentId: string
  hash: Hex
  expiresAt: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TX_HASH_RE = /^0x[0-9a-f]{64}$/i

function pendingTransferStorageKey(graveId: string, walletAddress: string): string {
  return `vibecemetery:grave-burn-pending:${graveId}:${walletAddress.toLowerCase()}`
}

function parseStoredPendingTransfer(value: string | null): PendingTransfer | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<PendingTransfer>
    if (
      typeof parsed.intentId !== 'string'
      || !UUID_RE.test(parsed.intentId)
      || typeof parsed.hash !== 'string'
      || !TX_HASH_RE.test(parsed.hash)
      || typeof parsed.expiresAt !== 'string'
      || !Number.isFinite(new Date(parsed.expiresAt).getTime())
    ) {
      return null
    }
    return parsed as PendingTransfer
  } catch {
    return null
  }
}

function readStoredPendingTransfer(key: string): PendingTransfer | null {
  try {
    return parseStoredPendingTransfer(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

function saveStoredPendingTransfer(key: string, transfer: PendingTransfer): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(transfer))
  } catch {
    // Storage is a client recovery aid. Verification must continue without it.
  }
}

function removeStoredPendingTransfer(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // A storage failure must not change the verified server result.
  }
}

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

function publicError(error: unknown, transferSubmitted = false): string {
  if (transferSubmitted) {
    return 'Transfer submitted. Verification is unfinished — do not send another offering.'
  }
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
    throw new BurnApiError(
      typeof data.error === 'string' ? data.error : 'Ritual request failed',
      response.status,
    )
  }
  return data
}

function isRetryableSubmissionError(error: unknown): boolean {
  return !(error instanceof BurnApiError) || error.status === 429 || error.status >= 500
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
  const [amountWhole, setAmountWhole] = useState<string>(GRAVE_BURN_PRESETS[0])
  const [customAmount, setCustomAmount] = useState('')
  const [usingCustom, setUsingCustom] = useState(false)
  const [state, setState] = useState<GraveBurnUiState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<GraveBurnStats>(EMPTY_STATS)
  const [statsLoading, setStatsLoading] = useState(true)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null)
  const highlightedTxRef = useRef<string | null>(null)
  const activeBurnAbortRef = useRef<AbortController | null>(null)
  const connectionRef = useRef({
    address: connection.address,
    chainId: connection.chainId,
  })
  const pendingStorageKey = useMemo(
    () => connection.address
      ? pendingTransferStorageKey(graveId, connection.address)
      : null,
    [connection.address, graveId],
  )

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
    setPendingTransfer(null)
    highlightedTxRef.current = null
    void refreshStats(statsController.signal)

    return () => {
      statsController.abort()
      activeBurnAbortRef.current?.abort()
      activeBurnAbortRef.current = null
    }
  }, [graveId, refreshStats])

  useEffect(() => {
    if (!pendingStorageKey) return
    const stored = readStoredPendingTransfer(pendingStorageKey)
    if (!stored) return

    setPendingTransfer(stored)
    setTxHash(stored.hash)
    setExplorerUrl(`${BASE_EXPLORER_TX_URL}${stored.hash}`)
    setState('failed')
    setError('A previous transfer still needs verification — do not send another offering.')
  }, [pendingStorageKey])

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
    setPendingTransfer(null)
    if (pendingStorageKey) removeStoredPendingTransfer(pendingStorageKey)
  }, [pendingStorageKey, refreshStats, slotId])

  const pollPending = useCallback(async (
    intentId: string,
    hash: Hex,
    expiresAt: string,
    initiallyBound: boolean,
    signal: AbortSignal,
  ) => {
    let bound = initiallyBound
    let firstAttempt = true
    setState(bound ? 'pending' : 'verifying')
    const recoveryDeadline = new Date(expiresAt).getTime() + GRAVE_BURN_VERIFICATION_GRACE_MS
    while (Date.now() < recoveryDeadline) {
      if (!firstAttempt) await waitForPoll(signal, 3_000)
      firstAttempt = false

      let result: Record<string, unknown>
      try {
        result = await submitToServer(intentId, hash, signal)
      } catch (cause) {
        if (isAbortError(cause) || !isRetryableSubmissionError(cause)) throw cause
        setState(bound ? 'pending' : 'verifying')
        continue
      }
      if (signal.aborted) throw abortError()
      if (result.status === 'verified') {
        await completeVerified(hash, signal)
        return
      }
      if (result.status === 'failed' || result.status === 'orphaned') {
        throw new Error('Transaction rejected / failed')
      }
      bound = bound || result.bound === true
      setState(bound ? 'pending' : 'verifying')
    }
    throw new Error('Verification is still pending. The server will continue checking it.')
  }, [completeVerified, submitToServer])

  const burn = useCallback(async () => {
    if (
      connection.status !== 'connected'
      || !connection.address
      || connection.chainId !== GRAVE_CHAIN_ID
      || amountRaw === null
      || pendingTransfer !== null
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
    let transferSubmitted = false
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
      transferSubmitted = true
      setTxHash(hash)
      setExplorerUrl(`${BASE_EXPLORER_TX_URL}${hash}`)
      const submittedTransfer = { intentId, hash, expiresAt }
      setPendingTransfer(submittedTransfer)
      if (pendingStorageKey) {
        saveStoredPendingTransfer(pendingStorageKey, submittedTransfer)
      }
      setState('verifying')
      await pollPending(intentId, hash, expiresAt, false, signal)
    } catch (cause) {
      if (isAbortError(cause)) return
      setState('failed')
      setError(publicError(cause, transferSubmitted))
    } finally {
      if (activeBurnAbortRef.current === controller) {
        activeBurnAbortRef.current = null
      }
    }
  }, [
    amountRaw,
    balance.data,
    connection.address,
    connection.chainId,
    connection.status,
    graveId,
    pendingTransfer,
    pendingStorageKey,
    pollPending,
    selectedAmount,
    signTypedDataAsync,
    writeContractAsync,
  ])

  const retryVerification = useCallback(async () => {
    if (!pendingTransfer) return

    setError(null)
    activeBurnAbortRef.current?.abort()
    const controller = new AbortController()
    activeBurnAbortRef.current = controller
    try {
      await pollPending(
        pendingTransfer.intentId,
        pendingTransfer.hash,
        pendingTransfer.expiresAt,
        false,
        controller.signal,
      )
    } catch (cause) {
      if (isAbortError(cause)) return
      setState('failed')
      setError(publicError(cause, true))
    } finally {
      if (activeBurnAbortRef.current === controller) {
        activeBurnAbortRef.current = null
      }
    }
  }, [pendingTransfer, pollPending])

  const clearPendingRecovery = useCallback(() => {
    if (pendingStorageKey) removeStoredPendingTransfer(pendingStorageKey)
    setPendingTransfer(null)
    setTxHash(null)
    setExplorerUrl(null)
    setError(null)
    setState('idle')
  }, [pendingStorageKey])

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
    maxAmountWhole: maxWholeGraveAmount(balance.data),
    balanceDisplay:
      typeof balance.data === 'bigint'
        ? formatUnits(balance.data, GRAVE_TOKEN_DECIMALS)
        : null,
    insufficientBalance,
    hasPendingTransfer: pendingTransfer !== null,
    burn,
    retryVerification,
    clearPendingRecovery,
  }
}
