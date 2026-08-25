import 'server-only'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { assertBaseChainId, getServerBurnConfig } from './burnConfig'

function createConfiguredBaseClient(rpcUrl: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl, { retryCount: 1, timeout: 10_000 }),
  })
}

type BasePublicClient = ReturnType<typeof createConfiguredBaseClient>

let cachedClient: BasePublicClient | null = null
let validationPromise: Promise<BasePublicClient> | null = null

export async function getBasePublicClient(): Promise<BasePublicClient> {
  const config = getServerBurnConfig()
  if (!config.enabled || !config.baseRpcUrl) {
    throw new Error('Web3 grave offerings are unavailable')
  }

  if (!cachedClient) {
    cachedClient = createConfiguredBaseClient(config.baseRpcUrl)
  }

  if (!validationPromise) {
    const client = cachedClient
    validationPromise = client.getChainId().then((chainId) => {
      assertBaseChainId(chainId)
      return client
    }).catch((error) => {
      cachedClient = null
      validationPromise = null
      throw error
    })
  }

  return validationPromise
}

export function __resetBaseClientForTests(): void {
  cachedClient = null
  validationPromise = null
}
