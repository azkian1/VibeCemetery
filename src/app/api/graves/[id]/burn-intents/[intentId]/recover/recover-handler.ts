import { NextRequest } from 'next/server'
import { BASE_EXPLORER_TX_URL } from '@/web3/config'
import { isUuid, type GraveBurnIntentRecord } from '@/lib/web3/burnIntent'
import type { BurnServiceDependencies } from '@/lib/web3/burnService'
import {
  recoverUnknownBurnTransaction,
  type BurnRecoveryClient,
} from '@/lib/web3/recoverBurnTx'
import {
  assertExactKeys,
  assertSameOrigin,
  BurnHttpError,
  burnHttpErrorResponse,
  burnJson,
  readStrictJsonObject,
} from '@/lib/web3/http'

export interface RecoverBurnRouteDependencies {
  isAvailable: () => boolean
  getStoredIntent: (graveId: string, intentId: string) => Promise<GraveBurnIntentRecord | null>
  rateLimitIp: (req: NextRequest, action: string, maxRequests?: number) => Promise<void>
  rateLimitWallet: (action: string, walletAddress: string, maxRequests?: number) => Promise<void>
  getServiceDependencies: () => Promise<BurnServiceDependencies>
  getRecoveryClient: () => Promise<BurnRecoveryClient>
}

export function createRecoverBurnHandler(dependencies: RecoverBurnRouteDependencies) {
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
        throw new BurnHttpError(400, 'Invalid ritual intent')
      }
      const body = await readStrictJsonObject(req)
      assertExactKeys(body, [])

      await dependencies.rateLimitIp(req, 'recover', 12)
      const storedIntent = await dependencies.getStoredIntent(graveId, intentId)
      if (!storedIntent) return burnJson({ error: 'Ritual intent not found' }, { status: 404 })
      await dependencies.rateLimitWallet('recover', storedIntent.walletAddress, 12)

      const result = await recoverUnknownBurnTransaction({
        deps: await dependencies.getServiceDependencies(),
        client: await dependencies.getRecoveryClient(),
        graveId,
        intentId,
      })

      if (result.outcome === 'not_found') {
        return burnJson({ error: 'Ritual intent not found' }, { status: 404 })
      }
      if (result.outcome === 'invalid_state') {
        return burnJson({ status: 'operator_required', reason: 'invalid_state' })
      }
      if (result.outcome === 'operator_required') {
        return burnJson({ status: result.outcome, reason: result.reason })
      }
      if (result.outcome === 'safe_no_match') {
        return burnJson({ status: 'safe_no_match', retryable: false })
      }
      if (result.outcome === 'pending') {
        return burnJson({ status: 'searching', retryable: true }, { status: 202 })
      }
      return burnJson({
        status: result.status,
        recovered: true,
        retryable: result.retryable,
        txHash: result.txHash,
        explorerUrl: `${BASE_EXPLORER_TX_URL}${result.txHash}`,
      }, { status: result.status === 'verified' ? 200 : 202 })
    } catch (error) {
      return burnHttpErrorResponse(error)
    }
  }
}
