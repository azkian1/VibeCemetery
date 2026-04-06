import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { proxy } from '../src/proxy'

const ORIGINAL_ENV = {
  nextAuthUrl: process.env.NEXTAUTH_URL,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
}

test.afterEach(() => {
  process.env.NEXTAUTH_URL = ORIGINAL_ENV.nextAuthUrl
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_ENV.siteUrl
})

test.describe('api proxy', () => {
  test('accepts preflight requests from canonical site origin', async () => {
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vibecemetery.com'

    const request = new NextRequest('http://localhost:3000/api/cli/link/status?link_id=test', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://vibecemetery.com',
      },
    })

    const response = await proxy(request)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://vibecemetery.com')
  })
})
