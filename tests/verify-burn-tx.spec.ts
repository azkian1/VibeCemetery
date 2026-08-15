import { expect, test } from '@playwright/test'
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from 'viem'
import { graveTokenAbi } from '../src/web3/abi'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
} from '../src/web3/config'
import type { GraveBurnIntentRecord } from '../src/lib/web3/burnIntent'
import {
  verifyBurnTx,
  type BurnVerificationClient,
} from '../src/lib/web3/verifyBurnTx'

const wallet = '0x1111111111111111111111111111111111111111' as Address
const otherWallet = '0x2222222222222222222222222222222222222222' as Address
const txHash = `0x${'ab'.repeat(32)}` as Hex
const blockHash = `0x${'cd'.repeat(32)}` as Hex
const amount = 100n * 10n ** 18n

function intent(overrides: Partial<GraveBurnIntentRecord> = {}): GraveBurnIntentRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    graveId: '22222222-2222-4222-8222-222222222222',
    walletAddress: wallet,
    githubUsername: null,
    amountRaw: amount.toString(),
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
    ...overrides,
  }
}

function transferLog({
  from = wallet,
  to = GRAVE_BURN_ADDRESS,
  value = amount,
  address = GRAVE_TOKEN_ADDRESS,
  logIndex = 3,
}: {
  from?: Address
  to?: Address
  value?: bigint
  address?: Address
  logIndex?: number
} = {}): Log {
  return {
    address,
    topics: encodeEventTopics({
      abi: graveTokenAbi,
      eventName: 'Transfer',
      args: { from, to },
    }),
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
    logIndex,
  } as unknown as Log
}

function client(overrides: Partial<BurnVerificationClient> = {}): BurnVerificationClient {
  return {
    getChainId: async () => GRAVE_CHAIN_ID,
    getTransactionReceipt: async () => ({
      status: 'success',
      blockNumber: 101n,
      blockHash,
      logs: [transferLog()],
    }),
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

test('missing receipt is retryable and does not bind the intent', async () => {
  const result = await verifyBurnTx({
    client: client({
      getTransactionReceipt: async () => {
        const error = new Error('Transaction receipt could not be found')
        error.name = 'TransactionReceiptNotFoundError'
        throw error
      },
    }),
    intent: intent(),
    txHash,
  })
  expect(result).toEqual({
    status: 'pending',
    bind: false,
    failureCode: 'receipt_not_found',
  })
})

test('one exact fixed-token Transfer becomes verified after two confirmations', async () => {
  const result = await verifyBurnTx({ client: client(), intent: intent(), txHash })
  expect(result).toMatchObject({
    status: 'verified',
    bind: true,
    artifact: { blockNumber: '101', blockHash, logIndex: 3 },
  })
})

test('matching receipt with too few confirmations binds as pending', async () => {
  const result = await verifyBurnTx({
    client: client({ getBlockNumber: async () => 101n }),
    intent: intent(),
    txHash,
  })
  expect(result).toMatchObject({ status: 'pending', bind: true })
})

test('security mismatches never bind or verify', async () => {
  const cases: Array<[string, BurnVerificationClient, GraveBurnIntentRecord]> = [
    ['reverted', client({ getTransactionReceipt: async () => ({
      status: 'reverted', blockNumber: 101n, blockHash, logs: [transferLog()],
    }) }), intent()],
    ['pre-authorization', client({ getTransactionReceipt: async () => ({
      status: 'success', blockNumber: 100n, blockHash, logs: [transferLog()],
    }) }), intent()],
    ['wrong sender', client({ getTransaction: async () => ({ from: otherWallet }) }), intent()],
    ['wrong token', client({ getTransactionReceipt: async () => ({
      status: 'success',
      blockNumber: 101n,
      blockHash,
      logs: [transferLog({ address: otherWallet })],
    }) }), intent()],
    ['wrong burn address', client({ getTransactionReceipt: async () => ({
      status: 'success',
      blockNumber: 101n,
      blockHash,
      logs: [transferLog({ to: otherWallet })],
    }) }), intent()],
    ['wrong amount', client({ getTransactionReceipt: async () => ({
      status: 'success',
      blockNumber: 101n,
      blockHash,
      logs: [transferLog({ value: amount + 1n })],
    }) }), intent()],
    ['multiple matches', client({ getTransactionReceipt: async () => ({
      status: 'success',
      blockNumber: 101n,
      blockHash,
      logs: [transferLog(), transferLog({ logIndex: 4 })],
    }) }), intent()],
  ]

  for (const [label, fakeClient, burnIntent] of cases) {
    const result = await verifyBurnTx({ client: fakeClient, intent: burnIntent, txHash })
    expect(result.bind, label).toBe(false)
    expect(result.status, label).not.toBe('verified')
  }
})

test('smart wallet uses contract-capable typed-data verification at the receipt block', async () => {
  let verifiedAtBlock: bigint | undefined
  const smartClient = client({
    getBytecode: async () => '0x1234',
    getTransaction: async () => ({ from: otherWallet }),
    verifyTypedData: async (args) => {
      verifiedAtBlock = args.blockNumber
      return true
    },
  })
  const result = await verifyBurnTx({ client: smartClient, intent: intent(), txHash })
  expect(result.status).toBe('verified')
  expect(verifiedAtBlock).toBe(101n)
})

test('reorged receipt block is orphaned', async () => {
  const result = await verifyBurnTx({
    client: client({
      getBlock: async () => ({
        hash: `0x${'ef'.repeat(32)}`,
        timestamp: 0n,
      }),
    }),
    intent: intent(),
    txHash,
  })
  expect(result).toEqual({
    status: 'orphaned',
    bind: false,
    failureCode: 'block_hash_mismatch',
  })
})
