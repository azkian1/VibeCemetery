import { NextResponse } from 'next/server'

type JsonObject = Record<string, unknown>

export interface AgentAshReadRecord {
  id: string
  subject_name: string
  repo_did: string | null
  agent_name: string | null
  agent_did?: string | null
  primary_cause: string
  failure_pattern?: string | null
  death_stage?: string | null
  verification_status: string
  verification_url?: string | null
  declared_dead_at?: string | null
  created_at: string
  certificate: JsonObject
  proof?: JsonObject | null
}

export interface AgentAshReadStore {
  countVerified(): Promise<number>
  listVerified(): Promise<AgentAshReadRecord[]>
  findVerifiedById(id: string): Promise<AgentAshReadRecord | null>
}

interface CountItem {
  value: string
  count: number
}

function noStoreHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store' }
}

function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...noStoreHeaders(),
      ...init?.headers,
    },
  })
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isSecretLikeKey(key: string): boolean {
  return /token|secret|password|authorization|api[_-]?key|private[_-]?key/i.test(key)
}

function isSecretLikeString(value: string): boolean {
  return /\bBearer\s+(?:ash_|vc_cli_)[A-Za-z0-9._~-]+|\b(?:ash_|vc_cli_)[A-Za-z0-9._~-]{16,}/.test(value)
}

function redactPublicCertificateValue(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    return isSecretLikeKey(key) || isSecretLikeString(value) ? '[redacted]' : value
  }
  if (Array.isArray(value)) return value.map((item) => redactPublicCertificateValue(item))
  if (!isObject(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactPublicCertificateValue(entryValue, entryKey)]),
  )
}

function countValues(values: Array<string | null | undefined>, limit = 5): CountItem[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function getLanguages(record: AgentAshReadRecord): string[] {
  const technicalProfile = record.certificate.technical_profile
  if (!isObject(technicalProfile) || !Array.isArray(technicalProfile.languages)) return []
  return technicalProfile.languages.filter((language): language is string => typeof language === 'string' && Boolean(language.trim()))
}

function getDomain(record: AgentAshReadRecord): string | null {
  const subject = record.certificate.subject
  return isObject(subject) && typeof subject.domain === 'string' ? subject.domain : null
}

function getPublicAgentName(record: AgentAshReadRecord): string | null {
  return record.agent_name?.trim() || null
}

function toPublicSummaryRecord(record: AgentAshReadRecord) {
  return {
    id: record.id,
    subject_name: record.subject_name,
    repo_did: record.repo_did,
    agent_name: record.agent_name,
    agent_did: record.agent_did ?? null,
    primary_cause: record.primary_cause,
    failure_pattern: record.failure_pattern ?? null,
    death_stage: record.death_stage ?? null,
    verification_status: record.verification_status,
    verification_url: record.verification_url ?? null,
    declared_dead_at: record.declared_dead_at ?? null,
    created_at: record.created_at,
  }
}

export function buildAgentAshSummary(records: AgentAshReadRecord[], options: { totalVerifiedAsh?: number } = {}) {
  const verified = records.filter((record) => record.verification_status === 'gitlawb_http_verified')
  const recent = [...verified].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5)

  return {
    total_verified_ash: options.totalVerifiedAsh ?? verified.length,
    sampled_verified_ash: verified.length,
    distinct_agents: new Set(verified.map(getPublicAgentName).filter(Boolean)).size,
    analytics_window: 'recent_verified_ash',
    analytics_window_limit: 50,
    top_primary_causes: countValues(verified.map((record) => record.primary_cause)),
    top_failure_patterns: countValues(verified.map((record) => record.failure_pattern)),
    common_death_stages: countValues(verified.map((record) => record.death_stage)),
    top_agents: countValues(verified.map(getPublicAgentName)),
    fragile_stacks: countValues(verified.flatMap(getLanguages)),
    top_domains: countValues(verified.map(getDomain)),
    recent_verified_ash: recent.map(toPublicSummaryRecord),
  }
}

function toDetailRecord(record: AgentAshReadRecord) {
  return toPublicSummaryRecord(record)
}

function isValidAshLookupId(id: string): boolean {
  return id.length > 0 && id.length <= 160 && /^[A-Za-z0-9:_-]+$/.test(id)
}

export function createAgentAshReadHandlers(store: AgentAshReadStore) {
  return {
    async summary() {
      const [records, totalVerifiedAsh] = await Promise.all([store.listVerified(), store.countVerified()])
      return json(buildAgentAshSummary(records, { totalVerifiedAsh }))
    },
    async detail(id: string) {
      if (!isValidAshLookupId(id)) return json({ error: 'Invalid Agent Ash id' }, { status: 400 })
      const record = await store.findVerifiedById(id)
      if (!record) return json({ error: 'Agent Ash record not found' }, { status: 404 })
      return json(toDetailRecord(record))
    },
    async certificate(id: string) {
      if (!isValidAshLookupId(id)) return json({ error: 'Invalid Agent Ash id' }, { status: 400 })
      const record = await store.findVerifiedById(id)
      if (!record) return json({ error: 'Agent Ash record not found' }, { status: 404 })
      return json(redactPublicCertificateValue({ ...record.certificate, ...(record.proof && { proof: record.proof }) }))
    },
  }
}

export function createSupabaseAgentAshReadStore(): AgentAshReadStore {
  const summaryFields = 'id, subject_name, repo_did, agent_name, agent_did, primary_cause, failure_pattern, death_stage, verification_status, verification_url, declared_dead_at, created_at, certificate'
  const detailFields = 'id, subject_name, repo_did, agent_name, agent_did, primary_cause, failure_pattern, death_stage, verification_status, verification_url, declared_dead_at, created_at, certificate, proof'

  return {
    async countVerified() {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { count, error } = await supabaseAdmin
        .from('agent_ashes')
        .select('id', { count: 'exact', head: true })
        .eq('verification_status', 'gitlawb_http_verified')

      if (error) throw error
      return count ?? 0
    },
    async listVerified() {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ashes')
        .select(summaryFields)
        .eq('verification_status', 'gitlawb_http_verified')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data ?? []) as AgentAshReadRecord[]
    },
    async findVerifiedById(id) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ashes')
        .select(detailFields)
        .eq('id', id)
        .eq('verification_status', 'gitlawb_http_verified')
        .maybeSingle()

      if (error) throw error
      return data as AgentAshReadRecord | null
    },
  }
}
