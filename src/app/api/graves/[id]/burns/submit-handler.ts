import { NextRequest } from 'next/server'
import { BASE_EXPLORER_TX_URL } from '@/web3/config'
import {
  isUuid,
  normalizeTransactionHash,
  type GraveBurnIntentRecord,
} from '@/lib/web3/burnIntent'
import {
  submitBurnTransaction,
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

export interface SubmitBurnRouteDependencies {
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
}

export function createSubmitBurnHandler(
  dependencies: SubmitBurnRouteDependencies,
) {
  return async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      assertSameOrigin(req)
      if (!dependencies.isAvailable()) {
        return burnJson({ error: 'The grave offering ritual is currently unavailable.' }, { status: 503 })
      }

      const { id: graveId } = await params
      if (!isUuid(graveId)) throw new BurnHttpError(400, 'Invalid grave id')
      const body = await readStrictJsonObject(req)
      assertExactKeys(body, ['intentId', 'txHash'])
      if (!isUuid(body.intentId)) throw new BurnHttpError(400, 'Invalid ritual intent')
      const txHash = normalizeTransactionHash(body.txHash)
      if (!txHash) throw new BurnHttpError(400, 'Invalid Base transaction hash')

      await dependencies.rateLimitIp(req, 'submit', 20)
      const storedIntent = await dependencies.getStoredIntent(graveId, body.intentId)
      if (!storedIntent) return burnJson({ error: 'Ritual intent not found' }, { status: 404 })
      await dependencies.rateLimitWallet('submit', storedIntent.walletAddress, 20)

      const result = await submitBurnTransaction({
        deps: await dependencies.getServiceDependencies(),
        graveId,
        intentId: body.intentId,
        txHash,
      })

      if (result.outcome === 'not_found') {
        return burnJson({ error: 'Ritual intent not found' }, { status: 404 })
      }
      if (result.outcome === 'expired') {
        return burnJson({ error: 'This ritual intent has expired' }, { status: 410 })
      }
      if (result.outcome === 'conflict') {
        return burnJson({ error: 'This intent or transaction is already bound' }, { status: 409 })
      }
      if (result.outcome === 'invalid_state') {
        return burnJson({ error: 'Authorize the grave intent before submitting a transaction' }, { status: 409 })
      }
      if (result.outcome === 'rejected') {
        return burnJson({
          status: result.status,
          error: 'The Base transaction does not match the signed grave offering',
          failureCode: result.failureCode,
          retryable: false,
        }, { status: 422 })
      }
      if (result.outcome !== 'accepted') {
        return burnJson({ error: 'The offering could not be recorded' }, { status: 409 })
      }

      return burnJson({
        status: result.status,
        bound: true,
        retryable: result.retryable,
        explorerUrl: `${BASE_EXPLORER_TX_URL}${txHash}`,
      }, { status: result.status === 'verified' ? 200 : 202 })
    } catch (error) {
      return burnHttpErrorResponse(error)
    }
  }
}
