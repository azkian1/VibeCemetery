import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { createGravePostHandler } from '../src/app/api/graves/writeHandler'
import { getAutoAssignableGraveSlots } from '../src/lib/map-slots'
import type { CliActor } from '../src/lib/cli-auth'
import { publicGrave } from '../src/lib/public-grave'

let db: PGlite
let actor: CliActor | null
let repoOwner = 'Tester'
let repoLookups = 0
let rateAllowed = true
let authFailure = false
let lastWrite: Record<string, unknown> | null
const key = (n: number) => 'sha256:' + n.toString(16).padStart(64, '0')
const local = (n = 1) => ({ source: 'local', project_key: key(n), name: 'Local project', cause: 'Lost interest', map_version: 'v1' })

// In-memory PostgreSQL executes the actual production RPC. No external credentials or writes.
const database = {
  from(table: string) {
    expect(table).toBe('graves')
    return { select: () => ({ eq: async (_field: string, map: string) => ({
      data: (await db.query('select slot_id from public.graves where map_version=$1', [map])).rows,
      error: null,
    }) }) }
  },
  async rpc(name: string, params: Record<string, unknown>) {
    expect(name).toBe('create_grave_once')
    lastWrite = params
    try {
      const result = await db.query<{ result: unknown }>('select public.create_grave_once($1,$2::jsonb,$3::integer[],$4,$5,$6) as result',
        [params.p_author_github, JSON.stringify(params.p_grave), params.p_auto_slot_ids, params.p_slot_id, params.p_map_version, params.p_grave_gid])
      return { data: result.rows[0].result, error: null }
    } catch { return { data: null, error: { message: 'Test database rejected write' } } }
  },
} as unknown as Parameters<typeof createGravePostHandler>[0]['supabaseAdmin']

const handler = createGravePostHandler({
  supabaseAdmin: database,
  resolveCliActor: async () => { if (authFailure) throw new Error('Storage unavailable'); return actor },
  checkRateLimit: async () => rateAllowed ? { allowed: true } : { allowed: false, retryAfterMs: 2000 },
  fetchGitHubRepo: async () => { repoLookups++; return Response.json({ id: 42, owner: { login: repoOwner }, fork: false, pushed_at: '2020-01-01T00:00:00Z', size: 20 }) },
  fetchGitHubRepoRootContents: async () => Response.json([{ name: 'package.json', type: 'file' }]),
})
const request = (body: unknown, token = 'vc_cli_fixture') => handler(new NextRequest('http://localhost/api/graves', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body),
}))

test.beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(readFileSync('docs/supabase-schema.sql', 'utf8').replace(/create extension if not exists pgcrypto;/gi, ''))
})
test.afterAll(async () => { await db?.close() })
test.beforeEach(async () => {
  await db.exec("truncate public.graves cascade; truncate public.users; insert into public.users(github_id,github_username) values(1,'Tester');")
  actor = { username: 'Tester', source: 'cli' }
  repoOwner = 'Tester'; repoLookups = 0; rateAllowed = true; authFailure = false; lastWrite = null
})

test('local HTTP request produces a real grave, server epitaph, map sprite and private identity', async () => {
  const r = await request({ ...local(), epitaph: 'FORGED', author_github: 'Other', slot_id: 999999 })
  expect(r.status).toBe(201)
  const grave = await r.json()
  expect(grave).toMatchObject({ source: 'local', map_version: 'v1', author_github: 'tester', github_url: null, github_repo_id: null })
  expect(grave.epitaph).toBeTruthy()
  expect(grave.epitaph).not.toBe('FORGED')
  expect(grave.grave_gid).toBeNull()
  expect(getAutoAssignableGraveSlots().some(s => s.id === grave.slot_id)).toBe(true)
  expect(grave).not.toHaveProperty('project_key')
  expect(repoLookups).toBe(0)
  expect(lastWrite).not.toBeNull()
})

test('API recovery works at account limit and ignores changed replay metadata', async () => {
  const first = await (await request(local())).json()
  for (let n = 2; n <= 4; n++) expect((await request({ ...local(n), map_version: 'v1' })).status).toBe(201)
  expect((await request(local(5))).status).toBe(403)
  const replay = await request({ ...local(), name: 'CHANGED', map_version: 'v1' })
  expect(replay.status).toBe(200)
  expect(await replay.json()).toEqual(first)
  expect((await db.query('select graves_count from public.users')).rows).toEqual([{ graves_count: 4 }])
})

test('session and agent projects use the same allowance and GitHub checks remain required', async () => {
  for (let n = 1; n <= 3; n++) await request(local(n))
  actor = { username: 'TESTER', source: 'session' }
  const github = { name: 'GitHub project', cause: 'Lost interest', github_repo_id: 42, github_url: 'https://github.com/Tester/repo', map_version: 'v1' }
  repoOwner = 'SomeoneElse'
  expect((await request(github)).status).toBe(403)
  repoOwner = 'Tester'
  expect((await request(github)).status).toBe(201)
  expect((await request(github)).status).toBe(409)
  actor = { username: 'Tester', source: 'cli' }
  expect((await request(local(9))).status).toBe(403)
})

test('a full map rejects a new project but still recovers the original grave', async () => {
  const first = await (await request(local())).json()
  const slots = getAutoAssignableGraveSlots().filter(s => s.id !== first.slot_id)
  await db.query(`insert into public.graves(name,cause,author_github,github_url,github_repo_id,slot_id,map_version)
    select 'Existing project', 'Abandoned', 'Other', 'https://github.com/Other/project' || id,
    10000 + id, id, 'v1' from jsonb_to_recordset($1::jsonb) as s(id integer)`, [JSON.stringify(slots)])
  expect((await request(local(2))).status).toBe(507)
  const replay = await request(local())
  expect(replay.status).toBe(200)
  expect((await replay.json()).id).toBe(first.id)
})

test('authentication failures stay distinct from unavailable authentication storage', async () => {
  actor = null
  expect((await request(local())).status).toBe(401)
  authFailure = true
  expect((await request(local())).status).toBe(503)
  expect((await request(local(), 'ash_blocked_token_123456789')).status).toBe(403)
  expect(lastWrite).toBeNull()
})

test('local identity cannot bypass account approval, envelope boundaries or rate limiting', async () => {
  actor = { username: 'Tester', source: 'session' }
  expect((await request(local())).status).toBe(403)
  actor = { username: 'Tester', source: 'cli' }
  expect((await request({ ...local(), github_url: 'https://github.com/Tester/repo' })).status).toBe(400)
  expect((await request({ ...local(), project_key: 'random' })).status).toBe(400)
  expect((await request({ ...local(), certificate: {}, proof: {} })).status).toBe(403)
  rateAllowed = false
  const limited = await request(local())
  expect(limited.status).toBe(429)
  expect(limited.headers.get('Retry-After')).toBe('2')
  expect(lastWrite).toBeNull()
})

test('malformed fields are rejected before reaching SQL', async () => {
  for (const fields of [
    { born_at: '2025-02-31' }, { died_at: '2025-04-31T00:00:00Z' },
    { born_at: '2025-01-01T10:00:00' }, { born_at: '0000-01-01' },
    { born_at: '2025-01-02', died_at: '2025-01-01' },
    { name: '\u0000' }, { cause: '' }, { stack: [null] }, { description: {} }, { source: 'unknown' },
    { map_version: 'v2' }, { map_version: 'unknown' },
  ]) expect((await request({ ...local(), ...fields })).status, JSON.stringify(fields)).toBe(400)
  expect((await request({ ...local(), name: 'x'.repeat(17_000) })).status).toBe(413)
  expect(lastWrite).toBeNull()
})

test('public response uses an allowlist even if database adds sensitive fields', () => {
  expect(publicGrave({ id: 'public-id', name: 'Project', project_key: key(1), internal_note: 'private' })).toEqual({ id: 'public-id', name: 'Project' })
})
