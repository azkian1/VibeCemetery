import { NextRequest } from 'next/server'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
  GRAVE_TOKEN_DECIMALS,
  GRAVE_TOKEN_SYMBOL,
} from '@/web3/config'
import { isUuid, normalizeSignature, type GraveBurnIntentRecord } from '@/lib/web3/burnIntent'
import {
  authorizeBurnIntent,
  type BurnServiceDependencies,
} from '@/lib/web3/burnService'
import {
  assertExactKeys,
  assertSameOrigin,
  BurnHttpError,
  burnHttpErrorResponse,
  burnJson,
  readStrictJsonObject,
} from '@/lib/web3/http'

export interface AuthorizeBurnIntentRouteDependencies {
  isAvailable: () => boolean
  getStoredIntent: (
    graveId: string,
    intentId: string,
  ) => Promise<GraveBurnIntentRecord | null>
  rateLimitIp: (
    req: NextRequest,
    action: string,
    maxRequests?: number,
  ) => Promise<void>
  rateLimitWallet: (
    action: string,
    walletAddress: string,
    maxRequests?: number,
  ) => Promise<void>
  getServiceDependencies: () => Promise<BurnServiceDependencies>
  getGithubUsername: () => Promise<string | null>
}

export function createAuthorizeBurnIntentHandler(
  dependencies: AuthorizeBurnIntentRouteDependencies,
) {
  return async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; intentId: string }> },
  ) {
    try {
      assertSameOrigin(req)
      if (!dependencies.isAvailable()) {
        return burnJson({ error: 'The grave offering ritual is currently unavailable.' }, { status: 503 })
      }

      const { id: graveId, intentId } = await params
      if (!isUuid(graveId) || !isUuid(intentId)) {
        throw new BurnHttpError(400, 'Invalid ritual identifier')
      }

      const body = await readStrictJsonObject(req)
      assertExactKeys(body, ['signature'])
      const signature = normalizeSignature(body.signature)
      if (!signature) throw new BurnHttpError(400, 'Invalid wallet signature')

      await dependencies.rateLimitIp(req, 'authorize', 12)
      const storedIntent = await dependencies.getStoredIntent(graveId, intentId)
      if (!storedIntent) return burnJson({ error: 'Ritual intent not found' }, { status: 404 })
      await dependencies.rateLimitWallet('authorize', storedIntent.walletAddress, 12)

      const result = await authorizeBurnIntent({
        deps: await dependencies.getServiceDependencies(),
        graveId,
        intentId,
        signature,
        githubUsername: await dependencies.getGithubUsername(),
      })

      if (result.outcome === 'not_found') {
        return burnJson({ error: 'Ritual intent not found' }, { status: 404 })
      }
      if (result.outcome === 'expired') {
        return burnJson({ error: 'This ritual intent has expired' }, { status: 410 })
      }
      if (result.outcome === 'invalid_signature') {
        return burnJson({ error: 'The wallet signature did not authorize this grave offering' }, { status: 401 })
      }
      if (result.outcome !== 'authorized') {
        return burnJson({ error: 'This ritual intent cannot be authorized' }, { status: 409 })
      }

      return burnJson({
        status: 'authorized',
        intentId,
        expiresAt: result.intent.expiresAt,
        transfer: {
          chainId: GRAVE_CHAIN_ID,
          tokenAddress: GRAVE_TOKEN_ADDRESS,
          tokenSymbol: GRAVE_TOKEN_SYMBOL,
          tokenDecimals: GRAVE_TOKEN_DECIMALS,
          burnAddress: GRAVE_BURN_ADDRESS,
          amountRaw: result.intent.amountRaw,
        },
      })
    } catch (error) {
      return burnHttpErrorResponse(error)
    }
  }
}
