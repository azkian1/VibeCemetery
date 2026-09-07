import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { GET as getGraves } from '../src/app/api/graves/route'
import { parseMapVersion } from '../src/lib/map-version'
import { canonicalCemeteryPath, cemeteryGravePath } from '../src/lib/cemetery-navigation'

test.describe('map version boundary', () => {
  test('only accepts the two deployed map namespaces', () => {
    expect(parseMapVersion(undefined)).toBe('v2')
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
  test('GET rejects the retired namespace without a database query', async () => {
    const response = await getGraves(new NextRequest('http://localhost/api/graves?map_version=v1'))
    expect(response.status).toBe(410)
    expect(await response.json()).toMatchObject({ code: 'CEMETERY_VERSION_RETIRED' })
  })
  test('canonical targets encode grave IDs and preserve repeated and future query values', () => {
    expect(cemeteryGravePath('a&modal=bury')).toBe('/cemetery?grave=a%26modal%3Dbury')
    expect(canonicalCemeteryPath({ grave: 'uuid', modal: 'bury', tag: ['a b', '&x'], missing: undefined })).toBe('/cemetery?grave=uuid&modal=bury&tag=a+b&tag=%26x')
    expect(canonicalCemeteryPath({})).toBe('/cemetery')
  })
})
