import { expect, test } from '@playwright/test'
import {
  AGENT_ASH_SCOPE_WRITE,
  buildAgentAshRawToken,
  createAgentAshTokenRecord,
  handleAgentAshTokenRevoke,
  handleAgentAshTokensList,
  handleAgentAshLinkApprove,
  handleAgentAshLinkSession,
  handleAgentAshLinkStart,
  handleAgentAshLinkStatus,
  hashAgentAshClaimToken,
  hashAgentAshToken,
  type AgentAshAuthStore,
  type AgentAshLinkSession,
  type AgentAshTokenRecord,
} from '../src/lib/agent-ash-auth'

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function makeStore(): AgentAshAuthStore & {
  links: AgentAshLinkSession[]
  tokens: AgentAshTokenRecord[]
} {
  const links: AgentAshLinkSession[] = []
  const tokens: AgentAshTokenRecord[] = []

  return {
    links,
    tokens,
    async insertLinkSession(link) {
      links.push(link)
    },
    async getLinkSession(linkId) {
      return links.find((link) => link.id === linkId) ?? null
    },
    async updateLinkSession(linkId, updates) {
      const link = links.find((item) => item.id === linkId)
      if (!link) return false
      Object.assign(link, updates)
      return true
    },
    async approveLinkSession(linkId, updates) {
      const link = links.find((item) => item.id === linkId)
      if (!link || link.approved_at || link.denied_at || link.claimed_at) return false
      Object.assign(link, updates)
      return true
    },
    async claimLinkSession(linkId, claimedAt) {
      const link = links.find((item) => item.id === linkId)
      if (!link || link.claimed_at) return false
      link.claimed_at = claimedAt
      return true
    },
    async insertToken(token) {
      tokens.push(token)
    },
    async revokeToken(tokenId) {
      const token = tokens.find((item) => item.id === tokenId)
      if (!token || token.revoked_at) return false
      token.revoked_at = new Date().toISOString()
      return true
    },
    async listTokensForUser(username) {
      return tokens
        .filter((token) => token.created_by_user_id === username && !token.revoked_at)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
    },
    async revokeTokenForUser(tokenId, username) {
      const token = tokens.find((item) => item.id === tokenId && item.created_by_user_id === username)
      if (!token || token.revoked_at) return false
      token.revoked_at = new Date().toISOString()
      return true
    },
    async findTokenByHash(tokenHash) {
      return tokens.find((token) => token.token_hash === tokenHash && !token.revoked_at) ?? null
    },
    async markTokenUsed(tokenId) {
      const token = tokens.find((item) => item.id === tokenId)
      if (token) token.last_used_at = new Date().toISOString()
    },
  }
}

test.describe('Agent Ash auth v1', () => {
  test('creates ash-prefixed tokens and stores only hashes plus masked prefixes', () => {
    const rawToken = buildAgentAshRawToken({ tokenId: 'tok_123', secret: 'agent-secret' })
    const record = createAgentAshTokenRecord({ tokenId: 'tok_123', secret: 'agent-secret' })

    expect(rawToken).toBe(record.rawToken)
    expect(rawToken).toMatch(/^ash_[A-Za-z0-9._~-]{16,}$/)
    expect(record.tokenHash).toBe(hashAgentAshToken(rawToken))
    expect(record.tokenPrefix).toContain('...')
    expect(record.tokenHash).not.toContain(rawToken)
  })

  test('starts a browser-approved claim with agent metadata and a hashed claim token', async () => {
    const store = makeStore()
    const response = await handleAgentAshLinkStart(jsonRequest('http://localhost/api/agent-ash/link/start', {
      agent_name: 'hermes',
      agent_did: 'did:key:z6MkAgentHermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      public_key: 'optional-ed25519-public-key',
    }), {
      store,
      siteUrl: 'https://vibecemetery.app',
      now: Date.parse('2026-05-18T12:00:00.000Z'),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      link_id: expect.stringMatching(/^ashlink_[A-Za-z0-9_-]+$/),
      claim_token: expect.stringMatching(/^claim_[A-Za-z0-9_-]+$/),
      approve_url: expect.stringContaining('/agent-ash/connect?link_id=ashlink_'),
      expires_at: '2026-05-18T12:10:00.000Z',
    })
    expect(store.links).toHaveLength(1)
    expect(store.links[0]).toMatchObject({
      agent_name: 'hermes',
      agent_did: 'did:key:z6MkAgentHermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      public_key: 'optional-ed25519-public-key',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      expires_at: '2026-05-18T12:10:00.000Z',
    })
    expect(store.links[0].claim_token_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  test('rejects invalid link start metadata bounds', async () => {
    const cases = [
      { agent_name: 'hermes', agent_did: 'key:z6MkAgentHermes', gitlawb_node_url: 'https://node.gitlawb.com' },
      { agent_name: 'hermes', agent_did: `did:${'x'.repeat(253)}`, gitlawb_node_url: 'https://node.gitlawb.com' },
      { agent_name: 'hermes', gitlawb_node_url: `https://node.gitlawb.com/${'x'.repeat(2048)}` },
      { agent_name: 'hermes', gitlawb_node_url: 'https://node.gitlawb.com', public_key: 'x'.repeat(513) },
    ]

    for (const body of cases) {
      const store = makeStore()
      const response = await handleAgentAshLinkStart(jsonRequest('http://localhost/api/agent-ash/link/start', body), {
        store,
        siteUrl: 'https://vibecemetery.app',
      })

      expect(response.status).toBe(400)
      expect(store.links).toHaveLength(0)
    }
  })

  test('rejects approval decisions other than exact approve or deny', async () => {
    const store = makeStore()
    await store.insertLinkSession({
      id: 'ashlink_pendingrequest1',
      claim_token_hash: hashAgentAshClaimToken('claim_' + 'x'.repeat(43)),
      agent_name: 'hermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      created_at: '2026-05-18T12:00:00.000Z',
      expires_at: '2026-05-18T12:10:00.000Z',
    })

    const response = await handleAgentAshLinkApprove(jsonRequest('http://localhost/api/agent-ash/link/approve', {
      link_id: 'ashlink_pendingrequest1',
      decision: 'maybe',
    }), {
      store,
      username: 'azkian1',
      secret: 'agent-secret',
      now: Date.parse('2026-05-18T12:01:00.000Z'),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid decision' })
    expect(store.tokens).toHaveLength(0)
    expect(store.links[0].approved_at).toBeUndefined()
    expect(store.links[0].denied_at).toBeUndefined()
  })

  test('requires browser session approval before polling reveals an ash token exactly once', async () => {
    const store = makeStore()
    const start = await handleAgentAshLinkStart(jsonRequest('http://localhost/api/agent-ash/link/start', {
      agent_name: 'hermes',
      agent_did: 'did:key:z6MkAgentHermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
    }), { store, siteUrl: 'https://vibecemetery.app' })
    const claim = await start.json()

    const pending = await handleAgentAshLinkStatus(new Request(`http://localhost/api/agent-ash/link/status?link_id=${claim.link_id}`, {
      headers: { authorization: `Bearer ${claim.claim_token}` },
    }), { store })
    await expect(pending.json()).resolves.toEqual({ status: 'pending' })

    const approve = await handleAgentAshLinkApprove(jsonRequest('http://localhost/api/agent-ash/link/approve', {
      link_id: claim.link_id,
      decision: 'approve',
    }), {
      store,
      username: 'azkian1',
      secret: 'agent-secret',
    })
    expect(approve.status).toBe(200)
    expect(store.tokens).toHaveLength(1)
    expect(store.tokens[0]).toMatchObject({
      created_by_user_id: 'azkian1',
      agent_name: 'hermes',
      agent_did: 'did:key:z6MkAgentHermes',
      scopes: [AGENT_ASH_SCOPE_WRITE],
    })

    const approved = await handleAgentAshLinkStatus(new Request(`http://localhost/api/agent-ash/link/status?link_id=${claim.link_id}`, {
      headers: { authorization: `Bearer ${claim.claim_token}` },
    }), { store, secret: 'agent-secret', siteUrl: 'https://vibecemetery.app' })
    await expect(approved.json()).resolves.toMatchObject({
      status: 'approved',
      agent_ash_token: expect.stringMatching(/^ash_[A-Za-z0-9._~-]{16,}$/),
      scopes: [AGENT_ASH_SCOPE_WRITE],
      vc_url: 'https://vibecemetery.app',
      expires_at: null,
    })

    const claimed = await handleAgentAshLinkStatus(new Request(`http://localhost/api/agent-ash/link/status?link_id=${claim.link_id}`, {
      headers: { authorization: `Bearer ${claim.claim_token}` },
    }), { store, secret: 'agent-secret', now: Date.parse('2026-05-18T12:02:00.000Z') })
    await expect(claimed.json()).resolves.toEqual({ status: 'claimed' })
  })

  test('concurrent browser approvals mint only one Agent Ash token', async () => {
    const store = makeStore()
    const pendingLink: AgentAshLinkSession = {
      id: 'ashlink_concurrentapproval1',
      claim_token_hash: hashAgentAshClaimToken('claim_' + 'x'.repeat(43)),
      agent_name: 'hermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      created_at: '2026-05-18T12:00:00.000Z',
      expires_at: '2026-05-18T12:10:00.000Z',
    }
    await store.insertLinkSession(pendingLink)

    let staleReads = 0
    const originalGetLinkSession = store.getLinkSession.bind(store)
    store.getLinkSession = async (linkId) => {
      if (linkId === pendingLink.id && staleReads < 2) {
        staleReads += 1
        return structuredClone(pendingLink)
      }
      return originalGetLinkSession(linkId)
    }

    const first = handleAgentAshLinkApprove(jsonRequest('http://localhost/api/agent-ash/link/approve', {
      link_id: 'ashlink_concurrentapproval1',
      decision: 'approve',
    }), { store, username: 'azkian1', secret: 'agent-secret', now: Date.parse('2026-05-18T12:01:00.000Z') })
    const second = handleAgentAshLinkApprove(jsonRequest('http://localhost/api/agent-ash/link/approve', {
      link_id: 'ashlink_concurrentapproval1',
      decision: 'approve',
    }), { store, username: 'azkian1', secret: 'agent-secret', now: Date.parse('2026-05-18T12:01:00.000Z') })

    const responses = await Promise.all([first, second])

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(store.tokens).toHaveLength(1)
  })

  test('requires dedicated AGENT_ASH_TOKEN_SECRET instead of falling back to NEXTAUTH_SECRET', async () => {
    const store = makeStore()
    await store.insertLinkSession({
      id: 'ashlink_pendingsecret1',
      claim_token_hash: hashAgentAshClaimToken('claim_' + 'x'.repeat(43)),
      agent_name: 'hermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      created_at: '2026-05-18T12:00:00.000Z',
      expires_at: '2026-05-18T12:10:00.000Z',
    })

    const previousAgentAshSecret = process.env.AGENT_ASH_TOKEN_SECRET
    const previousNextAuthSecret = process.env.NEXTAUTH_SECRET
    delete process.env.AGENT_ASH_TOKEN_SECRET
    process.env.NEXTAUTH_SECRET = 'nextauth-secret-must-not-be-used'

    try {
      await expect(handleAgentAshLinkApprove(jsonRequest('http://localhost/api/agent-ash/link/approve', {
        link_id: 'ashlink_pendingsecret1',
        decision: 'approve',
      }), {
        store,
        username: 'azkian1',
        now: Date.parse('2026-05-18T12:01:00.000Z'),
      })).rejects.toThrow('Missing AGENT_ASH_TOKEN_SECRET')
      expect(store.tokens).toHaveLength(0)
    } finally {
      if (previousAgentAshSecret === undefined) delete process.env.AGENT_ASH_TOKEN_SECRET
      else process.env.AGENT_ASH_TOKEN_SECRET = previousAgentAshSecret
      if (previousNextAuthSecret === undefined) delete process.env.NEXTAUTH_SECRET
      else process.env.NEXTAUTH_SECRET = previousNextAuthSecret
    }
  })

  test('returns claimed without revealing a token when atomic claim update is stale', async () => {
    const store = makeStore()
    const claimToken = 'claim_' + 'x'.repeat(43)
    await store.insertLinkSession({
      id: 'ashlink_approvedrequest1',
      claim_token_hash: hashAgentAshClaimToken(claimToken),
      agent_name: 'hermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      created_at: '2026-05-18T12:00:00.000Z',
      expires_at: '2026-05-18T12:10:00.000Z',
      approved_at: '2026-05-18T12:01:00.000Z',
      token_id: 'tok_123',
    })
    store.claimLinkSession = async () => false

    const response = await handleAgentAshLinkStatus(new Request('http://localhost/api/agent-ash/link/status?link_id=ashlink_approvedrequest1', {
      headers: { authorization: `Bearer ${claimToken}` },
    }), { store, secret: 'agent-secret', now: Date.parse('2026-05-18T12:02:00.000Z') })

    await expect(response.json()).resolves.toEqual({ status: 'claimed' })
  })

  test('returns public-safe browser approval metadata without exposing tokens', async () => {
    const store = makeStore()
    const claimToken = 'claim_' + 'x'.repeat(43)
    await store.insertLinkSession({
      id: 'ashlink_metadata1234',
      claim_token_hash: hashAgentAshClaimToken(claimToken),
      agent_name: 'hermes',
      agent_did: 'did:key:z6MkAgentHermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      created_at: '2026-05-18T11:00:00.000Z',
      expires_at: '2026-05-18T11:10:00.000Z',
    })

    const response = await handleAgentAshLinkSession(
      new Request('http://localhost/api/agent-ash/link/session?link_id=ashlink_metadata1234'),
      { store, now: Date.parse('2026-05-18T11:05:00.000Z') },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = await response.json()
    expect(body).toEqual({
      status: 'pending',
      agent_name: 'hermes',
      agent_did: 'did:key:z6MkAgentHermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      expires_at: '2026-05-18T11:10:00.000Z',
    })
    expect(JSON.stringify(body)).not.toContain(claimToken)
    expect(body).not.toHaveProperty('claim_token')
    expect(body).not.toHaveProperty('agent_ash_token')
  })

  test('denies or expires claims without issuing an ash token', async () => {
    const store = makeStore()
    const claimToken = 'claim_' + 'x'.repeat(43)
    await store.insertLinkSession({
      id: 'ashlink_deadrequest1',
      claim_token_hash: hashAgentAshClaimToken(claimToken),
      agent_name: 'hermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      created_at: '2026-05-18T11:00:00.000Z',
      expires_at: '2026-05-18T11:10:00.000Z',
    })

    const expired = await handleAgentAshLinkStatus(new Request('http://localhost/api/agent-ash/link/status?link_id=ashlink_deadrequest1', {
      headers: { authorization: `Bearer ${claimToken}` },
    }), { store, now: Date.parse('2026-05-18T12:00:00.000Z') })
    await expect(expired.json()).resolves.toEqual({ status: 'expired' })
    expect(store.tokens).toHaveLength(0)
  })

  test('lists only current browser user Agent Ash tokens without hashes', async () => {
    const store = makeStore()
    await store.insertToken({
      id: 'token-owned-new',
      token_hash: 'secret-hash-new',
      token_prefix: 'ash_new...',
      agent_name: 'hermes',
      agent_did: 'did:key:z6MkAgentHermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      created_by_user_id: 'azkian1',
      created_at: '2026-05-18T12:00:00.000Z',
    })
    await store.insertToken({
      id: 'token-other-user',
      token_hash: 'secret-hash-other',
      token_prefix: 'ash_other...',
      agent_name: 'openclaw',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      created_by_user_id: 'someone-else',
      created_at: '2026-05-18T12:01:00.000Z',
    })

    const response = await handleAgentAshTokensList({ store, username: 'azkian1' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      tokens: [{
        id: 'token-owned-new',
        token_prefix: 'ash_new...',
        agent_name: 'hermes',
        agent_did: 'did:key:z6MkAgentHermes',
        gitlawb_node_url: 'https://node.gitlawb.com',
        scopes: [AGENT_ASH_SCOPE_WRITE],
        created_at: '2026-05-18T12:00:00.000Z',
        last_used_at: null,
      }],
    })
  })

  test('revokes only current browser user Agent Ash token', async () => {
    const store = makeStore()
    await store.insertToken({
      id: 'token-owned',
      token_hash: 'secret-hash-owned',
      token_prefix: 'ash_owned...',
      agent_name: 'hermes',
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: [AGENT_ASH_SCOPE_WRITE],
      created_by_user_id: 'azkian1',
      created_at: '2026-05-18T12:00:00.000Z',
    })

    const missing = await handleAgentAshTokenRevoke(jsonRequest('http://localhost/api/agent-ash/token/revoke', {
      token_id: 'token-owned',
    }), { store, username: 'someone-else' })
    expect(missing.status).toBe(404)

    const revoked = await handleAgentAshTokenRevoke(jsonRequest('http://localhost/api/agent-ash/token/revoke', {
      token_id: 'token-owned',
    }), { store, username: 'azkian1' })
    expect(revoked.status).toBe(200)
    await expect(revoked.json()).resolves.toEqual({ ok: true })
    expect(store.tokens[0].revoked_at).toBeTruthy()
  })
})
