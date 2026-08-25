import { isBurnServiceAvailable } from '@/lib/web3/burnConfig'
import { graveBurnStore } from '@/lib/web3/burnStore'
import {
  enforceBurnIpRateLimit,
  enforceBurnWalletRateLimit,
} from '@/lib/web3/http'
import { getBurnServiceDependencies } from '@/lib/web3/routeDeps'
import { createGetGraveBurnStatsHandler } from './stats-route'
import { createSubmitBurnHandler } from './submit-handler'

export const GET = createGetGraveBurnStatsHandler(graveBurnStore)

export const POST = createSubmitBurnHandler({
  isAvailable: isBurnServiceAvailable,
  getStoredIntent: graveBurnStore.getIntent.bind(graveBurnStore),
  rateLimitIp: enforceBurnIpRateLimit,
  rateLimitWallet: enforceBurnWalletRateLimit,
  getServiceDependencies: getBurnServiceDependencies,
})
