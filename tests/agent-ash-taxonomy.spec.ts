import { expect, test } from '@playwright/test'
import {
  AGENT_ASH_DEATH_STAGES,
  AGENT_ASH_PRIMARY_CAUSES,
  AGENT_ASH_SECONDARY_CAUSES,
  AGENT_ASH_VALUE_LEVELS,
  classifyAgentAshTaxonomy,
  isAgentAshDeathStage,
  isAgentAshPrimaryCause,
  isAgentAshValueLevel,
} from '../src/lib/agent-ash-taxonomy'
import { validateAgentAshRequest } from '../src/lib/agent-ash-contract'

const request = {
  certificate: {
    schema_version: 'agent_ash.v1',
    identity: { kind: 'ash', source: 'gitlawb' },
    subject: { name: 'dead-agent-prototype', repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype' },
    lifecycle: {
      created_at: '2026-03-01T14:22:00Z',
      last_activity_at: '2026-03-05T09:15:00Z',
      declared_dead_at: '2026-03-06T12:11:00Z',
      death_stage: 'prototype',
    },
    technical_profile: { commits: 14, dependencies: ['ccxt'], runtime: 'python' },
    diagnosis: {
      primary_cause: 'external_api_break',
      secondary_causes: ['single_maintainer'],
      failure_pattern: 'external_api_changed_before_project_reached_production',
      summary: 'External API behavior changed before production.',
    },
    evidence: { signals: [] },
    value: {
      lesson_value: 'high',
      recommended_prevention: ['Add integration tests'],
    },
    agent: { name: 'hermes' },
  },
  proof: {
    type: 'gitlawb_http_node_v1',
    repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
    node_url: 'https://node.gitlawb.com',
    observed_created_at: '2026-03-01T14:22:00Z',
    observed_updated_at: '2026-03-05T09:15:00Z',
  },
}

test.describe('Agent Ash cause taxonomy', () => {
  test('exports the v1 structured taxonomy for analytics fields', () => {
    expect(AGENT_ASH_PRIMARY_CAUSES).toEqual([
      'abandoned',
      'external_api_break',
      'dependency_hell',
      'never_launched',
      'single_commit',
      'empty_repo',
      'broken_build',
      'unknown',
    ])
    expect(AGENT_ASH_DEATH_STAGES).toEqual(['idea', 'prototype', 'mvp', 'production', 'unknown'])
    expect(AGENT_ASH_SECONDARY_CAUSES).toContain('no_tests')
    expect(AGENT_ASH_SECONDARY_CAUSES).toContain('single_maintainer')
    expect(AGENT_ASH_VALUE_LEVELS).toEqual(['none', 'low', 'medium', 'high', 'unknown'])
    expect(isAgentAshPrimaryCause('dependency_hell')).toBe(true)
    expect(isAgentAshDeathStage('prototype')).toBe(true)
    expect(isAgentAshValueLevel('high')).toBe(true)
  })

  test('classifies public GitLawb metadata into initial cause taxonomy', () => {
    expect(classifyAgentAshTaxonomy({ commits: 0, files: 0, updated_at: '2026-01-01T00:00:00Z' }, '2026-07-01T00:00:00Z')).toMatchObject({
      primary_cause: 'empty_repo',
      death_stage: 'idea',
    })
    expect(classifyAgentAshTaxonomy({ commits: 1, files: 3, updated_at: '2026-01-01T00:00:00Z' }, '2026-07-01T00:00:00Z')).toMatchObject({
      primary_cause: 'single_commit',
      death_stage: 'idea',
    })
    expect(classifyAgentAshTaxonomy({ commits: 3, files: 8, updated_at: '2026-01-01T00:00:00Z' }, '2026-07-01T00:00:00Z')).toMatchObject({
      primary_cause: 'never_launched',
      death_stage: 'prototype',
    })
    expect(classifyAgentAshTaxonomy({ commits: 12, dependencies: ['ccxt'], updated_at: '2026-01-01T00:00:00Z' }, '2026-07-01T00:00:00Z')).toMatchObject({
      primary_cause: 'external_api_break',
    })
    expect(classifyAgentAshTaxonomy({ commits: 12, runtime: 'node12', updated_at: '2026-01-01T00:00:00Z' }, '2026-07-01T00:00:00Z')).toMatchObject({
      primary_cause: 'dependency_hell',
    })
    expect(classifyAgentAshTaxonomy({ commits: 12, has_ci: true, latest_build_status: 'failed', updated_at: '2026-01-01T00:00:00Z' }, '2026-07-01T00:00:00Z')).toMatchObject({
      primary_cause: 'broken_build',
    })
    expect(classifyAgentAshTaxonomy({ commits: 12, updated_at: '2026-01-01T00:00:00Z' }, '2026-07-01T00:00:00Z')).toMatchObject({
      primary_cause: 'abandoned',
    })
    expect(classifyAgentAshTaxonomy({ commits: 12, updated_at: '2026-04-02T00:00:00Z' }, '2026-07-01T00:00:00Z')).toMatchObject({
      primary_cause: 'abandoned',
    })
  })

  test('contract rejects unsupported structured taxonomy values before ingest', () => {
    expect(validateAgentAshRequest(request)).toEqual({ ok: true, value: request })

    const invalidCause = structuredClone(request)
    invalidCause.certificate.diagnosis.primary_cause = 'vibes_evaporated'
    expect(validateAgentAshRequest(invalidCause)).toEqual({
      ok: false,
      error: 'certificate.diagnosis.primary_cause must be a supported Agent Ash cause',
    })

    const invalidStage = structuredClone(request)
    invalidStage.certificate.lifecycle.death_stage = 'graveyard'
    expect(validateAgentAshRequest(invalidStage)).toEqual({
      ok: false,
      error: 'certificate.lifecycle.death_stage must be a supported Agent Ash death stage',
    })

    const invalidLessonValue = structuredClone(request)
    invalidLessonValue.certificate.value.lesson_value = 'priceless'
    expect(validateAgentAshRequest(invalidLessonValue)).toEqual({
      ok: false,
      error: 'certificate.value.lesson_value must be a supported Agent Ash value level',
    })

    const invalidSecondaryCause = structuredClone(request)
    invalidSecondaryCause.certificate.diagnosis.secondary_causes = ['dependency_hell', 'cosmic_rays']
    expect(validateAgentAshRequest(invalidSecondaryCause)).toEqual({
      ok: false,
      error: 'certificate.diagnosis.secondary_causes must contain only supported Agent Ash secondary causes',
    })
  })
})
