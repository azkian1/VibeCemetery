import { expect, test } from '@playwright/test'
import {
  __resetRateLimitStateForTests,
  checkRateLimit,
  getClientIp,
} from '../src/lib/rate-limit'
import { NextRequest } from 'next/server'

const ORIGINAL_ENV = {
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  trustProxyHeaders: process.env.TRUST_PROXY_HEADERS,
  vercel: process.env.VERCEL,
  playwrightE2E: process.env.PLAYWRIGHT_E2E,
}
const ORIGINAL_FETCH = globalThis.fetch

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

test.afterEach(() => {
  restoreEnv('UPSTASH_REDIS_REST_URL', ORIGINAL_ENV.url)
  restoreEnv('UPSTASH_REDIS_REST_TOKEN', ORIGINAL_ENV.token)
  restoreEnv('TRUST_PROXY_HEADERS', ORIGINAL_ENV.trustProxyHeaders)
  restoreEnv('VERCEL', ORIGINAL_ENV.vercel)
  restoreEnv('PLAYWRIGHT_E2E', ORIGINAL_ENV.playwrightE2E)
  if (ORIGINAL_FETCH) {
    globalThis.fetch = ORIGINAL_FETCH
  } else {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  }

  expect(process.env.UPSTASH_REDIS_REST_URL).toBe(ORIGINAL_ENV.url)
  expect(process.env.UPSTASH_REDIS_REST_TOKEN).toBe(ORIGINAL_ENV.token)
  expect(process.env.TRUST_PROXY_HEADERS).toBe(ORIGINAL_ENV.trustProxyHeaders)
  expect(process.env.VERCEL).toBe(ORIGINAL_ENV.vercel)
  expect(process.env.PLAYWRIGHT_E2E).toBe(ORIGINAL_ENV.playwrightE2E)
  expect(globalThis.fetch).toBe(ORIGINAL_FETCH)
  __resetRateLimitStateForTests()
})

test.describe('rate limiter', () => {
  test('falls back to in-memory limits when Redis env is absent', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    expect(await checkRateLimit('memory-key', 2, 60_000)).toEqual({ allowed: true })
    expect(await checkRateLimit('memory-key', 2, 60_000)).toEqual({ allowed: true })

    const blocked = await checkRateLimit('memory-key', 2, 60_000)
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0)
    }
  })

  test('uses one atomic Redis command per request and preserves fixed-window TTL', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com/'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    delete process.env.PLAYWRIGHT_E2E

    const commands: unknown[][] = []
    const responses = [[1, 60000], [2, 50000], [3, 42000], [4, 0], [1, 60000]]
    globalThis.fetch = (async (input, init) => {
      expect(input).toBe('https://redis.example.com')
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token')
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
      expect(init?.cache).toBe('no-store')
      commands.push(JSON.parse(String(init?.body)))
      return Response.json({ result: responses.shift() })
    }) as typeof fetch

    // Colons, slashes and Unicode must remain one key, not REST path segments.
    const key = 'read:2001:db8::1/тест'
    expect(await checkRateLimit(key, 2, 60_000)).toEqual({ allowed: true })
    expect(await checkRateLimit(key, 2, 60_000)).toEqual({ allowed: true })
    expect(await checkRateLimit(key, 2, 60_000)).toEqual({ allowed: false, retryAfterMs: 42000 })
    expect(await checkRateLimit(key, 2, 60_000)).toEqual({ allowed: false, retryAfterMs: 1 })
    expect(await checkRateLimit(key, 2, 60_000)).toEqual({ allowed: true })
    expect(commands).toHaveLength(5)
    for (const command of commands) {
      expect(command).toEqual(['EVAL', expect.any(String), 1, key, 60000])
    }
  })

  for (const failure of [
    'network', 'http', 'redis-error', 'missing-result', 'null',
    'invalid-count', 'negative-ttl', 'invalid-ttl',
  ]) {
    test(`falls back to a bounded memory window on ${failure}`, async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
      delete process.env.PLAYWRIGHT_E2E
      const originalError = console.error
      console.error = () => {}
      let calls = 0
      globalThis.fetch = (async () => {
        calls++
        switch (failure) {
          case 'network': throw new Error('Connection lost')
          case 'http': return new Response('Unavailable', { status: 503 })
          case 'redis-error': return Response.json({ error: 'ERR script failed' })
          case 'missing-result': return Response.json({})
          case 'null': return Response.json(null)
          case 'invalid-count': return Response.json({ result: ['1', 60000] })
          case 'negative-ttl': return Response.json({ result: [100, -1] })
          default: return Response.json({ result: [1, null] })
        }
      }) as typeof fetch
      try {
        expect(await checkRateLimit('fallback-key', 1, 60_000)).toEqual({ allowed: true })
        const blocked = await checkRateLimit('fallback-key', 1, 60_000)
        expect(blocked.allowed).toBe(false)
        if (!blocked.allowed) {
          expect(blocked.retryAfterMs).toBeGreaterThan(0)
          expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000)
        }
        // Do not retry a failed EVAL: it may have executed before the reply was lost.
        expect(calls).toBe(2)
      } finally {
        console.error = originalError
      }
    })
  }

  test('uses the in-memory limiter for explicit non-production Playwright E2E runs', async () => {
    process.env.PLAYWRIGHT_E2E = '1'
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

    let fetchCalled = false
    globalThis.fetch = (async () => {
      fetchCalled = true
      throw new Error('E2E must not contact Upstash')
    }) as typeof fetch

    expect(await checkRateLimit('e2e-memory-key', 1, 60_000)).toEqual({ allowed: true })
    expect((await checkRateLimit('e2e-memory-key', 1, 60_000)).allowed).toBe(false)
    expect(fetchCalled).toBe(false)
  })

  test('ignores spoofable forwarding headers unless proxy trust is explicitly enabled', () => {
    delete process.env.TRUST_PROXY_HEADERS

    const request = new NextRequest('https://vibecemetery.app/api/graves', {
      headers: {
        'cf-connecting-ip': '203.0.113.1',
        'x-real-ip': '203.0.113.2',
        'x-forwarded-for': '203.0.113.3, 203.0.113.4',
      },
    })

    expect(getClientIp(request)).toBe('0.0.0.0')
  })

  test('uses the original client from x-forwarded-for when proxy trust is explicitly enabled', () => {
    process.env.TRUST_PROXY_HEADERS = '1'

    const request = new NextRequest('https://vibecemetery.app/api/graves', {
      headers: {
        'x-forwarded-for': '203.0.113.3, 203.0.113.4',
      },
    })

    expect(getClientIp(request)).toBe('203.0.113.3')
  })

  test('uses the original client from Vercel-managed x-forwarded-for chains', () => {
    delete process.env.TRUST_PROXY_HEADERS
    process.env.VERCEL = '1'

    const request = new NextRequest('https://vibecemetery.app/api/graves', {
      headers: {
        'x-forwarded-for': '203.0.113.30, 198.51.100.2',
      },
    })

    expect(getClientIp(request)).toBe('203.0.113.30')
  })

  test('uses Vercel-managed x-forwarded-for without collapsing all users into one bucket', () => {
    delete process.env.TRUST_PROXY_HEADERS
    process.env.VERCEL = '1'

    const request = new NextRequest('https://vibecemetery.app/api/graves', {
      headers: {
        'x-forwarded-for': '203.0.113.30',
      },
    })

    expect(getClientIp(request)).toBe('203.0.113.30')
  })
})
