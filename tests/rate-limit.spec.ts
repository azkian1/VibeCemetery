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
}

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
  delete (globalThis as { fetch?: typeof fetch }).fetch
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

  test('uses Redis-backed fixed window when Upstash env is configured', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

    const calls: Array<{ url: string; body?: string }> = []
    let incrCount = 0

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined })

      if (url.endsWith('/incr/test-key')) {
        incrCount += 1
        return new Response(JSON.stringify({ result: incrCount }), { status: 200 })
      }

      if (url.endsWith('/pexpire/test-key/60000')) {
        return new Response(JSON.stringify({ result: 1 }), { status: 200 })
      }

      if (url.endsWith('/pttl/test-key')) {
        return new Response(JSON.stringify({ result: 42000 }), { status: 200 })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    }) as typeof fetch

    expect(await checkRateLimit('test-key', 2, 60_000)).toEqual({ allowed: true })
    expect(await checkRateLimit('test-key', 2, 60_000)).toEqual({ allowed: true })
    const blocked = await checkRateLimit('test-key', 2, 60_000)
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBe(42000)
    }

    expect(calls[0]?.url).toContain('/incr/test-key')
    expect(calls.some((call) => call.url.endsWith('/pexpire/test-key/60000'))).toBe(true)
    expect(calls.some((call) => call.url.endsWith('/pttl/test-key'))).toBe(true)
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
