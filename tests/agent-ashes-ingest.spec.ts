import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  buildAgentAshInsertRow,
  computeCertificateHash,
  handleAgentAshPost,
  stableJsonStringify,
  type AgentAshStore,
} from '../src/app/api/agent-ashes/route'
import { AGENT_ASH_PROOF_TYPE, type AgentAshRequest } from '../src/lib/agent-ash-contract'

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

function makeRequest(body: unknown = validRequest, token = 'ash_test_secret_123456'): Request {
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
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
    })
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('cache-control')).toBe('no-store')

    const invalid = await handleAgentAshPost(makeRequest({ certificate: {} }), {
      store: makeStore(),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'proof is required' })

    const invalidToken = await handleAgentAshPost(makeRequest(validRequest, 'ash_wrong_secret_123456'), {
      store: makeStore(),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
    })
    expect(invalidToken.status).toBe(401)
  })

  test('rejects missing repo DIDs and unsupported proof types before verification', async () => {
    const missingRepoDid = structuredClone(validRequest)
    delete (missingRepoDid.certificate.subject as { repo_did?: string }).repo_did
    const missingRepoResponse = await handleAgentAshPost(makeRequest(missingRepoDid), {
      store: makeStore(),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
    })
    expect(missingRepoResponse.status).toBe(400)
    await expect(missingRepoResponse.json()).resolves.toEqual({ error: 'certificate.subject.repo_did is required' })

    const unsupportedProof = structuredClone(validRequest)
    unsupportedProof.proof.type = 'gitlawb_signature_v1' as never
    const unsupportedProofResponse = await handleAgentAshPost(makeRequest(unsupportedProof), {
      store: makeStore(),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
    })
    expect(unsupportedProofResponse.status).toBe(400)
    await expect(unsupportedProofResponse.json()).resolves.toEqual({ error: 'proof.type must be gitlawb_http_node_v1' })
  })

  test('returns 422 when GitLawb HTTP verification fails', async () => {
    const response = await handleAgentAshPost(makeRequest(), {
      store: makeStore(),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
      verify: async () => ({ ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }),
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'Cannot verify GitLawb HTTP node proof' })
  })

  test('integrates rate-limit and proof security errors', async () => {
    const limited = await handleAgentAshPost(makeRequest(), {
      store: makeStore(),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
      rateLimit: async () => ({ allowed: false, retryAfterMs: 2000 }),
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('2')

    const unsupportedNode = await handleAgentAshPost(makeRequest({
      ...validRequest,
      proof: { ...validRequest.proof, node_url: 'https://evil.example' },
    }), {
      store: makeStore(),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
    })
    expect(unsupportedNode.status).toBe(403)
  })

  test('rejects duplicates and repo death conflicts before inserting', async () => {
    const duplicate = await handleAgentAshPost(makeRequest(), {
      store: makeStore({ async findByCertificateHash() { return { id: 'existing' } } }),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
      verify: async () => ({ ok: true, status: 'gitlawb_http_verified', verificationUrl: 'https://node.gitlawb.com/repo/x', matchedRepo: {} }),
    })
    expect(duplicate.status).toBe(409)

    const conflict = await handleAgentAshPost(makeRequest(), {
      store: makeStore({ async findConflict() { return { id: 'existing-conflict' } } }),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
      verify: async () => ({ ok: true, status: 'gitlawb_http_verified', verificationUrl: 'https://node.gitlawb.com/repo/x', matchedRepo: {} }),
    })
    expect(conflict.status).toBe(409)
  })

  test('maps insert-time unique violations to 409 for concurrent duplicates', async () => {
    const uniqueViolation = new Error('duplicate key') as Error & { code: string }
    uniqueViolation.code = '23505'

    const response = await handleAgentAshPost(makeRequest(), {
      store: makeStore({ async insert() { throw uniqueViolation } }),
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
      verify: async () => ({ ok: true, status: 'gitlawb_http_verified', verificationUrl: 'https://node.gitlawb.com/repo/x', matchedRepo: {} }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Agent Ash record already exists' })
  })

  test('stores verified Ash and returns stable response metadata', async () => {
    const store = makeStore()
    const response = await handleAgentAshPost(makeRequest(), {
      store,
      config: { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] },
      verify: async () => ({ ok: true, status: 'gitlawb_http_verified', verificationUrl: 'https://node.gitlawb.com/repo/x', matchedRepo: {} }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      id: 'ash-row-id',
      certificate_hash: computeCertificateHash(validRequest.certificate),
      url: 'http://localhost:3000/api/agent-ashes/ash-row-id',
      certificate_url: 'http://localhost:3000/api/agent-ashes/ash-row-id/certificate',
    })
    expect(store.inserted).toHaveLength(1)
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
