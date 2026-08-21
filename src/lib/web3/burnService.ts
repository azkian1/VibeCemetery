import { randomBytes, randomUUID } from 'node:crypto'
import { getAddress, type Hex } from 'viem'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_BURN_INTENT_TTL_MS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
} from '@/web3/config'
import {
  buildGraveBurnTypedData,
  type GraveBurnIntentRecord,
} from './burnIntent'
import type { GraveBurnStore } from './burnStore'
import {
  checkStoredBurnCanonicality,
  verifyBurnTx,
  type BurnVerificationClient,
} from './verifyBurnTx'

export interface BurnServiceDependencies {
  store: GraveBurnStore
  client: BurnVerificationClient
  now?: () => Date
  createId?: () => string
  createNonce?: () => string
}

function nowFrom(deps: BurnServiceDependencies): Date {
  return deps.now?.() ?? new Date()
}

function intentHasFixedConfig(intent: GraveBurnIntentRecord): boolean {
  return (
    intent.chainId === GRAVE_CHAIN_ID
    && intent.tokenAddress.toLowerCase() === GRAVE_TOKEN_ADDRESS.toLowerCase()
    && intent.burnAddress.toLowerCase() === GRAVE_BURN_ADDRESS.toLowerCase()
  )
}

export async function createBurnIntent({
  deps,
  graveId,
  walletAddress,
  amountRaw,
}: {
  deps: BurnServiceDependencies
  graveId: string
  walletAddress: string
  amountRaw: bigint
}) {
  const grave = await deps.store.findBurnableV1Grave(graveId)
  if (grave === 'not_found') return { outcome: 'not_found' as const }
  if (grave === 'schema_unavailable') return { outcome: 'schema_unavailable' as const }

  const now = nowFrom(deps)
  const intent = await deps.store.createIntent({
    id: deps.createId?.() ?? randomUUID(),
    graveId,
    walletAddress: getAddress(walletAddress),
    amountRaw: amountRaw.toString(),
    nonce: deps.createNonce?.() ?? `0x${randomBytes(32).toString('hex')}`,
    expiresAt: new Date(now.getTime() + GRAVE_BURN_INTENT_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
  })

  return {
    outcome: 'created' as const,
    intent,
    typedData: buildGraveBurnTypedData(intent),
  }
}

export async function authorizeBurnIntent({
  deps,
  graveId,
  intentId,
  signature,
  githubUsername,
}: {
  deps: BurnServiceDependencies
  graveId: string
  intentId: string
  signature: Hex
  githubUsername: string | null
}) {
  const intent = await deps.store.getIntent(graveId, intentId)
  if (!intent) return { outcome: 'not_found' as const }
  if (!intentHasFixedConfig(intent)) return { outcome: 'invalid_state' as const }

  if (intent.status === 'authorized' && intent.signature?.toLowerCase() === signature.toLowerCase()) {
    return { outcome: 'authorized' as const, intent }
  }
  if (intent.status !== 'created') return { outcome: 'invalid_state' as const }

  const now = nowFrom(deps)
  if (new Date(intent.expiresAt).getTime() <= now.getTime()) {
    await deps.store.expireIntentAtomic({
      graveId,
      intentId,
      checkedAt: now.toISOString(),
    })
    return { outcome: 'expired' as const }
  }

  const blockNumber = await deps.client.getBlockNumber()
  const block = await deps.client.getBlock({ blockNumber })
  if (!block.hash) return { outcome: 'rpc_unavailable' as const }

  const valid = await deps.client.verifyTypedData({
    address: getAddress(intent.walletAddress),
    ...buildGraveBurnTypedData(intent),
    signature,
    blockNumber,
  })
  if (!valid) return { outcome: 'invalid_signature' as const }

  const authorizationVerifiedAt = nowFrom(deps)
  if (new Date(intent.expiresAt).getTime() <= authorizationVerifiedAt.getTime()) {
    await deps.store.expireIntentAtomic({
      graveId,
      intentId,
      checkedAt: authorizationVerifiedAt.toISOString(),
    })
    return { outcome: 'expired' as const }
  }

  const outcome = await deps.store.authorizeIntentAtomic({
    graveId,
    intentId,
    signature,
    authorizedBlockNumber: blockNumber.toString(),
    authorizedBlockHash: block.hash,
    authorizationVerifiedAt: authorizationVerifiedAt.toISOString(),
    githubUsername,
  })
  if (outcome !== 'authorized' && outcome !== 'already_authorized') {
    return { outcome }
  }

  const authorizedIntent = await deps.store.getIntent(graveId, intentId)
  if (!authorizedIntent) return { outcome: 'not_found' as const }
  return { outcome: 'authorized' as const, intent: authorizedIntent }
}

export async function submitBurnTransaction({
  deps,
  graveId,
  intentId,
  txHash,
}: {
  deps: BurnServiceDependencies
  graveId: string
  intentId: string
  txHash: Hex
}) {
  const intent = await deps.store.getIntent(graveId, intentId)
  if (!intent) return { outcome: 'not_found' as const }
  if (!intentHasFixedConfig(intent)) return { outcome: 'invalid_state' as const }

  if (intent.status === 'consumed') {
    const existing = await deps.store.getBurnByIntent(intentId)
    if (!existing || existing.txHash.toLowerCase() !== txHash.toLowerCase()) {
      return { outcome: 'conflict' as const }
    }
    if (existing.status === 'pending') {
      const verification = await verifyBurnTx({
        client: deps.client,
        intent: { ...intent, status: 'authorized' },
        txHash,
      })
      if (!verification.bind) {
        if (verification.status !== 'pending') {
          await deps.store.updateReverifiedBurn({
            burnId: existing.id,
            status: 'orphaned',
            artifact: null,
            failureCode: verification.failureCode,
            checkedAt: nowFrom(deps).toISOString(),
          })
        }
        return {
          outcome: verification.status === 'pending' ? 'accepted' as const : 'rejected' as const,
          status: verification.status,
          ...(verification.status === 'pending'
            ? { txHash, retryable: true as const }
            : { failureCode: verification.failureCode, retryable: false as const }),
        }
      }
      await deps.store.updateReverifiedBurn({
        burnId: existing.id,
        status: verification.status,
        artifact: verification.artifact,
        failureCode: null,
        checkedAt: nowFrom(deps).toISOString(),
      })
      return {
        outcome: 'accepted' as const,
        status: verification.status,
        txHash,
        retryable: verification.status === 'pending',
      }
    }
    return {
      outcome: 'accepted' as const,
      status: existing.status,
      txHash: existing.txHash,
      retryable: false,
    }
  }
  if (intent.status !== 'authorized') return { outcome: 'invalid_state' as const }
  const now = nowFrom(deps)
  if (new Date(intent.expiresAt).getTime() <= now.getTime()) {
    await deps.store.expireIntentAtomic({
      graveId,
      intentId,
      checkedAt: now.toISOString(),
    })
    return { outcome: 'expired' as const }
  }

  const verification = await verifyBurnTx({ client: deps.client, intent, txHash })
  if (verification.status === 'pending' && !verification.bind) {
    return {
      outcome: 'receipt_not_found' as const,
      status: 'pending' as const,
      retryable: true,
    }
  }
  if (!verification.bind) {
    return {
      outcome: 'rejected' as const,
      status: verification.status,
      failureCode: verification.failureCode,
      retryable: false,
    }
  }

  const bound = await deps.store.bindBurnAtomic({
    graveId,
    intentId,
    txHash,
    status: verification.status,
    artifact: verification.artifact,
    checkedAt: nowFrom(deps).toISOString(),
  })
  if (bound.outcome !== 'bound' && bound.outcome !== 'existing') return bound

  return {
    outcome: 'accepted' as const,
    status: bound.status,
    txHash,
    retryable: bound.status === 'pending',
  }
}

export async function reverifyBurnBatch({
  deps,
  limit,
}: {
  deps: BurnServiceDependencies
  limit: number
}): Promise<{
  checked: number
  verified: number
  pending: number
  failed: number
  orphaned: number
  errors: number
}> {
  const candidates = await deps.store.listReverifyCandidates(limit)
  const summary = {
    checked: 0,
    verified: 0,
    pending: 0,
    failed: 0,
    orphaned: 0,
    errors: 0,
  }

  for (const { burn, intent } of candidates) {
    summary.checked += 1
    const checkedAt = nowFrom(deps).toISOString()

    try {
      if (burn.blockNumber && burn.blockHash) {
        const canonicality = await checkStoredBurnCanonicality({
          client: deps.client,
          blockNumber: burn.blockNumber,
          blockHash: burn.blockHash,
        })
        if (canonicality === 'unavailable') {
          summary.errors += 1
          continue
        }
        if (canonicality === 'orphaned') {
          await deps.store.updateReverifiedBurn({
            burnId: burn.id,
            status: 'orphaned',
            artifact: null,
            failureCode: 'block_hash_mismatch',
            checkedAt,
          })
          summary.orphaned += 1
          continue
        }
      }

      const result = await verifyBurnTx({
        client: deps.client,
        intent,
        txHash: burn.txHash,
      })

      if (!result.bind) {
        const status = result.status === 'pending' ? 'pending' : result.status
        await deps.store.updateReverifiedBurn({
          burnId: burn.id,
          status,
          artifact: null,
          failureCode: result.failureCode,
          checkedAt,
        })
        summary[status] += 1
        continue
      }

      await deps.store.updateReverifiedBurn({
        burnId: burn.id,
        status: result.status,
        artifact: result.artifact,
        failureCode: null,
        checkedAt,
      })
      summary[result.status] += 1
    } catch (error) {
      summary.errors += 1
      console.error(
        '[VibeCemetery] Grave burn reverification failed:',
        error instanceof Error ? error.name : 'unknown_error',
      )
    }
  }

  return summary
}
