import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import {
  assertExactKeys,
  assertSameOrigin,
  BurnHttpError,
  readStrictJsonObject,
} from '../src/lib/web3/http'
import { createAuthorizeBurnIntentHandler } from '../src/app/api/graves/[id]/burn-intents/[intentId]/authorize/authorize-handler'
import { createSubmitBurnHandler } from '../src/app/api/graves/[id]/burns/submit-handler'
import type { GraveBurnIntentRecord } from '../src/lib/web3/burnIntent'

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('https://vibecemetery.com/api/graves/id/burns', {
    method: 'POST',
    headers: {
      origin: 'https://vibecemetery.com',
      'content-type': 'application/json',
      ...headers,
    },
    body,
  })
}

const graveId = '22222222-2222-4222-8222-222222222222'
const intentId = '11111111-1111-4111-8111-111111111111'
const wallet = '0x1111111111111111111111111111111111111111'
const signature = `0x${'34'.repeat(65)}`
const txHash = `0x${'ab'.repeat(32)}`

test('write body parser enforces same origin, JSON and exact fields', async () => {
  const req = request(JSON.stringify({ intentId: 'id', txHash: 'hash' }))
  expect(() => assertSameOrigin(req)).not.toThrow()
  const body = await readStrictJsonObject(req)
  expect(() => assertExactKeys(body, ['intentId', 'txHash'])).not.toThrow()
  expect(() => assertExactKeys(body, ['intentId'])).toThrow(BurnHttpError)
})

test('cross-origin and oversized write requests are rejected', async () => {
  expect(() => assertSameOrigin(request('{}', { origin: 'https://evil.example' })))
    .toThrow(BurnHttpError)

  await expect(readStrictJsonObject(request(JSON.stringify({
    payload: 'x'.repeat(5_000),
  })))).rejects.toMatchObject({ status: 413 })
})

test('non-JSON content type is rejected', async () => {
  await expect(readStrictJsonObject(request('{}', {
    'content-type': 'text/plain',
  }))).rejects.toMatchObject({ status: 415 })
})

test('authorize applies the IP limit before an intent lookup', async () => {
  const calls: string[] = []
  const handler = createAuthorizeBurnIntentHandler({
    isAvailable: () => true,
    rateLimitIp: async () => {
      calls.push('ip')
      throw new BurnHttpError(429, 'limited')
    },
    getStoredIntent: async () => {
      calls.push('lookup')
      return null
    },
    rateLimitWallet: async () => {
      calls.push('wallet')
    },
    getServiceDependencies: async () => {
      throw new Error('service must not run')
    },
    getGithubUsername: async () => null,
  })

  const response = await handler(
    request(JSON.stringify({ signature })),
    { params: Promise.resolve({ id: graveId, intentId }) },
  )
  expect(response.status).toBe(429)
  expect(calls).toEqual(['ip'])
})

test('authorize applies the wallet limit only after a safe lookup', async () => {
  const calls: string[] = []
  const handler = createAuthorizeBurnIntentHandler({
    isAvailable: () => true,
    rateLimitIp: async () => {
      calls.push('ip')
    },
    getStoredIntent: async () => {
      calls.push('lookup')
      return { walletAddress: wallet } as unknown as GraveBurnIntentRecord
    },
    rateLimitWallet: async () => {
      calls.push('wallet')
      throw new BurnHttpError(429, 'limited')
    },
    getServiceDependencies: async () => {
      throw new Error('service must not run')
    },
    getGithubUsername: async () => null,
  })

  const response = await handler(
    request(JSON.stringify({ signature })),
    { params: Promise.resolve({ id: graveId, intentId }) },
  )
  expect(response.status).toBe(429)
  expect(calls).toEqual(['ip', 'lookup', 'wallet'])
})

test('submit applies the IP limit before an intent lookup', async () => {
  const calls: string[] = []
  const handler = createSubmitBurnHandler({
    isAvailable: () => true,
    rateLimitIp: async () => {
      calls.push('ip')
      throw new BurnHttpError(429, 'limited')
    },
    getStoredIntent: async () => {
      calls.push('lookup')
      return null
    },
    rateLimitWallet: async () => {
      calls.push('wallet')
    },
    getServiceDependencies: async () => {
      throw new Error('service must not run')
    },
  })

  const response = await handler(
    request(JSON.stringify({ intentId, txHash })),
    { params: Promise.resolve({ id: graveId }) },
  )
  expect(response.status).toBe(429)
  expect(calls).toEqual(['ip'])
})
