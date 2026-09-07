import { createHash } from 'node:crypto'
import { GRAVE_GIDS_V2 } from '../../src/game/utils/tileRegistry-v2.ts'
import { inferGraveSlotTypeV2 } from '../../src/lib/map-layout-v2.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const TABLES = ['graves', 'f_votes', 'grave_burn_intents', 'grave_burns', 'users'] as const
type Table = typeof TABLES[number]
export interface SnapshotGrave {
  id: string; name: string; map_version: 'v1' | 'v2'; slot_id: number
  grave_gid: number | null; created_at: string
}
export interface Snapshot {
  schema_version: 1
  graves: SnapshotGrave[]
  fingerprints: Record<Table, string>
  counts: Record<Table, number>
  verified_amount_raw: string
}
export interface Placement {
  grave_id: string; old_map_version: 'v1'; old_slot_id: number; old_grave_gid: number | null
  new_map_version: 'v2'; new_slot_id: number; new_grave_gid: number
}
export interface Manifest {
  schema_version: 1
  map_sha256: string
  snapshot_sha256: string
  placements: Placement[]
}
export interface Slot { id: number; type: string; x: number; y: number }

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
function creationMicros(value: string): bigint {
  const fraction = value.match(/\.(\d+)/)?.[1] ?? ''
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3, 6))
}
export function snapshotHash(snapshot: Snapshot): string {
  return hash(JSON.stringify([snapshot.schema_version, snapshot.graves,
    TABLES.map(t => [t, snapshot.fingerprints[t], snapshot.counts[t]]), snapshot.verified_amount_raw]))
}

export function validateSnapshot(snapshot: Snapshot): void {
  ensure(snapshot?.schema_version === 1 && Array.isArray(snapshot.graves), 'Invalid snapshot format')
  for (const table of TABLES) {
    ensure(/^[a-f0-9]{32}$/.test(snapshot.fingerprints?.[table]), `Missing PostgreSQL fingerprint: ${table}`)
    ensure(Number.isSafeInteger(snapshot.counts?.[table]) && snapshot.counts[table] >= 0, `Invalid count: ${table}`)
  }
  ensure(typeof snapshot.verified_amount_raw === 'string' && /^\d+$/.test(snapshot.verified_amount_raw), 'Raw offering total must be an exact decimal string')
  ensure(snapshot.graves.length === snapshot.counts.graves, 'Incomplete grave inventory')
  const ids = new Set<string>(), positions = new Set<string>()
  for (const grave of snapshot.graves) {
    ensure(UUID.test(grave.id) && !ids.has(grave.id), 'Invalid or duplicate grave UUID')
    ensure(grave.map_version === 'v1' || grave.map_version === 'v2', 'Unknown existing map namespace')
    ensure(Number.isSafeInteger(grave.slot_id) && grave.slot_id > 0, 'Invalid old slot')
    ensure(grave.grave_gid === null || (Number.isSafeInteger(grave.grave_gid) && grave.grave_gid > 0), 'Invalid old GID')
    ensure(Number.isFinite(Date.parse(grave.created_at)), 'Invalid grave creation date')
    const position = `${grave.map_version}:${grave.slot_id}`
    ensure(!positions.has(position), 'Duplicate existing map slot')
    ids.add(grave.id); positions.add(position)
  }
}

export function readSlots(mapText: string): Slot[] {
  const map = JSON.parse(mapText)
  const layer = map.layers?.find((l: { name: string }) => l.name === 'GraveObj')
  ensure(Array.isArray(layer?.objects), 'Missing v2 GraveObj layer')
  const slots: Slot[] = []
  const ids = new Set<number>()
  for (const obj of layer.objects) {
    if (obj.gid || obj.type === 'meta_grave' || obj.type === 'grave_special') continue
    const type = inferGraveSlotTypeV2(obj.width, obj.height)
    ensure(type, `Unknown v2 slot footprint: ${obj.id}`)
    ensure(Number.isSafeInteger(obj.id) && obj.id > 0 && !ids.has(obj.id), 'Invalid or duplicate v2 slot ID')
    ensure(Number.isFinite(obj.x) && Number.isFinite(obj.y), 'Invalid slot coordinates')
    ids.add(obj.id)
    slots.push({ id: obj.id, type, x: obj.x + (layer.offsetx ?? 0), y: obj.y + (layer.offsety ?? 0) })
  }
  ensure(slots.length, 'Empty v2 slot catalog')
  return slots.sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)
}

export function createManifest(snapshot: Snapshot, mapText: string, targetIds?: number[]): Manifest {
  validateSnapshot(snapshot)
  const slots = readSlots(mapText)
  const occupied = new Set(snapshot.graves.filter(g => g.map_version === 'v2').map(g => g.slot_id))
  const graves = snapshot.graves.filter(g => g.map_version === 'v1')
    .sort((a, b) => {
      const delta = creationMicros(a.created_at) - creationMicros(b.created_at)
      return delta < 0n ? -1 : delta > 0n ? 1 : a.id.localeCompare(b.id)
    })
  const freeSlots = slots.filter(s => !occupied.has(s.id))
  const targets = targetIds ?? freeSlots.slice(0, graves.length).map(s => s.id)
  ensure(targets.length === graves.length, 'Insufficient capacity or wrong number of requested founder slots')
  const manifest: Manifest = {
    schema_version: 1, map_sha256: hash(mapText), snapshot_sha256: snapshotHash(snapshot),
    placements: graves.map((g, index) => {
      const slot = freeSlots.find(s => s.id === targets[index])
      ensure(slot, `Target slot is occupied, reserved or unknown: ${targets[index]}`)
      const gids = GRAVE_GIDS_V2[slot.type]
      return { grave_id: g.id, old_map_version: 'v1', old_slot_id: g.slot_id, old_grave_gid: g.grave_gid,
        new_map_version: 'v2', new_slot_id: slot.id, new_grave_gid: gids[index % gids.length] }
    }),
  }
  validateManifest(manifest, snapshot, mapText)
  return manifest
}

export function validateManifest(manifest: Manifest, snapshot: Snapshot, mapText: string): void {
  validateSnapshot(snapshot)
  ensure(manifest?.schema_version === 1 && Array.isArray(manifest.placements), 'Invalid manifest format')
  ensure(manifest.map_sha256 === hash(mapText), 'TMJ changed; regenerate and review the manifest')
  ensure(manifest.snapshot_sha256 === snapshotHash(snapshot), 'Snapshot does not match manifest')
  const slots = new Map(readSlots(mapText).map(s => [s.id, s]))
  const graves = new Map(snapshot.graves.filter(g => g.map_version === 'v1').map(g => [g.id, g]))
  const occupied = new Set(snapshot.graves.filter(g => g.map_version === 'v2').map(g => g.slot_id))
  const seen = new Set<string>()
  for (const grave of snapshot.graves.filter(g => g.map_version === 'v2')) {
    ensure(slots.has(grave.slot_id), `Existing v2 grave uses an unknown slot: ${grave.id}`)
  }
  ensure(manifest.placements.length === graves.size, 'Manifest must cover every v1 grave exactly once')
  for (const p of manifest.placements) {
    const old = graves.get(p.grave_id), slot = slots.get(p.new_slot_id)
    ensure(old && !seen.has(p.grave_id), 'Missing or duplicate source UUID')
    ensure(p.old_map_version === 'v1' && p.old_slot_id === old.slot_id && p.old_grave_gid === old.grave_gid, 'Source placement changed')
    ensure(p.new_map_version === 'v2' && slot && !occupied.has(slot.id), 'Invalid, reserved or occupied destination')
    ensure(GRAVE_GIDS_V2[slot.type]?.includes(p.new_grave_gid), 'GID is incompatible with the slot footprint')
    seen.add(p.grave_id); occupied.add(slot.id)
  }
}

const fingerprint = (table: Table) => `(select md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' order by ${table === 'users' ? 'github_id' : 'id'}), '')) from public.${table} t)`
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Generates a rollback-by-default transaction. No database connection is opened. */
export function migrationSql(manifest: Manifest, snapshot: Snapshot, mapText: string, commit = false): string {
  validateManifest(manifest, snapshot, mapText)
  const catalog = readSlots(mapText).flatMap(s => GRAVE_GIDS_V2[s.type].map(gid => ({ slot_id: s.id, grave_gid: gid })))
  return `-- Generated from reviewed manifest. Map SHA-256: ${manifest.map_sha256}
-- ${commit ? 'COMMIT ENABLED: requires private export, closed DB gate and operator approval.' : 'DRY RUN: all updates are rolled back.'}
begin;
set local time zone 'UTC';
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.graves, public.users, public.f_votes, public.grave_burn_intents, public.grave_burns in share row exclusive mode;
do $$ begin
  perform 1 from public.cemetery_write_control where singleton and burials_paused for update;
  if not found then raise exception 'Close the database burial gate first'; end if;
${TABLES.map(t => `  if ${fingerprint(t)} <> '${snapshot.fingerprints[t]}' or (select count(*) from public.${t}) <> ${snapshot.counts[t]} then raise exception 'Stale snapshot: ${t}'; end if;`).join('\n')}
  if (select coalesce(sum(amount_raw),0) from public.grave_burns where status='verified') <> ${quote(snapshot.verified_amount_raw)}::numeric then raise exception 'Offering total changed'; end if;
end $$;
create temporary table cutover_before on commit drop as select * from public.graves;
create temporary table cutover_manifest on commit drop as
select * from jsonb_to_recordset(${quote(JSON.stringify(manifest.placements))}::jsonb)
as p(grave_id uuid, old_map_version text, old_slot_id integer, old_grave_gid integer, new_map_version text, new_slot_id integer, new_grave_gid integer);
alter table cutover_manifest add primary key(grave_id), add unique(new_slot_id);
create temporary table cutover_catalog on commit drop as
select * from jsonb_to_recordset(${quote(JSON.stringify(catalog))}::jsonb) as c(slot_id integer, grave_gid integer);
do $$ begin
  if (select count(*) from cutover_manifest) <> (select count(*) from public.graves where map_version='v1')
    or exists(select 1 from public.graves g where g.map_version='v1' and not exists(select 1 from cutover_manifest p where p.grave_id=g.id))
    then raise exception 'Incomplete migration manifest'; end if;
  if exists(select 1 from cutover_manifest p left join public.graves g on g.id=p.grave_id
    where g.id is null or g.map_version is distinct from p.old_map_version or p.old_map_version <> 'v1'
      or g.slot_id is distinct from p.old_slot_id or g.grave_gid is distinct from p.old_grave_gid
      or p.new_map_version <> 'v2'
      or not exists(select 1 from cutover_catalog c where c.slot_id=p.new_slot_id and c.grave_gid=p.new_grave_gid)
      or exists(select 1 from public.graves occupied where occupied.map_version='v2' and occupied.slot_id=p.new_slot_id))
    then raise exception 'Manifest precondition failed'; end if;
end $$;
select id from public.graves where id in (select grave_id from cutover_manifest) for update;
update public.graves g set map_version=p.new_map_version, slot_id=p.new_slot_id, grave_gid=p.new_grave_gid
from cutover_manifest p where g.id=p.grave_id;
do $$ begin
  if exists(select 1 from public.graves where map_version <> 'v2') then raise exception 'Unmigrated grave'; end if;
  if exists(select 1 from cutover_before b full join public.graves g using(id)
    where b.id is null or g.id is null or
    (to_jsonb(b) - array['map_version','slot_id','grave_gid']) is distinct from
    (to_jsonb(g) - array['map_version','slot_id','grave_gid'])) then raise exception 'Grave identity or memorial changed'; end if;
  if exists(select 1 from cutover_before b join public.graves g using(id)
    where b.map_version='v2' and to_jsonb(b) is distinct from to_jsonb(g)) then raise exception 'Existing v2 grave changed'; end if;
  if exists(select 1 from cutover_manifest p join public.graves g on g.id=p.grave_id
    where g.map_version <> 'v2' or g.slot_id <> p.new_slot_id or g.grave_gid is distinct from p.new_grave_gid)
    then raise exception 'Target placement mismatch'; end if;
  if exists(select slot_id from public.graves where map_version='v2' group by slot_id having count(*) > 1) then raise exception 'Slot collision'; end if;
${TABLES.filter(t => t !== 'graves').map(t => `  if ${fingerprint(t)} <> '${snapshot.fingerprints[t]}' then raise exception 'Related records changed: ${t}'; end if;`).join('\n')}
  if exists(select 1 from public.f_votes v left join public.graves g on g.id=v.grave_id where g.id is null)
    or exists(select 1 from public.grave_burn_intents i left join public.graves g on g.id=i.grave_id where g.id is null)
    or exists(select 1 from public.grave_burns b left join public.graves g on g.id=b.grave_id
      left join public.grave_burn_intents i on i.id=b.intent_id where g.id is null or i.id is null or i.grave_id <> b.grave_id)
    then raise exception 'Broken related-record identity'; end if;
  if (select coalesce(sum(amount_raw),0) from public.grave_burns where status='verified') <> ${quote(snapshot.verified_amount_raw)}::numeric then raise exception 'Offering total changed'; end if;
end $$;
alter table public.graves alter column map_version set default 'v2';
update public.cemetery_write_control set v1_retired=true where singleton;
-- The database gate stays CLOSED until every old UUID passes production smoke.
${commit ? 'commit' : 'rollback'};
`
}

export function rollbackSql(manifest: Manifest, snapshot: Snapshot, mapText: string): string {
  validateManifest(manifest, snapshot, mapText)
  return `-- Emergency data restoration only; NEVER republishes the v1 application.
-- Rollback by default. Review each target and explicitly approve COMMIT separately.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.graves in share row exclusive mode;
do $$ begin
  perform 1 from public.cemetery_write_control where singleton and burials_paused for update;
  if not found then raise exception 'Close the burial gate first'; end if;
end $$;
${manifest.placements.map(p => `do $$ begin
  if not exists(select 1 from public.graves where id='${p.grave_id}' and map_version='v2' and slot_id=${p.new_slot_id} and grave_gid=${p.new_grave_gid})
    then raise exception 'Restoration precondition failed for ${p.grave_id}'; end if;
  update public.graves set map_version='v1', slot_id=${p.old_slot_id}, grave_gid=${p.old_grave_gid ?? 'null'} where id='${p.grave_id}';
end $$;`).join('\n')}
-- Keep writes paused and v1 retired; show maintenance until v2 is repaired.
rollback;
`
}
