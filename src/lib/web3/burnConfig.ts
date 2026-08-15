import 'server-only'
import { GRAVE_CHAIN_ID } from '@/web3/config'

export interface ServerBurnConfig {
  enabled: boolean
  baseRpcUrl: string | null
  reverifySecret: string | null
  cronSecret: string | null
}

function readBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

function readRpcUrl(value: string | undefined): string | null {
  const candidate = value?.trim()
  if (!candidate) return null

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

export function getServerBurnConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerBurnConfig {
  return {
    enabled: readBoolean(env.WEB3_GRAVE_BURNS_ENABLED),
    baseRpcUrl: readRpcUrl(env.BASE_RPC_URL),
    reverifySecret: env.GRAVE_BURN_REVERIFY_SECRET?.trim() || null,
    cronSecret: env.CRON_SECRET?.trim() || null,
  }
}

export function isBurnServiceAvailable(config = getServerBurnConfig()): boolean {
  return config.enabled && config.baseRpcUrl !== null
}

export function assertBaseChainId(chainId: number): void {
  if (chainId !== GRAVE_CHAIN_ID) {
    throw new Error(`Configured RPC is not Base Mainnet (expected ${GRAVE_CHAIN_ID})`)
  }
}
