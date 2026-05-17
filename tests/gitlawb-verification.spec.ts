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
