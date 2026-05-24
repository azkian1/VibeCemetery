import { expect, test } from '@playwright/test'
import {
  AGENT_ASH_FUTURE_READ_ENDPOINTS,
  AGENT_ASH_FUTURE_VERIFICATION_BADGES,
  AGENT_ASH_FUTURE_VERIFICATION_LAYERS,
  AGENT_ASH_MONETIZATION_TIERS,
  AGENT_ASH_READ_API_LAUNCH_RULES,
} from '../src/lib/agent-ash-roadmap'

test.describe('Agent Ash future hardening roadmap', () => {
  test('keeps v1 HTTP verification separate from future cryptographic hardening', () => {
    expect(AGENT_ASH_FUTURE_VERIFICATION_LAYERS).toEqual([
      'ed25519_certificate_signatures',
      'agent_did_signature_verification',
      'ucan_capabilities',
      'agent_trust_scores',
      'sdk_verification',
      'mcp_verification',
      'graphql_event_provenance',
      'commit_ref_level_proof',
      'private_repo_proof_without_code_exposure',
    ])
    expect(AGENT_ASH_FUTURE_VERIFICATION_BADGES).toEqual([
      'gitlawb_http_verified',
      'gitlawb_signature_verified',
      'gitlawb_ucan_verified',
      'gitlawb_trust_verified',
    ])
  })
})

test.describe('Agent Ash future read API and monetization roadmap', () => {
  test('keeps future read API curated and gated until enough verified Ash exists', () => {
    expect(AGENT_ASH_FUTURE_READ_ENDPOINTS).toEqual([
      '/api/agent-ashes/summary',
      '/api/agent-ashes/patterns',
      '/api/agent-ashes/trends',
      '/api/agent-ashes/failure-patterns',
      '/api/agent-ashes/query?domain=crypto&project_type=trading_bot',
      '/api/agent-ashes/:did',
      '/api/agent-ashes/:did/certificate',
    ])
    expect(AGENT_ASH_READ_API_LAUNCH_RULES).toEqual([
      'return_aggregated_or_curated_data_first',
      'include_top_failure_patterns',
      'include_top_causes_of_death',
      'include_fragile_stacks',
      'include_death_stages',
      'include_prevention_guardrails',
      'include_limited_examples_for_each_pattern',
      'do_not_launch_monetized_read_access_until_archive_has_enough_verified_ash',
    ])
  })

  test('records future access tiers without enabling monetized endpoints in v1', () => {
    expect(AGENT_ASH_MONETIZATION_TIERS).toEqual([
      { tier: 'Free', access: 'Public dashboard, basic summary, top patterns, small monthly request quota' },
      { tier: 'Pro', access: 'Filtered query API, certificate lookup, higher quota, pattern reports' },
      { tier: 'Team', access: 'Bulk export, private workspace analytics, scheduled reports, custom guardrails' },
      { tier: 'Partner', access: 'High-volume access, dataset snapshots, custom integrations' },
    ])
  })
})
