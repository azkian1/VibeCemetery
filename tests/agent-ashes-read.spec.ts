import { expect, test } from '@playwright/test'
import {
  buildAgentAshSummary,
  createAgentAshReadHandlers,
  type AgentAshReadRecord,
  type AgentAshReadStore,
} from '../src/lib/agent-ashes-read'

const records: AgentAshReadRecord[] = [
  {
    id: 'ash-1',
    subject_name: 'dead-agent-prototype',
    repo_did: 'did:gitlawb:z6MkRepo1',
    agent_name: 'hermes',
    agent_did: 'did:key:z6MkAgentHermes',
    primary_cause: 'external_api_break',
    failure_pattern: 'external_api_changed_before_project_reached_production',
    death_stage: 'prototype',
    verification_status: 'gitlawb_http_verified',
    verification_url: 'https://node.gitlawb.com/repo/1',
    declared_dead_at: '2026-03-06T12:11:00Z',
    created_at: '2026-03-06T12:12:00Z',
    certificate: { subject: { domain: 'crypto' }, value: { resurrection_recommended: true, resurrection_score: 0.64 }, technical_profile: { languages: ['python'] } },
    proof: { type: 'gitlawb_http_node_v1', verification_url: 'https://node.gitlawb.com/repo/1' },
  },
  {
    id: 'ash-2',
    subject_name: 'stale-agent-ui',
    repo_did: 'did:gitlawb:z6MkRepo2',
    agent_name: 'hermes',
    primary_cause: 'dependency_hell',
    failure_pattern: 'obsolete_runtime_before_launch',
    death_stage: 'prototype',
    verification_status: 'gitlawb_http_verified',
    declared_dead_at: '2026-03-05T12:11:00Z',
    created_at: '2026-03-05T12:12:00Z',
    certificate: { subject: { domain: 'crypto' }, value: { resurrection_recommended: false }, technical_profile: { languages: ['typescript'] } },
    proof: { type: 'gitlawb_http_node_v1' },
  },
]

function makeStore(): AgentAshReadStore {
  return {
    async countVerified() { return records.length },
    async listVerified() { return records },
    async findVerifiedById(id) { return records.find((record) => record.id === id) ?? null },
  }
}

test.describe('Agent Ash read API helpers', () => {
  test('builds a curated summary from verified Ash records', () => {
    expect(buildAgentAshSummary(records, { totalVerifiedAsh: 12 })).toEqual({
      sampled_verified_ash: 2,
      analytics_window: 'recent_verified_ash',
      analytics_window_limit: 50,
      total_verified_ash: 12,
      top_primary_causes: [
        { value: 'external_api_break', count: 1 },
        { value: 'dependency_hell', count: 1 },
      ],
      top_failure_patterns: [
        { value: 'external_api_changed_before_project_reached_production', count: 1 },
        { value: 'obsolete_runtime_before_launch', count: 1 },
      ],
      common_death_stages: [{ value: 'prototype', count: 2 }],
      fragile_stacks: [
        { value: 'python', count: 1 },
        { value: 'typescript', count: 1 },
      ],
      top_domains: [{ value: 'crypto', count: 2 }],
      recent_verified_ash: [
        expect.objectContaining({ id: 'ash-1', subject_name: 'dead-agent-prototype' }),
        expect.objectContaining({ id: 'ash-2', subject_name: 'stale-agent-ui' }),
      ],
      resurrection_candidates: [expect.objectContaining({ id: 'ash-1', resurrection_score: 0.64 })],
    })

    expect(buildAgentAshSummary(records)).toMatchObject({
      total_verified_ash: 2,
      sampled_verified_ash: 2,
    })
  })

  test('returns summary, detail, and raw certificate with no-store headers', async () => {
    const handlers = createAgentAshReadHandlers(makeStore())

    const summary = await handlers.summary()
    expect(summary.status).toBe(200)
    expect(summary.headers.get('cache-control')).toBe('no-store')
    await expect(summary.json()).resolves.toMatchObject({ total_verified_ash: 2, sampled_verified_ash: 2 })

    const detail = await handlers.detail('ash-1')
    expect(detail.status).toBe(200)
    const detailBody = await detail.json()
    expect(detailBody).toMatchObject({ id: 'ash-1', subject_name: 'dead-agent-prototype' })
    expect(detailBody).not.toHaveProperty('certificate')
    expect(detailBody).not.toHaveProperty('proof')

    const certificate = await handlers.certificate('ash-1')
    expect(certificate.status).toBe(200)
    await expect(certificate.json()).resolves.toEqual({
      ...records[0].certificate,
      proof: records[0].proof,
    })
  })

  test('returns 400 for invalid lookup ids before querying the store', async () => {
    let queried = false
    const handlers = createAgentAshReadHandlers({
      async countVerified() { return 0 },
      async listVerified() { return [] },
      async findVerifiedById() {
        queried = true
        return null
      },
    })

    const response = await handlers.detail('../bad id')

    expect(response.status).toBe(400)
    expect(queried).toBe(false)
  })

  test('returns 404 for unknown verified Ash ids', async () => {
    const handlers = createAgentAshReadHandlers(makeStore())
    const detail = await handlers.detail('missing')
    const certificate = await handlers.certificate('missing')

    expect(detail.status).toBe(404)
    expect(certificate.status).toBe(404)
  })
})
