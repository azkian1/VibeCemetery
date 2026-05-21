import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_GITLAWB_NODE_URL = 'https://node.gitlawb.com'
export const DEFAULT_VC_URL = 'https://vibecemetery.app'
export const AGENT_ASH_INGEST_PATH = '/api/agent-ashes'
export const AGENT_ASH_LINK_START_PATH = '/api/agent-ash/link/start'
export const AGENT_ASH_LINK_STATUS_PATH = '/api/agent-ash/link/status'
export const GITLAWB_REPOS_PATH = '/api/v1/repos'
export const WATCHLIST_INACTIVITY_DAYS = 90
export const AGENT_ASH_TOKEN_PREFIX = 'ash_'
export const AGENT_ASH_TOKEN_PATTERN = /^ash_[A-Za-z0-9._~-]{16,}$/
export const AGENT_ASH_CLAIM_TOKEN_PATTERN = /^claim_[A-Za-z0-9_-]{20,}$/
export const AGENT_ASH_LINK_ID_PATTERN = /^ashlink_[A-Za-z0-9_-]{12,}$/
export const GITLAWB_REPO_DID_PATTERN = /^did:gitlawb:[A-Za-z0-9._~-]{1,148}$/

const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]/g
const SECRET_LIKE_PATTERN = /(ash_[A-Za-z0-9._~-]{8,}|claim_[A-Za-z0-9_-]{8,}|vc_cli_[A-Za-z0-9._~-]+)/g
const STRING_LIMITS = {
  subjectName: 120,
  subjectPath: 240,
  description: 500,
  domain: 120,
  projectType: 80,
  arrayItem: 80,
  arrayItems: 25,
  runtime: 80,
  readmeQuality: 40,
  rawDefaultBranch: 120,
  rawLatestCommit: 128,
  deathStage: 40,
  agentName: 120,
  agentDid: 240,
  failurePattern: 160,
  severity: 40,
  summary: 500,
  approvalBy: 120,
  notificationId: 160,
  notificationType: 80,
}
const MAX_APPROVAL_CANDIDATE_COUNT = 1000
const MAX_SCHEDULED_REPOS = 1000
const MAX_SCHEDULED_CANDIDATES = 100
const SCHEDULED_APPROVAL_POLICIES = new Set(['none', 'manual', 'all'])
const AGENT_ASH_CAUSES = new Set([
  'empty_repo',
  'single_commit',
  'never_launched',
  'broken_build',
  'external_api_break',
  'dependency_hell',
  'abandoned',
  'unknown',
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function sanitizeString(value, maxLength, fallback = '') {
  const clean = asString(value).replace(CONTROL_CHARS_PATTERN, '').trim()
  const normalized = clean || fallback
  return normalized.slice(0, maxLength)
}

function sanitizeOptionalString(value, maxLength) {
  const sanitized = sanitizeString(value, maxLength)
  return sanitized || undefined
}

function redactSecretLikeText(value) {
  return String(value).replace(SECRET_LIKE_PATTERN, '[redacted]')
}

function sanitizeStringArray(value, maxItems = STRING_LIMITS.arrayItems, maxLength = STRING_LIMITS.arrayItem) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .flatMap((item) => {
      const sanitized = sanitizeString(item, maxLength)
      return sanitized ? [sanitized] : []
    })
    .slice(0, maxItems)
}

function normalizeCause(value, fallback = '') {
  const cause = sanitizeString(value, STRING_LIMITS.arrayItem)
  return AGENT_ASH_CAUSES.has(cause) ? cause : fallback
}

function normalizeConfidence(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined
}

function normalizeCandidateCount(value) {
  if (!Number.isFinite(value) || value < 0) {
    return undefined
  }
  return Math.min(MAX_APPROVAL_CANDIDATE_COUNT, Math.floor(value))
}

function normalizeUrl(value, fallback) {
  const raw = asString(value) || fallback
  return new URL(raw).origin
}

function normalizeGitlawbNodeUrl(value) {
  const origin = normalizeUrl(value, DEFAULT_GITLAWB_NODE_URL)
  if (origin !== DEFAULT_GITLAWB_NODE_URL) {
    throw new Error('gitlawb_node_url must be https://node.gitlawb.com')
  }
  return origin
}

function normalizeVcUrl(value) {
  const origin = normalizeUrl(value, DEFAULT_VC_URL)
  if (origin !== DEFAULT_VC_URL) {
    throw new Error('vc_url must be https://vibecemetery.app')
  }
  return origin
}

function normalizeIso(value) {
  const raw = asString(value)
  const date = new Date(raw)
  if (!raw || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${raw || '(empty)'}`)
  }
  return date.toISOString().replace('.000Z', 'Z')
}

function hoursBetween(start, end) {
  return Math.max(0, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 3_600_000))
}

function daysBetween(start, end) {
  return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000)
}

function numberField(repo, key) {
  return Number.isFinite(repo?.[key]) ? repo[key] : null
}

function stringField(repo, key) {
  return asString(repo?.[key]).toLowerCase()
}

function stringArrayField(repo, key) {
  const value = repo?.[key]
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').map((item) => item.toLowerCase()) : []
}

function hasExternalApiDependency(repo) {
  const dependencies = stringArrayField(repo, 'dependencies')
  return dependencies.some((dependency) => ['ccxt', 'stripe', 'openai', 'binance', 'twitter', 'x-api'].includes(dependency))
}

function hasObsoleteRuntime(repo) {
  const runtime = stringField(repo, 'runtime')
  return ['node12', 'node10', 'python2', 'ruby2.6'].some((obsolete) => runtime.includes(obsolete))
}

export function classifyAgentAshTaxonomy(repo = {}, now = new Date().toISOString()) {
  const commits = numberField(repo, 'commits')
  const files = numberField(repo, 'files')
  const inactiveDays = daysBetween(normalizeIso(repo.updated_at), normalizeIso(now))
  const isStale = inactiveDays >= WATCHLIST_INACTIVITY_DAYS

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
      summary: `No public GitLawb activity for ${inactiveDays} days.`,
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

export function computeGitlawbStoragePaths(options = {}) {
  const home = asString(options.homedir) || os.homedir()
  const base = path.join(home, '.config', 'gitlawb')
  return {
    configPath: path.join(base, 'config.json'),
    watchlistPath: path.join(base, 'watchlist.json'),
  }
}

export function computeAgentAshStatePaths(options = {}) {
  const home = asString(options.homedir) || os.homedir()
  const stateDir = path.join(home, '.local', 'state', 'vibecemetery-agent-ash')
  return {
    stateDir,
    statePath: path.join(stateDir, 'state.json'),
    logsPath: path.join(stateDir, 'logs.jsonl'),
    lockPath: path.join(stateDir, 'scan.lock'),
  }
}

export function normalizeGitlawbConfig(config = {}) {
  return {
    gitlawb_node_url: normalizeGitlawbNodeUrl(config.gitlawb_node_url),
    agent_name: sanitizeString(config.agent_name, STRING_LIMITS.agentName, 'hermes'),
    agent_did: sanitizeString(config.agent_did, STRING_LIMITS.agentDid),
    agent_ash_token: asString(config.agent_ash_token),
    agent_private_key: asString(config.agent_private_key ?? config.private_key),
    experimental_native_submit: config.experimental_native_submit === true,
    vc_url: normalizeVcUrl(config.vc_url),
  }
}

function normalizeScheduledApprovalPolicy(options = {}, config = {}) {
  const policy = asString(
    options.scheduledApprovalPolicy
      ?? options.scheduled_approval_policy
      ?? config.scheduled_approval_policy
      ?? config.approval_policy
      ?? config.scheduled?.approval_policy,
  ) || 'none'
  if (!SCHEDULED_APPROVAL_POLICIES.has(policy)) {
    throw new Error(`Invalid scheduled approval policy: ${policy}`)
  }
  return policy
}

export function getRepoDid(repo = {}) {
  return [repo.did, repo.repo_did, repo.id].map(asString).find((value) => GITLAWB_REPO_DID_PATTERN.test(value)) || deriveRepoDidFromOwnerAndName(repo)
}

function normalizeOwnerDid(value) {
  const ownerDid = asString(value)
  if (ownerDid.startsWith('did:key:')) return ownerDid
  return ownerDid.startsWith('z6Mk') ? `did:key:${ownerDid}` : ownerDid
}

function normalizeDerivedRepoName(value) {
  return asString(value).toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^-+|-+$/g, '')
}

function deriveRepoDidFromOwnerAndName(repo = {}) {
  const ownerDid = normalizeOwnerDid(repo.owner_did)
  const name = normalizeDerivedRepoName(repo.name)
  if (!ownerDid.startsWith('did:key:') || !name) {
    return ''
  }
  return `did:gitlawb:${sha256(`${ownerDid}|${name}`).slice(0, 32)}`
}

function getRepoPath(repo = {}) {
  const id = sanitizeString(repo.id, STRING_LIMITS.subjectPath)
  const path = sanitizeString(repo.path, STRING_LIMITS.subjectPath)
    || sanitizeString(repo.full_name, STRING_LIMITS.subjectPath)
  if (path && path.includes('/')) return path
  if (id && id.includes('/')) {
    const slash = id.indexOf('/')
    const owner = normalizeOwnerDid(id.slice(0, slash))
    const name = id.slice(slash + 1)
    return `${owner}/${name}`
  }
  return path || sanitizeString(repo.name, STRING_LIMITS.subjectPath)
}

function parseOwnerNamePath(value) {
  const parts = asString(value).split('/').filter(Boolean)
  return parts.length === 2 ? parts : null
}

function buildRepoVerificationUrl(nodeUrl, repoPath) {
  const parts = parseOwnerNamePath(repoPath)
  if (!parts) return `${nodeUrl}${GITLAWB_REPOS_PATH}`
  const [owner, name] = parts.map((part) => encodeURIComponent(part))
  return `${nodeUrl}${GITLAWB_REPOS_PATH}/${owner}/${name}`
}

function getRepoName(repo = {}) {
  return sanitizeString(repo.name, STRING_LIMITS.subjectName)
    || sanitizeString(getRepoPath(repo).split('/').filter(Boolean).pop(), STRING_LIMITS.subjectName)
    || getRepoDid(repo)
}

function getNodeHost(nodeUrl) {
  return new URL(nodeUrl).host
}

export function stableJsonStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

function createNativeSignature(options = {}) {
  const config = normalizeGitlawbConfig(options.config ?? {})
  if (!config.agent_did) {
    throw new Error('agent_did is required for native Agent Ash submit')
  }
  if (!config.agent_private_key) {
    throw new Error('agent_private_key is required for native Agent Ash submit')
  }
  const timestamp = normalizeIso(options.timestamp ?? new Date().toISOString())
  const nonce = sanitizeString(options.nonce ?? base64Url(crypto.randomBytes(18)), 128)
  if (!nonce) {
    throw new Error('nonce is required for native Agent Ash submit')
  }
  const canonical = stableJsonStringify({
    certificate: options.request?.certificate,
    proof: options.request?.proof,
    timestamp,
    nonce,
  })
  const digest = crypto.createHash('sha256').update(canonical).digest()
  const signature = crypto.sign(null, digest, config.agent_private_key)
  return { timestamp, nonce, signature: base64Url(signature) }
}

function getRepoOwnerAgentDid(repo = {}) {
  return sanitizeString(repo.owner_agent_did, STRING_LIMITS.agentDid)
}

function getCanonicalRepoDid(repo = {}) {
  return asString(repo.did)
}

function publicKeyFingerprint(value) {
  try {
    const key = crypto.createPublicKey(value)
    const der = key.export({ type: 'spki', format: 'der' })
    return sha256(der)
  } catch {
    return ''
  }
}

function publicKeyFingerprintFromPrivateKey(value) {
  try {
    const key = crypto.createPublicKey(crypto.createPrivateKey(value))
    const der = key.export({ type: 'spki', format: 'der' })
    return sha256(der)
  } catch {
    return ''
  }
}

export function getNativeReadiness(repo = {}, config = {}) {
  const normalizedConfig = normalizeGitlawbConfig(config)
  const missing = []
  const invalid = []
  const canonicalRepoDid = getCanonicalRepoDid(repo)
  const ownerAgentDid = getRepoOwnerAgentDid(repo)
  const ownerPublicKey = asString(repo.owner_public_key)
  const state = sanitizeString(repo.state, STRING_LIMITS.deathStage).toLowerCase()
  const ownerPublicKeyFingerprint = ownerPublicKey ? publicKeyFingerprint(ownerPublicKey) : ''
  const signerPublicKeyFingerprint = normalizedConfig.agent_private_key
    ? publicKeyFingerprintFromPrivateKey(normalizedConfig.agent_private_key)
    : ''

  if (!GITLAWB_REPO_DID_PATTERN.test(canonicalRepoDid)) missing.push('did')
  if (!ownerAgentDid) missing.push('owner_agent_did')
  if (!ownerPublicKey) missing.push('owner_public_key')
  if (!normalizedConfig.agent_private_key) missing.push('agent_private_key')
  if (!state) missing.push('state')
  if (ownerPublicKey && !ownerPublicKeyFingerprint) invalid.push('owner_public_key')
  if (normalizedConfig.agent_private_key && !signerPublicKeyFingerprint) invalid.push('agent_private_key')
  if (ownerPublicKeyFingerprint && signerPublicKeyFingerprint && ownerPublicKeyFingerprint !== signerPublicKeyFingerprint) {
    invalid.push('owner_public_key_mismatch')
  }

  return {
    native_ready: missing.length === 0 && invalid.length === 0 && state === 'dead' && ownerAgentDid === normalizedConfig.agent_did,
    missing,
    invalid,
    state,
    owner_agent_did: ownerAgentDid || undefined,
    owner_public_key: ownerPublicKey || undefined,
  }
}

function validateNativeRepoMetadata(repo, config) {
  const readiness = getNativeReadiness(repo, config)
  if (readiness.missing.length > 0) {
    throw new Error('GitLawb repo metadata does not support agent-native submit; use connect-delegated/submit-delegated')
  }
  if (readiness.invalid.length > 0) {
    throw new Error('GitLawb repo native key metadata is invalid; use connect-delegated/submit-delegated')
  }
  if (readiness.state !== 'dead') {
    throw new Error('GitLawb repo state must be dead for native Agent Ash submit')
  }
  const ownerAgentDid = getRepoOwnerAgentDid(repo)
  if (ownerAgentDid !== config.agent_did) {
    throw new Error('GitLawb repo owner_agent_did must match agent_did')
  }
}

function defaultDiagnosis(repo, now) {
  const classification = classifyAgentAshTaxonomy(repo, now)
  return {
    primary_cause: classification.primary_cause,
    secondary_causes: [],
    failure_pattern: classification.failure_pattern,
    confidence: classification.confidence,
    preventable: true,
    severity: classification.primary_cause === 'unknown' ? 'unknown' : 'terminal',
    summary: classification.summary,
  }
}

function sanitizeDiagnosis(base, diagnosis = {}) {
  const override = diagnosis && typeof diagnosis === 'object' ? diagnosis : {}
  const confidence = normalizeConfidence(override.confidence)
  return {
    primary_cause: normalizeCause(override.primary_cause, base.primary_cause),
    secondary_causes: sanitizeStringArray(override.secondary_causes)
      .filter((cause) => AGENT_ASH_CAUSES.has(cause)),
    failure_pattern: sanitizeString(override.failure_pattern, STRING_LIMITS.failurePattern, base.failure_pattern),
    confidence: confidence ?? base.confidence,
    preventable: typeof override.preventable === 'boolean' ? override.preventable : base.preventable,
    severity: sanitizeString(override.severity, STRING_LIMITS.severity, base.severity),
    summary: sanitizeString(override.summary, STRING_LIMITS.summary, base.summary),
  }
}

function normalizeDiagnosis(repo, diagnosis, declaredDeadAt) {
  return sanitizeDiagnosis(defaultDiagnosis(repo, declaredDeadAt), diagnosis)
}

function normalizeApprovalNotification(notification) {
  if (!notification || typeof notification !== 'object') {
    return undefined
  }

  const normalized = {}
  const type = sanitizeOptionalString(notification.type, STRING_LIMITS.notificationType)
  if (type) {
    normalized.type = type
  }
  const candidateCount = normalizeCandidateCount(notification.candidate_count)
  if (candidateCount !== undefined) {
    normalized.candidate_count = candidateCount
  }
  if (Array.isArray(notification.approval_options)) {
    normalized.approval_options = sanitizeStringArray(notification.approval_options, 5, STRING_LIMITS.arrayItem)
  }
  return Object.keys(normalized).length ? normalized : undefined
}

function normalizeApprovalMetadata(approvalMetadata) {
  if (!approvalMetadata || typeof approvalMetadata !== 'object') {
    return undefined
  }

  return {
    mode: sanitizeString(approvalMetadata.mode, STRING_LIMITS.arrayItem),
    approved_by: sanitizeString(approvalMetadata.approved_by, STRING_LIMITS.approvalBy, 'human_operator'),
    approved_at: normalizeIso(approvalMetadata.approved_at ?? new Date().toISOString()),
    notification_id: sanitizeOptionalString(approvalMetadata.notification_id, STRING_LIMITS.notificationId),
    notification: normalizeApprovalNotification(approvalMetadata.notification),
  }
}

function normalizeTechnicalProfile(repo = {}) {
  const languages = sanitizeStringArray(repo.languages)

  return {
    languages,
    frameworks: sanitizeStringArray(repo.frameworks),
    dependencies: sanitizeStringArray(repo.dependencies),
    runtime: sanitizeString(repo.runtime, STRING_LIMITS.runtime, languages[0] || 'unknown'),
    has_tests: Boolean(repo.has_tests),
    has_ci: Boolean(repo.has_ci),
    has_deploy_config: Boolean(repo.has_deploy_config),
    has_readme: Boolean(repo.has_readme),
    readme_quality: sanitizeString(repo.readme_quality, STRING_LIMITS.readmeQuality, 'unknown'),
    commits: Number.isFinite(repo.commits) ? repo.commits : 0,
    contributors: Number.isFinite(repo.contributors) ? repo.contributors : 0,
    files: Number.isFinite(repo.files) ? repo.files : 0,
  }
}

export function buildAgentAshRequest(options = {}) {
  const repo = options.repo ?? {}
  const config = normalizeGitlawbConfig(options.config ?? {})
  const repoDid = getRepoDid(repo)
  if (!repoDid) {
    throw new Error('GitLawb repo DID must match did:gitlawb:<safe-id>')
  }

  const createdAt = normalizeIso(repo.created_at)
  const updatedAt = normalizeIso(repo.updated_at)
  const declaredDeadAt = normalizeIso(options.declaredDeadAt ?? new Date().toISOString())
  const diagnosis = normalizeDiagnosis(repo, options.diagnosis, declaredDeadAt)
  const repoPath = getRepoPath(repo)
  const certificateId = `ash_${sha256(`${repoDid}|${declaredDeadAt}`).slice(0, 26)}`
  const verificationUrl = buildRepoVerificationUrl(config.gitlawb_node_url, repoPath)
  const approvalMetadata = normalizeApprovalMetadata(options.approvalMetadata)
  const approval = approvalMetadata
    ? { approval: approvalMetadata }
    : {}

  return {
    certificate: {
      schema_version: 'agent_ash.v1',
      identity: {
        certificate_id: certificateId,
        kind: 'ash',
        source: 'gitlawb',
        visibility: 'public',
        verification_status: 'gitlawb_http_verified',
      },
      subject: {
        name: getRepoName(repo),
        repo_did: repoDid,
        path: repoPath,
        url: `gitlawb://${repoDid}`,
        host: getNodeHost(config.gitlawb_node_url),
        description: sanitizeString(repo.description, STRING_LIMITS.description),
        domain: sanitizeOptionalString(repo.domain, STRING_LIMITS.domain),
        project_type: sanitizeOptionalString(repo.project_type, STRING_LIMITS.projectType),
      },
      lifecycle: {
        created_at: createdAt,
        last_activity_at: updatedAt,
        declared_dead_at: declaredDeadAt,
        lifespan_hours: hoursBetween(createdAt, updatedAt),
        death_stage: sanitizeString(repo.death_stage, STRING_LIMITS.deathStage, classifyAgentAshTaxonomy(repo, declaredDeadAt).death_stage),
      },
      technical_profile: normalizeTechnicalProfile(repo),
      diagnosis,
      evidence: {
        signals: [{ type: 'last_activity', value: updatedAt, source: 'gitlawb_http_node' }],
        verified_by: 'gitlawb_http_node',
        verified_at: declaredDeadAt,
      },
      value: {
        lesson_value: 'medium',
        reuse_value: 'unknown',
        resurrection_score: 0,
        resurrection_recommended: false,
        estimated_recovery_effort: 'unknown',
        recommended_prevention: [],
      },
      agent: {
        name: config.agent_name,
        did: config.agent_did || undefined,
      },
      raw: {
        gitlawb_node_url: config.gitlawb_node_url,
        default_branch: sanitizeString(repo.default_branch, STRING_LIMITS.rawDefaultBranch),
        latest_commit: sanitizeString(repo.latest_commit, STRING_LIMITS.rawLatestCommit),
        ...approval,
      },
    },
    proof: {
      type: 'gitlawb_http_node_v1',
      repo_did: repoDid,
      node_url: config.gitlawb_node_url,
      observed_created_at: createdAt,
      observed_updated_at: updatedAt,
      verification_url: verificationUrl,
      signature: null,
      signed_by: config.agent_did || undefined,
    },
  }
}

export function buildSubmissionRequest(options = {}) {
  const config = normalizeGitlawbConfig(options.config ?? {})
  if (!config.agent_ash_token) {
    throw new Error('agent_ash_token is required')
  }
  if (!AGENT_ASH_TOKEN_PATTERN.test(config.agent_ash_token)) {
    throw new Error('agent_ash_token must match ash_[A-Za-z0-9._~-]{16,}')
  }

  return {
    url: `${config.vc_url}${AGENT_ASH_INGEST_PATH}`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.agent_ash_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options.request),
  }
}

export function buildNativeSubmissionRequest(options = {}) {
  const config = normalizeGitlawbConfig(options.config ?? {})
  const signed = createNativeSignature({
    config,
    request: options.request,
    timestamp: options.timestamp,
    nonce: options.nonce,
  })

  return {
    url: `${config.vc_url}${AGENT_ASH_INGEST_PATH}`,
    method: 'POST',
    headers: {
      Authorization: `AgentDID ${config.agent_did}`,
      'X-Agent-Signature': signed.signature,
      'X-Agent-Timestamp': signed.timestamp,
      'X-Agent-Nonce': signed.nonce,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options.request),
  }
}

export async function submitAgentAshRequest(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required to submit Agent Ash')
  }
  const request = buildSubmissionRequest(options)
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  })
  const body = await parseJsonResponse(response, 'Agent Ash submit')
  if (response.status !== 201) {
    throw new Error(`Agent Ash submit must return 201, received ${response.status}`)
  }
  return {
    status: response.status,
    body,
  }
}

export async function submitAgentAshNativeRequest(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required to submit Agent Ash')
  }
  const request = buildNativeSubmissionRequest(options)
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  })
  const body = await parseJsonResponse(response, 'Agent Ash submit')
  if (response.status !== 201) {
    throw new Error(`Agent Ash submit must return 201, received ${response.status}`)
  }
  return {
    status: response.status,
    body,
  }
}

export function buildAgentAshLinkStartRequest(options = {}) {
  const config = normalizeGitlawbConfig(options.config ?? {})
  const body = {
    agent_name: config.agent_name,
  }
  if (config.agent_did) {
    body.agent_did = config.agent_did
  }
  body.gitlawb_node_url = config.gitlawb_node_url
  const publicKey = sanitizeOptionalString(options.publicKey, 512)
  if (publicKey) {
    body.public_key = publicKey
  }

  return {
    url: `${config.vc_url}${AGENT_ASH_LINK_START_PATH}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function buildAgentAshLinkStatusRequest(options = {}) {
  const vcUrl = normalizeVcUrl(options.vcUrl)
  const linkId = sanitizeString(options.linkId, 128)
  const claimToken = sanitizeString(options.claimToken, 240)
  if (!AGENT_ASH_LINK_ID_PATTERN.test(linkId)) {
    throw new Error('link_id must match ashlink_[A-Za-z0-9_-]{12,}')
  }
  if (!AGENT_ASH_CLAIM_TOKEN_PATTERN.test(claimToken)) {
    throw new Error('claim_token must match claim_[A-Za-z0-9_-]{20,}')
  }

  return {
    url: `${vcUrl}${AGENT_ASH_LINK_STATUS_PATH}?link_id=${encodeURIComponent(linkId)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${claimToken}` },
  }
}

async function parseJsonResponse(response, context) {
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error(`${context} returned malformed JSON`)
  }
  if (!response.ok) {
    const message = body && typeof body.error === 'string' ? body.error : response.statusText
    throw new Error(`${context} failed: ${redactSecretLikeText(message)}`)
  }
  return body
}

export async function startAgentAshLink(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required to start Agent Ash link')
  }
  const request = buildAgentAshLinkStartRequest(options)
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  })
  const body = await parseJsonResponse(response, 'Agent Ash link start')
  if (!body?.link_id || !body?.claim_token || !body?.approve_url) {
    throw new Error('Agent Ash link start response is missing link_id, claim_token, or approve_url')
  }
  return body
}

export async function openAgentAshApproveUrl(options = {}) {
  const rawApproveUrl = sanitizeString(options.approveUrl ?? options.claim?.approve_url, 2048)
  let approveUrl
  try {
    approveUrl = new URL(rawApproveUrl)
  } catch {
    throw new Error('approve_url must be a VibeCemetery Agent Ash connect URL')
  }
  if (approveUrl.origin !== DEFAULT_VC_URL || approveUrl.pathname !== '/agent-ash/connect') {
    throw new Error('approve_url must be a VibeCemetery Agent Ash connect URL')
  }
  const normalizedApproveUrl = approveUrl.toString()
  await (typeof options.openImpl === 'function' ? options.openImpl : openUrlWithSystemBrowser)(normalizedApproveUrl)
  return normalizedApproveUrl
}

function openUrlWithSystemBrowser(url) {
  const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { windowsHide: true }, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
    child.unref?.()
  })
}

function isBrowserOpenFailure(error) {
  const code = asString(error?.code)
  const message = asString(error?.message)
  return code === 'ENOENT' || message.includes('xdg-open') || message.includes('spawn open ENOENT') || message.includes('spawn cmd.exe ENOENT')
}

function isGitlawbTransportFailure(error) {
  const code = asString(error?.code)
  const message = asString(error?.message)
  return ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code)
    || error?.name === 'AbortError'
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('timeout')
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

export async function pollAgentAshLinkStatus(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required to poll Agent Ash link status')
  }
  const claim = options.claim && typeof options.claim === 'object' ? options.claim : {}
  const vcUrl = options.vcUrl ?? options.config?.vc_url ?? DEFAULT_VC_URL
  const linkId = options.linkId ?? claim.link_id
  const claimToken = options.claimToken ?? claim.claim_token
  const startedAt = Date.now()
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : 10 * 60 * 1000
  const intervalMs = Number.isFinite(options.intervalMs) ? Math.max(0, options.intervalMs) : 2000

  while (Date.now() - startedAt <= timeoutMs) {
    const request = buildAgentAshLinkStatusRequest({ vcUrl, linkId, claimToken })
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
    })
    const body = await parseJsonResponse(response, 'Agent Ash link status')
    if (body.status === 'approved') {
      if (!AGENT_ASH_TOKEN_PATTERN.test(asString(body.agent_ash_token))) {
        throw new Error('approved Agent Ash link response is missing a valid agent_ash_token')
      }
      return body
    }
    if (body.status === 'denied' || body.status === 'expired' || body.status === 'claimed') {
      return body
    }
    await delay(intervalMs)
  }

  throw new Error('Timed out waiting for Agent Ash browser approval')
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

async function writeJsonFile(filePath, value, mode = 0o600) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode })
}

async function appendJsonLine(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 })
}

export async function storeAgentAshConfig(options = {}) {
  const approved = options.approved && typeof options.approved === 'object' ? options.approved : {}
  if (approved.status && approved.status !== 'approved') {
    throw new Error(`Agent Ash link is not approved: ${approved.status}`)
  }
  const agentAshToken = asString(approved.agent_ash_token)
  if (!AGENT_ASH_TOKEN_PATTERN.test(agentAshToken)) {
    throw new Error('agent_ash_token must match ash_[A-Za-z0-9._~-]{16,}')
  }

  const paths = computeGitlawbStoragePaths(options)
  const existing = await readJsonFile(paths.configPath)
  const baseConfig = normalizeGitlawbConfig({ ...existing, ...(options.config ?? {}) })
  const nextConfig = {
    ...existing,
    gitlawb_node_url: baseConfig.gitlawb_node_url,
    agent_name: baseConfig.agent_name,
    agent_did: baseConfig.agent_did,
    agent_ash_token: agentAshToken,
    vc_url: normalizeVcUrl(approved.vc_url ?? baseConfig.vc_url),
  }

  await fs.mkdir(path.dirname(paths.configPath), { recursive: true, mode: 0o700 })
  await fs.writeFile(paths.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await fs.chmod(paths.configPath, 0o600)
  return nextConfig
}

export async function connectAgentAsh(options = {}) {
  const claim = await startAgentAshLink(options)
  try {
    await openAgentAshApproveUrl({ claim, openImpl: options.openImpl })
  } catch (error) {
    if (!isBrowserOpenFailure(error)) {
      throw error
    }
    const log = typeof options.log === 'function' ? options.log : console.log
    log(`Open this Agent Ash approval URL in a browser: ${claim.approve_url}`)
  }
  const approved = await pollAgentAshLinkStatus({ ...options, claim })
  if (approved.status !== 'approved') {
    throw new Error(`Agent Ash link ended with status: ${approved.status}`)
  }
  return await storeAgentAshConfig({ ...options, approved })
}

export function buildGitlawbReposRequest(config = {}) {
  const normalized = normalizeGitlawbConfig(config)
  return {
    url: `${normalized.gitlawb_node_url}${GITLAWB_REPOS_PATH}`,
    method: 'GET',
    headers: { Accept: 'application/json' },
  }
}

async function hydrateGitlawbRepoFromTarget(repo, config, fetchImpl) {
  const repoPath = getRepoPath(repo)
  const request = buildGitlawbReposRequest(config)
  const url = buildRepoVerificationUrl(config.gitlawb_node_url, repoPath)
  if (url === request.url) return repo

  try {
    const response = await fetchImpl(url, {
      method: request.method,
      headers: request.headers,
    })
    if (!response.ok) return repo
    const body = await parseJsonResponse(response, 'GitLawb repo metadata')
    const hydrated = body?.repo ?? body
    return hydrated && typeof hydrated === 'object' && !Array.isArray(hydrated)
      ? { ...repo, ...hydrated }
      : repo
  } catch {
    return repo
  }
}

async function hydrateGitlawbReposFromTargets(repos, config, fetchImpl) {
  const hydrated = []
  for (const repo of repos) {
    hydrated.push(await hydrateGitlawbRepoFromTarget(repo, config, fetchImpl))
  }
  return hydrated
}

export async function fetchGitlawbRepos(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl === 'function') {
    const request = buildGitlawbReposRequest(options.config ?? {})
    let response
    try {
      response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
      })
    } catch (error) {
      if (!isGitlawbTransportFailure(error)) {
        throw error
      }
      return await fetchGitlawbReposWithCli({ ...options, cause: error })
    }

    const body = await parseJsonResponse(response, 'GitLawb repos scan')
    const repos = Array.isArray(body) ? body : Array.isArray(body?.repos) ? body.repos : []
    return await hydrateGitlawbReposFromTargets(repos, normalizeGitlawbConfig(options.config ?? {}), fetchImpl)
  }

  return await fetchGitlawbReposWithCli(options)
}

function execFileJson(execFileImpl, command, args) {
  return new Promise((resolve, reject) => {
    execFileImpl(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      try {
        resolve(JSON.parse(String(stdout || stderr || '')))
      } catch {
        reject(new Error(`${command} ${args.join(' ')} returned malformed JSON`))
      }
    })
  })
}

function firstString(...values) {
  return values.map(asString).find(Boolean) || ''
}

function normalizeGitlawbCliRepo(repo = {}) {
  if (!repo || typeof repo !== 'object' || Array.isArray(repo)) return null
  const did = firstString(repo.did)
  const repoDid = firstString(repo.repo_did, repo.repoDid)
  return {
    ...(did ? { did } : {}),
    ...(repoDid ? { repo_did: repoDid } : {}),
    id: firstString(repo.id, repo.full_name, repo.fullName, repo.path),
    owner_did: firstString(repo.owner_did, repo.ownerDid, repo.owner?.did),
    name: firstString(repo.name, repo.slug),
    created_at: firstString(repo.created_at, repo.createdAt),
    updated_at: firstString(repo.updated_at, repo.updatedAt),
  }
}

function parseGitlawbCliRepos(body) {
  if (Array.isArray(body)) {
    return body.map(normalizeGitlawbCliRepo).filter(Boolean)
  }
  if (body && typeof body === 'object') {
    return parseGitlawbCliRepos(body.repos ?? body.data ?? body.repositories)
  }
  return []
}

async function fetchGitlawbReposWithCli(options = {}) {
  const execFileImpl = options.execFileImpl ?? execFile
  if (typeof execFileImpl !== 'function') {
    throw options.cause ?? new Error('fetch is required to scan GitLawb repos')
  }
  const body = await execFileJson(execFileImpl, 'gl', ['repo', 'list', '--json'])
  return parseGitlawbCliRepos(body)
}

export function findGitlawbRepoByDid(repos, repoDid) {
  const normalizedRepoDid = asString(repoDid)
  if (!GITLAWB_REPO_DID_PATTERN.test(normalizedRepoDid)) {
    throw new Error('repo DID must match did:gitlawb:<safe-id>')
  }
  return (Array.isArray(repos) ? repos : []).find((repo) => getRepoDid(repo) === normalizedRepoDid) ?? null
}

export async function runOneShotSubmit(options = {}) {
  const repoDid = asString(options.repoDid ?? options.repo_did)
  if (!repoDid) {
    throw new Error('submit-one-shot requires a repo DID')
  }
  if (!GITLAWB_REPO_DID_PATTERN.test(repoDid)) {
    throw new Error('repo DID must match did:gitlawb:<safe-id>')
  }

  const storedConfig = options.config ?? await readJsonFile(computeGitlawbStoragePaths(options).configPath)
  const config = normalizeGitlawbConfig(storedConfig)
  const repos = Array.isArray(options.repos) ? options.repos : await fetchGitlawbRepos({ config, fetchImpl: options.fetchImpl, execFileImpl: options.execFileImpl })
  const repo = findGitlawbRepoByDid(repos, repoDid)
  if (!repo) {
    throw new Error(`GitLawb repo not found: ${repoDid}`)
  }
  validateNativeRepoMetadata(repo, config)
  if (options.experimentalNativeSubmit !== true && config.experimental_native_submit !== true) {
    throw new Error('Agent-native submit is not enabled on VibeCemetery backend; use submit-delegated')
  }

  const request = buildAgentAshRequest({
    repo,
    config,
    declaredDeadAt: options.now ?? options.declaredDeadAt ?? new Date().toISOString(),
    diagnosis: options.diagnosis,
  })
  const submitted = await submitAgentAshNativeRequest({ config, request, fetchImpl: options.fetchImpl })
  return {
    status: submitted.status,
    repo_did: repoDid,
    certificate_id: request.certificate.identity.certificate_id,
    id: submitted.body?.id,
    certificate_hash: submitted.body?.certificate_hash,
    url: submitted.body?.url,
    certificate_url: submitted.body?.certificate_url,
    verification_policy: submitted.body?.verification_policy,
  }
}

export async function runDelegatedSubmit(options = {}) {
  const repoDid = asString(options.repoDid ?? options.repo_did)
  if (!repoDid) {
    throw new Error('submit-delegated requires a repo DID')
  }
  if (!GITLAWB_REPO_DID_PATTERN.test(repoDid)) {
    throw new Error('repo DID must match did:gitlawb:<safe-id>')
  }

  const storedConfig = options.config ?? await readJsonFile(computeGitlawbStoragePaths(options).configPath)
  const config = normalizeGitlawbConfig(storedConfig)
  const repos = Array.isArray(options.repos) ? options.repos : await fetchGitlawbRepos({ config, fetchImpl: options.fetchImpl, execFileImpl: options.execFileImpl })
  const repo = findGitlawbRepoByDid(repos, repoDid)
  if (!repo) {
    throw new Error(`GitLawb repo not found: ${repoDid}`)
  }

  const request = buildAgentAshRequest({
    repo,
    config,
    declaredDeadAt: options.now ?? options.declaredDeadAt ?? new Date().toISOString(),
    diagnosis: options.diagnosis,
  })
  const submitted = await submitAgentAshRequest({ config, request, fetchImpl: options.fetchImpl })
  return {
    status: submitted.status,
    repo_did: repoDid,
    certificate_id: request.certificate.identity.certificate_id,
    id: submitted.body?.id,
    certificate_hash: submitted.body?.certificate_hash,
    url: submitted.body?.url,
    certificate_url: submitted.body?.certificate_url,
    verification_policy: submitted.body?.verification_policy,
  }
}

export async function runOneShotVerify(options = {}) {
  const repoDid = asString(options.repoDid ?? options.repo_did)
  if (!repoDid) {
    throw new Error('verify-one-shot requires a repo DID')
  }
  if (!GITLAWB_REPO_DID_PATTERN.test(repoDid)) {
    throw new Error('repo DID must match did:gitlawb:<safe-id>')
  }

  const storedConfig = options.config ?? await readJsonFile(computeGitlawbStoragePaths(options).configPath)
  const config = normalizeGitlawbConfig(storedConfig)
  const repos = Array.isArray(options.repos) ? options.repos : await fetchGitlawbRepos({ config, fetchImpl: options.fetchImpl, execFileImpl: options.execFileImpl })
  const repo = findGitlawbRepoByDid(repos, repoDid)
  if (!repo) {
    throw new Error(`GitLawb repo not found: ${repoDid}`)
  }

  const readiness = getNativeReadiness(repo, config)
  if (!readiness.native_ready) {
    return {
      status: 'blocked_delegated_only',
      repo_did: repoDid,
      native_ready: false,
      missing: readiness.missing,
      invalid: readiness.invalid,
      fallback: 'connect-delegated',
    }
  }

  return {
    status: 'native_ready',
    repo_did: repoDid,
    native_ready: true,
    missing: [],
    invalid: [],
    fallback: null,
  }
}

export function normalizeWatchlist(watchlist = {}) {
  const repos = Array.isArray(watchlist.repos) ? watchlist.repos : []
  return {
    repos: [...new Set(repos.map(asString).filter((repoDid) => GITLAWB_REPO_DID_PATTERN.test(repoDid)))],
  }
}

export function buildWatchlistReport(options = {}) {
  const watchlist = normalizeWatchlist(options.watchlist)
  const watched = new Set(watchlist.repos)
  const now = normalizeIso(options.now ?? new Date().toISOString())
  const repos = Array.isArray(options.repos) ? options.repos : []
  const candidates = repos.flatMap((repo) => {
    const repoDid = getRepoDid(repo)
    if (!repoDid || !watched.has(repoDid)) {
      return []
    }

    const updatedAt = normalizeIso(repo.updated_at)
    const inactiveDays = daysBetween(updatedAt, now)
    if (inactiveDays < WATCHLIST_INACTIVITY_DAYS) {
      return []
    }

    const diagnosis = defaultDiagnosis(repo, now)
    return [{
      repo,
      repo_did: repoDid,
      name: getRepoName(repo),
      last_activity_at: updatedAt,
      inactive_days: inactiveDays,
      primary_cause: diagnosis.primary_cause,
      summary: diagnosis.summary,
    }]
  })

  return {
    candidates,
    notification: candidates.length > 0
      ? {
          type: 'gitlawb_watchlist_candidates',
          requires_approval: true,
          approval_options: ['all', 'none', 'selective'],
          candidate_count: candidates.length,
        }
      : null,
  }
}

export function applyWatchlistApproval(options = {}) {
  const candidates = Array.isArray(options.candidates)
    ? options.candidates
        .map((candidate) => ({ ...candidate, repo_did: asString(candidate?.repo_did) }))
        .filter((candidate) => GITLAWB_REPO_DID_PATTERN.test(candidate.repo_did))
    : []
  const approval = options.approval && typeof options.approval === 'object' ? options.approval : {}
  const mode = asString(approval.mode) || 'none'
  const allowedModes = new Set(['all', 'none', 'selective'])
  if (!allowedModes.has(mode)) {
    throw new Error(`Invalid approval mode: ${mode}`)
  }

  if (mode === 'none') {
    return []
  }

  const approvedDids = mode === 'all'
    ? new Set(candidates.map((candidate) => candidate.repo_did).filter(Boolean))
    : new Set(Array.isArray(approval.approved_repo_dids) ? approval.approved_repo_dids.map(asString).filter((repoDid) => GITLAWB_REPO_DID_PATTERN.test(repoDid)) : [])
  const overrides = approval.cause_overrides && typeof approval.cause_overrides === 'object' ? approval.cause_overrides : {}

  return candidates.flatMap((candidate) => {
    if (!approvedDids.has(candidate.repo_did)) {
      return []
    }

    const override = overrides[candidate.repo_did] && typeof overrides[candidate.repo_did] === 'object'
      ? overrides[candidate.repo_did]
      : {}
    const baseDiagnosis = {
      primary_cause: normalizeCause(candidate.primary_cause, 'unknown'),
      secondary_causes: [],
      failure_pattern: candidate.primary_cause === 'abandoned' ? 'public_gitlawb_repo_inactive_90_days' : 'operator_confirmed_failure',
      confidence: 0.72,
      preventable: true,
      severity: 'terminal',
      summary: sanitizeString(candidate.summary, STRING_LIMITS.summary, 'Human operator approved public Agent Ash submission.'),
    }
    const diagnosis = sanitizeDiagnosis(baseDiagnosis, override)

    return [{
      repo: candidate.repo,
      repo_did: candidate.repo_did,
      diagnosis,
      approval_metadata: {
        mode,
        approved_by: sanitizeString(approval.approved_by, STRING_LIMITS.approvalBy, 'human_operator'),
        approved_at: normalizeIso(approval.approved_at ?? new Date().toISOString()),
        notification_id: sanitizeOptionalString(approval.notification_id, STRING_LIMITS.notificationId),
        notification: normalizeApprovalNotification(approval.notification),
      },
    }]
  })
}

async function acquireScheduledScanLock(paths) {
  await fs.mkdir(paths.stateDir, { recursive: true, mode: 0o700 })
  try {
    await fs.mkdir(paths.lockPath, { mode: 0o700 })
    return true
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return false
    }
    throw error
  }
}

function hasExplicitScheduledApproval(approval = {}) {
  if (!approval || typeof approval !== 'object') {
    return false
  }
  const mode = asString(approval.mode)
  if (mode !== 'all' && mode !== 'selective') {
    return false
  }
  if (!asString(approval.approved_by) || !asString(approval.approved_at)) {
    return false
  }
  try {
    normalizeIso(approval.approved_at)
    return true
  } catch {
    return false
  }
}

export async function runScheduledWatchlistScan(options = {}) {
  const paths = computeAgentAshStatePaths(options)
  const now = normalizeIso(options.now ?? new Date().toISOString())
  const locked = await acquireScheduledScanLock(paths)
  if (!locked) {
    await writeJsonFile(paths.statePath, {
      last_scan_at: now,
      last_status: 'locked',
      candidate_count: 0,
      submitted_count: 0,
    })
    await appendJsonLine(paths.logsPath, { event: 'scheduled_scan_locked', at: now, status: 'locked' })
    return { status: 'locked', candidates: [], candidate_count: 0, submitted: [], submitted_count: 0 }
  }

  try {
    await appendJsonLine(paths.logsPath, { event: 'scheduled_scan_started', at: now })
    const storedConfig = options.config ?? await readJsonFile(computeGitlawbStoragePaths(options).configPath)
    const config = normalizeGitlawbConfig(storedConfig)
    const scheduledApprovalPolicy = normalizeScheduledApprovalPolicy(options, storedConfig)
    const watchlist = options.watchlist ?? await readJsonFile(computeGitlawbStoragePaths(options).watchlistPath)
    const repos = (Array.isArray(options.repos)
      ? options.repos
      : await fetchGitlawbRepos({ config, fetchImpl: options.fetchImpl, execFileImpl: options.execFileImpl }))
      .slice(0, MAX_SCHEDULED_REPOS)
    const report = buildWatchlistReport({ repos, watchlist, now })
    report.candidates = report.candidates.slice(0, MAX_SCHEDULED_CANDIDATES)
    if (report.notification) {
      report.notification.candidate_count = report.candidates.length
    }
    const approval = options.approval ?? { mode: 'none' }
    const requestedApprovalMode = asString(approval.mode) || 'none'
    const approved = scheduledApprovalPolicy === 'none'
      ? []
      : applyWatchlistApproval({ candidates: report.candidates, approval })
    const submitted = []
    let status = 'completed'

    if (scheduledApprovalPolicy === 'none' && report.candidates.length > 0 && requestedApprovalMode !== 'none') {
      status = 'blocked_approval_policy_none'
    } else if (approved.length > 0 && !hasExplicitScheduledApproval(approval)) {
      status = 'blocked_missing_explicit_approval'
    } else if (approved.length > 0 && !AGENT_ASH_TOKEN_PATTERN.test(config.agent_ash_token)) {
      status = 'blocked_missing_agent_ash_token'
    } else {
      for (const item of approved) {
        const request = buildAgentAshRequest({
          repo: item.repo,
          config,
          declaredDeadAt: now,
          diagnosis: item.diagnosis,
          approvalMetadata: item.approval_metadata,
        })
        submitted.push(await submitAgentAshRequest({ config, request, fetchImpl: options.fetchImpl }))
      }
    }

    const result = {
      status,
      candidates: report.candidates,
      candidate_count: report.candidates.length,
      submitted,
      submitted_count: submitted.length,
    }
    await writeJsonFile(paths.statePath, {
      last_scan_at: now,
      last_status: status,
      candidate_count: result.candidate_count,
      submitted_count: result.submitted_count,
    })
    await appendJsonLine(paths.logsPath, {
      event: 'scheduled_scan_completed',
      at: now,
      status,
      candidate_count: result.candidate_count,
      submitted_count: result.submitted_count,
    })
    return result
  } finally {
    await fs.rm(paths.lockPath, { recursive: true, force: true })
  }
}

export function parseCliArgs(argv = []) {
  const command = asString(argv[0])
  if (!command) {
    return { command: 'noop' }
  }
  if (command === 'scheduled-scan' || command === 'scan-watchlist') {
    return { command: 'scheduled-scan' }
  }
  if (command === 'connect' || command === 'connect-delegated') {
    return { command: 'connect' }
  }
  if (command === 'submit-one-shot' || command === 'verify-one-shot' || command === 'submit-delegated') {
    const repoDid = asString(argv[1])
    if (!repoDid) {
      throw new Error(`${command} requires a repo DID`)
    }
    if (!GITLAWB_REPO_DID_PATTERN.test(repoDid)) {
      throw new Error('repo DID must match did:gitlawb:<safe-id>')
    }
    return { command, repoDid }
  }
  throw new Error(`Unknown gitlawb-helper command: ${command}`)
}

function toCliPrintableResult(result) {
  if (!result || typeof result !== 'object') {
    return result
  }
  return {
    status: result.status,
    candidate_count: result.candidate_count,
    submitted_count: result.submitted_count,
    candidates: (Array.isArray(result.candidates) ? result.candidates : []).map((candidate) => ({
      repo_did: candidate?.repo_did,
      name: candidate?.name,
      last_activity_at: candidate?.last_activity_at,
      inactive_days: candidate?.inactive_days,
      primary_cause: candidate?.primary_cause,
      summary: candidate?.summary,
    })),
    submitted: (Array.isArray(result.submitted) ? result.submitted : []).map((item) => ({
      status: item?.status,
      id: item?.body?.id,
      certificate_hash: item?.body?.certificate_hash,
      verification_policy: item?.body?.verification_policy,
      url: item?.body?.url,
      certificate_url: item?.body?.certificate_url,
    })),
  }
}

export async function runCliCommand(argv = [], options = {}) {
  const parsed = parseCliArgs(argv)
  const log = typeof options.log === 'function' ? options.log : console.log

  if (parsed.command === 'noop') {
    return null
  }

  if (parsed.command === 'connect') {
    const storedConfig = options.config ?? await readJsonFile(computeGitlawbStoragePaths(options).configPath)
    const stored = await connectAgentAsh({ ...options, config: storedConfig })
    const result = {
      status: 'connected',
      vc_url: normalizeVcUrl(stored.vc_url),
      gitlawb_node_url: normalizeGitlawbNodeUrl(stored.gitlawb_node_url),
      agent_name: sanitizeString(stored.agent_name, STRING_LIMITS.agentName, 'hermes'),
      agent_did: sanitizeString(stored.agent_did, STRING_LIMITS.agentDid) || undefined,
    }
    log(JSON.stringify(result, null, 2))
    return result
  }

  if (parsed.command === 'submit-one-shot') {
    const result = await runOneShotSubmit({ ...options, repoDid: parsed.repoDid })
    log(JSON.stringify(result, null, 2))
    return result
  }

  if (parsed.command === 'verify-one-shot') {
    const result = await runOneShotVerify({ ...options, repoDid: parsed.repoDid })
    log(JSON.stringify(result, null, 2))
    return result
  }

  if (parsed.command === 'submit-delegated') {
    const result = await runDelegatedSubmit({ ...options, repoDid: parsed.repoDid })
    log(JSON.stringify(result, null, 2))
    return result
  }

  const result = await runScheduledWatchlistScan(options)
  log(JSON.stringify(toCliPrintableResult(result), null, 2))
  return result
}

async function runCli() {
  try {
    await runCliCommand(process.argv.slice(2))
  } catch (error) {
    console.error(redactSecretLikeText(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await runCli()
}
