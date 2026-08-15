import 'server-only'
import { getBasePublicClient } from './baseClient'
import { graveBurnStore } from './burnStore'
import type { BurnServiceDependencies } from './burnService'

export async function getBurnServiceDependencies(): Promise<BurnServiceDependencies> {
  return {
    store: graveBurnStore,
    client: await getBasePublicClient(),
  }
}
