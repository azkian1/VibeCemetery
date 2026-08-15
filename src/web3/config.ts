export const GRAVE_CHAIN_ID = 8453
export const GRAVE_TOKEN_ADDRESS = '0xb48bc4896D18724F7bF5A3d2817fC35252cD7bA3' as const
export const GRAVE_TOKEN_SYMBOL = 'GRAVE'
export const GRAVE_TOKEN_DECIMALS = 18
export const GRAVE_BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const
export const GRAVE_BURN_PRESETS = ['100', '500', '10000'] as const
export const MIN_BURN_CONFIRMATIONS = 2

export const GRAVE_BURN_INTENT_DOMAIN_NAME = 'VibeCemetery Grave Offering'
export const GRAVE_BURN_INTENT_DOMAIN_VERSION = '1'
export const GRAVE_BURN_INTENT_TTL_MS = 10 * 60 * 1000
export const BASE_EXPLORER_TX_URL = 'https://basescan.org/tx/'

export const WEB3_GRAVE_BURNS_VISIBLE =
  process.env.NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED === 'true'
