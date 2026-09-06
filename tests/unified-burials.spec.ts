import { expect, test } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { generateEpitaph } from '../src/gravedigger/epitaphs'
import { burnedSupplyPercent } from '../src/lib/web3/offeringLedger'
let db: PGlite
const key = (n: number) => 'sha256:' + n.toString(16).padStart(64, '0')
async function bury(n: number, opts: { source?: string; author?: string; map?: string; slot?: number; cause?: string } = {}) {
  const row = { name: 'Project ' + n, cause: opts.cause ?? 'Developer lost interest', epitaph: generateEpitaph({ name: 'Project ' + n, cause: 'Developer lost interest', stack: ['JavaScript'], born_at: null, died_at: null }),
    source: opts.source ?? 'local', project_key: opts.source === 'github' ? null : key(n), github_repo_id: opts.source === 'github' ? n : null, github_url: opts.source === 'github' ? 'https://github.com/tester/project' + n : null }
  const result = await db.query<{ result: { status: string; grave: { id: string; name: string; epitaph: string; project_key?: string }; slots_used?: number } }>('select public.create_grave_once($1,$2::jsonb,$3::integer[],$4,$5,$6) as result', [opts.author ?? 'Tester', JSON.stringify(row), [1,2,3,4,5,6], opts.slot ?? n, opts.map ?? 'v1', null])
  return result.rows[0].result
}
test.beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(readFileSync('docs/supabase-schema.sql','utf8').replace(/create extension if not exists pgcrypto;/gi,''))
})
test.afterAll(async () => { await db?.close() })
test.beforeEach(async () => {
  await db.exec("truncate public.graves cascade; truncate public.users; insert into public.users(github_id,github_username) values (1,'Tester'),(2,'Other');")
})
test('local and GitHub projects share four slots across maps and username casing', async () => {
  const results = await Promise.all([bury(1), bury(2, { source: 'github' }), bury(3, { map: 'v2', author: 'TESTER' }), bury(4, { source: 'github', map: 'v2' }), bury(5)])
  expect(results.filter(r => r.status === 'created')).toHaveLength(4)
  expect(results.filter(r => r.status === 'user_slots_exhausted')).toHaveLength(1)
  expect((await db.query('select graves_count from public.users where github_id=1')).rows).toEqual([{ graves_count: 4 }])
  expect((await bury(6, { author: 'Other' })).status).toBe('created')
})
test('retries recover the original grave at quota/map capacity without publishing its identity hash', async () => {
  const first = await bury(1)
  await bury(2); await bury(3); await bury(4)
  const retry = await bury(1, { slot: 0, map: 'v2', author: 'TESTER', cause: 'Changed' })
  expect(retry.status).toBe('replayed')
  expect(retry.grave).toEqual(first.grave)
  expect(retry.grave.epitaph.length).toBeGreaterThan(0)
  expect(retry.grave).not.toHaveProperty('project_key')
  expect((await db.query('select count(*)::integer as n from public.graves')).rows[0]).toEqual({ n: 4 })
})
test('one share unlocks exactly one additional grave', async () => {
  await db.exec("update public.users set x_first_grave_shared_at = now() where github_id=1")
  for(let n=1;n<=5;n++) expect((await bury(n)).status).toBe('created')
  expect((await bury(6)).status).toBe('user_slots_exhausted')
})
test('slot collisions and invalid map identities do not consume allowance', async () => {
  await bury(1)
  expect((await bury(2, { slot: 1 })).status).toBe('slot_collision')
  expect((await bury(2, { map: 'invented' })).status).toBe('failed')
  expect((await bury(2, { slot: 0 })).status).toBe('no_slots')
  expect((await bury(2, { source: 'unknown' })).status).toBe('failed')
  expect((await db.query('select graves_count from public.users where github_id=1')).rows[0]).toEqual({ graves_count: 1 })
})
test('counter failure rolls back the burial', async () => {
  await db.exec('alter table public.users add constraint test_counter check(graves_count=0)')
  try { await expect(bury(1)).rejects.toThrow(); expect((await db.query('select * from public.graves')).rows).toHaveLength(0) }
  finally { await db.exec('alter table public.users drop constraint test_counter') }
})
test('migration can rerun and only service_role can call the write RPC', async () => {
  const first=await bury(1)
  await db.exec(readFileSync('docs/unified-burials.sql','utf8'))
  expect((await bury(1)).grave.id).toBe(first.grave.id)
  for(const role of ['anon','authenticated','service_role']) {
    const result=await db.query<{ allowed: boolean }>("select has_function_privilege($1,'public.create_grave_once(text,jsonb,integer[],integer,text,integer)','EXECUTE') as allowed",[role])
    expect(result.rows[0].allowed).toBe(role==='service_role')
  }
})
test('offering ledger counts received amounts exactly, across maps, excluding pending and orphaned records', async () => {
  const a=await bury(1), b=await bury(2,{map:'v2'}), c=await bury(3,{author:'Other'})
  const amounts=['100000000000000000001','200000000000000000002','700000000000000000000','900000000000000000000']
  for(let i=0;i<4;i++) {
    const grave=[a,b,c,a][i].grave.id
    const id='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0')
    const wallet='0x'+'a'.repeat(40), token='0xb48bc4896d18724f7bf5a3d2817fc35252cd7ba3', burn='0x000000000000000000000000000000000000dead'
    const hash='0x'+String(i+1).padStart(64,'0')
    await db.query('insert into public.grave_burn_intents(id,grave_id,wallet_address,amount_raw,token_address,burn_address,nonce,expires_at) values($1,$2,$3,$4,$5,$6,$7,now())',[id,grave,wallet,amounts[i],token,burn,hash])
    await db.query("insert into public.grave_burns(intent_id,grave_id,wallet_address,mourner_source,tx_hash,token_address,burn_address,amount_raw,status,verified_at) values($1,$2,$3,'wallet',$4,$5,$6,$7,$8,now())",[id,grave,wallet,hash,token,burn,amounts[i],['verified','verified','pending','orphaned'][i]])
  }
  const result=await db.query<{ ledger: { totalBurnedRaw: string; burnCount: number; authors: Array<{author: string; buried: number; offeringsRaw: string}>; recent: unknown[] } }>('select public.get_offering_ledger() as ledger')
  expect(result.rows[0].ledger).toMatchObject({totalBurnedRaw:'300000000000000000003',burnCount:2})
  expect(result.rows[0].ledger.authors).toContainEqual({author:'tester',buried:2,offeringsRaw:'300000000000000000003'})
  expect(result.rows[0].ledger.authors).toContainEqual({author:'other',buried:1,offeringsRaw:'0'})
  expect(result.rows[0].ledger.recent).toHaveLength(2)

  // Model an existing installation, then retire only project cremation storage.
  await db.exec(`
    create table public.cremated(id bigint primary key, name text);
    insert into public.cremated values (1, 'Old project');
    alter table public.users add column cremated_count integer default 0;
    create function public.create_cremation_once(text,text,text,text,text,text,bigint,text) returns void language sql as 'select';
    create function public.increment_cremated_count(text) returns void language sql as 'select';
    create function public.insert_grave_if_user_slot_available(text) returns void language sql as 'select';
    create function public.insert_grave_if_user_slot_available(text, integer) returns void language sql as 'select';
  `)
  const retirement = readFileSync('docs/retire-project-cremations.sql','utf8')
  await db.exec(retirement)
  await db.exec(retirement)
  await db.exec(readFileSync('docs/supabase-rls-hardening.sql','utf8'))
  expect((await db.query('select public.get_offering_ledger() as ledger')).rows).toEqual(result.rows)
  expect((await db.query("select to_regclass('public.cremated') as retired")).rows).toEqual([{ retired: null }])
  expect((await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='cremated_count'")).rows).toHaveLength(0)
  expect((await db.query("select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('create_cremation_once','increment_cremated_count','insert_grave_if_user_slot_available')")).rows).toHaveLength(0)
  expect((await bury(1)).grave.id).toBe(a.grave.id)
})
test('supply progress handles exact large amounts and an unavailable denominator', () => {
  expect(burnedSupplyPercent(10n**27n,10n**28n)).toBe(10)
  expect(() => burnedSupplyPercent(0n,0n)).toThrow()
})
