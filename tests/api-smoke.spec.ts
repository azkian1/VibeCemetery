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

function shouldUseSecureCookies() {
  return (process.env.NEXTAUTH_URL ?? '').startsWith('https://') || process.env.VERCEL === '1'
}

function getSessionCookieName() {
  return `${shouldUseSecureCookies() ? '__Secure-' : ''}next-auth.session-token`
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

async function createSmokeUser(username: string) {
  const { error } = await supabaseAdmin
    .from('users')
    .upsert({
      github_id: 800000000 + Math.floor(Math.random() * 1000000),
      github_username: username,
      avatar_url: `https://avatars.githubusercontent.com/${username}`,
    }, { onConflict: 'github_id' })

  if (error) {
    throw new Error(`Failed to create smoke user: ${error.message}`)
  }
}

async function deleteSmokeCliData(username: string) {
  await supabaseAdmin.from('cremated').delete().eq('author_github', username)
  await supabaseAdmin.from('cli_link_sessions').delete().eq('github_username', username)
  await supabaseAdmin.from('cli_tokens').delete().eq('github_username', username)
  await supabaseAdmin.from('users').delete().eq('github_username', username)
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

  test('CLI link flow issues one-time token and revoke disables later CLI auth', async ({ request }) => {
    const username = `api-smoke-cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await createSmokeUser(username)
    const sessionHeaders = await createAuthHeaders(username)

    try {
      const startRes = await request.post('/api/cli/link/start')
      expect(startRes.status()).toBe(200)
      expect(startRes.headers()['cache-control']).toBe('no-store')
      const startBody = await startRes.json()
      expect(typeof startBody.link_id).toBe('string')
      expect(typeof startBody.approve_url).toBe('string')
      expect(typeof startBody.claim_token).toBe('string')
      expect(startBody.claim_token.length).toBeGreaterThan(20)
      expect(startBody.approve_url).toContain(`/cli/connect?link_id=${startBody.link_id}#claim_token=`)

      const pendingRes = await request.get(`/api/cli/link/status?link_id=${startBody.link_id}`)
      expect(pendingRes.status()).toBe(401)
      expect(pendingRes.headers()['cache-control']).toBe('no-store')
      expect(await pendingRes.json()).toEqual({ error: 'Invalid claim token' })

      const wrongClaimRes = await request.get(`/api/cli/link/status?link_id=${startBody.link_id}`, {
        headers: { 'x-cli-claim-token': `${startBody.claim_token.slice(0, -1)}x` },
      })
      expect(wrongClaimRes.status()).toBe(401)
      expect(wrongClaimRes.headers()['cache-control']).toBe('no-store')
      expect(await wrongClaimRes.json()).toEqual({ error: 'Invalid claim token' })

      const pendingWithClaimRes = await request.get(`/api/cli/link/status?link_id=${startBody.link_id}`, {
        headers: { 'x-cli-claim-token': startBody.claim_token },
      })
      expect(pendingWithClaimRes.status()).toBe(200)
      expect(pendingWithClaimRes.headers()['cache-control']).toBe('no-store')
      expect(await pendingWithClaimRes.json()).toEqual({ status: 'pending' })

      const approveRes = await request.post('/api/cli/link/approve', {
        headers: sessionHeaders,
        data: { link_id: startBody.link_id, claim_token: startBody.claim_token },
      })
      expect(approveRes.status()).toBe(200)
      expect(approveRes.headers()['cache-control']).toBe('no-store')
      expect(await approveRes.json()).toEqual({ status: 'approved' })

      const claimRes = await request.get(`/api/cli/link/status?link_id=${startBody.link_id}`, {
        headers: { 'x-cli-claim-token': startBody.claim_token },
      })
      expect(claimRes.status()).toBe(200)
      expect(claimRes.headers()['cache-control']).toBe('no-store')
      const claimBody = await claimRes.json()
      expect(claimBody.status).toBe('approved')
      expect(claimBody.github_username).toBe(username)
      expect(typeof claimBody.cli_token).toBe('string')

      const claimedRes = await request.get(`/api/cli/link/status?link_id=${startBody.link_id}`, {
        headers: { 'x-cli-claim-token': startBody.claim_token },
      })
      expect(claimedRes.status()).toBe(200)
      expect(await claimedRes.json()).toEqual({ status: 'claimed', github_username: username })

      const cremationRes = await request.post('/api/cremated', {
        headers: { authorization: `Bearer ${claimBody.cli_token}` },
        data: {
          name: `CLI Smoke ${Date.now()}`,
          cause: 'CLI token smoke test',
        },
      })
      expect(cremationRes.status()).toBe(201)
      const cremationBody = await cremationRes.json()
      expect(cremationBody.author_github).toBe(username)
      expect(cremationBody.source).toBe('skill')

      const tokensRes = await request.get('/api/cli/tokens', { headers: sessionHeaders })
      expect(tokensRes.status()).toBe(200)
      expect(tokensRes.headers()['cache-control']).toBe('no-store')
      const tokensBody = await tokensRes.json()
      expect(Array.isArray(tokensBody.tokens)).toBe(true)
      expect(tokensBody.tokens).toHaveLength(1)

      const revokeRes = await request.post('/api/cli/token/revoke', {
        headers: sessionHeaders,
        data: { token_id: tokensBody.tokens[0].id },
      })
      expect(revokeRes.status()).toBe(200)
      expect(revokeRes.headers()['cache-control']).toBe('no-store')
      expect(await revokeRes.json()).toEqual({ ok: true })

      const deniedRes = await request.post('/api/cremated', {
        headers: { authorization: `Bearer ${claimBody.cli_token}` },
        data: {
          name: `CLI Smoke Denied ${Date.now()}`,
          cause: 'revoked token should fail',
        },
      })
      expect(deniedRes.status()).toBe(401)
      expect(await deniedRes.json()).toEqual({ error: 'Unauthorized' })
    } finally {
      await deleteSmokeCliData(username)
    }
  })

  test('CLI link approve requires claim-token proof of possession', async ({ request }) => {
    const username = `api-smoke-cli-proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await createSmokeUser(username)
    const sessionHeaders = await createAuthHeaders(username)

    try {
      const startRes = await request.post('/api/cli/link/start')
      expect(startRes.status()).toBe(200)
      const startBody = await startRes.json()

      const missingProofRes = await request.post('/api/cli/link/approve', {
        headers: sessionHeaders,
        data: { link_id: startBody.link_id },
      })
      expect(missingProofRes.status()).toBe(401)
      expect(missingProofRes.headers()['cache-control']).toBe('no-store')
      expect(await missingProofRes.json()).toEqual({ error: 'Invalid claim token' })
    } finally {
      await deleteSmokeCliData(username)
    }
  })

  test('CLI link approve rejects a different live claim token', async ({ request }) => {
    const username = `api-smoke-cli-wrong-proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await createSmokeUser(username)
    const sessionHeaders = await createAuthHeaders(username)

    try {
      const firstStartRes = await request.post('/api/cli/link/start')
      expect(firstStartRes.status()).toBe(200)
      const firstStartBody = await firstStartRes.json()

      const secondStartRes = await request.post('/api/cli/link/start')
      expect(secondStartRes.status()).toBe(200)
      const secondStartBody = await secondStartRes.json()

      const wrongProofRes = await request.post('/api/cli/link/approve', {
        headers: sessionHeaders,
        data: {
          link_id: firstStartBody.link_id,
          claim_token: secondStartBody.claim_token,
        },
      })

      expect(wrongProofRes.status()).toBe(401)
      expect(wrongProofRes.headers()['cache-control']).toBe('no-store')
      expect(await wrongProofRes.json()).toEqual({ error: 'Invalid claim token' })
    } finally {
      await deleteSmokeCliData(username)
    }
  })

  test('POST /api/cremated still works for authenticated browser sessions', async ({ request }) => {
    const username = `api-smoke-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await createSmokeUser(username)
    const sessionHeaders = await createAuthHeaders(username)

    try {
      const res = await request.post('/api/cremated', {
        headers: sessionHeaders,
        data: {
          name: `Session Smoke ${Date.now()}`,
          cause: 'browser session smoke test',
        },
      })

      expect(res.status()).toBe(201)
      const body = await res.json()
      expect(body.author_github).toBe(username)
      expect(body.source).toBe('github')
    } finally {
      await deleteSmokeCliData(username)
    }
  })

  test('POST /api/cremated rejects HTML-only values that sanitize to empty', async ({ request }) => {
    const username = `api-smoke-sanitize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await createSmokeUser(username)
    const sessionHeaders = await createAuthHeaders(username)

    try {
      const res = await request.post('/api/cremated', {
        headers: sessionHeaders,
        data: {
          name: '<b>   </b>',
          cause: '<i> </i>',
        },
      })

      expect(res.status()).toBe(400)
      expect(await res.json()).toEqual({ error: 'name and cause are required' })
    } finally {
      await deleteSmokeCliData(username)
    }
  })

  test('POST /api/cremated ignores body-based identity without session or CLI token', async ({ request }) => {
    const res = await request.post('/api/cremated', {
      data: {
        name: 'Body Auth Funeral',
        cause: 'Security audit regression test',
        author_github: 'spoofed-user',
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

  test('GET /api/github/last-commit rejects unauthenticated requests', async ({ request }) => {
    const res = await request.get('/api/github/last-commit?owner=vercel&repo=next.js')

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
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
