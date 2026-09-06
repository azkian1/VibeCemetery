import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { GET } from '../src/app/api/graves/route'
import { parseMapVersion } from '../src/lib/map-version'

test('public map requests only accept the released v1 namespace', async () => {
  expect(parseMapVersion(undefined)).toBe('v1')
  expect(parseMapVersion('v1')).toBe('v1')
  for (const value of ['v2', '', 'unknown', null]) expect(parseMapVersion(value)).toBeNull()
  const response = await GET(new NextRequest('https://vibecemetery.app/api/graves?map_version=v2'))
  expect(response.status).toBe(400)
})

test('temporary helper defaults to v1 and refuses unpublished maps', async () => {
  const helper = await import(pathToFileURL(join(process.cwd(), 'src/agent/burial-helper.mjs')).href)
  const payload = { name: 'Abandoned project', cause: 'Lost interest', project_key: 'sha256:' + 'a'.repeat(64) }
  expect(helper.buildBurialBody(payload)).toMatchObject({ map_version: 'v1', source: 'local' })
  expect(() => helper.buildBurialBody({ ...payload, map_version: 'v2' })).toThrow('Invalid map version')
})
