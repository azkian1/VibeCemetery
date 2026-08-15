import { expect, test } from '@playwright/test'
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from 'viem'
import {
  reverifyBurnBatch,
  submitBurnTransaction,
} from '../src/lib/web3/burnService'
import type {
  BurnStatus,
  GraveBurnRecord,
  GraveBurnStore,
} from '../src/lib/web3/burnStore'
import type { GraveBurnIntentRecord } from '../src/lib/web3/burnIntent'
import type {
  BurnVerificationArtifact,
  BurnVerificationClient,
} from '../src/lib/web3/verifyBurnTx'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
} from '../src/web3/config'
import { graveTokenAbi } from '../src/web3/abi'

const graveId = '22222222-2222-4222-8222-222222222222'
const intentId = '11111111-1111-4111-8111-111111111111'
const burnId = '33333333-3333-4333-8333-333333333333'
const wallet = '0x1111111111111111111111111111111111111111' as Address
const txHash = `0x${'ab'.repeat(32)}` as Hex
const blockHash = `0x${'cd'.repeat(32)}` as Hex

function intent(): GraveBurnIntentRecord {
  return {
    id: intentId,
    graveId,
    walletAddress: wallet,
    githubUsername: null,
    amountRaw: (100n * 10n ** 18n).toString(),
    chainId: GRAVE_CHAIN_ID,
    tokenAddress: GRAVE_TOKEN_ADDRESS,
    burnAddress: GRAVE_BURN_ADDRESS,
    nonce: `0x${'12'.repeat(32)}`,
    status: 'authorized',
    signature: `0x${'34'.repeat(65)}`,
    authorizedBlockNumber: '100',
    authorizedBlockHash: `0x${'56'.repeat(32)}`,
    authorizationVerifiedAt: '2026-07-30T12:00:00.000Z',
    expiresAt: '2026-07-30T12:10:00.000Z',
    authorizedAt: '2026-07-30T12:00:00.000Z',
    consumedAt: null,
    createdAt: '2026-07-30T11:59:00.000Z',
  }
}

function burn(): GraveBurnRecord {
  return {
    id: burnId,
    intentId,
    graveId,
    walletAddress: wallet,
    githubUsername: null,
    txHash,
    amountRaw: (100n * 10n ** 18n).toString(),
    status: 'pending',
    blockNumber: '101',
    blockHash,
    logIndex: 3,
    submittedAt: '2026-07-30T12:05:00.000Z',
    verifiedAt: null,
    lastCheckedAt: '2026-07-30T12:05:00.000Z',
    createdAt: '2026-07-30T12:05:00.000Z',
  }
}

function storeWithCandidate(updates: Array<{
  burnId: string
  status: BurnStatus
  artifact: BurnVerificationArtifact | null
  failureCode: string | null
  checkedAt: string
}>): GraveBurnStore {
  return {
    findV2Grave: async () => 'found',
    createIntent: async () => {
      throw new Error('not used')
    },
    getIntent: async () => intent(),
    expireIntentAtomic: async () => undefined,
    authorizeIntentAtomic: async () => 'authorized',
    bindBurnAtomic: async () => ({ outcome: 'bound', status: 'pending' }),
    getBurnByIntent: async () => burn(),
    getVerifiedBurnStats: async () => ({
      totalBurnedRaw: '0',
      totalBurnedDisplay: '0',
      burnCount: 0,
      topMourners: [],
    }),
    listReverifyCandidates: async () => [{ burn: burn(), intent: intent() }],
    updateReverifiedBurn: async (input) => {
      updates.push(input)
    },
  }
}

function client(overrides: Partial<BurnVerificationClient> = {}): BurnVerificationClient {
  return {
    getChainId: async () => GRAVE_CHAIN_ID,
    getTransactionReceipt: async () => {
      const error = new Error('Transaction receipt could not be found')
      error.name = 'TransactionReceiptNotFoundError'
      throw error
    },
    getTransaction: async () => ({ from: wallet }),
    getBlockNumber: async () => 102n,
    getBlock: async () => ({
      hash: blockHash,
      timestamp: BigInt(Date.parse('2026-07-30T12:05:00.000Z') / 1000),
    }),
    getBytecode: async () => undefined,
    verifyTypedData: async () => true,
    ...overrides,
  }
}

function validClient(): BurnVerificationClient {
  const transferLog = {
    address: GRAVE_TOKEN_ADDRESS,
    topics: encodeEventTopics({
      abi: graveTokenAbi,
      eventName: 'Transfer',
      args: { from: wallet, to: GRAVE_BURN_ADDRESS },
    }),
    data: encodeAbiParameters(
      [{ type: 'uint256' }],
      [100n * 10n ** 18n],
    ),
    logIndex: 3,
  } as unknown as Log

  return client({
    getTransactionReceipt: async () => ({
      status: 'success',
      blockNumber: 101n,
      blockHash,
      logs: [transferLog],
    }),
  })
}

test('reverify keeps a temporarily missing receipt pending', async () => {
  const updates: Parameters<ReturnType<typeof storeWithCandidate>['updateReverifiedBurn']>[0][] = []
  const summary = await reverifyBurnBatch({
    deps: {
      store: storeWithCandidate(updates),
      client: client(),
      now: () => new Date('2026-07-30T12:06:00.000Z'),
    },
    limit: 25,
  })

  expect(summary).toEqual({
    checked: 1,
    verified: 0,
    pending: 1,
    failed: 0,
    orphaned: 0,
    errors: 0,
  })
  expect(updates).toHaveLength(1)
  expect(updates[0]).toMatchObject({
    status: 'pending',
    artifact: null,
    failureCode: 'receipt_not_found',
  })
})

test('reverify preserves the burn when the block RPC is unavailable', async () => {
  const updates: Parameters<ReturnType<typeof storeWithCandidate>['updateReverifiedBurn']>[0][] = []
  const summary = await reverifyBurnBatch({
    deps: {
      store: storeWithCandidate(updates),
      client: client({
        getBlock: async () => {
          throw new Error('RPC timeout')
        },
      }),
    },
    limit: 25,
  })

  expect(summary.errors).toBe(1)
  expect(summary.orphaned).toBe(0)
  expect(updates).toEqual([])
})

test('reverify orphans only a confirmed block-hash mismatch', async () => {
  const updates: Parameters<ReturnType<typeof storeWithCandidate>['updateReverifiedBurn']>[0][] = []
  const summary = await reverifyBurnBatch({
    deps: {
      store: storeWithCandidate(updates),
      client: client({
        getBlock: async () => ({
          hash: `0x${'ef'.repeat(32)}`,
          timestamp: 0n,
        }),
      }),
    },
    limit: 25,
  })

  expect(summary.orphaned).toBe(1)
  expect(summary.errors).toBe(0)
  expect(updates[0]).toMatchObject({
    status: 'orphaned',
    failureCode: 'block_hash_mismatch',
  })
})

test('concurrent duplicate submissions atomically create one counted burn', async () => {
  let boundBurn: GraveBurnRecord | null = null
  let waitingLookups = 0
  let releaseLookups: (() => void) | undefined
  const lookupBarrier = new Promise<void>((resolve) => {
    releaseLookups = resolve
  })

  const store = storeWithCandidate([])
  store.listReverifyCandidates = async () => []
  store.getIntent = async () => {
    waitingLookups += 1
    if (waitingLookups === 2) releaseLookups?.()
    await lookupBarrier
    return intent()
  }
  store.bindBurnAtomic = async (input) => {
    if (boundBurn) {
      return { outcome: 'existing', status: boundBurn.status }
    }
    boundBurn = {
      ...burn(),
      txHash: input.txHash,
      status: input.status,
      blockNumber: input.artifact.blockNumber,
      blockHash: input.artifact.blockHash,
      logIndex: input.artifact.logIndex,
    }
    return { outcome: 'bound', status: input.status }
  }
  store.getBurnByIntent = async () => boundBurn

  const dependencies = {
    store,
    client: validClient(),
    now: () => new Date('2026-07-30T12:06:00.000Z'),
  }
  const [left, right] = await Promise.all([
    submitBurnTransaction({
      deps: dependencies,
      graveId,
      intentId,
      txHash,
    }),
    submitBurnTransaction({
      deps: dependencies,
      graveId,
      intentId,
      txHash,
    }),
  ])

  expect(left).toMatchObject({ outcome: 'accepted', status: 'verified' })
  expect(right).toMatchObject({ outcome: 'accepted', status: 'verified' })
  expect(boundBurn).not.toBeNull()
})
