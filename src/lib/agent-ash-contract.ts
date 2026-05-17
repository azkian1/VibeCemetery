import { isAgentAshDeathStage, isAgentAshPrimaryCause, isAgentAshSecondaryCause, isAgentAshValueLevel } from './agent-ash-taxonomy'

export const AGENT_ASH_SCHEMA_VERSION = 'agent_ash.v1'
export const AGENT_ASH_PROOF_TYPE = 'gitlawb_http_node_v1'

type JsonObject = Record<string, unknown>

export interface AgentAshRequest {
  certificate: AgentAshCertificate
  proof: AgentAshProof
}

export interface AgentAshCertificate extends JsonObject {
  schema_version: typeof AGENT_ASH_SCHEMA_VERSION
  identity: JsonObject & {
    kind: string
    source: string
    certificate_id?: string
    visibility?: string
    verification_status?: string
  }
  subject: JsonObject & {
    name: string
    repo_did: string
    path?: string
    url?: string
    host?: string
  }
  lifecycle: JsonObject & {
    created_at: string
    last_activity_at: string
    declared_dead_at: string
    lifespan_hours?: number
    death_stage?: string
  }
  technical_profile: JsonObject
  diagnosis: JsonObject & {
    primary_cause: string
    summary: string
  }
  evidence: JsonObject & {
    signals: unknown[]
  }
  value: JsonObject
  agent: JsonObject & {
    name: string
    did?: string
  }
  raw?: JsonObject
}

export interface AgentAshProof extends JsonObject {
  type: typeof AGENT_ASH_PROOF_TYPE
  repo_did: string
  node_url: string
  observed_created_at: string
  observed_updated_at: string
  verification_url?: string
  signature?: string | null
  signed_by?: string
}

export type AgentAshValidationResult =
  | { ok: true; value: AgentAshRequest }
  | { ok: false; error: string }

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requireObject(parent: JsonObject, key: string, path: string): JsonObject | string {
  const value = parent[key]
  return isObject(value) ? value : `${path} is required`
}

function requiredStringError(parent: JsonObject, key: string, path: string): string | null {
  const value = parent[key]
  return typeof value === 'string' && value.trim() ? null : `${path} is required`
}

function timestampError(parent: JsonObject, key: string, path: string): string | null {
  const value = parent[key]
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? null
    : `${path} must be a valid ISO timestamp`
}

function optionalStringError(parent: JsonObject, key: string, path: string): string | null {
  const value = parent[key]
  return value === undefined || typeof value === 'string' ? null : `${path} must be a string`
}

function optionalStringOrNullError(parent: JsonObject, key: string, path: string): string | null {
  const value = parent[key]
  return value === undefined || value === null || typeof value === 'string'
    ? null
    : `${path} must be a string or null`
}

function requireArray(parent: JsonObject, key: string, path: string): unknown[] | string {
  const value = parent[key]
  return Array.isArray(value) ? value : `${path} is required`
}

function fail(error: string): AgentAshValidationResult {
  return { ok: false, error }
}

export function validateAgentAshRequest(value: unknown): AgentAshValidationResult {
  if (!isObject(value)) return fail('request body must be a JSON object')

  const certificate = requireObject(value, 'certificate', 'certificate')
  if (typeof certificate === 'string') return fail(certificate)

  const proof = requireObject(value, 'proof', 'proof')
  if (typeof proof === 'string') return fail(proof)

  if (certificate.schema_version !== AGENT_ASH_SCHEMA_VERSION) {
    return fail('certificate.schema_version must be agent_ash.v1')
  }

  const identity = requireObject(certificate, 'identity', 'certificate.identity')
  if (typeof identity === 'string') return fail(identity)

  const subject = requireObject(certificate, 'subject', 'certificate.subject')
  if (typeof subject === 'string') return fail(subject)

  const lifecycle = requireObject(certificate, 'lifecycle', 'certificate.lifecycle')
  if (typeof lifecycle === 'string') return fail(lifecycle)

  const technicalProfile = requireObject(certificate, 'technical_profile', 'certificate.technical_profile')
  if (typeof technicalProfile === 'string') return fail(technicalProfile)

  const diagnosis = requireObject(certificate, 'diagnosis', 'certificate.diagnosis')
  if (typeof diagnosis === 'string') return fail(diagnosis)

  const evidence = requireObject(certificate, 'evidence', 'certificate.evidence')
  if (typeof evidence === 'string') return fail(evidence)

  const ashValue = requireObject(certificate, 'value', 'certificate.value')
  if (typeof ashValue === 'string') return fail(ashValue)

  const agent = requireObject(certificate, 'agent', 'certificate.agent')
  if (typeof agent === 'string') return fail(agent)

  const requiredStrings: Array<[JsonObject, string, string]> = [
    [identity, 'kind', 'certificate.identity.kind'],
    [identity, 'source', 'certificate.identity.source'],
    [subject, 'name', 'certificate.subject.name'],
    [subject, 'repo_did', 'certificate.subject.repo_did'],
    [lifecycle, 'created_at', 'certificate.lifecycle.created_at'],
    [lifecycle, 'last_activity_at', 'certificate.lifecycle.last_activity_at'],
    [lifecycle, 'declared_dead_at', 'certificate.lifecycle.declared_dead_at'],
    [diagnosis, 'primary_cause', 'certificate.diagnosis.primary_cause'],
    [diagnosis, 'summary', 'certificate.diagnosis.summary'],
    [agent, 'name', 'certificate.agent.name'],
    [proof, 'type', 'proof.type'],
    [proof, 'repo_did', 'proof.repo_did'],
    [proof, 'node_url', 'proof.node_url'],
    [proof, 'observed_created_at', 'proof.observed_created_at'],
    [proof, 'observed_updated_at', 'proof.observed_updated_at'],
  ]

  for (const [parent, key, path] of requiredStrings) {
    const error = requiredStringError(parent, key, path)
    if (error) return fail(error)
  }

  const timestampErrors = [
    timestampError(lifecycle, 'created_at', 'certificate.lifecycle.created_at'),
    timestampError(lifecycle, 'last_activity_at', 'certificate.lifecycle.last_activity_at'),
    timestampError(lifecycle, 'declared_dead_at', 'certificate.lifecycle.declared_dead_at'),
    timestampError(proof, 'observed_created_at', 'proof.observed_created_at'),
    timestampError(proof, 'observed_updated_at', 'proof.observed_updated_at'),
  ]
  for (const error of timestampErrors) {
    if (error) return fail(error)
  }

  const signals = requireArray(evidence, 'signals', 'certificate.evidence.signals')
  if (typeof signals === 'string') return fail(signals)

  const optionalErrors = [
    optionalStringError(agent, 'did', 'certificate.agent.did'),
    optionalStringOrNullError(proof, 'signature', 'proof.signature'),
    optionalStringError(proof, 'signed_by', 'proof.signed_by'),
  ]
  for (const error of optionalErrors) {
    if (error) return fail(error)
  }

  if (certificate.raw !== undefined && !isObject(certificate.raw)) {
    return fail('certificate.raw must be an object')
  }

  if (identity.kind !== 'ash') return fail('certificate.identity.kind must be ash')
  if (identity.source !== 'gitlawb') return fail('certificate.identity.source must be gitlawb')
  if (identity.verification_status !== undefined && identity.verification_status !== 'gitlawb_http_verified') {
    return fail('certificate.identity.verification_status must be gitlawb_http_verified')
  }
  if (!isAgentAshPrimaryCause(diagnosis.primary_cause)) {
    return fail('certificate.diagnosis.primary_cause must be a supported Agent Ash cause')
  }
  if (diagnosis.secondary_causes !== undefined) {
    if (!Array.isArray(diagnosis.secondary_causes) || !diagnosis.secondary_causes.every(isAgentAshSecondaryCause)) {
      return fail('certificate.diagnosis.secondary_causes must contain only supported Agent Ash secondary causes')
    }
  }
  if (lifecycle.death_stage !== undefined && !isAgentAshDeathStage(lifecycle.death_stage)) {
    return fail('certificate.lifecycle.death_stage must be a supported Agent Ash death stage')
  }
  if (ashValue.lesson_value !== undefined && !isAgentAshValueLevel(ashValue.lesson_value)) {
    return fail('certificate.value.lesson_value must be a supported Agent Ash value level')
  }
  if (ashValue.reuse_value !== undefined && !isAgentAshValueLevel(ashValue.reuse_value)) {
    return fail('certificate.value.reuse_value must be a supported Agent Ash value level')
  }
  if (proof.type !== AGENT_ASH_PROOF_TYPE) return fail('proof.type must be gitlawb_http_node_v1')
  if (proof.repo_did !== subject.repo_did) {
    return fail('proof.repo_did must match certificate.subject.repo_did')
  }

  return { ok: true, value: value as unknown as AgentAshRequest }
}
