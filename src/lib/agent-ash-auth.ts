import { createHash, createHmac, randomBytes } from 'node:crypto'
import { extractBearerToken } from './cli-auth'
import { isAgentAshIngestToken } from './agent-ash-boundary'

if (typeof window !== 'undefined') {
  throw new Error('agent-ash-auth helpers must only run on the server')
}

const AGENT_ASH_TOKEN_PREFIX = 'ash_'
const AGENT_ASH_CLAIM_PREFIX = 'claim_'
const AGENT_ASH_LINK_PREFIX = 'ashlink_'
const AGENT_ASH_LINK_TTL_MS = 10 * 60 * 1000

export const AGENT_ASH_SCOPE_WRITE = 'agent_ashes:write'

export interface AgentAshLinkSession {
  id: string
  claim_token_hash: string
  agent_name: string
  agent_did?: string
  gitlawb_node_url: string
  public_key?: string
  scopes: string[]
  created_at: string
  expires_at: string
  approved_at?: string | null
  denied_at?: string | null
  claimed_at?: string | null
  token_id?: string | null
  created_by_user_id?: string | null
}

export interface AgentAshTokenRecord {
  id: string
  token_hash: string
  token_prefix: string
  agent_name: string
  agent_did?: string
  gitlawb_node_url: string
  public_key?: string
  scopes: string[]
  created_by_user_id: string
  created_at: string
  last_used_at?: string | null
  revoked_at?: string | null
}

export interface AgentAshAuthStore {
  insertLinkSession(link: AgentAshLinkSession): Promise<void>
  getLinkSession(linkId: string): Promise<AgentAshLinkSession | null>
  updateLinkSession(linkId: string, updates: Partial<AgentAshLinkSession>): Promise<boolean>
  claimLinkSession(linkId: string, claimedAt: string): Promise<boolean>
  insertToken(token: AgentAshTokenRecord): Promise<void>
  revokeToken(tokenId: string): Promise<boolean>
  listTokensForUser(username: string): Promise<AgentAshTokenRecord[]>
  revokeTokenForUser(tokenId: string, username: string): Promise<boolean>
  findTokenByHash(tokenHash: string): Promise<AgentAshTokenRecord | null>
  markTokenUsed(tokenId: string): Promise<void>
}

function getAgentAshTokenSecret(secret = process.env.AGENT_ASH_TOKEN_SECRET?.trim()): string {
  if (!secret) throw new Error('Missing AGENT_ASH_TOKEN_SECRET')
  return secret
}

function noStoreJson(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init?.headers,
    },
  })
}

function randomId(prefix: string): string {
  return `${prefix}${randomBytes(18).toString('base64url')}`
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

function isAgentAshLinkId(value: string): boolean {
  return /^ashlink_[A-Za-z0-9_-]{12,}$/.test(value)
}

function isAgentAshClaimToken(value: string): boolean {
  return /^claim_[A-Za-z0-9_-]{20,}$/.test(value)
}

function getExpiresAt(now = Date.now()): string {
  return new Date(now + AGENT_ASH_LINK_TTL_MS).toISOString()
}

function isExpired(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now
}

export function createAgentAshLinkId(): string {
  return randomId(AGENT_ASH_LINK_PREFIX)
}

export function createAgentAshClaimToken(): string {
  return randomId(AGENT_ASH_CLAIM_PREFIX)
}

export function createAgentAshTokenId(): string {
  return randomBytes(18).toString('base64url')
}

export function hashAgentAshClaimToken(claimToken: string): string {
  return createHash('sha256').update(claimToken).digest('hex')
}

export function hashAgentAshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function buildAgentAshRawToken({ tokenId, secret }: { tokenId: string; secret: string }): string {
  const signature = createHmac('sha256', secret)
    .update(`agent-ash-token:${tokenId}`)
    .digest('base64url')

  return `${AGENT_ASH_TOKEN_PREFIX}${tokenId}.${signature}`
}

export function createAgentAshTokenRecord({ tokenId, secret }: { tokenId: string; secret: string }) {
  const rawToken = buildAgentAshRawToken({ tokenId, secret })
  return {
    rawToken,
    tokenHash: hashAgentAshToken(rawToken),
    tokenPrefix: `${rawToken.slice(0, 18)}...`,
  }
}

export async function handleAgentAshLinkStart(
  request: Request,
  options: { store: AgentAshAuthStore; siteUrl: string; now?: number },
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return noStoreJson({ error: 'Invalid or malformed request body' }, { status: 400 })
  }

  const data = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  const agentName = typeof data.agent_name === 'string' ? data.agent_name.trim() : ''
  const agentDid = typeof data.agent_did === 'string' ? data.agent_did.trim() : ''
  const gitlawbNodeUrl = typeof data.gitlawb_node_url === 'string' ? normalizeHttpsUrl(data.gitlawb_node_url) : null
  const publicKey = typeof data.public_key === 'string' ? data.public_key.trim() : ''

  if (!agentName || agentName.length > 64) return noStoreJson({ error: 'Invalid agent name' }, { status: 400 })
  if (!gitlawbNodeUrl) return noStoreJson({ error: 'Invalid GitLawb node URL' }, { status: 400 })
  if (gitlawbNodeUrl.length > 2048) return noStoreJson({ error: 'Invalid GitLawb node URL' }, { status: 400 })
  if (agentDid && (!agentDid.startsWith('did:') || agentDid.length > 256)) return noStoreJson({ error: 'Invalid agent DID' }, { status: 400 })
  if (publicKey && publicKey.length > 512) return noStoreJson({ error: 'Invalid public key' }, { status: 400 })

  const linkId = createAgentAshLinkId()
  const claimToken = createAgentAshClaimToken()
  const now = options.now ?? Date.now()
  const expiresAt = getExpiresAt(now)

  await options.store.insertLinkSession({
    id: linkId,
    claim_token_hash: hashAgentAshClaimToken(claimToken),
    agent_name: agentName,
    ...(agentDid && { agent_did: agentDid }),
    gitlawb_node_url: gitlawbNodeUrl,
    ...(publicKey && { public_key: publicKey }),
    scopes: [AGENT_ASH_SCOPE_WRITE],
    created_at: new Date(now).toISOString(),
    expires_at: expiresAt,
  })

  return noStoreJson({
    link_id: linkId,
    claim_token: claimToken,
    approve_url: `${options.siteUrl}/agent-ash/connect?link_id=${encodeURIComponent(linkId)}`,
    expires_at: expiresAt,
  })
}

export async function handleAgentAshLinkApprove(
  request: Request,
  options: { store: AgentAshAuthStore; username: string | null; secret?: string; now?: number },
): Promise<Response> {
  if (!options.username) return noStoreJson({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return noStoreJson({ error: 'Invalid or malformed request body' }, { status: 400 })
  }

  const data = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  const linkId = typeof data.link_id === 'string' ? data.link_id.trim() : ''
  const decision = typeof data.decision === 'string' ? data.decision.trim() : ''
  if (!isAgentAshLinkId(linkId)) return noStoreJson({ error: 'Invalid link id' }, { status: 400 })
  if (decision !== 'approve' && decision !== 'deny') return noStoreJson({ error: 'Invalid decision' }, { status: 400 })

  const link = await options.store.getLinkSession(linkId)
  if (!link) return noStoreJson({ error: 'Link session not found' }, { status: 404 })
  if (isExpired(link.expires_at, options.now)) return noStoreJson({ error: 'Link session expired' }, { status: 410 })
  if (link.claimed_at) return noStoreJson({ error: 'Link session already claimed' }, { status: 409 })
  if (link.approved_at || link.denied_at) return noStoreJson({ status: link.approved_at ? 'approved' : 'denied' })

  const now = new Date(options.now ?? Date.now()).toISOString()
  if (decision === 'deny') {
    await options.store.updateLinkSession(linkId, { denied_at: now, created_by_user_id: options.username })
    return noStoreJson({ status: 'denied' })
  }

  const tokenId = createAgentAshTokenId()
  const token = createAgentAshTokenRecord({ tokenId, secret: getAgentAshTokenSecret(options.secret) })
  await options.store.insertToken({
    id: tokenId,
    token_hash: token.tokenHash,
    token_prefix: token.tokenPrefix,
    agent_name: link.agent_name,
    ...(link.agent_did && { agent_did: link.agent_did }),
    gitlawb_node_url: link.gitlawb_node_url,
    ...(link.public_key && { public_key: link.public_key }),
    scopes: [AGENT_ASH_SCOPE_WRITE],
    created_by_user_id: options.username,
    created_at: now,
  })

  await options.store.updateLinkSession(linkId, {
    approved_at: now,
    token_id: tokenId,
    created_by_user_id: options.username,
  })

  return noStoreJson({ status: 'approved' })
}

function getLinkPublicStatus(link: AgentAshLinkSession, now?: number): 'pending' | 'approved' | 'denied' | 'claimed' | 'expired' {
  if (link.denied_at) return 'denied'
  if (link.claimed_at) return 'claimed'
  if (isExpired(link.expires_at, now)) return 'expired'
  if (link.approved_at) return 'approved'
  return 'pending'
}

export async function handleAgentAshLinkSession(
  request: Request,
  options: { store: Pick<AgentAshAuthStore, 'getLinkSession'>; now?: number },
): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const linkId = searchParams.get('link_id')?.trim() ?? ''

  if (!isAgentAshLinkId(linkId)) return noStoreJson({ error: 'Invalid link id' }, { status: 400 })

  const link = await options.store.getLinkSession(linkId)
  if (!link) return noStoreJson({ error: 'Link session not found' }, { status: 404 })

  return noStoreJson({
    status: getLinkPublicStatus(link, options.now),
    agent_name: link.agent_name,
    agent_did: link.agent_did ?? null,
    gitlawb_node_url: link.gitlawb_node_url,
    scopes: link.scopes,
    expires_at: link.expires_at,
  })
}

export async function handleAgentAshLinkStatus(
  request: Request,
  options: { store: AgentAshAuthStore; secret?: string; siteUrl?: string; now?: number },
): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const linkId = searchParams.get('link_id')?.trim() ?? ''
  const claimToken = extractBearerToken(request) ?? ''

  if (!isAgentAshLinkId(linkId)) return noStoreJson({ error: 'Invalid link id' }, { status: 400 })
  if (!isAgentAshClaimToken(claimToken)) return noStoreJson({ error: 'Invalid claim token' }, { status: 401 })

  const link = await options.store.getLinkSession(linkId)
  if (!link) return noStoreJson({ error: 'Link session not found' }, { status: 404 })
  if (hashAgentAshClaimToken(claimToken) !== link.claim_token_hash) return noStoreJson({ error: 'Invalid claim token' }, { status: 401 })

  if (link.denied_at) return noStoreJson({ status: 'denied' })
  if (isExpired(link.expires_at, options.now) && !link.claimed_at) return noStoreJson({ status: 'expired' })
  if (!link.approved_at || !link.token_id) return noStoreJson({ status: 'pending' })
  if (link.claimed_at) return noStoreJson({ status: 'claimed' })

  const claimedAt = new Date(options.now ?? Date.now()).toISOString()
  const claimed = await options.store.claimLinkSession(linkId, claimedAt)
  if (!claimed) return noStoreJson({ status: 'claimed' })

  return noStoreJson({
    status: 'approved',
    agent_ash_token: buildAgentAshRawToken({ tokenId: link.token_id, secret: getAgentAshTokenSecret(options.secret) }),
    scopes: [AGENT_ASH_SCOPE_WRITE],
    vc_url: options.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vibecemetery.app',
    expires_at: null,
  })
}

export async function authorizeAgentAshIngestRequest(
  request: Request,
  store: Pick<AgentAshAuthStore, 'findTokenByHash' | 'markTokenUsed'>,
): Promise<{ ok: true; token: AgentAshTokenRecord } | { ok: false; status: number; error: string }> {
  const bearerToken = extractBearerToken(request)
  if (!bearerToken) return { ok: false, status: 401, error: 'Missing Agent Ash ingest token' }
  if (!isAgentAshIngestToken(bearerToken)) return { ok: false, status: 401, error: 'Invalid Agent Ash ingest token' }

  const token = await store.findTokenByHash(hashAgentAshToken(bearerToken))
  if (!token || !token.scopes.includes(AGENT_ASH_SCOPE_WRITE)) {
    return { ok: false, status: 401, error: 'Invalid Agent Ash ingest token' }
  }

  await store.markTokenUsed(token.id)
  return { ok: true, token }
}

export async function handleAgentAshTokensList(
  options: { store: Pick<AgentAshAuthStore, 'listTokensForUser'>; username: string | null },
): Promise<Response> {
  if (!options.username) return noStoreJson({ error: 'Unauthorized' }, { status: 401 })

  const tokens = await options.store.listTokensForUser(options.username)
  return noStoreJson({
    tokens: tokens.map((token) => ({
      id: token.id,
      token_prefix: token.token_prefix,
      agent_name: token.agent_name,
      agent_did: token.agent_did ?? null,
      gitlawb_node_url: token.gitlawb_node_url,
      scopes: token.scopes,
      created_at: token.created_at,
      last_used_at: token.last_used_at ?? null,
    })),
  })
}

export async function handleAgentAshTokenRevoke(
  request: Request,
  options: { store: Pick<AgentAshAuthStore, 'revokeTokenForUser'>; username: string | null },
): Promise<Response> {
  if (!options.username) return noStoreJson({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return noStoreJson({ error: 'Invalid or malformed request body' }, { status: 400 })
  }

  const data = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  const tokenId = typeof data.token_id === 'string' ? data.token_id.trim() : ''
  if (!/^[A-Za-z0-9_-]{3,}$/.test(tokenId)) return noStoreJson({ error: 'Invalid token id' }, { status: 400 })

  const revoked = await options.store.revokeTokenForUser(tokenId, options.username)
  if (!revoked) return noStoreJson({ error: 'Agent Ash token not found' }, { status: 404 })

  return noStoreJson({ ok: true })
}

export function createSupabaseAgentAshAuthStore(): AgentAshAuthStore {
  return {
    async insertLinkSession(link) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { error } = await supabaseAdmin.from('agent_ash_link_sessions').insert(link)
      if (error) throw error
    },
    async getLinkSession(linkId) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ash_link_sessions')
        .select('*')
        .eq('id', linkId)
        .maybeSingle()
      if (error) throw error
      return data as AgentAshLinkSession | null
    },
    async updateLinkSession(linkId, updates) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ash_link_sessions')
        .update(updates)
        .eq('id', linkId)
        .select('id')
      if (error) throw error
      return Boolean(data?.length)
    },
    async claimLinkSession(linkId, claimedAt) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ash_link_sessions')
        .update({ claimed_at: claimedAt })
        .eq('id', linkId)
        .is('claimed_at', null)
        .select('id')
      if (error) throw error
      return Boolean(data?.length)
    },
    async insertToken(token) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { error } = await supabaseAdmin.from('agent_ash_tokens').insert(token)
      if (error) throw error
    },
    async revokeToken(tokenId) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ash_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenId)
        .is('revoked_at', null)
        .select('id')
      if (error) throw error
      return Boolean(data?.length)
    },
    async listTokensForUser(username) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ash_tokens')
        .select('id, token_prefix, agent_name, agent_did, gitlawb_node_url, scopes, created_at, last_used_at')
        .eq('created_by_user_id', username)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as AgentAshTokenRecord[]
    },
    async revokeTokenForUser(tokenId, username) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ash_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenId)
        .eq('created_by_user_id', username)
        .is('revoked_at', null)
        .select('id')
      if (error) throw error
      return Boolean(data?.length)
    },
    async findTokenByHash(tokenHash) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { data, error } = await supabaseAdmin
        .from('agent_ash_tokens')
        .select('*')
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .maybeSingle()
      if (error) throw error
      return data as AgentAshTokenRecord | null
    },
    async markTokenUsed(tokenId) {
      const { supabaseAdmin } = await import('@/lib/supabase')
      const { error } = await supabaseAdmin
        .from('agent_ash_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', tokenId)
      if (error) throw error
    },
  }
}
