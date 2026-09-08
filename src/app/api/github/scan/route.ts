import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { createGitHubScanHandler } from './handler'

export const maxDuration = 60
export const GET = createGitHubScanHandler({
  username: async () => (await getServerSession(authOptions))?.user?.github_username ?? null,
  clientIp: getClientIp,
  rateLimit: checkRateLimit,
})
