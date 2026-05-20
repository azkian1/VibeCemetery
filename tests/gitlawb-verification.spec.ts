import { expect, test } from '@playwright/test'
import {
  GITLAWB_TIMESTAMP_TOLERANCE_MS,
  verifyGitlawbHttpProof,
} from '../src/lib/gitlawb-verification'
import { AGENT_ASH_PROOF_TYPE, type AgentAshRequest } from '../src/lib/agent-ash-contract'

const request: AgentAshRequest = {
  certificate: {
    schema_version: 'agent_ash.v1',
    identity: { kind: 'ash', source: 'gitlawb' },
    subject: {
      name: 'dead-agent-prototype',
      repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
      path: 'azkian1/dead-agent-prototype',
    },
    lifecycle: {
      created_at: '2026-03-01T14:22:00Z',
      last_activity_at: '2026-03-05T09:15:00Z',
      declared_dead_at: '2026-03-06T12:11:00Z',
    },
    technical_profile: {},
    diagnosis: { primary_cause: 'external_api_break', summary: 'Dead before production.' },
    evidence: { signals: [] },
    value: {},
    agent: { name: 'hermes' },
  },
  proof: {
    type: AGENT_ASH_PROOF_TYPE,
    repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
    node_url: 'https://node.gitlawb.com',
    observed_created_at: '2026-03-01T14:22:00Z',
    observed_updated_at: '2026-03-05T09:15:00Z',
  },
}

const derivedRepoDid = 'did:gitlawb:34deff7b47100b8febd5c935bf152124'

function reposResponse(repos: unknown[], ok = true): Response {
  return new Response(JSON.stringify(repos), { status: ok ? 200 : 502 })
}

test.describe('GitLawb HTTP verification adapter', () => {
  test('verifies a public repo DID and timestamp proof from the node repo list', async () => {
    const fetches: string[] = []
    const result = await verifyGitlawbHttpProof(request, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async (url) => {
        fetches.push(String(url))
        return reposResponse([{
          repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
          path: 'azkian1/dead-agent-prototype',
          name: 'dead-agent-prototype',
          created_at: '2026-03-01T14:22:30Z',
          updated_at: '2026-03-05T09:14:30Z',
        }])
      },
    })

    expect(GITLAWB_TIMESTAMP_TOLERANCE_MS).toBe(5 * 60 * 1000)
    expect(fetches).toEqual(['https://node.gitlawb.com/api/v1/repos'])
    expect(result).toMatchObject({
      ok: true,
      status: 'gitlawb_http_verified',
      verificationUrl: 'https://node.gitlawb.com/repo/did%3Agitlawb%3Az6MkRepoDeadAgentPrototype',
    })
  })

  test('verifies GitLawb node v0.3.8 repos that expose owner_did and name but no repo_did', async () => {
    const derivedRequest: AgentAshRequest = {
      ...request,
      certificate: {
        ...request.certificate,
        subject: {
          name: 'hermes-test',
          repo_did: derivedRepoDid,
          path: 'hermes-test',
        },
        lifecycle: {
          ...request.certificate.lifecycle,
          created_at: '2026-06-01T00:00:00Z',
          last_activity_at: '2026-06-01T00:00:00Z',
        },
      },
      proof: {
        ...request.proof,
        repo_did: derivedRepoDid,
        observed_created_at: '2026-06-01T00:00:00Z',
        observed_updated_at: '2026-06-01T00:00:00Z',
      },
    }

    await expect(verifyGitlawbHttpProof(derivedRequest, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([{
        id: '35912a4c-d435-4f7f-a5d6-71abc39bed0e',
        owner_did: 'did:key:z6MkpqHermesOwner',
        name: 'hermes-test',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      }]),
    })).resolves.toMatchObject({
      ok: true,
      verificationUrl: `https://node.gitlawb.com/repo/${encodeURIComponent(derivedRepoDid)}`,
    })
  })

  test('rejects GitLawb node v0.3.8 UUID ids as repo DID proofs', async () => {
    const uuid = '35912a4c-d435-4f7f-a5d6-71abc39bed0e'
    const uuidRequest: AgentAshRequest = {
      ...request,
      certificate: {
        ...request.certificate,
        subject: {
          name: 'hermes-test',
          repo_did: uuid,
          path: 'hermes-test',
        },
        lifecycle: {
          ...request.certificate.lifecycle,
          created_at: '2026-06-01T00:00:00Z',
          last_activity_at: '2026-06-01T00:00:00Z',
        },
      },
      proof: {
        ...request.proof,
        repo_did: uuid,
        observed_created_at: '2026-06-01T00:00:00Z',
        observed_updated_at: '2026-06-01T00:00:00Z',
      },
    }

    await expect(verifyGitlawbHttpProof(uuidRequest, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([{
        id: uuid,
        owner_did: 'did:key:z6MkpqHermesOwner',
        name: 'hermes-test',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      }]),
    })).resolves.toMatchObject({ ok: false })
  })

  test('rejects raw UUID id-only repos as repo DID proofs', async () => {
    const uuid = '35912a4c-d435-4f7f-a5d6-71abc39bed0e'
    const uuidRequest: AgentAshRequest = {
      ...request,
      certificate: {
        ...request.certificate,
        subject: {
          name: 'hermes-test',
          repo_did: uuid,
          path: 'hermes-test',
        },
        lifecycle: {
          ...request.certificate.lifecycle,
          created_at: '2026-06-01T00:00:00Z',
          last_activity_at: '2026-06-01T00:00:00Z',
        },
      },
      proof: {
        ...request.proof,
        repo_did: uuid,
        observed_created_at: '2026-06-01T00:00:00Z',
        observed_updated_at: '2026-06-01T00:00:00Z',
      },
    }

    await expect(verifyGitlawbHttpProof(uuidRequest, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([{
        id: uuid,
        name: 'hermes-test',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      }]),
    })).resolves.toMatchObject({ ok: false })
  })

  test('rejects unsupported nodes before fetching', async () => {
    const result = await verifyGitlawbHttpProof({
      ...request,
      proof: { ...request.proof, node_url: 'https://evil.example' },
    }, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([]),
    })

    expect(result).toEqual({ ok: false, status: 'rejected', reason: 'Unsupported GitLawb node' })
  })

  test('rejects missing repos and timestamp mismatches', async () => {
    await expect(verifyGitlawbHttpProof(request, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([]),
    })).resolves.toEqual({ ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' })

    await expect(verifyGitlawbHttpProof(request, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([{
        repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
        path: 'azkian1/dead-agent-prototype',
        created_at: '2026-03-01T14:22:00Z',
        updated_at: '2026-03-05T10:15:00Z',
      }]),
    })).resolves.toEqual({ ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' })
  })

  test('rejects non-200 or invalid JSON node responses without throwing', async () => {
    await expect(verifyGitlawbHttpProof(request, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => new Response(null, { status: 204 }),
    })).resolves.toEqual({ ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' })

    await expect(verifyGitlawbHttpProof(request, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => new Response('not json', { status: 200 }),
    })).resolves.toEqual({ ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' })
  })

  test('uses a timeout signal and rejects oversized node responses', async () => {
    let sawAbortSignal = false
    await expect(verifyGitlawbHttpProof(request, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async (_url, init) => {
        sawAbortSignal = init?.signal instanceof AbortSignal
        return new Response(JSON.stringify({ repos: 'x'.repeat(300_000) }), { status: 200 })
      },
    })).resolves.toEqual({ ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' })

    expect(sawAbortSignal).toBe(true)
  })

  test('computes verification URL from the verified node instead of trusting proof input', async () => {
    const result = await verifyGitlawbHttpProof({
      ...request,
      proof: { ...request.proof, verification_url: 'https://evil.example/phishing' },
    }, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([{
        repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
        path: 'azkian1/dead-agent-prototype',
        created_at: '2026-03-01T14:22:00Z',
        updated_at: '2026-03-05T09:15:00Z',
      }]),
    })

    expect(result).toMatchObject({
      ok: true,
      verificationUrl: 'https://node.gitlawb.com/repo/did%3Agitlawb%3Az6MkRepoDeadAgentPrototype',
    })
  })

  test('does not reject verified DID and path when display name differs from the certificate slug', async () => {
    await expect(verifyGitlawbHttpProof(request, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([{
        repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
        path: 'azkian1/dead-agent-prototype',
        name: 'Dead Agent Prototype',
        created_at: '2026-03-01T14:22:00Z',
        updated_at: '2026-03-05T09:15:00Z',
      }]),
    })).resolves.toMatchObject({ ok: true })
  })

  test('rejects forged certificate names when subject path is omitted', async () => {
    await expect(verifyGitlawbHttpProof({
      ...request,
      certificate: {
        ...request.certificate,
        subject: {
          name: 'forged-project-name',
          repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
        },
      },
    }, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([{
        repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
        path: 'azkian1/dead-agent-prototype',
        name: 'Dead Agent Prototype',
        created_at: '2026-03-01T14:22:00Z',
        updated_at: '2026-03-05T09:15:00Z',
      }]),
    })).resolves.toEqual({ ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' })
  })

  test('rejects forged certificate names even when subject path matches', async () => {
    await expect(verifyGitlawbHttpProof({
      ...request,
      certificate: {
        ...request.certificate,
        subject: {
          name: 'forged-project-name',
          repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
          path: 'AZKIAN1/Dead-Agent-Prototype',
        },
      },
    }, {
      allowedNodeUrls: ['https://node.gitlawb.com'],
      fetchImpl: async () => reposResponse([{
        repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
        path: 'azkian1/dead-agent-prototype',
        name: 'Dead Agent Prototype',
        created_at: '2026-03-01T14:22:00Z',
        updated_at: '2026-03-05T09:15:00Z',
      }]),
    })).resolves.toEqual({ ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' })
  })
})
