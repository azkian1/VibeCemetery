# Atomic Grave Slot Insert Plan

## Goal

Close the race condition in `POST /api/graves` without overloading the architecture.

The normal grave slot cap must be checked atomically with the grave insert, so two parallel burial requests for one remaining user slot result in exactly one created grave and one `USER_GRAVE_SLOTS_EXHAUSTED` response.

## Current Problem

The current route does these steps separately:

1. Count the user's used normal slots.
2. Calculate unlocked normal slots from the base slot count and the social slot flag.
3. Pick a free map slot in application code.
4. Insert the grave.
5. Re-count and rollback if the user exceeded the slot cap.

This is race-prone. If two requests start while the user has one free normal slot, both can pass the pre-check before either insert commits. The rollback guard can then produce incorrect outcomes, including both requests deleting their own inserts.

## Minimal Solution

Keep the existing application responsibilities:

- request validation;
- text sanitization;
- epitaph generation;
- parsing map slots from `public/map/az.tmj`;
- weighted random selection of `grave` / `grave_tall` slots;
- retry on map slot collision.

Move only the critical section into Postgres:

- per-user advisory transaction lock;
- normal slot economy re-count;
- grave insert;
- structured status return.

This avoids a new `map_slots` table and avoids moving all slot selection logic into SQL.

## New RPC

Add a new SQL file:

```text
docs/grave-slot-rpc.sql
```

Define:

```sql
public.insert_grave_if_user_slot_available(...)
returns jsonb
```

### Parameters

```sql
p_author_github text,
p_auto_slot_ids integer[],
p_slot_id integer,
p_name text,
p_description text,
p_epitaph text,
p_born_at timestamptz,
p_died_at timestamptz,
p_cause text,
p_stack text[],
p_github_url text,
p_github_repo_id bigint,
p_last_commit_message text
```

`p_auto_slot_ids` is passed by the API from the parsed map. This keeps the Tiled map as the source of truth and avoids adding a database slot table for now.

## RPC Logic

Inside the function:

1. Take a per-user transaction lock:

```sql
perform pg_advisory_xact_lock(hashtext(p_author_github));
```

2. Read the planned social slot flag:

```sql
select x_first_grave_shared_at is not null
from users
where github_username = p_author_github;
```

3. Calculate unlocked normal slots:

```text
4 base slots
+1 if x_first_grave_shared_at is not null
```

4. Count used normal slots:

```sql
select count(*)
from graves
where author_github = p_author_github
and slot_id = any(p_auto_slot_ids);
```

5. If `slots_used >= slots_unlocked`, return:

```json
{
  "status": "user_slots_exhausted",
  "slots_unlocked": 4,
  "slots_used": 4
}
```

7. Attempt the insert into `graves` using `p_slot_id`.

8. On success, return:

```json
{
  "status": "created",
  "grave": { ... }
}
```

9. On unique violation for `github_repo_id`, return:

```json
{ "status": "duplicate_repo" }
```

10. On unique violation for `slot_id`, return:

```json
{ "status": "slot_collision" }
```

11. On any other insert error, return:

```json
{
  "status": "failed",
  "message": "..."
}
```

## Why This Fixes the Race

With one remaining normal slot and two parallel requests:

1. Request A enters the advisory lock.
2. Request B waits.
3. Request A re-counts slot usage and inserts the grave.
4. Request A exits the transaction.
5. Request B enters the lock.
6. Request B re-counts slot usage after A's insert.
7. Request B returns `user_slots_exhausted`.

Result: exactly one created grave.

## API Changes

File:

```text
src/app/api/graves/route.ts
```

Keep:

- auth;
- daily `20/day` pre-check for now;
- body parsing;
- validation;
- sanitization;
- epitaph generation;
- map slot loading;
- weighted random slot selection.

Remove:

- non-atomic user slot pre-check;
- post-insert user slot rollback guard;
- `loadUserSlotEconomy` from this route if it becomes unused.

Replace the insert section with a local retry loop that calls the RPC.

Pseudo-flow:

```ts
const autoSlotIds = getAutoAssignableGraveSlots().map((slot) => slot.id)
const triedSlotIds = new Set<number>()

for (let attempt = 0; attempt < 5; attempt += 1) {
  const usedSlotIds = await loadUsedSlotIds()
  for (const slotId of triedSlotIds) usedSlotIds.add(slotId)

  const slot = pickRandomFreeSlot(usedSlotIds)
  if (!slot) return mapSlotsExhaustedResponse()

  triedSlotIds.add(slot.id)

  const rpcResult = await insertGraveIfUserSlotAvailable(slot.id, autoSlotIds, graveRow)

  if (rpcResult.status === 'created') return createdResponse(rpcResult.grave)
  if (rpcResult.status === 'slot_collision') continue
  if (rpcResult.status === 'duplicate_repo') return duplicateRepoResponse()
  if (rpcResult.status === 'user_slots_exhausted') return userSlotsExhaustedResponse(rpcResult)

  return failedResponse()
}

return retryExhaustedResponse()
```

## HTTP Mapping

```text
created                -> 201 + grave
duplicate_repo         -> 409
user_slots_exhausted   -> 403 + code USER_GRAVE_SLOTS_EXHAUSTED
slot_collision         -> retry until max attempts
no free map slot       -> 507
failed                 -> 500
retry exhausted        -> 503
```

The `403` response must keep the existing client contract:

```json
{
  "code": "USER_GRAVE_SLOTS_EXHAUSTED",
  "error": "No user grave slots available",
  "slots_unlocked": 4,
  "slots_used": 4
}
```

## Tests

Minimum useful coverage:

1. Helper tests:
   - auto slot IDs include only `grave` and `grave_tall`;
   - reserved/manual slots do not count as normal usage.

2. RPC result mapping tests, if route extraction stays small:
   - `user_slots_exhausted` maps to `403` with `USER_GRAVE_SLOTS_EXHAUSTED`;
   - `duplicate_repo` maps to `409`;
   - repeated `slot_collision` maps to retry then `503`;
   - `created` maps to `201`.

3. Manual database concurrency verification:
   - create a test user with one unlocked normal slot and zero used normal slots;
   - send two concurrent calls that attempt to insert different repos;
   - verify exactly one `created` result;
   - verify exactly one `user_slots_exhausted` result;
   - verify exactly one new grave row exists.

## Verification Commands

Run after implementation:

```powershell
npx.cmd playwright test -c playwright.unit.config.ts tests/map-slots.spec.ts tests/slot-economy.spec.ts tests/bury-flow-modal.spec.ts tests/graves-write-path.spec.ts
npm.cmd run lint
npm.cmd run build
```

If route-specific tests are added, include them in the targeted Playwright command.

## Non-Goals

- Do not add a `map_slots` database table.
- Do not implement Tier 2/3 admin upgrade flow.
- Do not implement friends/welcome manual placement flow.
- Do not rewrite grave rendering or Phaser map logic.
- Do not change CLI cremation flow.
- Do not silently fall back to the old non-atomic insert path if the RPC is missing.

## Review Checklist

Before considering the fix complete:

- `POST /api/graves` no longer performs user slot check and insert as separate non-atomic operations.
- User slot cap and insert happen inside one RPC under `pg_advisory_xact_lock`.
- `slot_collision` still retries.
- `USER_GRAVE_SLOTS_EXHAUSTED` response shape is unchanged for the client.
- Normal slot usage still counts only auto-assignable slot IDs.
- Build and targeted tests pass.
