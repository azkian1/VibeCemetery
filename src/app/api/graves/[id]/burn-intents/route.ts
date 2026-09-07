import { isBurnServiceAvailable } from '@/lib/web3/burnConfig'
import { enforceBurnRateLimit } from '@/lib/web3/http'
import { getBurnServiceDependencies } from '@/lib/web3/routeDeps'
import { createPostBurnIntentHandler } from './create-handler'

export const POST = createPostBurnIntentHandler({
  isAvailable: isBurnServiceAvailable,
  rateLimit: enforceBurnRateLimit,
  getServiceDependencies: getBurnServiceDependencies,
})
