import { expect, test } from '@playwright/test'
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from 'viem'
import {
  BURN_RECOVERY_LOG_CHUNK_SIZE,
  recoverUnknownBurnBatch,
  recoverUnknownBurnTransaction,
  type BurnRecoveryClient,
  type BurnRecoveryLog,
} from '../src/lib/web3/recoverBurnTx'
import type { GraveBurnIntentRecord } from '../src/lib/web3/burnIntent'
import type { GraveBurnStore } from '../src/lib/web3/burnStore'
import type { BurnVerificationClient } from '../src/lib/web3/verifyBurnTx'
import { graveTokenAbi } from '../src/web3/abi'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
} from '../src/web3/config'

const graveId = '22222222-2222-4222-8222-222222222222'
const intentId = '11111111-1111-4111-8111-111111111111'
const wallet = '0x1111111111111111111111111111111111111111' as Address
const txHash = `0x${'ab'.repeat(32)}` as Hex
const blockHash = `0x${'cd'.repeat(32)}` as Hex
const amountRaw = (1_000n * 10n ** 18n).toString()
const baseTimestamp = BigInt(Date.parse('2026-07-30T12:00:00.000Z') / 1_000)

function intent(): GraveBurnIntentRecord {
  return {
    id: intentId,
    graveId,
    walletAddress: wallet,
    githubUsername: null,
    amountRaw,
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

function store(): GraveBurnStore {
  return {
    findBurnableV1Grave: async () => 'found',
    createIntent: async () => intent(),
    getIntent: async () => intent(),
    expireStaleCreatedIntents: async () => 0,
    expireIntentAtomic: async () => undefined,
    authorizeIntentAtomic: async () => 'authorized',
    bindBurnAtomic: async (input) => ({ outcome: 'bound', status: input.status }),
    getBurnByIntent: async () => null,
    getVerifiedBurnStats: async () => ({
      totalBurnedRaw: '0',
      totalBurnedDisplay: '0',
      burnCount: 0,
      topMourners: [],
    }),
    claimBurnRecoveryCandidates: async () => [],
    finishBurnRecoveryClaim: async () => undefined,
    listReverifyCandidates: async () => [],
    updateReverifiedBurn: async () => undefined,
  }
}

function transferReceiptLog(): Log {
  return {
    address: GRAVE_TOKEN_ADDRESS,
    topics: encodeEventTopics({
      abi: graveTokenAbi,
      eventName: 'Transfer',
      args: { from: wallet, to: GRAVE_BURN_ADDRESS },
    }),
    data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(amountRaw)]),
    logIndex: 3,
  } as unknown as Log
}

function verificationClient(): BurnVerificationClient {
  return {
    getChainId: async () => GRAVE_CHAIN_ID,
    getTransactionReceipt: async () => ({
      status: 'success',
      blockNumber: 101n,
      blockHash,
      logs: [transferReceiptLog()],
    }),
    getTransaction: async () => ({ from: wallet }),
    getBlockNumber: async () => 103n,
    getBlock: async ({ blockNumber }) => ({
      hash: blockNumber === 101n ? blockHash : `0x${'ef'.repeat(32)}` as Hex,
      timestamp: baseTimestamp + (blockNumber - 100n),
    }),
    getBytecode: async () => undefined,
    verifyTypedData: async () => true,
  }
}

function recoveryClient({
  latest = 103n,
  logs = [],
  getLogs,
}: {
  latest?: bigint
  logs?: readonly BurnRecoveryLog[]
  getLogs?: BurnRecoveryClient['getLogs']
} = {}): BurnRecoveryClient {
  return {
    getBlockNumber: async () => latest,
    getBlock: async ({ blockNumber }) => ({
      hash: `0x${'ef'.repeat(32)}` as Hex,
      timestamp: baseTimestamp + (blockNumber - 100n),
    }),
    getLogs: getLogs ?? (async () => logs),
  }
}

test('exact recovered Transfer still passes the existing verifier and atomic bind', async () => {
  let boundHash: Hex | null = null
  const burnStore = store()
  burnStore.bindBurnAtomic = async (input) => {
    boundHash = input.txHash
    expect(input.artifact).toMatchObject({ blockNumber: '101', blockHash, logIndex: 3 })
    return { outcome: 'bound', status: input.status }
  }
  const logRequests: Parameters<BurnRecoveryClient['getLogs']>[0][] = []
  const result = await recoverUnknownBurnTransaction({
    deps: { store: burnStore, client: verificationClient() },
    client: recoveryClient({
      logs: [{ transactionHash: txHash, args: { value: BigInt(amountRaw) } }],
      getLogs: async (args) => {
        logRequests.push(args)
        return [{ transactionHash: txHash, args: { value: BigInt(amountRaw) } }]
      },
    }),
    graveId,
    intentId,
  })

  expect(result).toEqual({ outcome: 'recovered', status: 'verified', txHash, retryable: false })
  expect(boundHash).toBe(txHash)
  expect(logRequests).toHaveLength(1)
  expect(logRequests[0]).toMatchObject({
    address: GRAVE_TOKEN_ADDRESS,
    args: { from: wallet, to: GRAVE_BURN_ADDRESS },
    fromBlock: 101n,
    toBlock: 103n,
    strict: true,
  })
})

test('no match stays pending before the on-chain grace deadline', async () => {
  const result = await recoverUnknownBurnTransaction({
    deps: { store: store(), client: verificationClient() },
    client: recoveryClient(),
    graveId,
    intentId,
  })
  expect(result).toEqual({ outcome: 'pending', retryable: true })
})

test('a complete no-match scan after grace safely concludes and uses bounded chunks', async () => {
  const ranges: Array<[bigint, bigint]> = []
  const result = await recoverUnknownBurnTransaction({
    deps: { store: store(), client: verificationClient() },
    client: recoveryClient({
      latest: 3_000n,
      getLogs: async ({ fromBlock, toBlock }) => {
        expect(toBlock - fromBlock + 1n).toBeLessThanOrEqual(BURN_RECOVERY_LOG_CHUNK_SIZE)
        ranges.push([fromBlock, toBlock])
        return []
      },
    }),
    graveId,
    intentId,
  })

  expect(result).toEqual({ outcome: 'safe_no_match', retryable: false })
  expect(ranges).toEqual([[101n, 2_100n], [2_101n, 2_500n]])
})

test('RPC failure never produces a safe no-match conclusion', async () => {
  await expect(recoverUnknownBurnTransaction({
    deps: { store: store(), client: verificationClient() },
    client: recoveryClient({
      getLogs: async () => {
        throw new Error('RPC unavailable')
      },
    }),
    graveId,
    intentId,
  })).rejects.toThrow('RPC unavailable')
})

test('a recovery-boundary reorg never produces a safe no-match conclusion', async () => {
  let scanStarted = false
  const changingClient = recoveryClient({
    latest: 3_000n,
    getLogs: async () => {
      scanStarted = true
      return []
    },
  })
  changingClient.getBlock = async ({ blockNumber }) => {
    return {
      hash: scanStarted && blockNumber === 2_500n
        ? `0x${'aa'.repeat(32)}` as Hex
        : `0x${'ef'.repeat(32)}` as Hex,
      timestamp: baseTimestamp + (blockNumber - 100n),
    }
  }

  await expect(recoverUnknownBurnTransaction({
    deps: { store: store(), client: verificationClient() },
    client: changingClient,
    graveId,
    intentId,
  })).rejects.toThrow('Recovery boundary changed during scan')
})

test('multiple exact candidates fail closed without guessing a hash', async () => {
  let bindCalls = 0
  const burnStore = store()
  burnStore.bindBurnAtomic = async () => {
    bindCalls += 1
    return { outcome: 'bound', status: 'verified' }
  }
  const result = await recoverUnknownBurnTransaction({
    deps: { store: burnStore, client: verificationClient() },
    client: recoveryClient({
      logs: [
        { transactionHash: txHash, args: { value: BigInt(amountRaw) } },
        { transactionHash: `0x${'bc'.repeat(32)}`, args: { value: BigInt(amountRaw) } },
      ],
    }),
    graveId,
    intentId,
  })

  expect(result).toEqual({ outcome: 'operator_required', reason: 'multiple_candidates' })
  expect(bindCalls).toBe(0)
})

test('wrong amount logs are ignored by exact bigint filtering', async () => {
  const result = await recoverUnknownBurnTransaction({
    deps: { store: store(), client: verificationClient() },
    client: recoveryClient({
      logs: [{ transactionHash: txHash, args: { value: BigInt(amountRaw) - 1n } }],
    }),
    graveId,
    intentId,
  })
  expect(result).toEqual({ outcome: 'pending', retryable: true })
})

test('background recovery claims a bounded batch and completes a stable no-match', async () => {
  const finishes: Parameters<GraveBurnStore['finishBurnRecoveryClaim']>[0][] = []
  const burnStore = store()
  let claimedLeaseToken = ''
  burnStore.claimBurnRecoveryCandidates = async (limit, _claimedAt, leaseToken) => {
    expect(limit).toBe(5)
    claimedLeaseToken = leaseToken
    return [intent()]
  }
  burnStore.finishBurnRecoveryClaim = async (input) => {
    finishes.push(input)
  }

  const summary = await recoverUnknownBurnBatch({
    deps: {
      store: burnStore,
      client: verificationClient(),
      now: () => new Date('2026-07-30T13:00:00.000Z'),
    },
    client: recoveryClient({ latest: 3_000n }),
    limit: 5,
  })

  expect(summary).toEqual({
    claimed: 1,
    recovered: 0,
    pending: 0,
    safeNoMatch: 1,
    operatorRequired: 0,
    errors: 0,
  })
  expect(finishes).toEqual([expect.objectContaining({
    intentId,
    leaseToken: claimedLeaseToken,
    outcome: 'safe_no_match',
    failureCode: 'no_transfer_found',
  })])
})

test('background RPC failure releases the lease for a later retry', async () => {
  const finishes: Parameters<GraveBurnStore['finishBurnRecoveryClaim']>[0][] = []
  const burnStore = store()
  burnStore.claimBurnRecoveryCandidates = async () => [intent()]
  burnStore.finishBurnRecoveryClaim = async (input) => {
    finishes.push(input)
  }

  const summary = await recoverUnknownBurnBatch({
    deps: { store: burnStore, client: verificationClient() },
    client: recoveryClient({
      getLogs: async () => {
        throw new Error('RPC unavailable')
      },
    }),
    limit: 5,
  })

  expect(summary.errors).toBe(1)
  expect(finishes).toEqual([expect.objectContaining({
    intentId,
    outcome: 'retry',
  })])
})
