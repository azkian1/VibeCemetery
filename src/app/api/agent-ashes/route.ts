import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { validateAgentAshRequest, type AgentAshRequest } from '@/lib/agent-ash-contract'
import { getSiteUrl } from '@/lib/site'
import {
  agentAshNoStoreHeaders,
  checkAgentAshIngestRateLimit,
  getAgentAshAllowedNodeUrls,
  readAgentAshJsonWithLimit,
  validateAgentAshProofSecurity,
} from '@/lib/agent-ash-security'
import { authorizeAgentAshIngestRequest, createSupabaseAgentAshAuthStore, type AgentAshAuthStore, type AgentAshTokenRecord } from '@/lib/agent-ash-auth'
import { verifyGitlawbHttpProof, type GitlawbVerificationResult } from '@/lib/gitlawb-verification'
type AgentAshRecordRef = { id: string }

export const AGENT_ASH_WRITE_VERIFICATION_POLICY = 'external_source_verified_once_before_insert'

export interface AgentAshInsertRow {
  certificate_hash: string
  schema_version: string
  source: string
  repo_did: string
  agent_did?: string
  agent_name: string
  subject_name: string
  subject_path?: string
  subject_url?: string
  primary_cause: string
  failure_pattern?: string
  death_stage?: string
  confidence?: number
  created_at_source: string
  last_activity_at: string
  declared_dead_at: string
  verification_status: 'gitlawb_http_verified'
  verification_url?: string
  certificate: AgentAshRequest['certificate']
  proof: AgentAshRequest['proof']
  agent_ash_token_id?: string
  authorized_agent_name?: string
  authorized_agent_did?: string
  authorized_by_user_id?: string
}

export interface AgentAshStore {
  findByCertificateHash(certificateHash: string): Promise<AgentAshRecordRef | null>
  findConflict(repoDid: string, declaredDeadAt: string): Promise<AgentAshRecordRef | null>
  insert(row: AgentAshInsertRow): Promise<AgentAshRecordRef>
}

interface HandlerDependencies {
  store: AgentAshStore
  authStore?: Pick<AgentAshAuthStore, 'findTokenByHash' | 'markTokenUsed'>
  allowedNodeUrls?: string[]
  verify?: (request: AgentAshRequest, options: { allowedNodeUrls: string[] }) => Promise<GitlawbVerificationResult>
  rateLimit?: typeof checkAgentAshIngestRateLimit
}

function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...agentAshNoStoreHeaders(),
      ...init?.headers,
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === '23505'
}

function normalizeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return null
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`
  }

  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(',')}}`
  }

  return JSON.stringify(value)
}

export function computeCertificateHash(certificate: unknown): string {
  return createHash('sha256').update(stableJsonStringify(certificate)).digest('hex')
}

export function buildAgentAshInsertRow(
  request: AgentAshRequest,
  certificateHash: string,
  verificationUrl?: string,
  authToken?: AgentAshTokenRecord | null,
): AgentAshInsertRow {
  return {
    certificate_hash: certificateHash,
    schema_version: request.certificate.schema_version,
    source: request.certificate.identity.source,
    repo_did: request.certificate.subject.repo_did,
    ...(request.certificate.agent.did && { agent_did: request.certificate.agent.did }),
    agent_name: request.certificate.agent.name,
    subject_name: request.certificate.subject.name,
    ...(request.certificate.subject.path && { subject_path: request.certificate.subject.path }),
    ...(request.certificate.subject.url && { subject_url: request.certificate.subject.url }),
    primary_cause: request.certificate.diagnosis.primary_cause,
    ...(typeof request.certificate.diagnosis.failure_pattern === 'string' && { failure_pattern: request.certificate.diagnosis.failure_pattern }),
    ...(typeof request.certificate.lifecycle.death_stage === 'string' && { death_stage: request.certificate.lifecycle.death_stage }),
    ...(typeof request.certificate.diagnosis.confidence === 'number' && { confidence: request.certificate.diagnosis.confidence }),
    created_at_source: request.certificate.lifecycle.created_at,
    last_activity_at: request.certificate.lifecycle.last_activity_at,
    declared_dead_at: request.certificate.lifecycle.declared_dead_at,
    verification_status: 'gitlawb_http_verified',
    ...(verificationUrl && { verification_url: verificationUrl }),
    certificate: request.certificate,
    proof: request.proof,
    ...(authToken && {
      agent_ash_token_id: authToken.id,
      authorized_agent_name: authToken.agent_name,
      ...(authToken.agent_did && { authorized_agent_did: authToken.agent_did }),
      authorized_by_user_id: authToken.created_by_user_id,
    }),
  }
}

export async function handleAgentAshPost(
  request: Request,
  dependencies: HandlerDependencies,
): Promise<NextResponse> {
  const auth = await authorizeAgentAshIngestRequest(request, dependencies.authStore ?? createSupabaseAgentAshAuthStore())
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status })
  const authToken = ('token' in auth ? auth.token : null) as AgentAshTokenRecord | null

  const allowedNodeUrls = dependencies.allowedNodeUrls ?? getAgentAshAllowedNodeUrls()

  const rateLimit = await (dependencies.rateLimit ?? checkAgentAshIngestRateLimit)(request as NextRequest)
  if (!rateLimit.allowed) {
    return json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)) } },
    )
  }

  const body = await readAgentAshJsonWithLimit(request)
  if (!body.ok) return json({ error: body.error }, { status: body.status })

  const validation = validateAgentAshRequest(body.value)
  if (!validation.ok) return json({ error: validation.error }, { status: 400 })

  if (authToken && (
    authToken.agent_name !== validation.value.certificate.agent.name ||
    (authToken.agent_did && authToken.agent_did !== validation.value.certificate.agent.did)
  )) {
    return json({ error: 'Agent Ash token does not match certificate agent' }, { status: 403 })
  }

  if (authToken && normalizeHttpsUrl(authToken.gitlawb_node_url) !== normalizeHttpsUrl(validation.value.proof.node_url)) {
    return json({ error: 'Agent Ash token does not match approved GitLawb node' }, { status: 403 })
  }

  const security = validateAgentAshProofSecurity(validation.value.proof, allowedNodeUrls)
  if (!security.ok) return json({ error: security.error }, { status: security.status })

  const certificateHash = computeCertificateHash(validation.value.certificate)
  const duplicate = await dependencies.store.findByCertificateHash(certificateHash)
  if (duplicate) return json({ error: 'Agent Ash certificate already exists' }, { status: 409 })

  const conflict = await dependencies.store.findConflict(
    validation.value.certificate.subject.repo_did,
    validation.value.certificate.lifecycle.declared_dead_at,
  )
  if (conflict) return json({ error: 'Agent Ash record already exists for this repo death' }, { status: 409 })

  const verifier = dependencies.verify ?? verifyGitlawbHttpProof
  const verification = await verifier(validation.value, { allowedNodeUrls })
  if (!verification.ok) return json({ error: verification.reason }, { status: 422 })

  const row = buildAgentAshInsertRow(validation.value, certificateHash, verification.verificationUrl, authToken)
  let inserted: AgentAshRecordRef
  try {
    inserted = await dependencies.store.insert(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      return json({ error: 'Agent Ash record already exists' }, { status: 409 })
    }
    throw error
  }

  return json({
    id: inserted.id,
    certificate_hash: certificateHash,
    verification_policy: AGENT_ASH_WRITE_VERIFICATION_POLICY,
    url: `${getSiteUrl()}/api/agent-ashes/${inserted.id}`,
    certificate_url: `${getSiteUrl()}/api/agent-ashes/${inserted.id}/certificate`,
  }, { status: 201 })
}

function createSupabaseAgentAshStore(): AgentAshStore {
  return {
    async findByCertificateHash(certificateHash) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ashes')
        .select('id')
        .eq('certificate_hash', certificateHash)
        .maybeSingle()

      if (error) throw error
      return data as AgentAshRecordRef | null
    },
    async findConflict(repoDid, declaredDeadAt) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ashes')
        .select('id')
        .eq('repo_did', repoDid)
        .eq('declared_dead_at', declaredDeadAt)
        .maybeSingle()

      if (error) throw error
      return data as AgentAshRecordRef | null
    },
    async insert(row) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ashes')
        .insert(row)
        .select('id')
        .single()

      if (error) throw error
      return data as AgentAshRecordRef
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handleAgentAshPost(request, { store: createSupabaseAgentAshStore() })
  } catch (error) {
    console.error('Agent Ash ingest failed:', error)
    return json({ error: 'Failed to ingest Agent Ash' }, { status: 500 })
  }
}
