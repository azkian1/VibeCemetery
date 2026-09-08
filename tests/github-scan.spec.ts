import { test, expect } from '@playwright/test'
import { NextRequest } from 'next/server'
import { createGitHubScanHandler, SCAN_PAGE_SIZE } from '../src/app/api/github/scan/handler'
import { scanAllGitHubRepos, waitForScanRetry } from '../src/lib/github-scan-client'
import { classifyGitHubRootEntries, fetchGitHubRepoRootContents } from '../src/app/api/graves/githubRepoEligibility'
const repo = (id: number) => ({ id, name: `project-${id}`, html_url: `https://github.com/tester/project-${id}`, fork: false, pushed_at: '2020-01-01T00:00:00Z', created_at: '2019-01-01', language: 'C', description: null })
const request = (query = 'username=tester&page=1') => new NextRequest(`http://localhost/api/github/scan?${query}`)
function fixture(overrides: Partial<Parameters<typeof createGitHubScanHandler>[0]> = {}) {
  return createGitHubScanHandler({ username: async () => 'Tester', clientIp: () => 'test', rateLimit: async () => ({ allowed: true, retryAfterMs: 0 }), fetchPage: async () => Response.json([repo(1)]), fetchContents: async () => Response.json([{ name: 'main.c', type: 'file' }]), ...overrides })
}
const clientFor = (handler: ReturnType<typeof fixture>): typeof fetch => async (input, init) => handler(new NextRequest(new URL(String(input), 'http://localhost'), { signal: init?.signal ?? undefined }))

test('all 320 repositories are checked, including candidates beyond 75 and repositories beyond 300', async () => {
  const all = Array.from({ length: 320 }, (_, i) => repo(i + 1))
  let checks = 0, active = 0, peak = 0
  const pages: number[] = []
  const handler = fixture({
    fetchPage: async (_, page) => { pages.push(page); return Response.json(all.slice((page - 1) * SCAN_PAGE_SIZE, page * SCAN_PAGE_SIZE)) },
    fetchContents: async () => { checks++; active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return Response.json([{ name: 'main.c', type: 'file' }]) },
  })
  const progress: number[] = []
  const result = await scanAllGitHubRepos('tester', { fetchImpl: clientFor(handler), onProgress: p => progress.push(p.checked) })
  expect(result.dead_repos.map(r => r.id)).toEqual(all.map(r => r.id))
  expect(result.total_repos).toBe(320)
  expect(result.next_page).toBeNull()
  expect(checks).toBe(320)
  expect(peak).toBeLessThanOrEqual(4)
  expect(pages.at(-1)).toBe(27)
  expect(progress.at(-1)).toBe(320)
})

test('auth and cursor validation happen before any GitHub reads', async () => {
  let reads = 0
  const fetchPage = async () => { reads++; return Response.json([]) }
  expect((await fixture({ username: async () => null, fetchPage })(request())).status).toBe(401)
  expect((await fixture({ fetchPage })(request('username=someone-else'))).status).toBe(403)
  expect((await fixture({ fetchPage })(request('username=tester'))).status).toBe(409)
  for (const page of ['0', '-1', '1.5', 'Infinity', '9007199254740992']) expect((await fixture({ fetchPage })(request(`username=tester&page=${page}`))).status).toBe(400)
  expect(reads).toBe(0)
})

test('forks, active repositories and another owner are excluded', async () => {
  let checks = 0
  const handler = fixture({ fetchPage: async () => Response.json([repo(1), { ...repo(2), fork: true }, { ...repo(3), pushed_at: new Date().toISOString() }, { ...repo(4), html_url: 'https://github.com/other/project' }]), fetchContents: async () => { checks++; return Response.json([{ name: 'package.json', type: 'file' }]) } })
  const body = await (await handler(request())).json()
  expect(body.dead_repos.map((r: { id: number }) => r.id)).toEqual([1])
  expect(checks).toBe(1)
})

test('failed content checks do not get cached as a successful shortened page', async () => {
  let fail = true, calls = 0
  const handler = fixture({ fetchContents: async () => { calls++; return fail ? new Response(null, { status: 503 }) : Response.json([{ name: 'main.c', type: 'file' }]) } })
  expect((await handler(request())).status).toBe(502)
  fail = false
  expect((await (await handler(request())).json()).dead_count).toBe(1)
  expect(calls).toBe(2)
  await handler(request())
  expect(calls).toBe(2)
  await handler(request('username=tester&page=1&refresh=1'))
  expect(calls).toBe(3)
})

test('GitHub throttling pauses the same page and does not duplicate accumulated results', async () => {
  const pages: string[] = [], waits: number[] = []
  let limited = true
  const fetchImpl: typeof fetch = async input => {
    const page = new URL(String(input), 'http://localhost').searchParams.get('page')!
    pages.push(page)
    if (page === '2' && limited) { limited = false; return Response.json({ error: 'Slow down' }, { status: 429, headers: { 'Retry-After': '1' } }) }
    return Response.json({ dead_repos: [repo(Number(page))], total_repos: 1, next_page: page === '1' ? 2 : null })
  }
  const result = await scanAllGitHubRepos('tester', { fetchImpl, wait: async ms => { waits.push(ms) } })
  expect(pages).toEqual(['1', '2', '2'])
  expect(waits).toEqual([1000])
  expect(result.dead_count).toBe(2)
  expect(result.total_repos).toBe(2)
})

test('later-page failure never returns partial success', async () => {
  const fetchImpl: typeof fetch = async input => new URL(String(input), 'http://localhost').searchParams.get('page') === '1'
    ? Response.json({ dead_repos: [repo(1)], total_repos: 1, next_page: 2 })
    : Response.json({ error: 'GitHub unavailable' }, { status: 502 })
  await expect(scanAllGitHubRepos('tester', { fetchImpl })).rejects.toThrow('GitHub unavailable')
})

test('pagination deduplicates repository IDs and rejects a repeated cursor', async () => {
  let page = 0
  const result = await scanAllGitHubRepos('tester', { fetchImpl: async () => Response.json({ dead_repos: [repo(1)], total_repos: 1, next_page: ++page === 1 ? 2 : null }) })
  expect(result.dead_count).toBe(1)
  await expect(scanAllGitHubRepos('tester', { fetchImpl: async () => Response.json({ dead_repos: [], total_repos: 0, next_page: 1 }) })).rejects.toThrow('continue safely')
})

test('retry wait can be cancelled immediately', async () => {
  const controller = new AbortController()
  const waiting = waitForScanRetry(60_000, controller.signal)
  controller.abort()
  await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
})

for (const filename of ['main.c', 'main.cpp', 'main.rb', 'main.swift', 'main.cs', 'main.kt', 'App.vue', 'app.svelte']) {
  test(`recognizes ${filename} with a README`, () => {
    expect(classifyGitHubRootEntries([{ name: 'README.md', type: 'file' }, { name: filename, type: 'file' }]).isCandidate).toBe(true)
  })
}

test('source directories are inspected and actual code is accepted', async () => {
  const urls: string[] = []
  const response = await fetchGitHubRepoRootContents('tester', 'demo', { fetchImpl: async input => {
    const url = String(input); urls.push(url)
    return Response.json(url.endsWith('/contents') ? [{ name: 'README.md', type: 'file' }, { name: 'src', type: 'dir' }] : [{ name: 'main.cpp', type: 'file' }])
  } })
  expect(urls).toHaveLength(2)
  expect(urls[1]).toBe('https://api.github.com/repos/tester/demo/contents/src')
  expect(classifyGitHubRootEntries(await response.json()).isCandidate).toBe(true)
})

test('a source directory containing only documentation is not enough', async () => {
  const response = await fetchGitHubRepoRootContents('tester', 'demo', { fetchImpl: async input => Response.json(String(input).endsWith('/contents') ? [{ name: 'src', type: 'dir' }] : [{ name: 'README.md', type: 'file' }]) })
  expect(classifyGitHubRootEntries(await response.json()).isCandidate).toBe(false)
})

test('source-directory errors remain errors rather than hiding valid projects', async () => {
  const response = await fetchGitHubRepoRootContents('tester', 'demo', { fetchImpl: async input => String(input).endsWith('/contents') ? Response.json([{ name: 'src', type: 'dir' }]) : new Response(null, { status: 429 }) })
  expect(response.status).toBe(429)
})
