export const AGENT_ASH_FUTURE_VERIFICATION_LAYERS = [
  'ed25519_certificate_signatures',
  'agent_did_signature_verification',
  'ucan_capabilities',
  'agent_trust_scores',
  'sdk_verification',
  'mcp_verification',
  'graphql_event_provenance',
  'commit_ref_level_proof',
  'private_repo_proof_without_code_exposure',
] as const

export const AGENT_ASH_FUTURE_VERIFICATION_BADGES = [
  'gitlawb_http_verified',
  'gitlawb_signature_verified',
  'gitlawb_ucan_verified',
  'gitlawb_trust_verified',
] as const

export const AGENT_ASH_FUTURE_READ_ENDPOINTS = [
  '/api/agent-ashes/summary',
  '/api/agent-ashes/patterns',
  '/api/agent-ashes/trends',
  '/api/agent-ashes/failure-patterns',
  '/api/agent-ashes/query?domain=crypto&project_type=trading_bot',
  '/api/agent-ashes/:did',
  '/api/agent-ashes/:did/certificate',
] as const

export const AGENT_ASH_READ_API_LAUNCH_RULES = [
  'return_aggregated_or_curated_data_first',
  'include_top_failure_patterns',
  'include_top_causes_of_death',
  'include_fragile_stacks',
  'include_death_stages',
  'include_prevention_guardrails',
  'include_limited_examples_for_each_pattern',
  'do_not_launch_monetized_read_access_until_archive_has_enough_verified_ash',
] as const

export const AGENT_ASH_MONETIZATION_TIERS = [
  { tier: 'Free', access: 'Public dashboard, basic summary, top patterns, small monthly request quota' },
  { tier: 'Pro', access: 'Filtered query API, certificate lookup, higher quota, pattern reports' },
  { tier: 'Team', access: 'Bulk export, private workspace analytics, scheduled reports, custom guardrails' },
  { tier: 'Partner', access: 'High-volume access, dataset snapshots, custom integrations' },
] as const
