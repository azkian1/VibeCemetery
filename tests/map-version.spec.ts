import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { GET as getGraves } from '../src/app/api/graves/route'
import { parseMapVersion } from '../src/lib/map-version'

test.describe('map version boundary', () => {
  test('only accepts the two deployed map namespaces', () => {
    expect(parseMapVersion(undefined)).toBe('v1')
    expect(parseMapVersion('v1')).toBe('v1')
    expect(parseMapVersion('v2')).toBe('v2')

    for (const invalidVersion of ['', 'v3', 'shadow', 'v1 ', null, 2, {}]) {
      expect(parseMapVersion(invalidVersion)).toBeNull()
    }
  })

  test('GET /api/graves rejects an unsupported map namespace before querying data', async () => {
    const response = await getGraves(new NextRequest('http://localhost/api/graves?map_version=shadow'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'map_version must be one of: v1, v2' })
  })
})
