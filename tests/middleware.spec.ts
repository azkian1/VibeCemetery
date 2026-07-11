import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { proxy } from '../src/proxy'
import { __resetRateLimitStateForTests } from '@/lib/rate-limit'

const ORIGINAL_ENV = {
  nextAuthUrl: process.env.NEXTAUTH_URL,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  playwrightE2E: process.env.PLAYWRIGHT_E2E,
  nodeEnv: process.env.NODE_ENV,
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

test.afterEach(() => {
  restoreEnv('NEXTAUTH_URL', ORIGINAL_ENV.nextAuthUrl)
  restoreEnv('NEXT_PUBLIC_SITE_URL', ORIGINAL_ENV.siteUrl)
  restoreEnv('UPSTASH_REDIS_REST_URL', ORIGINAL_ENV.upstashUrl)
  restoreEnv('UPSTASH_REDIS_REST_TOKEN', ORIGINAL_ENV.upstashToken)
  restoreEnv('PLAYWRIGHT_E2E', ORIGINAL_ENV.playwrightE2E)
  restoreEnv('NODE_ENV', ORIGINAL_ENV.nodeEnv)
  __resetRateLimitStateForTests()
})

test.beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  __resetRateLimitStateForTests()
})

test.describe('api proxy', () => {
  test('accepts preflight requests from canonical site origin', async () => {
    process.env.NEXTAUTH_URL = 'https://vibecemetery.app'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vibecemetery.app'

    const request = new NextRequest('https://vibecemetery.app/api/cli/link/status?link_id=test', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://vibecemetery.app',
      },
    })

    const response = await proxy(request)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://vibecemetery.app')
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  test('marks origin-dependent CORS responses as varying by origin', async () => {
    process.env.NEXTAUTH_URL = 'https://vibecemetery.app'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vibecemetery.app'

    const response = await proxy(new NextRequest('https://vibecemetery.app/api/graves', {
      method: 'GET',
      headers: {
        origin: 'https://vibecemetery.app',
      },
    }))

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://vibecemetery.app')
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  test('marks no-origin GET responses as varying by origin for cache safety', async () => {
    process.env.NEXTAUTH_URL = 'https://vibecemetery.app'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vibecemetery.app'

    const response = await proxy(new NextRequest('https://vibecemetery.app/api/graves', {
      method: 'GET',
    }))

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  test('marks rejected preflight responses as varying by origin', async () => {
    process.env.NEXTAUTH_URL = 'https://vibecemetery.app'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vibecemetery.app'

    const response = await proxy(new NextRequest('https://vibecemetery.app/api/graves', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
      },
    }))

    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  test('marks disallowed-origin GET responses as varying by origin without allowing CORS', async () => {
    process.env.NEXTAUTH_URL = 'https://vibecemetery.app'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vibecemetery.app'

    const response = await proxy(new NextRequest('https://vibecemetery.app/api/graves', {
      method: 'GET',
      headers: {
        origin: 'https://evil.example',
      },
    }))

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  test('keeps CORS headers on rate-limited allowed-origin reads', async () => {
    process.env.NEXTAUTH_URL = 'https://vibecemetery.app'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vibecemetery.app'

    let response: Awaited<ReturnType<typeof proxy>> | null = null
    for (let i = 0; i < 61; i += 1) {
      response = await proxy(new NextRequest('https://vibecemetery.app/api/graves', {
        method: 'GET',
        headers: {
          origin: 'https://vibecemetery.app',
        },
      }))
    }

    expect(response?.status).toBe(429)
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('https://vibecemetery.app')
    expect(response?.headers.get('Vary')).toBe('Origin')
  })

  test('keeps Vary without CORS allow header on rate-limited disallowed-origin reads', async () => {
    process.env.NEXTAUTH_URL = 'https://vibecemetery.app'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vibecemetery.app'

    let response: Awaited<ReturnType<typeof proxy>> | null = null
    for (let i = 0; i < 61; i += 1) {
      response = await proxy(new NextRequest('https://vibecemetery.app/api/graves', {
        method: 'GET',
        headers: {
          origin: 'https://evil.example',
        },
      }))
    }

    expect(response?.status).toBe(429)
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response?.headers.get('Vary')).toBe('Origin')
  })

  test('does not rate limit auth session requests', async () => {
    process.env.NEXTAUTH_URL = 'https://vibecemetery.app'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vibecemetery.app'

    for (let i = 0; i < 61; i += 1) {
      const authSession = await proxy(new NextRequest('https://vibecemetery.app/api/auth/session', {
        method: 'GET',
      }))

      expect(authSession.status).not.toBe(429)
    }
  })

  test('bypasses the shared read budget only for explicit local Playwright E2E requests', async () => {
    Object.assign(process.env, { PLAYWRIGHT_E2E: '1', NODE_ENV: 'test' })

    let response: Awaited<ReturnType<typeof proxy>> | null = null
    for (let i = 0; i < 61; i += 1) {
      response = await proxy(new NextRequest('http://localhost:3000/api/graves', {
        method: 'GET',
      }))
    }

    expect(response?.status).toBe(200)
  })

  test('keeps the read budget for non-local or production requests even when the E2E flag is set', async () => {
    Object.assign(process.env, { PLAYWRIGHT_E2E: '1', NODE_ENV: 'production' })

    let response: Awaited<ReturnType<typeof proxy>> | null = null
    for (let i = 0; i < 61; i += 1) {
      response = await proxy(new NextRequest('http://localhost:3000/api/graves', {
        method: 'GET',
      }))
    }

    expect(response?.status).toBe(429)
  })
})
