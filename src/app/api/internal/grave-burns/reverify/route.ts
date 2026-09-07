import { getServerBurnConfig, isBurnServiceAvailable } from '@/lib/web3/burnConfig'
import { getBasePublicClient } from '@/lib/web3/baseClient'
import { reverifyBurnBatch } from '@/lib/web3/burnService'
import {
  recoverUnknownBurnBatch,
  type BurnRecoveryClient,
} from '@/lib/web3/recoverBurnTx'
import { getBurnServiceDependencies } from '@/lib/web3/routeDeps'
import { createReverifyHandler } from './reverify-handler'

export const runtime = 'nodejs'
export const maxDuration = 30

// Vercel Cron invokes configured paths with GET. POST remains available for
// an approved external scheduler or a deliberate operator retry.
const handleReverify = createReverifyHandler({
  getConfig: getServerBurnConfig,
  isAvailable: isBurnServiceAvailable,
  getServiceDependencies: getBurnServiceDependencies,
  reverify: reverifyBurnBatch,
  recover: recoverUnknownBurnBatch,
  getRecoveryClient: async () => await getBasePublicClient() as unknown as BurnRecoveryClient,
})
export const GET = handleReverify
export const POST = handleReverify
