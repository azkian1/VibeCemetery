import {
  getAddress,
  isAddress,
  isHash,
  parseUnits,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_BURN_INTENT_DOMAIN_NAME,
  GRAVE_BURN_INTENT_DOMAIN_VERSION,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
  GRAVE_TOKEN_DECIMALS,
  MAX_GRAVE_UINT256_RAW,
  MIN_GRAVE_BURN_RAW,
} from '@/web3/config'

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const GRAVE_AMOUNT_RE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/
export const SIGNATURE_RE = /^0x[0-9a-fA-F]+$/

export interface GraveBurnIntentRecord {
  id: string
  graveId: string
  walletAddress: Address
  githubUsername: string | null
  amountRaw: string
  chainId: number
  tokenAddress: Address
  burnAddress: Address
  nonce: string
  status: 'created' | 'authorized' | 'consumed' | 'expired' | 'failed'
  signature: Hex | null
  authorizedBlockNumber: string | null
  authorizedBlockHash: Hex | null
  authorizationVerifiedAt: string | null
  expiresAt: string
  authorizedAt: string | null
  consumedAt: string | null
  createdAt: string
}

export const graveBurnIntentTypes = {
  GraveBurnIntent: [
    { name: 'intentId', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'graveId', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'expectedRawAmount', type: 'uint256' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'burnAddress', type: 'address' },
    { name: 'expiresAt', type: 'uint256' },
  ],
} as const

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function normalizeWalletAddress(value: unknown): Address | null {
  if (typeof value !== 'string' || !isAddress(value, { strict: true })) return null
  return getAddress(value)
}

export function normalizeTransactionHash(value: unknown): Hex | null {
  if (typeof value !== 'string' || !isHash(value)) return null
  return value.toLowerCase() as Hex
}

export function normalizeSignature(value: unknown): Hex | null {
  if (
    typeof value !== 'string'
    || value.length < 4
    || value.length > 16_386
    || !SIGNATURE_RE.test(value)
    || value.length % 2 !== 0
  ) {
    return null
  }
  return value as Hex
}

export function parseGraveAmount(value: unknown): {
  amount: string
  amountRaw: bigint
} | null {
  if (typeof value !== 'string' || value.length > 79 || !GRAVE_AMOUNT_RE.test(value)) return null
  if (value.split('.')[0].length > 60) return null

  try {
    const amountRaw = parseUnits(value, GRAVE_TOKEN_DECIMALS)
    if (amountRaw < MIN_GRAVE_BURN_RAW || amountRaw > MAX_GRAVE_UINT256_RAW) return null
    return { amount: value, amountRaw }
  } catch {
    return null
  }
}

export function graveBurnIntentDomain(): TypedDataDomain {
  return {
    name: GRAVE_BURN_INTENT_DOMAIN_NAME,
    version: GRAVE_BURN_INTENT_DOMAIN_VERSION,
    chainId: GRAVE_CHAIN_ID,
    verifyingContract: GRAVE_TOKEN_ADDRESS,
  }
}

export function buildGraveBurnTypedData(intent: Pick<
  GraveBurnIntentRecord,
  'id' | 'nonce' | 'graveId' | 'walletAddress' | 'amountRaw' | 'expiresAt'
>) {
  return {
    domain: graveBurnIntentDomain(),
    types: graveBurnIntentTypes,
    primaryType: 'GraveBurnIntent' as const,
    message: {
      intentId: intent.id,
      nonce: intent.nonce,
      graveId: intent.graveId,
      wallet: getAddress(intent.walletAddress),
      expectedRawAmount: intent.amountRaw,
      chainId: String(GRAVE_CHAIN_ID),
      tokenAddress: GRAVE_TOKEN_ADDRESS,
      burnAddress: GRAVE_BURN_ADDRESS,
      expiresAt: String(Math.floor(new Date(intent.expiresAt).getTime() / 1000)),
    },
  }
}
