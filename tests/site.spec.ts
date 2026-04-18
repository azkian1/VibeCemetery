import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { POST as startCliLink } from '../src/app/api/cli/link/start/route'
import { getCliApprovalSiteUrl, getSiteUrl } from '../src/lib/site'

function setEnv(name: 'NODE_ENV' | 'NEXT_PUBLIC_SITE_URL', value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  Object.assign(process.env, { [name]: value })
}

const ORIGINAL_ENV = {
  nodeEnv: process.env.NODE_ENV,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
}

test.afterEach(() => {
  setEnv('NODE_ENV', ORIGINAL_ENV.nodeEnv)
  setEnv('NEXT_PUBLIC_SITE_URL', ORIGINAL_ENV.siteUrl)
})

test.describe('site url contract', () => {
  test('requires NEXT_PUBLIC_SITE_URL in production for CLI approval links', async () => {
    setEnv('NODE_ENV', 'production')
    setEnv('NEXT_PUBLIC_SITE_URL', undefined)

    expect(() => getCliApprovalSiteUrl()).toThrow('NEXT_PUBLIC_SITE_URL is required in production for CLI approval links')
  })

  test('keeps existing site fallback for general production reads', async () => {
    setEnv('NODE_ENV', 'production')
    setEnv('NEXT_PUBLIC_SITE_URL', undefined)

    expect(getSiteUrl()).toBe('https://vibecemetery.app')
  })

  test('keeps localhost fallback in development', async () => {
    setEnv('NODE_ENV', 'development')
    setEnv('NEXT_PUBLIC_SITE_URL', undefined)

    expect(getSiteUrl()).toBe('http://localhost:3000')
  })

  test('CLI link start fails closed before persistence when approval site url is missing in production', async () => {
    setEnv('NODE_ENV', 'production')
    setEnv('NEXT_PUBLIC_SITE_URL', undefined)

    const response = await startCliLink(new NextRequest('https://vibecemetery.app/api/cli/link/start', {
      method: 'POST',
    }))

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'CLI approval site URL is not configured' })
  })
})
