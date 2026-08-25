import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getServerBurnConfig, isBurnServiceAvailable } from '@/lib/web3/burnConfig'
import { reverifyBurnBatch } from '@/lib/web3/burnService'
import { burnHttpErrorResponse, burnJson } from '@/lib/web3/http'
import { getBurnServiceDependencies } from '@/lib/web3/routeDeps'

export const runtime = 'nodejs'
export const maxDuration = 30

function bearerToken(req: NextRequest): string | null {
  return req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null
}

function tokenMatches(candidate: string | null, expected: string | null): boolean {
  if (!candidate || !expected) return false
  const candidateBytes = Buffer.from(candidate)
  const expectedBytes = Buffer.from(expected)
  return (
    candidateBytes.length === expectedBytes.length
    && timingSafeEqual(candidateBytes, expectedBytes)
  )
}

export interface ReverifyRouteDependencies {
  getConfig: typeof getServerBurnConfig
  isAvailable: typeof isBurnServiceAvailable
  getServiceDependencies: typeof getBurnServiceDependencies
  reverify: typeof reverifyBurnBatch
}

export function createReverifyHandler(dependencies: ReverifyRouteDependencies) {
  return async function handleReverify(req: NextRequest) {
  try {
    const config = dependencies.getConfig()
    const token = bearerToken(req)
    if (
      !tokenMatches(token, config.reverifySecret)
      && !tokenMatches(token, config.cronSecret)
    ) {
      return burnJson({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!dependencies.isAvailable(config)) {
      return burnJson({ error: 'The grave offering ritual is unavailable' }, { status: 503 })
    }

    const summary = await dependencies.reverify({
      deps: await dependencies.getServiceDependencies(),
      limit: 25,
    })
    return burnJson(summary)
  } catch (error) {
    return burnHttpErrorResponse(error)
  }
  }
}

// Vercel Cron invokes configured paths with GET. POST remains available for
// an approved external scheduler or a deliberate operator retry.
const handleReverify = createReverifyHandler({
  getConfig: getServerBurnConfig,
  isAvailable: isBurnServiceAvailable,
  getServiceDependencies: getBurnServiceDependencies,
  reverify: reverifyBurnBatch,
})
export const GET = handleReverify
export const POST = handleReverify
