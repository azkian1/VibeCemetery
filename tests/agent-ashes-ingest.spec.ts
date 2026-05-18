import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  AGENT_ASH_WRITE_VERIFICATION_POLICY,
  buildAgentAshInsertRow,
  computeCertificateHash,
  handleAgentAshPost,
  stableJsonStringify,
  type AgentAshStore,
} from '../src/app/api/agent-ashes/route'
import { AGENT_ASH_PROOF_TYPE, type AgentAshRequest } from '../src/lib/agent-ash-contract'
import {
  AGENT_ASH_SCOPE_WRITE,
  buildAgentAshRawToken,
  hashAgentAshToken,
  type AgentAshAuthStore,
  type AgentAshTokenRecord,
} from '../src/lib/agent-ash-auth'

const validRequest: AgentAshRequest = {
  certificate: {
    schema_version: 'agent_ash.v1',
    identity: { kind: 'ash', source: 'gitlawb' },
    subject: {
      name: 'dead-agent-prototype',
      repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
      path: 'azkian1/dead-agent-prototype',
      url: 'gitlawb://did:gitlawb:z6MkRepoDeadAgentPrototype',
    },
    lifecycle: {
      created_at: '2026-03-01T14:22:00Z',
      last_activity_at: '2026-03-05T09:15:00Z',
      declared_dead_at: '2026-03-06T12:11:00Z',
      death_stage: 'prototype',
    },
    technical_profile: {},
    diagnosis: {
      primary_cause: 'external_api_break',
      failure_pattern: 'external_api_changed_before_project_reached_production',
      confidence: 0.82,
      summary: 'Dead before production.',
    },
    evidence: { signals: [] },
    value: {},
    agent: { name: 'hermes', did: 'did:key:z6MkAgentHermes' },
  },
  proof: {
    type: AGENT_ASH_PROOF_TYPE,
    repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
    node_url: 'https://node.gitlawb.com',
    observed_created_at: '2026-03-01T14:22:00Z',
    observed_updated_at: '2026-03-05T09:15:00Z',
  },
}

function makeRequest(body: unknown = validRequest, token = buildAgentAshRawToken({ tokenId: 'ash-token-id', secret: 'agent-secret' })): Request {
  return new Request('http://localhost/api/agent-ashes', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

function makeStore(overrides: Partial<AgentAshStore> = {}): AgentAshStore & { inserted: unknown[] } {
  const inserted: unknown[] = []
  return {
    inserted,
    async findByCertificateHash() { return null },
    async findConflict() { return null },
    async insert(row) {
      inserted.push(row)
      return { id: 'ash-row-id' }
    },
    ...overrides,
  }
}

function makeAuthStore(tokens: AgentAshTokenRecord[]): Pick<AgentAshAuthStore, 'findTokenByHash' | 'markTokenUsed'> & { used: string[] } {
  const used: string[] = []
  return {
    used,
    async findTokenByHash(tokenHash) {
      return tokens.find((token) => token.token_hash === tokenHash && !token.revoked_at) ?? null
    },
    async markTokenUsed(tokenId) {
      used.push(tokenId)
    },
  }
}

function makeTokenRecord(overrides: Partial<AgentAshTokenRecord> = {}) {
  const id = overrides.id ?? 'ash-token-id'
  const rawToken = buildAgentAshRawToken({ tokenId: id, secret: 'agent-secret' })
  const record: AgentAshTokenRecord = {
    id,
    token_hash: hashAgentAshToken(rawToken),
    token_prefix: `${rawToken.slice(0, 18)}...`,
    agent_name: 'hermes',
    agent_did: 'did:key:z6MkAgentHermes',
    gitlawb_node_url: 'https://node.gitlawb.com',
    scopes: [AGENT_ASH_SCOPE_WRITE],
    created_by_user_id: 'azkian1',
    created_at: '2026-05-18T12:00:00.000Z',
    ...overrides,
  }
  return { rawToken, record }
}

function makeAuthDependencies() {
  const { record } = makeTokenRecord()
  return {
    authStore: makeAuthStore([record]),
    allowedNodeUrls: ['https://node.gitlawb.com'],
  }
}

test.describe('Agent Ash ingest API handler', () => {
  test('canonicalizes certificate JSON and computes stable hashes', () => {
    expect(stableJsonStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
    expect(stableJsonStringify({ a: 1, b: 2 })).toBe(stableJsonStringify({ b: 2, a: 1 }))
    expect(computeCertificateHash({ b: 2, a: 1 })).toMatch(/^[a-f0-9]{64}$/)
  })

  test('maps an accepted certificate into an agent_ashes insert row', () => {
    const row = buildAgentAshInsertRow(validRequest, 'hash123', 'https://node.gitlawb.com/repo/x')

    expect(row).toMatchObject({
      certificate_hash: 'hash123',
      schema_version: 'agent_ash.v1',
      source: 'gitlawb',
      repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
      agent_did: 'did:key:z6MkAgentHermes',
      agent_name: 'hermes',
      subject_name: 'dead-agent-prototype',
      primary_cause: 'external_api_break',
      failure_pattern: 'external_api_changed_before_project_reached_production',
      death_stage: 'prototype',
      confidence: 0.82,
      verification_status: 'gitlawb_http_verified',
      verification_url: 'https://node.gitlawb.com/repo/x',
      certificate: validRequest.certificate,
      proof: validRequest.proof,
    })
  })

  test('rejects unauthorized and invalid Agent Ash requests with no-store headers', async () => {
    const unauthorized = await handleAgentAshPost(new Request('http://localhost/api/agent-ashes', { method: 'POST' }), {
      store: makeStore(),
      ...makeAuthDependencies(),
    })
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('cache-control')).toBe('no-store')

    const invalid = await handleAgentAshPost(makeRequest({ certificate: {} }), {
      store: makeStore(),
      ...makeAuthDependencies(),
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'proof is required' })

    const invalidToken = await handleAgentAshPost(makeRequest(validRequest, 'ash_wrong_secret_123456'), {
      store: makeStore(),
      ...makeAuthDependencies(),
    })
    expect(invalidToken.status).toBe(401)
  })

  test('rejects missing repo DIDs and unsupported proof types before verification', async () => {
    const missingRepoDid = structuredClone(validRequest)
    delete (missingRepoDid.certificate.subject as { repo_did?: string }).repo_did
    const missingRepoResponse = await handleAgentAshPost(makeRequest(missingRepoDid), {
      store: makeStore(),
      ...makeAuthDependencies(),
    })
    expect(missingRepoResponse.status).toBe(400)
    await expect(missingRepoResponse.json()).resolves.toEqual({ error: 'certificate.subject.repo_did is required' })

    const unsupportedProof = structuredClone(validRequest)
    unsupportedProof.proof.type = 'gitlawb_signature_v1' as never
    const unsupportedProofResponse = await handleAgentAshPost(makeRequest(unsupportedProof), {
      store: makeStore(),
      ...makeAuthDependencies(),
    })
    expect(unsupportedProofResponse.status).toBe(400)
    await expect(unsupportedProofResponse.json()).resolves.toEqual({ error: 'proof.type must be gitlawb_http_node_v1' })
  })

  test('returns 422 when GitLawb HTTP verification fails', async () => {
    const response = await handleAgentAshPost(makeRequest(), {
      store: makeStore(),
      ...makeAuthDependencies(),
      verify: async () => ({ ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }),
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'Cannot verify GitLawb HTTP node proof' })
  })

  test('integrates rate-limit and proof security errors', async () => {
    const limited = await handleAgentAshPost(makeRequest(), {
      store: makeStore(),
      ...makeAuthDependencies(),
      rateLimit: async () => ({ allowed: false, retryAfterMs: 2000 }),
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('2')

    const unsupportedNode = await handleAgentAshPost(makeRequest({
      ...validRequest,
      proof: { ...validRequest.proof, node_url: 'https://evil.example' },
    }), {
      store: makeStore(),
      ...makeAuthDependencies(),
    })
    expect(unsupportedNode.status).toBe(403)
  })

  test('rejects duplicates and repo death conflicts before inserting', async () => {
    const duplicate = await handleAgentAshPost(makeRequest(), {
      store: makeStore({ async findByCertificateHash() { return { id: 'existing' } } }),
      ...makeAuthDependencies(),
      verify: async () => ({ ok: true, status: 'gitlawb_http_verified', verificationUrl: 'https://node.gitlawb.com/repo/x', matchedRepo: {} }),
    })
    expect(duplicate.status).toBe(409)

    const conflict = await handleAgentAshPost(makeRequest(), {
      store: makeStore({ async findConflict() { return { id: 'existing-conflict' } } }),
      ...makeAuthDependencies(),
      verify: async () => ({ ok: true, status: 'gitlawb_http_verified', verificationUrl: 'https://node.gitlawb.com/repo/x', matchedRepo: {} }),
    })
    expect(conflict.status).toBe(409)
  })

  test('maps insert-time unique violations to 409 for concurrent duplicates', async () => {
    const uniqueViolation = new Error('duplicate key') as Error & { code: string }
    uniqueViolation.code = '23505'

    const response = await handleAgentAshPost(makeRequest(), {
      store: makeStore({ async insert() { throw uniqueViolation } }),
      ...makeAuthDependencies(),
      verify: async () => ({ ok: true, status: 'gitlawb_http_verified', verificationUrl: 'https://node.gitlawb.com/repo/x', matchedRepo: {} }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Agent Ash record already exists' })
  })

  test('stores verified Ash and returns stable response metadata', async () => {
    const store = makeStore()
    const calls: string[] = []
    const response = await handleAgentAshPost(makeRequest(), {
      store,
      ...makeAuthDependencies(),
      verify: async () => {
        calls.push('verify')
        return { ok: true, status: 'gitlawb_http_verified', verificationUrl: 'https://node.gitlawb.com/repo/x', matchedRepo: {} }
      },
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      id: 'ash-row-id',
      certificate_hash: computeCertificateHash(validRequest.certificate),
      verification_policy: AGENT_ASH_WRITE_VERIFICATION_POLICY,
      url: 'http://localhost:3000/api/agent-ashes/ash-row-id',
      certificate_url: 'http://localhost:3000/api/agent-ashes/ash-row-id/certificate',
    })
    expect(store.inserted).toHaveLength(1)
    expect(calls).toEqual(['verify'])
  })

  test('production authStore token authorizes ingest and inserts token attribution', async () => {
    const { rawToken, record } = makeTokenRecord()
    const authStore = makeAuthStore([record])
    const store = makeStore()

    const response = await handleAgentAshPost(makeRequest(validRequest, rawToken), {
      store,
      authStore,
      allowedNodeUrls: ['https://node.gitlawb.com'],
      rateLimit: async () => ({ allowed: true, retryAfterMs: 0 }),
      verify: async () => ({ ok: true, status: 'gitlawb_http_verified', verificationUrl: 'https://node.gitlawb.com/repo/x', matchedRepo: {} }),
    })

    expect(response.status).toBe(201)
    expect(authStore.used).toEqual(['ash-token-id'])
    expect(store.inserted[0]).toMatchObject({
      agent_ash_token_id: 'ash-token-id',
      authorized_agent_name: 'hermes',
      authorized_agent_did: 'did:key:z6MkAgentHermes',
      authorized_by_user_id: 'azkian1',
    })
  })

  test('production authStore rejects revoked, missing-scope, and vc_cli tokens', async () => {
    const active = makeTokenRecord()
    const revoked = makeTokenRecord({ id: 'revoked-token-id', revoked_at: '2026-05-18T12:30:00.000Z' })
    const noScope = makeTokenRecord({ id: 'no-scope-token-id', scopes: [] })

    const revokedResponse = await handleAgentAshPost(makeRequest(validRequest, revoked.rawToken), {
      store: makeStore(),
      authStore: makeAuthStore([revoked.record]),
    })
    expect(revokedResponse.status).toBe(401)

    const noScopeResponse = await handleAgentAshPost(makeRequest(validRequest, noScope.rawToken), {
      store: makeStore(),
      authStore: makeAuthStore([noScope.record]),
    })
    expect(noScopeResponse.status).toBe(401)

    const cliTokenResponse = await handleAgentAshPost(makeRequest(validRequest, 'vc_cli_' + 'x'.repeat(40)), {
      store: makeStore(),
      authStore: makeAuthStore([active.record]),
    })
    expect(cliTokenResponse.status).toBe(401)
  })

  test('production authStore rejects certificate agent metadata mismatches', async () => {
    const { rawToken, record } = makeTokenRecord()

    const nameMismatch = structuredClone(validRequest)
    nameMismatch.certificate.agent.name = 'openclaw'
    const nameResponse = await handleAgentAshPost(makeRequest(nameMismatch, rawToken), {
      store: makeStore(),
      authStore: makeAuthStore([record]),
      allowedNodeUrls: ['https://node.gitlawb.com'],
      rateLimit: async () => ({ allowed: true, retryAfterMs: 0 }),
    })
    expect(nameResponse.status).toBe(403)
    await expect(nameResponse.json()).resolves.toEqual({ error: 'Agent Ash token does not match certificate agent' })

    const didMismatch = structuredClone(validRequest)
    didMismatch.certificate.agent.did = 'did:key:z6MkOtherAgent'
    const didResponse = await handleAgentAshPost(makeRequest(didMismatch, rawToken), {
      store: makeStore(),
      authStore: makeAuthStore([record]),
      allowedNodeUrls: ['https://node.gitlawb.com'],
      rateLimit: async () => ({ allowed: true, retryAfterMs: 0 }),
    })
    expect(didResponse.status).toBe(403)
    await expect(didResponse.json()).resolves.toEqual({ error: 'Agent Ash token does not match certificate agent' })
  })

  test('ingest route does not import or write human-layer tables or progression RPCs', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'agent-ashes', 'route.ts'), 'utf8')

    expect(source).not.toContain("from '@/lib/cli-auth'")
    expect(source).not.toContain("from('users')")
    expect(source).not.toContain("from('graves')")
    expect(source).not.toContain("from('cremated')")
    expect(source).not.toContain('increment_cremated_count')
    expect(source).not.toContain('insert_grave_if_user_slot_available')
  })
})
