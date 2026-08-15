import { expect, test } from '@playwright/test'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
  GRAVE_TOKEN_DECIMALS,
  MIN_BURN_CONFIRMATIONS,
} from '../src/web3/config'
import {
  buildGraveBurnTypedData,
  normalizeTransactionHash,
  normalizeWalletAddress,
  parseWholeGraveAmount,
  type GraveBurnIntentRecord,
} from '../src/lib/web3/burnIntent'

const wallet = '0x1111111111111111111111111111111111111111'

test('fixed GRAVE configuration matches the approved Base MVP', () => {
  expect(GRAVE_CHAIN_ID).toBe(8453)
  expect(GRAVE_TOKEN_ADDRESS).toBe('0xb48bc4896D18724F7bF5A3d2817fC35252cD7bA3')
  expect(GRAVE_TOKEN_DECIMALS).toBe(18)
  expect(GRAVE_BURN_ADDRESS).toBe('0x000000000000000000000000000000000000dEaD')
  expect(MIN_BURN_CONFIRMATIONS).toBe(2)
})

test('whole amount parsing uses bigint raw units and rejects unsafe input', () => {
  expect(parseWholeGraveAmount('100')?.amountRaw).toBe(100n * 10n ** 18n)
  for (const invalid of ['0', '-1', '1.5', '01', '1e3', '', ' 1', 100, '9'.repeat(61)]) {
    expect(parseWholeGraveAmount(invalid)).toBeNull()
  }
})

test('addresses and hashes are strictly normalized', () => {
  expect(normalizeWalletAddress(wallet)).toBe(wallet)
  expect(normalizeWalletAddress('0x123')).toBeNull()
  expect(normalizeTransactionHash(`0x${'AB'.repeat(32)}`))
    .toBe(`0x${'ab'.repeat(32)}`)
  expect(normalizeTransactionHash('0x1234')).toBeNull()
})

test('typed data binds grave, wallet, amount, fixed chain/token/burn and expiry', () => {
  const intent = {
    id: '11111111-1111-4111-8111-111111111111',
    graveId: '22222222-2222-4222-8222-222222222222',
    walletAddress: wallet,
    githubUsername: null,
    amountRaw: (100n * 10n ** 18n).toString(),
    chainId: GRAVE_CHAIN_ID,
    tokenAddress: GRAVE_TOKEN_ADDRESS,
    burnAddress: GRAVE_BURN_ADDRESS,
    nonce: `0x${'12'.repeat(32)}`,
    status: 'created',
    signature: null,
    authorizedBlockNumber: null,
    authorizedBlockHash: null,
    authorizationVerifiedAt: null,
    expiresAt: '2026-07-30T12:10:00.000Z',
    authorizedAt: null,
    consumedAt: null,
    createdAt: '2026-07-30T12:00:00.000Z',
  } satisfies GraveBurnIntentRecord
  const typedData = buildGraveBurnTypedData(intent)

  expect(typedData.message).toMatchObject({
    intentId: intent.id,
    graveId: intent.graveId,
    wallet,
    expectedRawAmount: intent.amountRaw,
    chainId: '8453',
    tokenAddress: GRAVE_TOKEN_ADDRESS,
    burnAddress: GRAVE_BURN_ADDRESS,
  })
})
