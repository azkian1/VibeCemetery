import { isBurnServiceAvailable } from '@/lib/web3/burnConfig'
import { getBasePublicClient } from '@/lib/web3/baseClient'
import { graveBurnStore } from '@/lib/web3/burnStore'
import {
  enforceBurnIpRateLimit,
  enforceBurnWalletRateLimit,
} from '@/lib/web3/http'
import type { BurnRecoveryClient } from '@/lib/web3/recoverBurnTx'
import { getBurnServiceDependencies } from '@/lib/web3/routeDeps'
import { createRecoverBurnHandler } from './recover-handler'

export const runtime = 'nodejs'
export const maxDuration = 30

export const POST = createRecoverBurnHandler({
  isAvailable: isBurnServiceAvailable,
  getStoredIntent: graveBurnStore.getIntent.bind(graveBurnStore),
  rateLimitIp: enforceBurnIpRateLimit,
  rateLimitWallet: enforceBurnWalletRateLimit,
  getServiceDependencies: getBurnServiceDependencies,
  getRecoveryClient: async () => await getBasePublicClient() as unknown as BurnRecoveryClient,
})
