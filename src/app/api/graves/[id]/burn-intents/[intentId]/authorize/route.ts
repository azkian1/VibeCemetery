import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isBurnServiceAvailable } from '@/lib/web3/burnConfig'
import { graveBurnStore } from '@/lib/web3/burnStore'
import {
  enforceBurnIpRateLimit,
  enforceBurnWalletRateLimit,
} from '@/lib/web3/http'
import { getBurnServiceDependencies } from '@/lib/web3/routeDeps'
import { createAuthorizeBurnIntentHandler } from './authorize-handler'

export const POST = createAuthorizeBurnIntentHandler({
  isAvailable: isBurnServiceAvailable,
  getStoredIntent: graveBurnStore.getIntent.bind(graveBurnStore),
  rateLimitIp: enforceBurnIpRateLimit,
  rateLimitWallet: enforceBurnWalletRateLimit,
  getServiceDependencies: getBurnServiceDependencies,
  getGithubUsername: async () => {
    const session = await getServerSession(authOptions)
    return session?.user?.github_username ?? null
  },
})
