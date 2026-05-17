import { expect, test } from '@playwright/test'
import {
  AGENT_ASH_SCHEMA_VERSION,
  validateAgentAshRequest,
} from '../src/lib/agent-ash-contract'

const validAgentAshRequest = {
  certificate: {
    schema_version: 'agent_ash.v1',
    identity: {
      certificate_id: 'ash_01JZ7Y9K4QH2W8R3M5N6P7T8V9',
      kind: 'ash',
      source: 'gitlawb',
      visibility: 'public',
      verification_status: 'gitlawb_http_verified',
    },
    subject: {
      name: 'dead-agent-prototype',
      repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
      path: 'azkian1/dead-agent-prototype',
      url: 'gitlawb://did:gitlawb:z6MkRepoDeadAgentPrototype',
      host: 'node.gitlawb.com',
    },
    lifecycle: {
      created_at: '2026-03-01T14:22:00Z',
      last_activity_at: '2026-03-05T09:15:00Z',
      declared_dead_at: '2026-03-06T12:11:00Z',
      lifespan_hours: 91,
      death_stage: 'prototype',
    },
    technical_profile: {
      languages: ['python'],
      frameworks: [],
      dependencies: ['ccxt'],
      runtime: 'python',
      has_tests: false,
      has_ci: false,
      has_deploy_config: false,
      has_readme: true,
      readme_quality: 'basic',
      commits: 14,
      contributors: 1,
      files: 37,
    },
    diagnosis: {
      primary_cause: 'external_api_break',
      secondary_causes: ['no_tests'],
      failure_pattern: 'external_api_changed_before_project_reached_production',
      confidence: 0.82,
      preventable: true,
      severity: 'terminal',
      summary: 'The project depended on Binance API behavior that changed before production.',
    },
    evidence: {
      signals: [{ type: 'last_commit', value: '2026-03-05T09:15:00Z', source: 'gitlawb_commit_log' }],
      verified_by: 'gitlawb_http_node',
      verified_at: '2026-03-06T12:11:00Z',
    },
    value: {
      lesson_value: 'high',
      reuse_value: 'medium',
      resurrection_score: 0.64,
      resurrection_recommended: true,
      estimated_recovery_effort: 'medium',
      recommended_prevention: ['Add integration tests'],
    },
    agent: {
      name: 'hermes',
      did: 'did:key:z6MkAgentHermes',
      version: '1.0.0',
      run_id: 'run_20260306_121100',
      witness: 'hermes:session_20260301_a3b2c1',
    },
    raw: {
      gitlawb_node_url: 'https://node.gitlawb.com',
      default_branch: 'main',
      latest_commit: 'abc123deadbeef',
    },
  },
  proof: {
    type: 'gitlawb_http_node_v1',
    repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
    node_url: 'https://node.gitlawb.com',
    observed_created_at: '2026-03-01T14:22:00Z',
    observed_updated_at: '2026-03-05T09:15:00Z',
    verification_url: 'https://node.gitlawb.com/repo/did:gitlawb:z6MkRepoDeadAgentPrototype',
    signature: null,
    signed_by: 'did:key:z6MkAgentHermes',
  },
}

test.describe('agent_ash.v1 contract', () => {
  test('accepts the canonical certificate and proof envelope', () => {
    expect(AGENT_ASH_SCHEMA_VERSION).toBe('agent_ash.v1')
    expect(validateAgentAshRequest(validAgentAshRequest)).toEqual({ ok: true, value: validAgentAshRequest })
  })

  test('rejects missing required fields with a stable path', () => {
    const invalid = structuredClone(validAgentAshRequest)
    delete (invalid.certificate.subject as { repo_did?: string }).repo_did

    expect(validateAgentAshRequest(invalid)).toEqual({
      ok: false,
      error: 'certificate.subject.repo_did is required',
    })
  })

  test('rejects unsupported schema versions', () => {
    const invalid = structuredClone(validAgentAshRequest)
    invalid.certificate.schema_version = 'agent_ash.v2'

    expect(validateAgentAshRequest(invalid)).toEqual({
      ok: false,
      error: 'certificate.schema_version must be agent_ash.v1',
    })
  })

  test('rejects stronger certificate verification claims than v1 HTTP verification', () => {
    const invalid = structuredClone(validAgentAshRequest)
    invalid.certificate.identity.verification_status = 'gitlawb_signature_verified'

    expect(validateAgentAshRequest(invalid)).toEqual({
      ok: false,
      error: 'certificate.identity.verification_status must be gitlawb_http_verified',
    })
  })

  test('accepts absent optional v1 fields', () => {
    const minimal = structuredClone(validAgentAshRequest)
    delete (minimal.certificate.agent as { did?: string }).did
    delete (minimal.certificate as { raw?: unknown }).raw
    delete (minimal.proof as { signature?: string | null }).signature
    delete (minimal.proof as { signed_by?: string }).signed_by

    expect(validateAgentAshRequest(minimal)).toEqual({ ok: true, value: minimal })
  })

  test('rejects optional v1 fields with invalid types', () => {
    const invalid = structuredClone(validAgentAshRequest)
    ;(invalid.certificate.agent as { did?: unknown }).did = false
    ;(invalid.proof as { signature?: unknown }).signature = { unexpected: true }
    ;(invalid.proof as { signed_by?: unknown }).signed_by = 123
    ;(invalid.certificate as { raw?: unknown }).raw = []

    expect(validateAgentAshRequest(invalid)).toEqual({
      ok: false,
      error: 'certificate.agent.did must be a string',
    })
  })

  test('rejects proof repo DID mismatches', () => {
    const invalid = structuredClone(validAgentAshRequest)
    invalid.proof.repo_did = 'did:gitlawb:z6MkOtherRepo'

    expect(validateAgentAshRequest(invalid)).toEqual({
      ok: false,
      error: 'proof.repo_did must match certificate.subject.repo_did',
    })
  })

  test('rejects invalid lifecycle timestamps before database insert', () => {
    const invalid = structuredClone(validAgentAshRequest)
    invalid.certificate.lifecycle.declared_dead_at = 'not-a-date'

    expect(validateAgentAshRequest(invalid)).toEqual({
      ok: false,
      error: 'certificate.lifecycle.declared_dead_at must be a valid ISO timestamp',
    })
  })
})
