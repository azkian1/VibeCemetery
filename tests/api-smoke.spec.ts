import { test, expect } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { createClient } from '@supabase/supabase-js'

function getNextAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for authenticated API smoke tests')
  }
  return secret
}

function getRequiredEnv(name: 'NEXTAUTH_SECRET' | 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SERVICE_KEY'): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for API smoke tests`)
  }
  return value
}

function useSecureCookies() {
  return (process.env.NEXTAUTH_URL ?? '').startsWith('https://') || process.env.VERCEL === '1'
}

function getSessionCookieName() {
  return `${useSecureCookies() ? '__Secure-' : ''}next-auth.session-token`
}

async function createAuthHeaders(
  username: string,
): Promise<Record<string, string>> {
  const token = await encode({
    secret: getNextAuthSecret(),
    token: {
      sub: username,
      name: username,
      github_username: username,
    },
  })
  const sessionCookieName = getSessionCookieName()

  return {
    cookie: `${sessionCookieName}=${token}`,
  }
}

const supabaseAdmin = createClient(
  getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnv('SUPABASE_SERVICE_KEY'),
)

async function createSmokeGrave() {
  const timestamp = Date.now()
  const slotId = 900000 + Math.floor(Math.random() * 10000)
  const repoId = 900000000 + Math.floor(Math.random() * 1000000)

  const { data, error } = await supabaseAdmin
    .from('graves')
    .insert({
      name: `API Smoke Grave ${timestamp}`,
      cause: 'integration smoke',
      epitaph: 'Temporary grave for API smoke coverage.',
      github_url: `https://github.com/api-smoke/grave-${timestamp}`,
      github_repo_id: repoId,
      author_github: 'api-smoke',
      slot_id: slotId,
      f_count: 0,
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error(`Failed to create smoke grave: ${error?.message ?? 'unknown error'}`)
  }

  return { id: data.id }
}

async function deleteSmokeGrave(graveId: string) {
  await supabaseAdmin.from('f_votes').delete().eq('grave_id', graveId)
  await supabaseAdmin.from('graves').delete().eq('id', graveId)
}

test.describe.serial('API smoke', () => {
  test('GET /api/graves returns a bounded list', async ({ request }) => {
    const res = await request.get('/api/graves?limit=1')

    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeLessThanOrEqual(1)
  })

  test('GET /api/f-status returns empty votes for unauthenticated requests', async ({ request }) => {
    const res = await request.get('/api/f-status')

    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ myVotes: [] })
  })

  test('POST /api/graves rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post('/api/graves', {
      data: {
        github_url: 'https://github.com/example/repo',
        github_repo_id: 1,
        name: 'repo',
        cause: 'dead',
      },
    })

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  test('POST /api/graves rejects malformed JSON for authenticated requests', async ({ playwright }) => {
    const headers = await createAuthHeaders(`api-smoke-json-${Date.now()}`)
    const rawRequest = await playwright.request.newContext({
      baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000',
      extraHTTPHeaders: { ...headers, 'content-type': 'application/json' },
    })

    try {
      const res = await rawRequest.fetch('/api/graves', {
        method: 'POST',
        data: Buffer.from('{'),
      })

      expect(res.status()).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
    } finally {
      await rawRequest.dispose()
    }
  })

  test('POST /api/graves validates GitHub repository URLs', async ({ request }) => {
    const headers = await createAuthHeaders(`api-smoke-url-${Date.now()}`)
    const res = await request.post('/api/graves', {
      headers,
      data: {
        github_url: 'https://example.com/not-github',
        github_repo_id: 42,
        name: 'bad repo',
        cause: 'bad link',
      },
    })

    expect(res.status()).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid github_url — must be a GitHub repository URL' })
  })

  test('GET /api/github/scan requires username when authenticated', async ({ request }) => {
    const headers = await createAuthHeaders(`api-smoke-scan-${Date.now()}`)
    const res = await request.get('/api/github/scan', { headers })

    expect(res.status()).toBe(400)
    expect(await res.json()).toEqual({ error: 'Missing required query parameter: username' })
  })

  test('GET /api/github/scan only allows scanning your own GitHub account', async ({ request }) => {
    const headers = await createAuthHeaders(`api-smoke-owner-${Date.now()}`)
    const res = await request.get('/api/github/scan?username=someone-else', { headers })

    expect(res.status()).toBe(403)
    expect(await res.json()).toEqual({ error: 'You can only scan your own GitHub' })
  })

  test('POST /api/graves/[id]/f rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post('/api/graves/not-a-uuid/f')

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  test('POST /api/graves/[id]/f validates grave id format', async ({ request }) => {
    const headers = await createAuthHeaders(`api-smoke-f-${Date.now()}`)
    const res = await request.post('/api/graves/not-a-uuid/f', { headers })

    expect(res.status()).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid grave id' })
  })

  test('POST /api/graves/[id]/f is idempotent and visible in /api/f-status', async ({ request }) => {
    const headers = await createAuthHeaders(`api-smoke-voter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    const grave = await createSmokeGrave()

    try {
      const firstVote = await request.post(`/api/graves/${grave.id}/f`, { headers })
      expect(firstVote.status()).toBe(200)
      const firstVoteBody = await firstVote.json()
      expect(typeof firstVoteBody.f_count).toBe('number')

      const secondVote = await request.post(`/api/graves/${grave.id}/f`, { headers })
      expect(secondVote.status()).toBe(409)
      const secondVoteBody = await secondVote.json()
      expect(secondVoteBody).toEqual({ f_count: firstVoteBody.f_count })

      const statusRes = await request.get('/api/f-status', { headers })
      expect(statusRes.status()).toBe(200)
      const statusBody = await statusRes.json()
      expect(statusBody.myVotes).toContain(grave.id)
    } finally {
      await deleteSmokeGrave(grave.id)
    }
  })
})
