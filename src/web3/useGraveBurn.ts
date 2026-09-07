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
  MAX_GRAVE_UINT256_RAW,
  MIN_GRAVE_BURN_RAW,
  maxGraveAmount,
} from './config'

class BurnApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

interface KnownPendingTransfer {
  kind: 'known_hash'
  intentId: string
  hash: Hex
  expiresAt: string
}

interface UnknownPendingTransfer {
  kind: 'unknown_hash'
  intentId: string
  graveId: string
  walletAddress: string
  amountRaw: string
  expiresAt: string
}

type PendingTransfer = KnownPendingTransfer | UnknownPendingTransfer

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TX_HASH_RE = /^0x[0-9a-f]{64}$/i

function pendingTransferStorageKey(graveId: string, walletAddress: string): string {
  return `vibecemetery:grave-burn-pending:${graveId}:${walletAddress.toLowerCase()}`
}

function parseStoredPendingTransfer(value: string | null): PendingTransfer | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const invalidCommon = (
      typeof parsed.intentId !== 'string'
      || !UUID_RE.test(parsed.intentId)
      || typeof parsed.expiresAt !== 'string'
      || !Number.isFinite(new Date(parsed.expiresAt).getTime())
    )
    if (invalidCommon) {
      return null
    }
    const intentId = parsed.intentId as string
    const expiresAt = parsed.expiresAt as string
    if (
      (parsed.kind === 'known_hash' || parsed.kind === undefined)
      && typeof parsed.hash === 'string'
      && TX_HASH_RE.test(parsed.hash)
    ) {
      return {
        kind: 'known_hash',
        intentId,
        hash: parsed.hash as Hex,
        expiresAt,
      }
    }
    if (
      parsed.kind === 'unknown_hash'
      && typeof parsed.graveId === 'string'
      && UUID_RE.test(parsed.graveId)
      && typeof parsed.walletAddress === 'string'
      && /^0x[0-9a-f]{40}$/i.test(parsed.walletAddress)
      && typeof parsed.amountRaw === 'string'
      && /^(?:0|[1-9][0-9]*)$/.test(parsed.amountRaw)
    ) {
      return {
        kind: 'unknown_hash',
        intentId,
        graveId: parsed.graveId,
        walletAddress: parsed.walletAddress,
        amountRaw: parsed.amountRaw,
        expiresAt,
      }
    }
    return null
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

function saveStoredPendingTransfer(key: string, transfer: PendingTransfer): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(transfer))
    return true
  } catch {
    return false
  }
}

function findStoredUnknownTransfer(graveId: string): {
  key: string
  transfer: UnknownPendingTransfer
} | null {
  try {
    const prefix = `vibecemetery:grave-burn-pending:${graveId}:`
    const matches: Array<{ key: string; transfer: UnknownPendingTransfer }> = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith(prefix)) continue
      const transfer = readStoredPendingTransfer(key)
      if (transfer?.kind === 'unknown_hash' && transfer.graveId === graveId) {
        matches.push({ key, transfer })
      }
    }
    return matches.length === 1 ? matches[0] : null
  } catch {
    return null
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
  | 'recovering'
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

function isUserRejectedRequest(error: unknown): boolean {
  const visited = new Set<unknown>()
  let current: unknown = error
  for (let depth = 0; depth < 8 && current && !visited.has(current); depth += 1) {
    visited.add(current)
    if (typeof current !== 'object') return false
    const candidate = current as { code?: unknown; name?: unknown; cause?: unknown }
    if (candidate.code === 4001) return true
    current = candidate.cause
  }
  return false
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
  const [amount, setAmount] = useState<string>(GRAVE_BURN_PRESETS[0])
  const [state, setState] = useState<GraveBurnUiState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<GraveBurnStats>(EMPTY_STATS)
  const [statsLoading, setStatsLoading] = useState(true)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null)
  const [restoredStorageKey, setRestoredStorageKey] = useState<string | null>(null)
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
  // A restored ambiguous attempt takes priority even if another wallet is
  // currently connected. Recovery belongs to the original intent and must
  // not be paused or discarded by an account switch.
  const effectivePendingStorageKey = restoredStorageKey ?? pendingStorageKey

  const amountRaw = useMemo(() => {
    if (
      amount.length > 79
      || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(amount)
      || amount.split('.')[0].length > 60
    ) return null
    try {
      const parsed = parseUnits(amount, GRAVE_TOKEN_DECIMALS)
      return parsed >= MIN_GRAVE_BURN_RAW && parsed <= MAX_GRAVE_UINT256_RAW ? parsed : null
    } catch {
      return null
    }
  }, [amount])

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
    setRestoredStorageKey(null)
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
    setPendingTransfer(null)
    if (effectivePendingStorageKey) removeStoredPendingTransfer(effectivePendingStorageKey)
    setRestoredStorageKey(null)
  }, [effectivePendingStorageKey, refreshStats, slotId])

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

  const recoverUnknownHash = useCallback(async (
    transfer: UnknownPendingTransfer,
    signal: AbortSignal,
  ) => {
    setState('recovering')
    setError('Checking Base for a previous transfer — do not send another offering.')
    let retryDelayMs = 10_000

    while (!signal.aborted) {
      let result: Record<string, unknown>
      try {
        result = await readApiJson(await fetch(
          `/api/graves/${graveId}/burn-intents/${transfer.intentId}/recover`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            signal,
          },
        ))
      } catch (cause) {
        if (isAbortError(cause)) throw cause
        setState('recovering')
        setError('Base recovery is temporarily unavailable — do not retry the burn.')
        await waitForPoll(signal, retryDelayMs)
        retryDelayMs = Math.min(retryDelayMs * 2, 60_000)
        continue
      }

      if (result.status === 'safe_no_match') {
        if (effectivePendingStorageKey) removeStoredPendingTransfer(effectivePendingStorageKey)
        setPendingTransfer(null)
        setRestoredStorageKey(null)
        setTxHash(null)
        setExplorerUrl(null)
        setState('idle')
        setError('No transfer was found. You can start a new burn.')
        return
      }
      if (result.status === 'operator_required') {
        setState('failed')
        setError('A possible transfer needs manual review. Do not retry the burn.')
        return
      }
      if (
        (result.status === 'pending' || result.status === 'verified')
        && typeof result.txHash === 'string'
        && TX_HASH_RE.test(result.txHash)
      ) {
        const hash = result.txHash as Hex
        const known: KnownPendingTransfer = {
          kind: 'known_hash',
          intentId: transfer.intentId,
          hash,
          expiresAt: transfer.expiresAt,
        }
        if (effectivePendingStorageKey) saveStoredPendingTransfer(effectivePendingStorageKey, known)
        setPendingTransfer(known)
        setTxHash(hash)
        setExplorerUrl(`${BASE_EXPLORER_TX_URL}${hash}`)
        if (result.status === 'verified') {
          await completeVerified(hash, signal)
          return
        }
        await pollPending(transfer.intentId, hash, transfer.expiresAt, true, signal)
        return
      }

      setState('recovering')
      setError('Checking Base for a previous transfer — do not send another offering.')
      await waitForPoll(signal, retryDelayMs)
      retryDelayMs = Math.min(retryDelayMs * 2, 60_000)
    }
  }, [completeVerified, effectivePendingStorageKey, graveId, pollPending])

  useEffect(() => {
    if (restoredStorageKey) return
    // Prefer an attempt stored for the currently connected wallet. If there
    // is none, still recover the sole ambiguous attempt for this grave: a
    // wallet extension may reconnect to a different account after reload.
    if (pendingStorageKey && readStoredPendingTransfer(pendingStorageKey)) return
    const restored = findStoredUnknownTransfer(graveId)
    if (restored) setRestoredStorageKey(restored.key)
  }, [graveId, pendingStorageKey, restoredStorageKey])

  useEffect(() => {
    if (!effectivePendingStorageKey) return
    const stored = readStoredPendingTransfer(effectivePendingStorageKey)
    if (!stored) return

    if (stored.kind === 'unknown_hash' && stored.graveId !== graveId) {
      removeStoredPendingTransfer(effectivePendingStorageKey)
      return
    }

    setRestoredStorageKey(effectivePendingStorageKey)
    setPendingTransfer(stored)
    if (stored.kind === 'known_hash') {
      setTxHash(stored.hash)
      setExplorerUrl(`${BASE_EXPLORER_TX_URL}${stored.hash}`)
      setState('failed')
      setError('A previous transfer still needs verification — do not send another offering.')
      return
    }

    const controller = new AbortController()
    activeBurnAbortRef.current?.abort()
    activeBurnAbortRef.current = controller
    void recoverUnknownHash(stored, controller.signal).catch((cause) => {
      if (isAbortError(cause)) return
      setState('failed')
      setError('Base recovery is temporarily unavailable — do not retry the burn.')
    }).finally(() => {
      if (activeBurnAbortRef.current === controller) activeBurnAbortRef.current = null
    })
    return () => controller.abort()
  }, [effectivePendingStorageKey, graveId, recoverUnknownHash])

  const burn = useCallback(async () => {
    if (
      connection.status !== 'connected'
      || !connection.address
      || connection.chainId !== GRAVE_CHAIN_ID
      || amountRaw === null
      || typeof balance.data !== 'bigint'
      || pendingTransfer !== null
    ) {
      return
    }
    if (balance.data < amountRaw) {
      setError('Not enough GRAVE')
      return
    }

    setError(null)
    setTxHash(null)
    activeBurnAbortRef.current?.abort()
    const controller = new AbortController()
    activeBurnAbortRef.current = controller
    const { signal } = controller
    let transferMayHaveBeenSubmitted = false
    let ambiguousTransfer: UnknownPendingTransfer | null = null
    try {
      setState('creating_intent')
      const created = await readApiJson(await fetch(`/api/graves/${graveId}/burn-intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: connection.address,
          amount,
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
      const recoveryCandidate: UnknownPendingTransfer = {
        kind: 'unknown_hash',
        intentId,
        graveId,
        walletAddress: connection.address,
        amountRaw: amountRaw.toString(),
        expiresAt,
      }
      if (!pendingStorageKey || !saveStoredPendingTransfer(pendingStorageKey, recoveryCandidate)) {
        throw new Error('Safe transaction recovery storage is unavailable')
      }
      // Mark the attempt as ambiguous only after its durable recovery record
      // exists. If storage failed, the wallet request has not started.
      ambiguousTransfer = recoveryCandidate
      setRestoredStorageKey(pendingStorageKey)
      setPendingTransfer(ambiguousTransfer)
      transferMayHaveBeenSubmitted = true
      const hash = await writeContractAsync({
        account: connection.address,
        address: GRAVE_TOKEN_ADDRESS,
        abi: graveTokenAbi,
        functionName: 'transfer',
        args: [GRAVE_BURN_ADDRESS, amountRaw],
        chainId: GRAVE_CHAIN_ID,
      })
      setTxHash(hash)
      setExplorerUrl(`${BASE_EXPLORER_TX_URL}${hash}`)
      const submittedTransfer: KnownPendingTransfer = {
        kind: 'known_hash',
        intentId,
        hash,
        expiresAt,
      }
      // localStorage.setItem replaces the unknown-hash marker in one
      // synchronous operation, so there is no unprotected transition window.
      saveStoredPendingTransfer(pendingStorageKey, submittedTransfer)
      setPendingTransfer(submittedTransfer)
      ambiguousTransfer = null
      setState('verifying')
      await pollPending(intentId, hash, expiresAt, false, signal)
    } catch (cause) {
      if (isAbortError(cause)) return
      if (ambiguousTransfer && isUserRejectedRequest(cause)) {
        if (pendingStorageKey) removeStoredPendingTransfer(pendingStorageKey)
        setPendingTransfer(null)
        setRestoredStorageKey(null)
        transferMayHaveBeenSubmitted = false
      } else if (ambiguousTransfer) {
        setState('recovering')
        setError('The wallet response was lost. Checking Base — do not retry the burn.')
        try {
          await recoverUnknownHash(ambiguousTransfer, signal)
        } catch (recoveryError) {
          if (!isAbortError(recoveryError)) {
            setState('failed')
            setError('Base recovery is temporarily unavailable — do not retry the burn.')
          }
        }
        return
      }
      setState('failed')
      setError(publicError(cause, transferMayHaveBeenSubmitted))
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
    recoverUnknownHash,
    amount,
    signTypedDataAsync,
    writeContractAsync,
  ])

  const retryVerification = useCallback(async () => {
    if (!pendingTransfer || pendingTransfer.kind !== 'known_hash') return

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

  const busy = ['creating_intent', 'signing', 'transferring', 'recovering', 'verifying', 'pending']
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
    amount,
    setAmount,
    amountRaw,
    maxAmount: maxGraveAmount(balance.data),
    balanceRaw: typeof balance.data === 'bigint' ? balance.data : null,
    balanceDisplay:
      typeof balance.data === 'bigint'
        ? formatUnits(balance.data, GRAVE_TOKEN_DECIMALS)
        : null,
    insufficientBalance,
    hasPendingTransfer: pendingTransfer !== null,
    hasKnownPendingTransfer: pendingTransfer?.kind === 'known_hash',
    burn,
    retryVerification,
  }
}
