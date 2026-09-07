import { expect, test } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createManifest, migrationSql, readSlots, rollbackSql, validateManifest, type Snapshot } from '../scripts/v2-cutover/manifest'
import { getAutoAssignableGraveSlots } from '../src/lib/map-slots'
import { extractHomeSlotPositions } from '../src/components/HomeScannerLanding'
import { ACTIVE_GRAVE_SLOT_IDS_V2, ACTIVE_GRAVE_CAPACITY_V2, CEMETERY_MASTER_CAPACITY_V2, isActiveGraveSlotV2 } from '../src/lib/map-layout-v2'

const mapText = readFileSync('public/map/cemetery-v2.tmj', 'utf8')
const snapshotSql = readFileSync('scripts/v2-cutover/snapshot.sql', 'utf8')
const gateSql = readFileSync('docs/v2-cutover-write-gate.sql', 'utf8')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let db: PGlite
let snapshot: Snapshot
async function inventory(): Promise<Snapshot> {
  const results = await db.exec(snapshotSql)
  return (results.find(r => r.rows.length)?.rows[0] as { cutover_snapshot: Snapshot }).cutover_snapshot
}
async function execute(sql: string) {
  try { return await db.exec(sql) }
  catch (error) { await db.exec('rollback'); throw error }
}

test.beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(readFileSync('docs/supabase-schema.sql', 'utf8').replace(/create extension if not exists pgcrypto;/gi, ''))
  await db.exec('begin;\n' + readFileSync('docs/web3-grave-burn-hash-recovery.sql', 'utf8') + '\ncommit;')
  // Historical production fields are not part of the fresh-install users schema.
  await db.exec(`alter table public.users add column id uuid not null default gen_random_uuid();
    alter table public.users add column cremated_count integer default 8;`)
  await db.exec('alter default privileges in schema public grant all on tables to service_role;')
  await db.exec(gateSql)
})
test.afterAll(async () => { await db?.close() })

test('snapshot fingerprints and migration are independent of the operator session timezone', async () => {
  await db.exec("set time zone 'Pacific/Honolulu'")
  try {
    expect(await inventory()).toEqual(snapshot)
    await execute(migrationSql(createManifest(snapshot, mapText), snapshot, mapText))
    expect(await inventory()).toEqual(snapshot)
    expect((await db.query<{ TimeZone: string }>('show timezone')).rows[0].TimeZone).toBe('Pacific/Honolulu')
  } finally {
    await db.exec("set time zone 'UTC'")
  }
})
test.beforeEach(async () => {
  await db.exec(`update public.cemetery_write_control set burials_paused=false, v1_retired=false;
    truncate public.graves cascade; truncate public.users;
    insert into public.users(github_id,github_username,graves_count,x_first_grave_shared_at) values(1,'Founder',3,'2026-01-01');`)
  for (let n = 1; n <= 3; n++) {
    await db.query(`insert into public.graves(id,name,cause,author_github,github_url,github_repo_id,slot_id,map_version,grave_gid,created_at,f_count)
      values($1,$2,'Retired','Founder',$3,$4,$5,$6,$7,'2026-01-01',7)`,
    [id(n), 'Founder ' + n, 'https://github.com/Founder/repo' + n, n,
      n === 3 ? readSlots(mapText)[0].id : 280 + n, n === 3 ? 'v2' : 'v1', n === 3 ? 51 : null])
  }
  await db.query('insert into public.f_votes(grave_id,username) values($1,\'Visitor\')', [id(1)])
  const wallet = '0x' + 'a'.repeat(40), token = '0xb48bc4896d18724f7bf5a3d2817fc35252cd7ba3', burn = '0x000000000000000000000000000000000000dead'
  for (let n = 1; n <= 2; n++) {
    const amount = n === 1 ? '25263442113724649798733865' : '100000000000000000001'
    const tx = '0x' + n.toString().padStart(64, '0')
    await db.query(`insert into public.grave_burn_intents(id,grave_id,wallet_address,amount_raw,token_address,burn_address,nonce,expires_at)
      values($1,$2,$3,$4,$5,$6,$7,now())`, [id(n + 10), id(n), wallet, amount, token, burn, tx])
    await db.query(`insert into public.grave_burns(intent_id,grave_id,wallet_address,mourner_source,tx_hash,token_address,burn_address,amount_raw,status)
      values($1,$2,$3,'wallet',$4,$5,$6,$7,$8)`, [id(n + 10), id(n), wallet, tx, token, burn, amount, n === 1 ? 'verified' : 'pending'])
  }
  await db.exec(`update public.grave_burn_intents set recovery_last_checked_at='2026-01-01',
    recovery_lease_until='2026-01-02', recovery_lease_token='${id(900)}', recovery_failure_code='rpc_unavailable';
    update public.cemetery_write_control set burials_paused=true`)
  snapshot = await inventory()
})

test('home, server and migration use the same authored v2 slots', () => {
  const expected = getAutoAssignableGraveSlots().map(s => s.id).sort((a, b) => a - b)
  expect(expected).toHaveLength(144)
  expect(expected).toEqual(ACTIVE_GRAVE_SLOT_IDS_V2)
  expect(ACTIVE_GRAVE_CAPACITY_V2).toBe(144)
  expect(CEMETERY_MASTER_CAPACITY_V2).toBe(666)
  expect(readSlots(mapText).map(s => s.id).sort((a, b) => a - b)).toEqual(expected)
  expect(extractHomeSlotPositions(JSON.parse(mapText)).map(s => s.id).sort((a, b) => a - b)).toEqual(expected)
})

test('future authored slots stay closed until their IDs are explicitly activated', () => {
  const extendedMap = JSON.parse(mapText)
  extendedMap.layers.find((layer: { name: string }) => layer.name === 'GraveObj').objects.push({
    id: 900001, x: 0, y: 0, width: 32, height: 64, type: '', name: '',
  })
  expect(isActiveGraveSlotV2(900001)).toBe(false)
  expect(readSlots(JSON.stringify(extendedMap))).toEqual(readSlots(mapText))
  expect(extractHomeSlotPositions(extendedMap)).toEqual(extractHomeSlotPositions(JSON.parse(mapText)))
  const founderSlots = createManifest(snapshot, mapText).placements.map(p => p.new_slot_id)
  expect(() => createManifest(snapshot, JSON.stringify(extendedMap), [900001, ...founderSlots.slice(1)])).toThrow('reserved or unknown')
})

test('application credentials can read but cannot reopen the gate despite inherited grants', async () => {
  const result = await db.query(`select
    has_table_privilege('service_role','public.cemetery_write_control','SELECT') as can_read,
    has_table_privilege('service_role','public.cemetery_write_control','INSERT,UPDATE,DELETE,TRUNCATE') as can_write,
    has_table_privilege('anon','public.cemetery_write_control','SELECT,INSERT,UPDATE,DELETE') as anonymous_access,
    has_table_privilege('authenticated','public.cemetery_write_control','SELECT,INSERT,UPDATE,DELETE') as signed_in_access`)
  expect(result.rows).toEqual([{ can_read: true, can_write: false, anonymous_access: false, signed_in_access: false }])
})

test('manifest is deterministic, excludes occupied slots and covers each UUID', () => {
  const first = createManifest(snapshot, mapText)
  expect(createManifest(snapshot, mapText)).toEqual(first)
  expect(first.placements.map(p => p.grave_id)).toEqual([id(1), id(2)])
  expect(first.placements.every(p => p.new_slot_id !== readSlots(mapText)[0].id)).toBe(true)
  expect(snapshot.verified_amount_raw).toBe('25263442113724649798733865')
})

test('CLI creates reviewable private artifacts and defaults to rollback without connecting to a database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'v2-cutover-fixture-'))
  const input = join(dir, 'snapshot.json'), out = join(dir, 'plan')
  writeFileSync(input, JSON.stringify(snapshot))
  const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/v2-cutover/cli.mts', ...args], { encoding: 'utf8' })
  const plan = run('plan', input, out)
  expect(plan.status, plan.stderr).toBe(0)
  expect(readFileSync(join(out, 'dry-run.sql'), 'utf8')).toMatch(/rollback;\s*$/)
  expect(readFileSync(join(out, 'placements.tsv'), 'utf8')).toContain(id(1))
  expect(run('validate', input, join(out, 'manifest.json')).status).toBe(0)
  expect(run('plan', input, out).status).not.toBe(0) // Cannot overwrite an approved plan.
  expect(run('sql', input, join(out, 'manifest.json'), join(dir, 'apply'), '--commit').status).toBe(0)
  expect(readFileSync(join(dir, 'apply', 'apply.sql'), 'utf8')).toMatch(/commit;\s*$/)
})

test('manifest rejects missing graves, duplicates, stale maps and incompatible sprites', () => {
  const good = createManifest(snapshot, mapText)
  for (const invalid of [
    { ...good, placements: good.placements.slice(1) },
    { ...good, placements: [good.placements[0], good.placements[0]] },
    { ...good, placements: good.placements.map(p => ({ ...p, new_grave_gid: 999 })) },
    { ...good, placements: good.placements.map(p => ({ ...p, new_slot_id: readSlots(mapText)[0].id })) },
    { ...good, placements: good.placements.map(p => ({ ...p, old_slot_id: 999 })) },
  ]) expect(() => validateManifest(invalid, snapshot, mapText)).toThrow()
  expect(() => validateManifest(good, snapshot, mapText + ' ')).toThrow('TMJ changed')
  expect(() => createManifest(snapshot, mapText, [])).toThrow('capacity')
})

test('dry-run transaction changes nothing, including default version and gate state', async () => {
  const beforeGate = await db.query('select * from public.cemetery_write_control')
  await execute(migrationSql(createManifest(snapshot, mapText), snapshot, mapText))
  expect(await inventory()).toEqual(snapshot)
  expect((await db.query('select * from public.cemetery_write_control')).rows).toEqual(beforeGate.rows)
})

test('commit preserves UUIDs, complete memorials, F, intents, exact offerings and account counters', async () => {
  const manifest = createManifest(snapshot, mapText)
  await execute(migrationSql(manifest, snapshot, mapText, true))
  const after = await inventory()
  expect(after.counts).toEqual(snapshot.counts)
  expect(after.graves.map(g => g.id).sort()).toEqual(snapshot.graves.map(g => g.id).sort())
  expect(after.graves.every(g => g.map_version === 'v2')).toBe(true)
  expect(after.verified_amount_raw).toBe(snapshot.verified_amount_raw)
  for (const t of ['f_votes', 'grave_burns', 'grave_burn_intents', 'users'] as const) expect(after.fingerprints[t]).toBe(snapshot.fingerprints[t])
  expect((await db.query('select * from public.cemetery_write_control')).rows).toEqual([{ singleton: true, burials_paused: true, v1_retired: true }])
  // Emergency restoration is reviewable and rollback-only unless explicitly edited.
  await execute(rollbackSql(manifest, snapshot, mapText))
  expect(await inventory()).toEqual(after)
  await execute(rollbackSql(manifest, snapshot, mapText).replace(/rollback;\s*$/, 'commit;'))
  expect(await inventory()).toEqual(snapshot)
})

test('transaction rejects drift or an open gate without partially moving a grave', async () => {
  const sql = migrationSql(createManifest(snapshot, mapText), snapshot, mapText, true)
  await db.exec('update public.cemetery_write_control set burials_paused=false')
  await expect(execute(sql)).rejects.toThrow('gate')
  await db.exec('update public.cemetery_write_control set burials_paused=true; update public.graves set f_count=f_count+1')
  const changed = await inventory()
  await expect(execute(sql)).rejects.toThrow('Stale snapshot')
  expect(await inventory()).toEqual(changed)
})

test('postcondition failure rolls back every placement and every side effect', async () => {
  await db.exec(`create function test_cutover_side_effect() returns trigger language plpgsql as $$
    begin update public.users set graves_count=99; return new; end $$;
    create trigger test_cutover_side_effect after update on public.graves for each row execute function test_cutover_side_effect();`)
  try {
    await expect(execute(migrationSql(createManifest(snapshot, mapText), snapshot, mapText, true))).rejects.toThrow('Related records changed: users')
    expect(await inventory()).toEqual(snapshot)
  } finally { await db.exec('drop trigger test_cutover_side_effect on public.graves; drop function test_cutover_side_effect();') }
})

test('database gate blocks old deployments and retirement blocks explicit v1 inserts', async () => {
  const insert = (version: string) => db.query(`insert into public.graves(name,cause,github_url,github_repo_id,slot_id,map_version)
    values('Old client','Retired','https://github.com/other/repo',999,999,$1)`, [version])
  await expect(insert('v1')).rejects.toThrow('CEMETERY_BURIALS_PAUSED')
  await db.exec('update public.cemetery_write_control set burials_paused=false, v1_retired=true')
  await expect(insert('v1')).rejects.toThrow('CEMETERY_VERSION_RETIRED')
  expect(await inventory()).toEqual(snapshot)
  await db.exec(gateSql)
  await expect(insert('v1')).rejects.toThrow('CEMETERY_VERSION_RETIRED')
})
