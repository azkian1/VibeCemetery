import { randomUUID } from 'node:crypto'
import type { Address, Hex } from 'viem'
import { graveTokenAbi } from '@/web3/abi'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_BURN_VERIFICATION_GRACE_MS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
} from '@/web3/config'
import type { GraveBurnIntentRecord } from './burnIntent'
import type { BurnServiceDependencies } from './burnService'
import { submitBurnTransaction } from './burnService'
import type { BurnVerificationClient } from './verifyBurnTx'

export const BURN_RECOVERY_LOG_CHUNK_SIZE = 2_000n

const transferEvent = graveTokenAbi[3]

export interface BurnRecoveryLog {
  transactionHash: Hex | null
  args?: {
    value?: bigint
  }
}

export interface BurnRecoveryClient extends Pick<
  BurnVerificationClient,
  'getBlockNumber' | 'getBlock'
> {
  getLogs(args: {
    address: Address
    event: typeof transferEvent
    args: { from: Address; to: Address }
    fromBlock: bigint
    toBlock: bigint
    strict: true
  }): Promise<readonly BurnRecoveryLog[]>
}

export type RecoverUnknownBurnResult =
  | { outcome: 'pending'; retryable: true }
  | { outcome: 'safe_no_match'; retryable: false }
  | { outcome: 'operator_required'; reason: 'multiple_candidates' | 'candidate_rejected' | 'conflict' }
  | { outcome: 'recovered'; status: 'pending' | 'verified'; txHash: Hex; retryable: boolean }
  | { outcome: 'not_found' }
  | { outcome: 'invalid_state' }

export interface RecoverUnknownBurnBatchSummary {
  claimed: number
  recovered: number
  pending: number
  safeNoMatch: number
  operatorRequired: number
  errors: number
}

function deadlineSeconds(intent: GraveBurnIntentRecord): bigint {
  return BigInt(Math.floor(
    (new Date(intent.expiresAt).getTime() + GRAVE_BURN_VERIFICATION_GRACE_MS) / 1_000,
  ))
}

async function firstBlockAtOrAfter({
  client,
  low,
  high,
  timestamp,
}: {
  client: BurnRecoveryClient
  low: bigint
  high: bigint
  timestamp: bigint
}): Promise<bigint> {
  let left = low
  let right = high
  while (left < right) {
    const middle = left + ((right - left) / 2n)
    const block = await client.getBlock({ blockNumber: middle })
    if (block.timestamp >= timestamp) right = middle
    else left = middle + 1n
  }
  return left
}

async function scanExactTransfers({
  client,
  intent,
  fromBlock,
  toBlock,
}: {
  client: BurnRecoveryClient
  intent: GraveBurnIntentRecord
  fromBlock: bigint
  toBlock: bigint
}): Promise<BurnRecoveryLog[]> {
  const exact: BurnRecoveryLog[] = []
  for (let start = fromBlock; start <= toBlock; start += BURN_RECOVERY_LOG_CHUNK_SIZE) {
    const end = start + BURN_RECOVERY_LOG_CHUNK_SIZE - 1n > toBlock
      ? toBlock
      : start + BURN_RECOVERY_LOG_CHUNK_SIZE - 1n
    const logs = await client.getLogs({
      address: GRAVE_TOKEN_ADDRESS,
      event: transferEvent,
      args: {
        from: intent.walletAddress,
        to: GRAVE_BURN_ADDRESS,
      },
      fromBlock: start,
      toBlock: end,
      strict: true,
    })
    for (const log of logs) {
      if (log.transactionHash && log.args?.value === BigInt(intent.amountRaw)) {
        exact.push(log)
      }
    }
  }
  return exact
}

/**
 * Finds a transaction hash only from the fixed, authorized intent. Discovery
 * never counts a burn: every candidate still passes submitBurnTransaction,
 * which performs the full receipt, sender, signature, confirmation and
 * canonical-block verification before the atomic bind.
 */
export async function recoverUnknownBurnTransaction({
  deps,
  client,
  graveId,
  intentId,
}: {
  deps: BurnServiceDependencies
  client: BurnRecoveryClient
  graveId: string
  intentId: string
}): Promise<RecoverUnknownBurnResult> {
  const intent = await deps.store.getIntent(graveId, intentId)
  if (!intent) return { outcome: 'not_found' }

  if (intent.status === 'consumed') {
    const burn = await deps.store.getBurnByIntent(intentId)
    if (!burn) return { outcome: 'invalid_state' }
    if (burn.status !== 'pending' && burn.status !== 'verified') {
      return { outcome: 'operator_required', reason: 'candidate_rejected' }
    }
    return {
      outcome: 'recovered',
      status: burn.status === 'verified' ? 'verified' : 'pending',
      txHash: burn.txHash,
      retryable: burn.status === 'pending',
    }
  }
  if (
    intent.status !== 'authorized'
    || !intent.authorizedBlockNumber
    || !intent.signature
    || intent.chainId !== GRAVE_CHAIN_ID
    || intent.tokenAddress.toLowerCase() !== GRAVE_TOKEN_ADDRESS.toLowerCase()
    || intent.burnAddress.toLowerCase() !== GRAVE_BURN_ADDRESS.toLowerCase()
  ) {
    return { outcome: 'invalid_state' }
  }

  const authorizedBlock = BigInt(intent.authorizedBlockNumber)
  const fromBlock = authorizedBlock + 1n
  const latestBlockNumber = await client.getBlockNumber()
  if (latestBlockNumber < authorizedBlock) throw new Error('Recovery RPC is behind authorization')

  const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber })
  const deadline = deadlineSeconds(intent)
  const scanComplete = latestBlock.timestamp >= deadline
  const toBlock = scanComplete && fromBlock <= latestBlockNumber
    ? await firstBlockAtOrAfter({
      client,
      low: fromBlock,
      high: latestBlockNumber,
      timestamp: deadline,
    })
    : latestBlockNumber

  const boundaryBefore = scanComplete
    ? await client.getBlock({ blockNumber: toBlock })
    : null

  const candidates = fromBlock <= toBlock
    ? await scanExactTransfers({ client, intent, fromBlock, toBlock })
    : []

  // A no-match conclusion must refer to one stable canonical boundary. If a
  // reorg occurs while getLogs is running, fail closed and retry instead of
  // allowing another burn from an incomplete view of the chain.
  if (scanComplete) {
    const boundaryAfter = await client.getBlock({ blockNumber: toBlock })
    if (
      !boundaryBefore?.hash
      || !boundaryAfter.hash
      || boundaryBefore.hash.toLowerCase() !== boundaryAfter.hash.toLowerCase()
    ) {
      throw new Error('Recovery boundary changed during scan')
    }
  }

  if (candidates.length > 1) {
    return { outcome: 'operator_required', reason: 'multiple_candidates' }
  }
  if (candidates.length === 0) {
    return scanComplete
      ? { outcome: 'safe_no_match', retryable: false }
      : { outcome: 'pending', retryable: true }
  }

  const txHash = candidates[0].transactionHash as Hex
  const submission = await submitBurnTransaction({
    deps,
    graveId,
    intentId,
    txHash,
  })
  if (submission.outcome === 'accepted') {
    return {
      outcome: 'recovered',
      status: submission.status === 'verified' ? 'verified' : 'pending',
      txHash,
      retryable: submission.retryable,
    }
  }
  if (submission.outcome === 'conflict') {
    return { outcome: 'operator_required', reason: 'conflict' }
  }
  return { outcome: 'operator_required', reason: 'candidate_rejected' }
}

/**
 * Bounded background safety net for users who close the page after a wallet
 * response is lost. Supabase leases candidates atomically; this worker never
 * marks a burn verified itself and remains idempotent with on-demand recovery.
 */
export async function recoverUnknownBurnBatch({
  deps,
  client,
  limit,
}: {
  deps: BurnServiceDependencies
  client: BurnRecoveryClient
  limit: number
}): Promise<RecoverUnknownBurnBatchSummary> {
  const claimedAt = (deps.now?.() ?? new Date()).toISOString()
  const leaseToken = randomUUID()
  const intents = await deps.store.claimBurnRecoveryCandidates(limit, claimedAt, leaseToken)
  const summary: RecoverUnknownBurnBatchSummary = {
    claimed: intents.length,
    recovered: 0,
    pending: 0,
    safeNoMatch: 0,
    operatorRequired: 0,
    errors: 0,
  }

  for (const intent of intents) {
    try {
      const result = await recoverUnknownBurnTransaction({
        deps,
        client,
        graveId: intent.graveId,
        intentId: intent.id,
      })
      const checkedAt = (deps.now?.() ?? new Date()).toISOString()

      if (result.outcome === 'recovered') {
        summary.recovered += 1
        continue
      }
      if (result.outcome === 'pending') {
        summary.pending += 1
        await deps.store.finishBurnRecoveryClaim({
          intentId: intent.id,
          leaseToken,
          outcome: 'retry',
          failureCode: null,
          checkedAt,
        })
        continue
      }
      if (result.outcome === 'safe_no_match') {
        summary.safeNoMatch += 1
        await deps.store.finishBurnRecoveryClaim({
          intentId: intent.id,
          leaseToken,
          outcome: 'safe_no_match',
          failureCode: 'no_transfer_found',
          checkedAt,
        })
        continue
      }

      summary.operatorRequired += 1
      await deps.store.finishBurnRecoveryClaim({
        intentId: intent.id,
        leaseToken,
        outcome: 'operator_required',
        failureCode: result.outcome === 'operator_required'
          ? result.reason
          : result.outcome,
        checkedAt,
      })
    } catch (error) {
      summary.errors += 1
      console.error(
        '[VibeCemetery] Grave burn hash recovery failed:',
        error instanceof Error ? error.name : 'unknown_error',
      )
      try {
        await deps.store.finishBurnRecoveryClaim({
          intentId: intent.id,
          leaseToken,
          outcome: 'retry',
          failureCode: null,
          checkedAt: (deps.now?.() ?? new Date()).toISOString(),
        })
      } catch {
        // The database lease expires automatically, so a failed release can
        // never make an intent permanently unreachable.
      }
    }
  }

  return summary
}
