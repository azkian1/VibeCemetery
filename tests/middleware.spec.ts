import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { proxy } from '../src/proxy'
import { __resetRateLimitStateForTests } from '@/lib/rate-limit'

const ORIGINAL_ENV = {
  nextAuthUrl: process.env.NEXTAUTH_URL,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
}

test.afterEach(() => {
  process.env.NEXTAUTH_URL = ORIGINAL_ENV.nextAuthUrl
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_ENV.siteUrl
  __resetRateLimitStateForTests()
})

test.beforeEach(() => {
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
})
