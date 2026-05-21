export type GitHubRepoEligibilityResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export interface GitHubRepoEligibilityRepo {
  id?: unknown
  fork?: unknown
  pushed_at?: unknown
  owner?: { login?: unknown } | null
}

export interface GitHubRootEntry {
  name?: unknown
  type?: unknown
}

export type GitHubRootClassification = {
  isCandidate: boolean
  source: 'strong' | 'fallback' | 'none'
  strongMatches: string[]
  codeLikeFiles: string[]
  codeLikeCount: number
  confidenceBoosters: string[]
  confidenceBoosterCount: number
}

const DEAD_REPO_INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000

const STRONG_MARKER_FILES = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'requirements.txt',
  'pyproject.toml',
  'pom.xml',
  'build.gradle',
]

const CONFIDENCE_BOOSTER_FILES = [
  'README.md',
  'CLAUDE.md',
  'PRD.md',
  'PLAN.md',
  'vercel.json',
  'netlify.toml',
  'Dockerfile',
  '.env.example',
]

const CODE_LIKE_EXTENSIONS = [
  '.py',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.css',
  '.java',
  '.go',
  '.rs',
  '.sh',
  '.ps1',
]

function extname(value: string): string {
  const slashIndex = value.lastIndexOf('/')
  const name = slashIndex >= 0 ? value.slice(slashIndex + 1) : value
  const dotIndex = name.lastIndexOf('.')
  return dotIndex > 0 ? name.slice(dotIndex) : ''
}

export function classifyGitHubRootEntries(entries: GitHubRootEntry[]): GitHubRootClassification {
  const rootFiles = Array.isArray(entries)
    ? entries.flatMap((entry) => {
      const name = typeof entry?.name === 'string' ? entry.name : ''
      const type = typeof entry?.type === 'string' ? entry.type : ''
      if (!name || type !== 'file') return []
      return [{ name, normalizedName: name.toLowerCase() }]
    })
    : []
  const strongMatches = []

  for (const marker of STRONG_MARKER_FILES) {
    if (rootFiles.some((entry) => entry.normalizedName === marker.toLowerCase())) {
      strongMatches.push(marker)
    }
  }

  for (const entry of rootFiles) {
    if (entry.normalizedName.endsWith('.sln') || entry.normalizedName.endsWith('.csproj')) {
      strongMatches.push(entry.name)
    }
  }

  const codeLikeFiles = rootFiles
    .filter((entry) => CODE_LIKE_EXTENSIONS.includes(extname(entry.normalizedName)))
    .map((entry) => entry.name)
  const confidenceBoosters = rootFiles
    .filter((entry) => CONFIDENCE_BOOSTER_FILES.some((marker) => marker.toLowerCase() === entry.normalizedName))
    .map((entry) => entry.name)
  const hasStrong = strongMatches.length > 0
  const qualifiesFallback = !hasStrong && (
    codeLikeFiles.length >= 2
    || (codeLikeFiles.length >= 1 && confidenceBoosters.length >= 1)
    || (rootFiles.length === 1 && codeLikeFiles.length === 1)
  )

  return {
    isCandidate: hasStrong || qualifiesFallback,
    source: hasStrong ? 'strong' : qualifiesFallback ? 'fallback' : 'none',
    strongMatches,
    codeLikeFiles,
    codeLikeCount: codeLikeFiles.length,
    confidenceBoosters,
    confidenceBoosterCount: confidenceBoosters.length,
  }
}

export function validateGitHubRootContentsEligibility(entries: GitHubRootEntry[]): GitHubRepoEligibilityResult {
  const classification = classifyGitHubRootEntries(entries)
  if (!classification.isCandidate) {
    return {
      ok: false,
      status: 400,
      error: 'Empty or non-project repositories cannot be buried',
    }
  }

  return { ok: true }
}

function githubHeaders(): Record<string, string> {
  return {
    'User-Agent': 'vibecemetery-app',
    Accept: 'application/vnd.github.v3+json',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  }
}

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
  return fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
}

export async function fetchGitHubRepoRootContents(owner: string, repo: string): Promise<Response> {
  return fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
}
