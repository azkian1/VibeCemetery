import { expect, test } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { writeCremation, type CremationWrite } from '../src/lib/cremation-write'

const schema = readFileSync('docs/supabase-schema.sql', 'utf8')
const migration = readFileSync('docs/cremation-write-v2.sql', 'utf8')
let db: PGlite
const key = (n: number) => `sha256:${n.toString(16).padStart(64, '0')}`
const input = (n: number, extra: Partial<CremationWrite> = {}): CremationWrite => ({
  author: 'tester', name: `project-${n}`, cause: 'Retired', source: 'skill', projectKey: key(n),
  githubUrl: null, githubRepoId: null, lastCommitMessage: null, ...extra,
})

async function rpc(_name: string, args: Record<string, unknown>) {
  try {
    const result = await db.query<{ result: unknown }>(
      'select public.create_cremation_once($1, $2, $3, $4, $5, $6, $7, $8) as result',
      [args.p_author_github, args.p_name, args.p_cause, args.p_source, args.p_project_key,
        args.p_github_url, args.p_github_repo_id, args.p_last_commit_message],
    )
    return { data: result.rows[0].result, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

test.beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  for (const name of ['users', 'cremated']) {
    const definition = schema.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))
    if (!definition) throw new Error(`Missing ${name} table`)
    await db.exec(definition[0])
  }
  await db.exec(migration)
})
test.afterAll(async () => { await db?.close() })
test.beforeEach(async () => {
  await db.exec("truncate public.cremated, public.users restart identity; insert into public.users(github_id, github_username) values (1, 'Tester');")
})

test('migration is repeatable, included in bootstrap, and restricted to the service role', async () => {
  await writeCremation(input(1), rpc)
  await db.exec(migration)
  expect(schema.replace(/\r\n/g, '\n').endsWith(migration.replace(/\r\n/g, '\n'))).toBe(true)
  expect((await db.query('select id from public.cremated')).rows).toHaveLength(1)
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const privileges = await db.query<{ allowed: boolean }>(
      "select has_function_privilege($1, 'public.create_cremation_once(text,text,text,text,text,text,bigint,text)', 'EXECUTE') as allowed", [role])
    expect(privileges.rows[0].allowed).toBe(role === 'service_role')
  }
})

test('a lost response can be retried without duplicate rows or counter increments', async () => {
  const first = await writeCremation(input(1), rpc)
  const replay = await writeCremation(input(1, { author: 'TESTER', cause: 'Changed on retry' }), rpc)
  expect(first.status).toBe(201)
  expect(replay.status).toBe(200)
  expect(await replay.json()).toEqual(await first.json())
  expect((await db.query('select * from public.cremated')).rows).toHaveLength(1)
  expect((await db.query('select cremated_count from public.users')).rows).toEqual([{ cremated_count: 1 }])
})

test('GitHub identity deduplicates legacy URLs and renamed repositories', async () => {
  await db.exec("insert into public.cremated(name, cause, author_github, github_url) values ('legacy', 'Retired', 'Tester', 'https://github.com/Tester/Old/');")
  const legacy = await writeCremation(input(1, { githubUrl: 'https://github.com/tester/old', githubRepoId: 12 }), rpc)
  expect(legacy.status).toBe(200)
  expect((await legacy.json()).name).toBe('legacy')
  const renamedLegacy = await writeCremation(input(5, { githubUrl: 'https://github.com/tester/renamed-old', githubRepoId: 12 }), rpc)
  expect(renamedLegacy.status).toBe(200)
  expect((await renamedLegacy.json()).name).toBe('legacy')
  const created = await writeCremation(input(2, { githubUrl: 'https://github.com/tester/new', githubRepoId: 13 }), rpc)
  const renamed = await writeCremation(input(3, { githubUrl: 'https://github.com/tester/renamed', githubRepoId: 13 }), rpc)
  expect(created.status).toBe(201)
  expect(renamed.status).toBe(200)
  expect(await renamed.json()).toEqual(await created.json())
})

test('queued requests cannot exceed the first-50 boundary and retries work at the limit', async () => {
  await db.exec("insert into public.cremated(name,cause,author_github) select 'old-' || n, 'Retired', 'Tester' from generate_series(1,49) n;")
  const results = await Promise.all(Array.from({ length: 5 }, (_, n) => writeCremation(input(n + 1), rpc)))
  expect(results.filter((result) => result.status === 201)).toHaveLength(1)
  expect(results.filter((result) => result.status === 429)).toHaveLength(4)
  const created = await results.find((result) => result.status === 201)!.json()
  const blocked = results.find((result) => result.status === 429)!
  expect(await blocked.json()).toMatchObject({ code: 'DAILY_LIMIT' })
  expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0)
  const replay = await writeCremation(input(Number(created.name.split('-')[1])), rpc)
  expect(replay.status).toBe(200)
  expect((await db.query('select cremated_count from public.users')).rows).toEqual([{ cremated_count: 50 }])
})

test('daily allowance uses UTC even when the database session has another timezone', async () => {
  await db.exec("set timezone = 'Pacific/Honolulu'; insert into public.cremated(name,cause,author_github,created_at) select 'old-' || n, 'Retired', 'Tester', now() - interval '3 days' from generate_series(1,50) n;")
  try {
    for (let n = 1; n <= 3; n++) expect((await writeCremation(input(n), rpc)).status).toBe(201)
    const blocked = await writeCremation(input(4), rpc)
    expect(blocked.status).toBe(429)
    const seconds = await db.query<{ seconds: number }>("select ceil(extract(epoch from ((date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC' - now())))::integer as seconds")
    expect(Math.abs(Number(blocked.headers.get('Retry-After')) - seconds.rows[0].seconds)).toBeLessThanOrEqual(2)
  } finally { await db.exec("set timezone = 'UTC'") }
})

test('counter failure rolls back the insert instead of reporting partial success', async () => {
  await db.exec('alter table public.users add constraint test_counter_failure check (cremated_count = 0)')
  try {
    expect((await writeCremation(input(1), rpc)).status).toBe(503)
    expect((await db.query('select * from public.cremated')).rows).toHaveLength(0)
  } finally { await db.exec('alter table public.users drop constraint test_counter_failure') }
})

test('missing migration fails closed, without any unguarded insertion fallback', async () => {
  const response = await writeCremation(input(1), async () => ({ data: null, error: { code: 'PGRST202' } }))
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ code: 'CREMATION_UNAVAILABLE' })
})
