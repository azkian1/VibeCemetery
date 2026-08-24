import { expect, test } from '@playwright/test'
import { encodeFunctionResult, multicall3Abi } from 'viem'

const graveId = '22222222-2222-4222-8222-222222222222'
const intentId = '11111111-1111-4111-8111-111111111111'
const wallet = '0x1111111111111111111111111111111111111111'
const txHash = `0x${'ab'.repeat(32)}`
const signature = `0x${'34'.repeat(65)}`
const amountRaw = (1000n * 10n ** 18n).toString()
const walletBalanceRaw = (1_000_000n * 10n ** 18n).toString()
const encodedWalletBalance = `0x${BigInt(walletBalanceRaw).toString(16).padStart(64, '0')}` as const
const encodedMulticallBalance = encodeFunctionResult({
  abi: multicall3Abi,
  functionName: 'aggregate3',
  result: [{ success: true, returnData: encodedWalletBalance }],
})

test('injected wallet completes a stubbed verified Map v1 burn offering', async ({ page }) => {
  await page.addInitScript(({ walletAddress, hash, signed, balanceResult }) => {
    let chainId = '0x1'
    let connected = false
    const listeners = new Map<string, Set<(value: unknown) => void>>()
    const emit = (event: string, value: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(value)
    }
    const ethereum = {
      isMetaMask: true,
      on(event: string, listener: (value: unknown) => void) {
        const eventListeners = listeners.get(event) ?? new Set()
        eventListeners.add(listener)
        listeners.set(event, eventListeners)
      },
      removeListener(event: string, listener: (value: unknown) => void) {
        listeners.get(event)?.delete(listener)
      },
      async request({ method }: { method: string; params?: unknown[] }) {
        if (method === 'eth_accounts') return connected ? [walletAddress] : []
        if (method === 'eth_requestAccounts') {
          connected = true
          emit('accountsChanged', [walletAddress])
          return [walletAddress]
        }
        if (method === 'eth_chainId') return chainId
        if (method === 'net_version') return String(Number.parseInt(chainId, 16))
        if (method === 'wallet_switchEthereumChain') {
          chainId = '0x2105'
          emit('chainChanged', chainId)
          return null
        }
        if (method === 'eth_signTypedData_v4') return signed
        if (method === 'eth_call') return balanceResult
        if (method === 'eth_sendTransaction') return hash
        if (method === 'eth_estimateGas') return '0x186a0'
        if (method === 'wallet_getCapabilities') return {}
        if (method === 'eth_getCode') return '0x'
        if (method === 'eth_blockNumber') return '0x1'
        throw new Error(`Unexpected wallet method: ${method}`)
      },
    }
    Object.defineProperty(window, 'ethereum', {
      value: ethereum,
      configurable: true,
    })
  }, {
    walletAddress: wallet,
    hash: txHash,
    signed: signature,
    balanceResult: encodedMulticallBalance,
  })

  let verified = false
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (url.pathname === '/api/graves' && request.method() === 'GET') {
      return json([{
        id: graveId,
        slot_id: 15,
        grave_gid: null,
        map_version: 'v1',
        name: 'Stubbed Grave',
        cause: 'Test fixture',
        epitaph: 'No token value crossed this test.',
        github_url: 'https://github.com/example/stubbed-grave',
        author_github: 'example',
        f_count: 0,
        born_at: null,
        died_at: null,
        last_commit_message: 'test: browser ritual',
      }])
    }
    if (url.pathname === '/api/cremated') return json([])
    if (url.pathname === '/api/f-status') return json({ grave_ids: [] })

    if (url.pathname === `/api/graves/${graveId}/burn-intents` && request.method() === 'POST') {
      return json({
        intentId,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        typedData: {
          domain: {
            name: 'VibeCemetery Grave Offering',
            version: '1',
            chainId: 8453,
            verifyingContract: '0xb48bc4896D18724F7bF5A3d2817fC35252cD7bA3',
          },
          types: {
            GraveBurnIntent: [
              { name: 'intentId', type: 'string' },
              { name: 'nonce', type: 'string' },
              { name: 'graveId', type: 'string' },
              { name: 'wallet', type: 'address' },
              { name: 'expectedRawAmount', type: 'uint256' },
              { name: 'chainId', type: 'uint256' },
              { name: 'tokenAddress', type: 'address' },
              { name: 'burnAddress', type: 'address' },
              { name: 'expiresAt', type: 'uint256' },
            ],
          },
          primaryType: 'GraveBurnIntent',
          message: {
            intentId,
            nonce: `0x${'12'.repeat(32)}`,
            graveId,
            wallet,
            expectedRawAmount: amountRaw,
            chainId: '8453',
            tokenAddress: '0xb48bc4896D18724F7bF5A3d2817fC35252cD7bA3',
            burnAddress: '0x000000000000000000000000000000000000dEaD',
            expiresAt: String(Math.floor(Date.now() / 1000) + 600),
          },
        },
      }, 201)
    }
    if (
      url.pathname === `/api/graves/${graveId}/burn-intents/${intentId}/authorize`
      && request.method() === 'POST'
    ) {
      return json({ status: 'authorized', intentId })
    }
    if (url.pathname === `/api/graves/${graveId}/burns` && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ intentId, txHash })
      verified = true
      return json({
        status: 'verified',
        bound: true,
        retryable: false,
        explorerUrl: `https://basescan.org/tx/${txHash}`,
      })
    }
    if (url.pathname === `/api/graves/${graveId}/burns` && request.method() === 'GET') {
      return json({
        totalBurnedRaw: verified ? amountRaw : '0',
        totalBurnedDisplay: verified ? '1000' : '0',
        burnCount: verified ? 1 : 0,
        topMourners: verified ? [{
          walletAddress: wallet,
          displayName: '0x1111…1111',
          githubUsername: null,
          amountRaw,
          amountDisplay: '1000',
          source: 'wallet',
        }] : [],
      })
    }
    return json({})
  })

  await page.goto(`/cemetery?grave=${graveId}`)
  await expect(page.getByText('0 GRAVE BURNED', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeHidden()
  await page.getByRole('button', { name: 'Expand burn controls' }).click()
  await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible()
  await page.getByRole('button', { name: 'Connect wallet' }).click()
  await expect(page.getByRole('button', { name: 'Switch to Base' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to Base' }).click()
  const preset = page.getByRole('button', { name: 'Offer 1,000 GRAVE' })
  const maximum = page.getByRole('button', { name: /Offer maximum/ })
  await expect(preset).toHaveAttribute('aria-pressed', 'true')
  await expect(maximum).toBeEnabled({ timeout: 3_000 })
  await maximum.click()
  await expect(maximum).toHaveAttribute('aria-pressed', 'true')
  await expect(preset).toHaveAttribute('aria-pressed', 'false')
  await preset.click()
  await expect(page.getByRole('button', { name: 'BURN $GRAVE' })).toBeEnabled()
  await page.getByRole('button', { name: 'BURN $GRAVE' }).click()
  await expect(page.getByText('Ritual accepted')).toBeVisible()
  await expect(page.getByText('1000 GRAVE BURNED', { exact: true })).toBeVisible()
})
