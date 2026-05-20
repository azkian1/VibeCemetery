import { AGENT_ASH_PROOF_TYPE, type AgentAshRequest } from './agent-ash-contract'
import { isAllowedGitlawbNodeUrl } from './agent-ash-security'

export const GITLAWB_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000
export const GITLAWB_VERIFY_TIMEOUT_MS = 10_000
export const GITLAWB_VERIFY_MAX_BODY_BYTES = 256 * 1024

export type GitlawbVerificationResult =
  | {
      ok: true
      status: 'gitlawb_http_verified'
      verificationUrl?: string
      matchedRepo: unknown
    }
  | {
      ok: false
      status: 'rejected'
      reason: string
    }

interface VerifyOptions {
  allowedNodeUrls: string[]
  fetchImpl?: typeof fetch
}

type RepoLike = Record<string, unknown>

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function getRepoDid(repo: RepoLike): string | null {
  return getString(repo.repo_did) ?? getString(repo.did) ?? getString(repo.id)
}

function getRepoPath(repo: RepoLike): string | null {
  return getString(repo.path) ?? getString(repo.full_path) ?? getString(repo.full_name)
}

function getRepoName(repo: RepoLike): string | null {
  return getString(repo.name) ?? getString(repo.slug)
}

function slugFromPath(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function normalizeIdentityText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function normalizePath(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '').toLowerCase()
}

function normalizeNodeUrl(nodeUrl: string): string {
  const url = new URL(nodeUrl.trim())
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/+$/, '')
}

function parseRepos(value: unknown): RepoLike[] {
  if (Array.isArray(value)) return value.filter((repo): repo is RepoLike => Boolean(repo && typeof repo === 'object' && !Array.isArray(repo)))
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const repos = (value as { repos?: unknown; data?: unknown; repositories?: unknown })
    return parseRepos(repos.repos ?? repos.data ?? repos.repositories)
  }
  return []
}

async function readJsonWithLimit(response: Response): Promise<unknown | null> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > GITLAWB_VERIFY_MAX_BODY_BYTES) return null

  const reader = response.body?.getReader()
  if (!reader) return null

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > GITLAWB_VERIFY_MAX_BODY_BYTES) return null
    chunks.push(value)
  }

  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)))
  } catch {
    return null
  }
}

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(GITLAWB_VERIFY_TIMEOUT_MS)
    : undefined
}

function timestampsMatch(...timestamps: string[]): boolean {
  const parsed = timestamps.map((timestamp) => Date.parse(timestamp))
  if (parsed.some((timestamp) => Number.isNaN(timestamp))) return false

  const [first, ...rest] = parsed
  return rest.every((timestamp) => Math.abs(timestamp - first) <= GITLAWB_TIMESTAMP_TOLERANCE_MS)
}

function repoIdentityMatches(repo: RepoLike, request: AgentAshRequest): boolean {
  const repoPath = getRepoPath(repo)
  const subjectPath = request.certificate.subject.path
  if (repoPath && subjectPath && normalizePath(repoPath) !== normalizePath(subjectPath)) {
    return false
  }

  const repoName = getRepoName(repo)
  const canonicalRepoName = repoPath ? slugFromPath(repoPath) : repoName
  const allowedNames = [repoName, canonicalRepoName]
    .filter((value): value is string => Boolean(value))
    .map(normalizeIdentityText)
  if (allowedNames.length > 0 && !allowedNames.includes(normalizeIdentityText(request.certificate.subject.name))) {
    return false
  }

  return true
}

export async function verifyGitlawbHttpProof(
  request: AgentAshRequest,
  options: VerifyOptions,
): Promise<GitlawbVerificationResult> {
  if (request.proof.type !== AGENT_ASH_PROOF_TYPE) {
    return { ok: false, status: 'rejected', reason: 'Unsupported Agent Ash proof type' }
  }

  if (!isAllowedGitlawbNodeUrl(request.proof.node_url, options.allowedNodeUrls)) {
    return { ok: false, status: 'rejected', reason: 'Unsupported GitLawb node' }
  }

  if (request.proof.repo_did !== request.certificate.subject.repo_did) {
    return { ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }
  }

  const nodeUrl = normalizeNodeUrl(request.proof.node_url)
  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(`${nodeUrl}/api/v1/repos`, { cache: 'no-store', signal: timeoutSignal() })
  } catch {
    return { ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }
  }

  if (response.status !== 200) {
    return { ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }
  }

  const body = await readJsonWithLimit(response)
  if (body === null) {
    return { ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }
  }

  const repos = parseRepos(body)
  const matchedRepo = repos.find((repo) => getRepoDid(repo) === request.proof.repo_did)
  if (!matchedRepo || !repoIdentityMatches(matchedRepo, request)) {
    return { ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }
  }

  const repoCreatedAt = getString(matchedRepo.created_at)
  const repoUpdatedAt = getString(matchedRepo.updated_at)
  if (!repoCreatedAt || !repoUpdatedAt) {
    return { ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }
  }

  if (!timestampsMatch(repoCreatedAt, request.certificate.lifecycle.created_at, request.proof.observed_created_at)) {
    return { ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }
  }

  if (!timestampsMatch(repoUpdatedAt, request.certificate.lifecycle.last_activity_at, request.proof.observed_updated_at)) {
    return { ok: false, status: 'rejected', reason: 'Cannot verify GitLawb HTTP node proof' }
  }

  return {
    ok: true,
    status: 'gitlawb_http_verified',
    verificationUrl: `${nodeUrl}/repo/${encodeURIComponent(request.proof.repo_did)}`,
    matchedRepo,
  }
}
