import { NextRequest } from 'next/server'
import { graveBurnStore, type GraveBurnStore } from '@/lib/web3/burnStore'
import { isUuid } from '@/lib/web3/burnIntent'
import { burnHttpErrorResponse, burnJson } from '@/lib/web3/http'

export function createGetGraveBurnStatsHandler(store: GraveBurnStore) {
  return async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const { id: graveId } = await params
      if (!isUuid(graveId)) {
        return burnJson({ error: 'Invalid grave id' }, { status: 400 })
      }

      return burnJson(await store.getVerifiedBurnStats(graveId))
    } catch (error) {
      return burnHttpErrorResponse(error)
    }
  }
}

export const GET = createGetGraveBurnStatsHandler(graveBurnStore)
