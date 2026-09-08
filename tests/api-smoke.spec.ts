import { test, expect } from '@playwright/test'

// HTTP contract checks only: no admin credentials, signed sessions, fixture
// inserts, cleanup deletes, or live wallet transactions. Write-path behavior
// is covered separately by hermetic handler and database tests.
test.describe('Public API smoke', () => {
  test('grave listing serves only the current map and public fields', async ({ request }) => {
    const response = await request.get('/api/graves?limit=500')
    expect(response.status()).toBe(200)
    const graves = await response.json()
    expect(Array.isArray(graves)).toBe(true)
    expect(graves.length).toBeLessThanOrEqual(500)
    for (const grave of graves) {
      expect(grave.map_version).toBe('v2')
      expect(grave).not.toHaveProperty('project_key')
      expect(grave).not.toHaveProperty('cli_token')
    }
  })

  test('unknown map versions are rejected', async ({ request }) => {
    const response = await request.get('/api/graves?map_version=unknown')
    expect(response.status()).toBe(400)
  })

  test('retired map requests cannot read old graves', async ({ request }) => {
    const response = await request.get('/api/graves?map_version=v1')
    expect(response.status()).toBe(410)
    expect((await response.json()).code).toBe('CEMETERY_VERSION_RETIRED')
  })

  for (const method of ['GET', 'POST'] as const) {
    test(`retired project cremation returns 410 for ${method}`, async ({ request }) => {
      const response = await request.fetch('/api/cremated', { method })
      expect(response.status()).toBe(410)
      expect(response.headers()['cache-control']).toBe('no-store')
      expect((await response.json()).code).toBe('RETIRED')
    })
  }

  test('anonymous visitors have no personal F votes', async ({ request }) => {
    const response = await request.get('/api/f-status')
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({ myVotes: [] })
  })

  for (const path of ['/api/github/scan', '/api/github/last-commit', '/api/cli/tokens']) {
    test(`${path} requires authentication`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(401)
    })
  }

  for (const version of ['v1', 'v2']) {
    test(`versioned ${version} links preserve the grave query`, async ({ request }) => {
      const response = await request.get(`/cemetery/${version}?grave=example-project`, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      const location = new URL(response.headers().location, response.url())
      expect(location.pathname).toBe('/cemetery')
      expect(location.searchParams.get('grave')).toBe('example-project')
    })
  }
})
