-- Read-only inventory. Save the single JSON value privately as snapshot.json.
-- A full private database export is ALSO required before migration.
-- Fingerprints are calculated in PostgreSQL; uint256 values never pass through JS numbers.
begin transaction isolation level repeatable read read only;
set local time zone 'UTC';
select jsonb_build_object(
  'schema_version', 1,
  'graves', (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'map_version', map_version, 'slot_id', slot_id,
    'grave_gid', grave_gid, 'created_at', created_at
  ) order by created_at, id), '[]'::jsonb) from public.graves),
  'fingerprints', jsonb_build_object(
    'graves', (select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.graves t),
    'f_votes', (select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.f_votes t),
    'grave_burn_intents', (select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.grave_burn_intents t),
    'grave_burns', (select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.grave_burns t),
    'users', (select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by github_id), '')) from public.users t)
  ),
  'counts', jsonb_build_object(
    'graves', (select count(*) from public.graves),
    'f_votes', (select count(*) from public.f_votes),
    'grave_burn_intents', (select count(*) from public.grave_burn_intents),
    'grave_burns', (select count(*) from public.grave_burns),
    'users', (select count(*) from public.users)
  ),
  'verified_amount_raw', (select coalesce(sum(amount_raw), 0)::text from public.grave_burns where status = 'verified')
) as cutover_snapshot;
commit;
