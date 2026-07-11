import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import {
  CREMATED_MAX_BODY_BYTES,
  CREMATED_WRITE_RATE_LIMIT,
  POST as postCremated,
  checkCrematedWriteRateLimit,
  crematedWriteRateLimitResponse,
  readCrematedJsonWithLimit,
} from '../src/app/api/cremated/route'
import { __resetRateLimitStateForTests } from '../src/lib/rate-limit'

test.beforeEach(() => {
  __resetRateLimitStateForTests()
})

test.afterEach(() => {
  __resetRateLimitStateForTests()
})

function streamRequest(body: Uint8Array, contentLength: string): Request {
  return new Request('http://localhost/api/cremated', {
    method: 'POST',
    headers: { 'content-length': contentLength },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body)
        controller.close()
      },
    }),
    duplex: 'half',
  } as RequestInit)
}

test.describe('cremated POST hardening', () => {
  test('fast-rejects a declared oversized body at the route without consuming it', async () => {
    const request = new NextRequest('http://localhost/api/cremated', {
      method: 'POST',
      headers: { 'content-length': String(CREMATED_MAX_BODY_BYTES + 1) },
      body: '{}',
    })

    const response = await postCremated(request)

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ error: 'Request body too large' })
    await expect(request.text()).resolves.toBe('{}')
  })

  test('caps a stream when Content-Length is absent or forged', async () => {
    const oversizedPayload = new TextEncoder().encode('x'.repeat(CREMATED_MAX_BODY_BYTES + 1))

    await expect(readCrematedJsonWithLimit(streamRequest(oversizedPayload, '2'))).resolves.toEqual({
      ok: false,
      status: 413,
      error: 'Request body too large',
    })
  })

  test('orders the pre-auth limiter and authentication before bounded JSON parsing', () => {
    const source = readFileSync('src/app/api/cremated/route.ts', 'utf8')
    const post = source.slice(source.indexOf('export async function POST'))

    expect(post.indexOf('checkCrematedWriteRateLimit(request)')).toBeGreaterThan(-1)
    expect(post.indexOf('const actor = await resolveCliActor(request)')).toBeGreaterThan(-1)
    expect(post.indexOf('const bodyResult = await readCrematedJsonWithLimit(request)')).toBeGreaterThan(-1)
    expect(post.indexOf('checkCrematedWriteRateLimit(request)')).toBeLessThan(post.indexOf('const actor = await resolveCliActor(request)'))
    expect(post.indexOf('const actor = await resolveCliActor(request)')).toBeLessThan(post.indexOf('const bodyResult = await readCrematedJsonWithLimit(request)'))
  })

  test('rate-limits pre-auth write attempts and returns Retry-After', async () => {
    const request = new NextRequest('http://localhost/api/cremated', { method: 'POST' })

    for (let attempt = 0; attempt < CREMATED_WRITE_RATE_LIMIT; attempt += 1) {
      await expect(checkCrematedWriteRateLimit(request)).resolves.toEqual({ allowed: true })
    }

    const blocked = await checkCrematedWriteRateLimit(request)

    expect(blocked.allowed).toBe(false)
    if (blocked.allowed) return

    const response = crematedWriteRateLimitResponse(blocked.retryAfterMs)
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    await expect(response.json()).resolves.toEqual({
      error: 'Too many cremation attempts. Please try again later.',
    })
  })
})
