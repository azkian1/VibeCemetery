import { expect, test } from '@playwright/test'
import type { Address, Hex } from 'viem'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
} from '../src/web3/config'
import type { GraveBurnIntentRecord } from '../src/lib/web3/burnIntent'
import {
  authorizeBurnIntent,
  createBurnIntent,
  type BurnServiceDependencies,
} from '../src/lib/web3/burnService'
import type {
  BindBurnOutcome,
  CreateIntentInput,
  GraveBurnRecord,
  GraveBurnStore,
  GraveLookupResult,
} from '../src/lib/web3/burnStore'
import type { BurnVerificationClient } from '../src/lib/web3/verifyBurnTx'

const graveId = '22222222-2222-4222-8222-222222222222'
const intentId = '11111111-1111-4111-8111-111111111111'
const wallet = '0x1111111111111111111111111111111111111111' as Address
const signature = `0x${'34'.repeat(65)}` as Hex
const blockHash = `0x${'56'.repeat(32)}` as Hex

class MemoryBurnStore implements GraveBurnStore {
  graveResult: GraveLookupResult = 'found'
  intents = new Map<string, GraveBurnIntentRecord>()

  async findBurnableGrave(): Promise<GraveLookupResult> {
    return this.graveResult
  }

  async createIntent(input: CreateIntentInput): Promise<GraveBurnIntentRecord> {
    if ([...this.intents.values()].some((intent) => intent.nonce === input.nonce)) {
      throw new Error('duplicate nonce')
    }
    const intent: GraveBurnIntentRecord = {
      id: input.id,
      graveId: input.graveId,
      walletAddress: input.walletAddress as Address,
      githubUsername: null,
      amountRaw: input.amountRaw,
      chainId: GRAVE_CHAIN_ID,
      tokenAddress: GRAVE_TOKEN_ADDRESS,
      burnAddress: GRAVE_BURN_ADDRESS,
      nonce: input.nonce,
      status: 'created',
      signature: null,
      authorizedBlockNumber: null,
      authorizedBlockHash: null,
      authorizationVerifiedAt: null,
      expiresAt: input.expiresAt,
      authorizedAt: null,
      consumedAt: null,
      createdAt: input.createdAt,
    }
    this.intents.set(intent.id, intent)
    return intent
  }

  async getIntent(requestedGraveId: string, requestedIntentId: string) {
    const intent = this.intents.get(requestedIntentId)
    return intent?.graveId === requestedGraveId ? intent : null
  }

  async expireIntentAtomic(input: {
    graveId: string
    intentId: string
    checkedAt: string
  }) {
    const intent = await this.getIntent(input.graveId, input.intentId)
    if (
      intent
      && (intent.status === 'created' || intent.status === 'authorized')
      && new Date(intent.expiresAt) <= new Date(input.checkedAt)
    ) {
      intent.status = 'expired'
    }
  }

  async authorizeIntentAtomic(input: {
    graveId: string
    intentId: string
    signature: Hex
    authorizedBlockNumber: string
    authorizedBlockHash: Hex
    authorizationVerifiedAt: string
    githubUsername: string | null
  }) {
    const intent = await this.getIntent(input.graveId, input.intentId)
    if (!intent) return 'not_found' as const
    if (intent.status === 'authorized' && intent.signature === input.signature) {
      return 'already_authorized' as const
    }
    if (intent.status !== 'created') return 'invalid_state' as const
    if (new Date(intent.expiresAt) <= new Date(input.authorizationVerifiedAt)) {
      intent.status = 'expired'
      return 'expired' as const
    }
    Object.assign(intent, {
      status: 'authorized',
      signature: input.signature,
      authorizedBlockNumber: input.authorizedBlockNumber,
      authorizedBlockHash: input.authorizedBlockHash,
      authorizationVerifiedAt: input.authorizationVerifiedAt,
      authorizedAt: input.authorizationVerifiedAt,
      githubUsername: input.githubUsername,
    })
    return 'authorized' as const
  }

  async bindBurnAtomic(): Promise<BindBurnOutcome> {
    throw new Error('not used')
  }
  async getBurnByIntent(): Promise<GraveBurnRecord | null> {
    return null
  }
  async getVerifiedBurnStats() {
    return {
      totalBurnedRaw: '0',
      totalBurnedDisplay: '0',
      burnCount: 0,
      topMourners: [],
    }
  }
  async listReverifyCandidates() {
    return []
  }
  async updateReverifiedBurn() {}
}

function fakeClient(validSignature = true): BurnVerificationClient {
  return {
    getChainId: async () => GRAVE_CHAIN_ID,
    getBlockNumber: async () => 100n,
    getBlock: async () => ({
      hash: blockHash,
      timestamp: BigInt(Date.parse('2026-07-30T12:00:00.000Z') / 1000),
    }),
    verifyTypedData: async () => validSignature,
    getTransactionReceipt: async () => {
      throw new Error('not used')
    },
    getTransaction: async () => ({ from: wallet }),
    getBytecode: async () => undefined,
  }
}

function dependencies(
  store: MemoryBurnStore,
  now = new Date('2026-07-30T12:00:00.000Z'),
  validSignature = true,
): BurnServiceDependencies {
  return {
    store,
    client: fakeClient(validSignature),
    now: () => now,
    createId: () => intentId,
    createNonce: () => `0x${'12'.repeat(32)}`,
  }
}

test('intent creation fails closed without the Map v1 schema boundary', async () => {
  const store = new MemoryBurnStore()
  store.graveResult = 'schema_unavailable'
  const result = await createBurnIntent({
    deps: dependencies(store),
    graveId,
    walletAddress: wallet,
    amountRaw: 100n * 10n ** 18n,
  })
  expect(result).toEqual({ outcome: 'schema_unavailable' })
  expect(store.intents.size).toBe(0)
})

test('server controls the unique nonce, fixed config and ten-minute expiry', async () => {
  const store = new MemoryBurnStore()
  const result = await createBurnIntent({
    deps: dependencies(store),
    graveId,
    walletAddress: wallet,
    amountRaw: 100n * 10n ** 18n,
  })
  expect(result.outcome).toBe('created')
  if (result.outcome !== 'created') return

  expect(result.intent).toMatchObject({
    id: intentId,
    nonce: `0x${'12'.repeat(32)}`,
    graveId,
    walletAddress: wallet,
    chainId: GRAVE_CHAIN_ID,
    tokenAddress: GRAVE_TOKEN_ADDRESS,
    burnAddress: GRAVE_BURN_ADDRESS,
    expiresAt: '2026-07-30T12:10:00.000Z',
  })

  await expect(createBurnIntent({
    deps: dependencies(store),
    graveId,
    walletAddress: wallet,
    amountRaw: 100n * 10n ** 18n,
  })).rejects.toThrow('duplicate nonce')
})

test('authorization verifies the signature at a block snapshot and is idempotent', async () => {
  const store = new MemoryBurnStore()
  await createBurnIntent({
    deps: dependencies(store),
    graveId,
    walletAddress: wallet,
    amountRaw: 100n * 10n ** 18n,
  })

  const authorized = await authorizeBurnIntent({
    deps: dependencies(store),
    graveId,
    intentId,
    signature,
    githubUsername: 'server-session-name',
  })
  expect(authorized.outcome).toBe('authorized')
  expect(store.intents.get(intentId)).toMatchObject({
    status: 'authorized',
    signature,
    authorizedBlockNumber: '100',
    authorizedBlockHash: blockHash,
    githubUsername: 'server-session-name',
  })

  const repeated = await authorizeBurnIntent({
    deps: dependencies(store),
    graveId,
    intentId,
    signature,
    githubUsername: 'ignored-new-name',
  })
  expect(repeated.outcome).toBe('authorized')
  expect(store.intents.get(intentId)?.githubUsername).toBe('server-session-name')
})

test('invalid or expired signatures cannot authorize an intent', async () => {
  const invalidStore = new MemoryBurnStore()
  await createBurnIntent({
    deps: dependencies(invalidStore),
    graveId,
    walletAddress: wallet,
    amountRaw: 100n * 10n ** 18n,
  })
  const invalid = await authorizeBurnIntent({
    deps: dependencies(invalidStore, new Date('2026-07-30T12:01:00.000Z'), false),
    graveId,
    intentId,
    signature,
    githubUsername: null,
  })
  expect(invalid.outcome).toBe('invalid_signature')
  expect(invalidStore.intents.get(intentId)?.status).toBe('created')

  const expired = await authorizeBurnIntent({
    deps: dependencies(invalidStore, new Date('2026-07-30T12:11:00.000Z')),
    graveId,
    intentId,
    signature,
    githubUsername: null,
  })
  expect(expired.outcome).toBe('expired')
  expect(invalidStore.intents.get(intentId)?.status).toBe('expired')
})
