import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import type { ServerBurnConfig } from '@/lib/web3/burnConfig'
import type { reverifyBurnBatch } from '@/lib/web3/burnService'
import { burnHttpErrorResponse, burnJson } from '@/lib/web3/http'
import type {
  BurnRecoveryClient,
  recoverUnknownBurnBatch,
} from '@/lib/web3/recoverBurnTx'
import type { getBurnServiceDependencies } from '@/lib/web3/routeDeps'

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
  getConfig: () => ServerBurnConfig
  isAvailable: (config: ServerBurnConfig) => boolean
  getServiceDependencies: typeof getBurnServiceDependencies
  reverify: typeof reverifyBurnBatch
  recover: typeof recoverUnknownBurnBatch
  getRecoveryClient: () => Promise<BurnRecoveryClient>
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

      const deps = await dependencies.getServiceDependencies()
      // Preserve the existing canonicality safety job even if the additional
      // hash search later consumes the remaining function duration.
      const reverify = await dependencies.reverify({ deps, limit: 25 })
      let recovery
      try {
        recovery = await dependencies.recover({
          deps,
          client: await dependencies.getRecoveryClient(),
          limit: 2,
        })
      } catch (error) {
        // A recovery migration/RPC outage must not disable the older canonical
        // burn reverification job during a staged deployment.
        console.error(
          '[VibeCemetery] Background hash recovery batch failed:',
          error instanceof Error ? error.name : 'unknown_error',
        )
        recovery = {
          claimed: 0,
          recovered: 0,
          pending: 0,
          safeNoMatch: 0,
          operatorRequired: 0,
          errors: 1,
        }
      }
      // Keep the legacy reverify summary at the top level for existing
      // operator scripts; recovery is an additive field.
      return burnJson({ ...reverify, recovery })
    } catch (error) {
      return burnHttpErrorResponse(error)
    }
  }
}
