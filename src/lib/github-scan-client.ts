import type { DeadRepo, GitHubScanResult } from '@/types/game'

export interface ScanProgress { checked: number; message: string }
export function waitForScanRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Scan cancelled', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

/** Only publish a complete result. A failed later page must not look like a
 * successful empty or shortened scan. Both scanner entry points use this. */
export async function scanAllGitHubRepos(username: string, options: {
  signal?: AbortSignal
  refresh?: boolean
  onProgress?: (progress: ScanProgress) => void
  fetchImpl?: typeof fetch
  wait?: typeof waitForScanRetry
} = {}): Promise<GitHubScanResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const wait = options.wait ?? waitForScanRetry
  const repos = new Map<number, DeadRepo>()
  let page = 1, total = 0, checked = 0, retries = 0
  while (true) {
    options.signal?.throwIfAborted()
    const params = new URLSearchParams({ username, page: String(page) })
    if (options.refresh) params.set('refresh', '1')
    const response = await fetchImpl(`/api/github/scan?${params}`, { signal: options.signal })
    const data = await response.json().catch(() => null)
    options.signal?.throwIfAborted()
    if (response.status === 429 && retries < 2) {
      const seconds = Number(response.headers.get('retry-after') ?? '60')
      if (Number.isFinite(seconds) && seconds > 0 && seconds <= 60) {
        options.onProgress?.({ checked, message: `Checked ${checked} repositories. GitHub requests paused; resuming in ${Math.ceil(seconds)}s...` })
        retries++
        await wait(Math.ceil(seconds) * 1000, options.signal)
        continue
      }
    }
    if (!response.ok) throw new Error(data?.error || `Scan failed (${response.status}). Please retry.`)
    if (!data || !Array.isArray(data.dead_repos) || !Number.isSafeInteger(data.total_repos) || data.total_repos < 0) throw new Error('The scan returned an invalid page. Please retry.')
    for (const repo of data.dead_repos as DeadRepo[]) repos.set(repo.id, repo)
    total += data.total_repos
    checked += data.scanned_repos ?? data.total_repos
    options.onProgress?.({ checked, message: `Checked ${checked} repositories...` })
    retries = 0
    // Missing pagination metadata supports responses from the previous release
    // during deployment and existing browser fixtures.
    if (data.next_page == null) return { dead_repos: [...repos.values()], total_repos: total, dead_count: repos.size, scanned_repos: checked, next_page: null }
    if (!Number.isSafeInteger(data.next_page) || data.next_page !== page + 1) throw new Error('The scan could not continue safely. Please retry.')
    page = data.next_page
  }
}
