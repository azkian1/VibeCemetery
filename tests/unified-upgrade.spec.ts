import { expect, test } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

test('upgrade from the actual previous schema preserves graves and quota before retiring legacy data', async () => {
  const db = new PGlite()
  const sql = (file: string) => readFileSync(file, 'utf8').replace(/create extension if not exists pgcrypto;/gi, '')
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;')
    await db.exec(sql('tests/fixtures/schema-before-unified.sql'))
    // The connected production database predates the repository's updated_at column.
    await db.exec('alter table public.users drop column updated_at')
    await db.exec(sql('docs/map-v2-migration.sql'))
    await db.exec(sql('docs/map-v2-grave-gid.sql'))
    await db.exec("insert into public.users(github_id,github_username,graves_count) values(1,'Tester',4)")
    await db.exec(`insert into public.graves(name,cause,author_github,github_url,github_repo_id,slot_id,map_version)
      select 'Old project ' || n, 'Abandoned', 'Tester', 'https://github.com/Tester/project' || n,n,n,
      case when n % 2 = 0 then 'v2' else 'v1' end from generate_series(1,4) n`)
    await db.exec("insert into public.cremated(name,cause,author_github) values('Old ashes','Abandoned','Tester')")
    const oldGraves = await db.query('select id,name,slot_id,map_version from public.graves order by id')
    for (let i = 0; i < 2; i++) {
      await db.exec(sql('docs/unified-burials.sql'))
      await db.exec(sql('docs/offering-ledger.sql'))
    }
    const payload = JSON.stringify({ name: 'Local project', cause: 'Abandoned', source: 'local', project_key: 'sha256:' + 'a'.repeat(64), epitaph: 'Rest in peace' })
    const write = async () => (await db.query<{ value: { status: string; grave?: { id: string } } }>("select public.create_grave_once('Tester',$1::jsonb,array[5],5,'v2',51) as value", [payload])).rows[0].value
    expect(await write()).toMatchObject({ status: 'user_slots_exhausted' })
    await db.exec("update public.users set x_first_grave_shared_at=now() where github_id=1")
    const created = await write()
    expect(created.status).toBe('created')
    expect((await db.query('select id,name,slot_id,map_version from public.graves where github_repo_id is not null order by id')).rows).toEqual(oldGraves.rows)
    // The additive phase must leave the currently deployed app's legacy storage in place.
    expect((await db.query('select name from public.cremated')).rows).toEqual([{ name: 'Old ashes' }])
    await db.exec(sql('docs/retire-project-cremations.sql'))
    await db.exec(sql('docs/supabase-rls-hardening.sql'))
    expect((await write()).grave?.id).toBe(created.grave?.id)
    expect((await db.query('select count(*)::int as n from public.graves')).rows).toEqual([{ n: 5 }])
    expect((await db.query("select to_regclass('public.cremated') as relation")).rows).toEqual([{ relation: null }])
    expect((await db.query('select graves_count from public.users')).rows).toEqual([{ graves_count: 5 }])
    expect((await db.query('select updated_at is not null as present from public.users')).rows).toEqual([{ present: true }])
  } finally { await db.close() }
})
