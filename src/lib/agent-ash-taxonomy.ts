export const AGENT_ASH_PRIMARY_CAUSES = [
  'abandoned',
  'external_api_break',
  'dependency_hell',
  'never_launched',
  'single_commit',
  'empty_repo',
  'broken_build',
  'unknown',
] as const

export const AGENT_ASH_DEATH_STAGES = ['idea', 'prototype', 'mvp', 'production', 'unknown'] as const
export const AGENT_ASH_SECONDARY_CAUSES = [
  ...AGENT_ASH_PRIMARY_CAUSES,
  'no_tests',
  'no_ci',
  'single_maintainer',
  'no_readme',
  'no_deploy_config',
] as const
export const AGENT_ASH_VALUE_LEVELS = ['none', 'low', 'medium', 'high', 'unknown'] as const

export type AgentAshPrimaryCause = (typeof AGENT_ASH_PRIMARY_CAUSES)[number]
export type AgentAshDeathStage = (typeof AGENT_ASH_DEATH_STAGES)[number]
export type AgentAshSecondaryCause = (typeof AGENT_ASH_SECONDARY_CAUSES)[number]
export type AgentAshValueLevel = (typeof AGENT_ASH_VALUE_LEVELS)[number]

type RepoMetadata = Record<string, unknown>

export interface AgentAshTaxonomyClassification {
  primary_cause: AgentAshPrimaryCause
  death_stage: AgentAshDeathStage
  failure_pattern: string
  confidence: number
  summary: string
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number])
}

export function isAgentAshPrimaryCause(value: unknown): value is AgentAshPrimaryCause {
  return isOneOf(AGENT_ASH_PRIMARY_CAUSES, value)
}

export function isAgentAshDeathStage(value: unknown): value is AgentAshDeathStage {
  return isOneOf(AGENT_ASH_DEATH_STAGES, value)
}

export function isAgentAshSecondaryCause(value: unknown): value is AgentAshSecondaryCause {
  return isOneOf(AGENT_ASH_SECONDARY_CAUSES, value)
}

export function isAgentAshValueLevel(value: unknown): value is AgentAshValueLevel {
  return isOneOf(AGENT_ASH_VALUE_LEVELS, value)
}

function numberField(repo: RepoMetadata, key: string): number | null {
  const value = repo[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringField(repo: RepoMetadata, key: string): string {
  const value = repo[key]
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function stringArrayField(repo: RepoMetadata, key: string): string[] {
  const value = repo[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase()) : []
}

function inactiveDays(repo: RepoMetadata, now: string): number | null {
  const updatedAt = stringField(repo, 'updated_at')
  const updatedTime = Date.parse(updatedAt)
  const nowTime = Date.parse(now)
  if (Number.isNaN(updatedTime) || Number.isNaN(nowTime)) return null
  return Math.floor((nowTime - updatedTime) / 86_400_000)
}

function hasExternalApiDependency(repo: RepoMetadata): boolean {
  const dependencies = stringArrayField(repo, 'dependencies')
  return dependencies.some((dependency) => ['ccxt', 'stripe', 'openai', 'binance', 'twitter', 'x-api'].includes(dependency))
}

function hasObsoleteRuntime(repo: RepoMetadata): boolean {
  const runtime = stringField(repo, 'runtime')
  return ['node12', 'node10', 'python2', 'ruby2.6'].some((obsolete) => runtime.includes(obsolete))
}

export function classifyAgentAshTaxonomy(repo: RepoMetadata, now = new Date().toISOString()): AgentAshTaxonomyClassification {
  const commits = numberField(repo, 'commits')
  const files = numberField(repo, 'files')
  const daysInactive = inactiveDays(repo, now)
  const isStale = daysInactive !== null && daysInactive >= 90

  if ((files !== null && files <= 1) || commits === 0) {
    return {
      primary_cause: 'empty_repo',
      death_stage: 'idea',
      failure_pattern: 'empty_or_near_empty_repository',
      confidence: 0.86,
      summary: 'The public GitLawb repository is empty or near-empty.',
    }
  }

  if (commits === 1) {
    return {
      primary_cause: 'single_commit',
      death_stage: 'idea',
      failure_pattern: 'single_initial_commit_without_followthrough',
      confidence: 0.82,
      summary: 'The public GitLawb repository stopped after a single commit.',
    }
  }

  if (commits !== null && commits <= 3) {
    return {
      primary_cause: 'never_launched',
      death_stage: 'prototype',
      failure_pattern: 'few_commits_no_launch_signal',
      confidence: 0.74,
      summary: 'The public GitLawb repository shows only a small prototype and no launch signal.',
    }
  }

  if (repo.has_ci === true && stringField(repo, 'latest_build_status') === 'failed') {
    return {
      primary_cause: 'broken_build',
      death_stage: 'prototype',
      failure_pattern: 'ci_failed_before_recovery',
      confidence: 0.8,
      summary: 'The latest known public build signal failed before the project recovered.',
    }
  }

  if (hasExternalApiDependency(repo) && isStale) {
    return {
      primary_cause: 'external_api_break',
      death_stage: 'prototype',
      failure_pattern: 'external_api_risk_then_abandonment',
      confidence: 0.68,
      summary: 'The project depended on external APIs and then became stale.',
    }
  }

  if (hasObsoleteRuntime(repo)) {
    return {
      primary_cause: 'dependency_hell',
      death_stage: 'prototype',
      failure_pattern: 'obsolete_runtime_before_recovery',
      confidence: 0.7,
      summary: 'The public metadata indicates an obsolete runtime or dependency base.',
    }
  }

  if (isStale) {
    return {
      primary_cause: 'abandoned',
      death_stage: 'prototype',
      failure_pattern: 'public_gitlawb_repo_inactive_90_days',
      confidence: 0.72,
      summary: `No public GitLawb activity for ${daysInactive} days.`,
    }
  }

  return {
    primary_cause: 'unknown',
    death_stage: 'unknown',
    failure_pattern: 'insufficient_public_signals',
    confidence: 0.35,
    summary: 'Public GitLawb metadata does not expose enough failure signals for a confident diagnosis.',
  }
}
