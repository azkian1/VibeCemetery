export type GitHubRepoEligibilityResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export interface GitHubRepoEligibilityRepo {
  id?: unknown
  fork?: unknown
  pushed_at?: unknown
  owner?: { login?: unknown } | null
}

const DEAD_REPO_INACTIVITY_MS = 14 * 24 * 60 * 60 * 1000

export function parseGitHubRepoUrl(githubUrl: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(githubUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null

    const [owner, repo, ...extra] = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
    if (!owner || !repo || extra.length > 0) return null

    return { owner, repo }
  } catch {
    return null
  }
}

export function validateGitHubRepoEligibility({
  repo,
  expectedRepoId,
  authenticatedUsername,
  now = new Date(),
}: {
  repo: GitHubRepoEligibilityRepo
  expectedRepoId: number
  authenticatedUsername: string
  now?: Date
}): GitHubRepoEligibilityResult {
  if (repo.id !== expectedRepoId) {
    return { ok: false, status: 400, error: 'github_repo_id does not match repository URL' }
  }

  const ownerLogin = typeof repo.owner?.login === 'string' ? repo.owner.login : ''
  if (ownerLogin.toLowerCase() !== authenticatedUsername.toLowerCase()) {
    return { ok: false, status: 403, error: 'You can only bury your own GitHub repositories' }
  }

  if (repo.fork === true) {
    return { ok: false, status: 400, error: 'Forked repositories cannot be buried' }
  }

  if (repo.fork !== false) {
    return { ok: false, status: 400, error: 'Repository fork status is invalid' }
  }

  const pushedAt = typeof repo.pushed_at === 'string' ? Date.parse(repo.pushed_at) : NaN
  if (!Number.isFinite(pushedAt)) {
    return { ok: false, status: 400, error: 'Repository pushed_at is invalid' }
  }

  if (now.getTime() - pushedAt < DEAD_REPO_INACTIVITY_MS) {
    return { ok: false, status: 400, error: 'Repository is not dead yet' }
  }

  return { ok: true }
}

export async function fetchGitHubRepo(owner: string, repo: string): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': 'vibecemetery-app',
    Accept: 'application/vnd.github.v3+json',
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  return fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  })
}
