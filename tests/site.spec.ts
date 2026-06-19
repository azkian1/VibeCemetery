import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import robots from '../src/app/robots'
import { POST as startCliLink } from '../src/app/api/cli/link/start/route'
import { POST as approveAgentAshLink } from '../src/app/api/agent-ash/link/approve/route'
import { GET as statusAgentAshLink } from '../src/app/api/agent-ash/link/status/route'
import { POST as startAgentAshLink } from '../src/app/api/agent-ash/link/start/route'
import { POST as postAgentAsh } from '../src/app/api/agent-ashes/route'
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

  test('robots disallows API and paused Agent Layer direct routes', () => {
    const config = robots()
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules

    expect(rules.disallow).toEqual(['/api/', '/agents', '/agent-ash/'])
  })

  test('Agent Ash link start is server-side paused', async () => {
    const response = await startAgentAshLink(new NextRequest('https://vibecemetery.app/api/agent-ash/link/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: 'hermes',
        agent_did: 'did:key:z6MkAgentHermes',
        gitlawb_node_url: 'https://node.gitlawb.com',
      }),
    }))

    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Agent Layer is paused' })
  })

  test('Agent Ash link approve is server-side paused before browser auth', async () => {
    const response = await approveAgentAshLink(new NextRequest('https://vibecemetery.app/api/agent-ash/link/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        link_id: 'ashlink_pausedrequest1',
        decision: 'approve',
      }),
    }))

    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Agent Layer is paused' })
  })

  test('Agent Ash link status is server-side paused before token reveal', async () => {
    const response = await statusAgentAshLink(new NextRequest('https://vibecemetery.app/api/agent-ash/link/status?link_id=ashlink_pausedrequest1', {
      headers: { authorization: `Bearer claim_${'x'.repeat(43)}` },
    }))

    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Agent Layer is paused' })
  })

  test('Agent Ash ingest POST is server-side paused before token auth', async () => {
    const response = await postAgentAsh(new NextRequest('https://vibecemetery.app/api/agent-ashes', {
      method: 'POST',
    }))

    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Agent Layer is paused' })
  })
})
