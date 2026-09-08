import { NextRequest, NextResponse } from 'next/server'
import { fetchGitHubRepoRootContents, parseGitHubRepoUrl, validateGitHubRootContentsEligibility } from '@/app/api/graves/githubRepoEligibility'
import type { DeadRepo, GitHubScanResult } from '@/types/game'

export const SCAN_PAGE_SIZE = 12
interface Repo extends DeadRepo { fork: boolean }
type Limit = { allowed: true } | { allowed: false; retryAfterMs: number }
interface Dependencies {
  username: () => Promise<string | null>
  clientIp: (request: NextRequest) => string
  rateLimit: (key: string, limit: number, windowMs: number) => Promise<Limit>
  fetchPage?: (username: string, page: number, signal: AbortSignal) => Promise<Response>
  fetchContents?: typeof fetchGitHubRepoRootContents
  now?: () => number
}
const json = (data: unknown, status = 200, retryAfter?: number) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
})
const githubError = (response: Response) => {
  const limited = response.status === 403 || response.status === 429
  return json({ error: limited ? 'GitHub is limiting requests. Please retry later.' : 'GitHub could not finish the scan. Please retry.' }, limited ? 429 : 502,
    limited ? Math.max(1, Math.min(3600, Number(response.headers.get('retry-after')) || 60)) : undefined)
}

export function createGitHubScanHandler(deps: Dependencies) {
  const now = deps.now ?? Date.now
  const pages = new Map<string, { data: GitHubScanResult; expires: number }>()
  const contents = new Map<string, { ok: boolean; expires: number }>()
  const fetchPage = deps.fetchPage ?? ((username, page, signal) => fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&per_page=${SCAN_PAGE_SIZE}&sort=full_name&direction=asc&page=${page}`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vibecemetery-app',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
  ))
  const fetchContents = deps.fetchContents ?? fetchGitHubRepoRootContents
  function remember<T>(cache: Map<string, T>, key: string, value: T, max: number) {
    if (cache.size >= max && !cache.has(key)) cache.delete(cache.keys().next().value!)
    cache.set(key, value)
  }
  return async function GET(request: NextRequest) {
    const actor = await deps.username()
    if (!actor) return json({ error: 'Sign in with GitHub first' }, 401)
    const username = request.nextUrl.searchParams.get('username')?.trim().toLowerCase()
    if (!username) return json({ error: 'Missing required query parameter: username' }, 400)
    if (username !== actor.toLowerCase()) return json({ error: 'You can only scan your own GitHub' }, 403)
    // Old open tabs cannot consume paginated results. Ask them to reload
    // instead of silently presenting the first page as the full scan.
    const rawPage = request.nextUrl.searchParams.get('page')
    if (rawPage === null) return json({ error: 'The scanner has been updated. Reload this page and scan again.' }, 409)
    const page = Number(rawPage)
    if (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(page) || page >= Number.MAX_SAFE_INTEGER) return json({ error: 'Invalid scan page' }, 400)
    const ip = deps.clientIp(request)
    const limit = await deps.rateLimit(`scan:${ip}:${username}`, 60, 60_000)
    if (!limit.allowed) return json({ error: 'Scan paused. Waiting for the request limit to reset.' }, 429, Math.max(1, Math.ceil(limit.retryAfterMs / 1000)))
    const refresh = request.nextUrl.searchParams.get('refresh') === '1'
    const key = `${username}:${page}`
    const cached = pages.get(key)
    if (!refresh && cached && cached.expires > now()) return json(cached.data)
    // Limit expensive pages as well as individual HTTP calls. Clients preserve
    // their current page during Retry-After; no page is silently discarded.
    const deepLimit = await deps.rateLimit(`scan-content:${username}`, 30, 60_000)
    if (!deepLimit.allowed) return json({ error: 'Scan paused. Waiting for the request limit to reset.' }, 429, Math.max(1, Math.ceil(deepLimit.retryAfterMs / 1000)))
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55_000)])
    try {
      const response = await fetchPage(username, page, signal)
      if (response.status === 404) return json({ error: 'GitHub account not found' }, 404)
      if (!response.ok) return githubError(response)
      const repos = await response.json() as Repo[]
      if (!Array.isArray(repos) || repos.length > SCAN_PAGE_SIZE) return json({ error: 'Invalid GitHub repository page' }, 502)
      const owned = repos.filter(repo => repo.fork === false && parseGitHubRepoUrl(repo.html_url)?.owner.toLowerCase() === username)
      const candidates = owned.filter(repo => Number.isFinite(Date.parse(repo.pushed_at)) && now() - Date.parse(repo.pushed_at) >= 7 * 24 * 60 * 60 * 1000)
      const eligible = new Set<number>()
      // Four workers cap GitHub pressure; a page is cached only after every
      // candidate has been checked successfully.
      for (let start = 0; start < candidates.length; start += 4) {
        const outcomes = await Promise.all(candidates.slice(start, start + 4).map(async repo => {
          const parsed = parseGitHubRepoUrl(repo.html_url)!
          const contentKey = `${username}/${parsed.repo.toLowerCase()}:${repo.pushed_at}`
          const prior = contents.get(contentKey)
          if (!refresh && prior && prior.expires > now()) return { repo, ok: prior.ok }
          const content = await fetchContents(parsed.owner, parsed.repo, { signal })
          if (content.status === 404 || content.status === 409) return { repo, ok: false }
          if (!content.ok) return { repo, failure: content }
          const entries = await content.json()
          if (!Array.isArray(entries)) return { repo, failure: new Response(null, { status: 502 }) }
          const ok = validateGitHubRootContentsEligibility(entries).ok
          remember(contents, contentKey, { ok, expires: now() + 6 * 60 * 60 * 1000 }, 2000)
          return { repo, ok }
        }))
        for (const outcome of outcomes) {
          if (outcome.failure) return githubError(outcome.failure)
          if (outcome.ok) eligible.add(outcome.repo.id)
        }
      }
      const deadRepos = candidates.filter(repo => eligible.has(repo.id)).map(({ id, name, description, html_url, language, created_at, pushed_at }) => ({ id, name, description, html_url, language, created_at, pushed_at }))
      const result: GitHubScanResult = { dead_repos: deadRepos, total_repos: owned.length, dead_count: deadRepos.length,
        scanned_repos: repos.length, next_page: repos.length === SCAN_PAGE_SIZE ? page + 1 : null }
      remember(pages, key, { data: result, expires: now() + 5 * 60 * 1000 }, 500)
      return json(result)
    } catch {
      return json({ error: 'GitHub could not finish checking this page. Please retry the scan.' }, 502)
    }
  }
}
