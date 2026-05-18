import type { NextRequest } from 'next/server'
import { AGENT_ASH_PROOF_TYPE } from './agent-ash-contract'
import { checkRateLimit, getClientIp } from './rate-limit'

export const AGENT_ASH_MAX_BODY_BYTES = 256 * 1024
export const AGENT_ASH_INGEST_RATE_LIMIT_MAX = 30
export const AGENT_ASH_INGEST_RATE_LIMIT_WINDOW_MS = 60_000

type SecurityResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

type RateLimitChecker = typeof checkRateLimit

type BodyReadResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string }

function normalizeUrl(value: string): string | null {
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

type AgentAshEnv = Record<string, string | undefined>

export function getAgentAshAllowedNodeUrls(env: AgentAshEnv = process.env): string[] {
  const allowedNodeUrls = (env.GITLAWB_ALLOWED_NODE_URLS ?? '')
    .split(',')
    .map((url) => normalizeUrl(url))
    .filter((url): url is string => Boolean(url))

  if (allowedNodeUrls.length === 0) {
    throw new Error('Missing GITLAWB_ALLOWED_NODE_URLS')
  }

  return allowedNodeUrls
}

export function isAllowedGitlawbNodeUrl(nodeUrl: string, allowedNodeUrls: string[]): boolean {
  const normalizedNodeUrl = normalizeUrl(nodeUrl)
  return Boolean(normalizedNodeUrl && allowedNodeUrls.includes(normalizedNodeUrl))
}

export function validateAgentAshProofSecurity(
  proof: { type?: unknown; node_url?: unknown },
  allowedNodeUrls: string[],
): SecurityResult {
  if (proof.type !== AGENT_ASH_PROOF_TYPE) {
    return { ok: false, status: 400, error: 'Unsupported Agent Ash proof type' }
  }

  if (typeof proof.node_url !== 'string' || !isAllowedGitlawbNodeUrl(proof.node_url, allowedNodeUrls)) {
    return { ok: false, status: 403, error: 'Unsupported GitLawb node' }
  }

  return { ok: true }
}

export function isAgentAshBodyTooLarge(request: Request): boolean {
  const contentLength = Number(request.headers.get('content-length'))
  return Number.isFinite(contentLength) && contentLength > AGENT_ASH_MAX_BODY_BYTES
}

export async function readAgentAshJsonWithLimit(request: Request): Promise<BodyReadResult> {
  if (isAgentAshBodyTooLarge(request)) {
    return { ok: false, status: 413, error: 'Agent Ash request body too large' }
  }

  const reader = request.body?.getReader()
  if (!reader) {
    return { ok: false, status: 400, error: 'Missing Agent Ash request body' }
  }

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    totalBytes += value.byteLength
    if (totalBytes > AGENT_ASH_MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: 'Agent Ash request body too large' }
    }
    chunks.push(value)
  }

  try {
    const body = new TextDecoder().decode(Buffer.concat(chunks))
    return { ok: true, value: JSON.parse(body) }
  } catch {
    return { ok: false, status: 400, error: 'Invalid Agent Ash JSON body' }
  }
}

export async function checkAgentAshIngestRateLimit(
  request: NextRequest,
  checker: RateLimitChecker = checkRateLimit,
) {
  return checker(
    `agent-ash-ingest:${getClientIp(request)}`,
    AGENT_ASH_INGEST_RATE_LIMIT_MAX,
    AGENT_ASH_INGEST_RATE_LIMIT_WINDOW_MS,
  )
}

export function agentAshNoStoreHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store' }
}
