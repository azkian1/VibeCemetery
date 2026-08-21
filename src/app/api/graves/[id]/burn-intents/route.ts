import { NextRequest } from 'next/server'
import {
  GRAVE_BURN_ADDRESS,
  GRAVE_CHAIN_ID,
  GRAVE_TOKEN_ADDRESS,
  GRAVE_TOKEN_DECIMALS,
  GRAVE_TOKEN_SYMBOL,
} from '@/web3/config'
import { isBurnServiceAvailable } from '@/lib/web3/burnConfig'
import {
  isUuid,
  normalizeWalletAddress,
  parseWholeGraveAmount,
} from '@/lib/web3/burnIntent'
import { createBurnIntent } from '@/lib/web3/burnService'
import {
  assertExactKeys,
  assertSameOrigin,
  BurnHttpError,
  burnHttpErrorResponse,
  burnJson,
  enforceBurnRateLimit,
  readStrictJsonObject,
} from '@/lib/web3/http'
import { getBurnServiceDependencies } from '@/lib/web3/routeDeps'

export interface CreateBurnIntentRouteDependencies {
  isAvailable: typeof isBurnServiceAvailable
  rateLimit: typeof enforceBurnRateLimit
  getServiceDependencies: typeof getBurnServiceDependencies
}

export function createPostBurnIntentHandler(
  dependencies: CreateBurnIntentRouteDependencies,
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
      assertExactKeys(body, ['walletAddress', 'amountWhole'])
      const walletAddress = normalizeWalletAddress(body.walletAddress)
      if (!walletAddress) throw new BurnHttpError(400, 'Invalid wallet address')
      const amount = parseWholeGraveAmount(body.amountWhole)
      if (!amount) throw new BurnHttpError(400, 'Choose a positive whole GRAVE amount')

      await dependencies.rateLimit(req, 'create', walletAddress, 8)
      const result = await createBurnIntent({
        deps: await dependencies.getServiceDependencies(),
        graveId,
        walletAddress,
        amountRaw: amount.amountRaw,
      })

      if (result.outcome === 'not_found') {
        return burnJson({ error: 'Grave not found on Cemetery Map v1' }, { status: 404 })
      }
      if (result.outcome === 'schema_unavailable') {
        return burnJson({ error: 'The grave offering ritual is not configured.' }, { status: 503 })
      }

      return burnJson({
        intentId: result.intent.id,
        expiresAt: result.intent.expiresAt,
        typedData: result.typedData,
        transfer: {
          chainId: GRAVE_CHAIN_ID,
          tokenAddress: GRAVE_TOKEN_ADDRESS,
          tokenSymbol: GRAVE_TOKEN_SYMBOL,
          tokenDecimals: GRAVE_TOKEN_DECIMALS,
          burnAddress: GRAVE_BURN_ADDRESS,
          amountRaw: result.intent.amountRaw,
        },
      }, { status: 201 })
    } catch (error) {
      return burnHttpErrorResponse(error)
    }
  }
}

export const POST = createPostBurnIntentHandler({
  isAvailable: isBurnServiceAvailable,
  rateLimit: enforceBurnRateLimit,
  getServiceDependencies: getBurnServiceDependencies,
})
