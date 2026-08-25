import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const migration = fs.readFileSync(path.join(root, 'docs/web3-grave-burn-mvp.sql'), 'utf8')
const finishMigration = fs.readFileSync(
  path.join(root, 'docs/web3-grave-burn-v1-finish.sql'),
  'utf8',
)

function normalizedFunctionBody(sql: string, functionName: string): string {
  const marker = `create or replace function public.${functionName}(`
  const functionStart = sql.indexOf(marker)
  expect(functionStart).toBeGreaterThanOrEqual(0)
  const bodyStart = sql.indexOf('as $$', functionStart)
  const bodyEnd = sql.indexOf('$$;', bodyStart)
  expect(bodyStart).toBeGreaterThan(functionStart)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return sql
    .slice(bodyStart + 'as $$'.length, bodyEnd)
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

test('migration creates constrained intent and burn tables', () => {
  expect(migration).toContain('create table if not exists public.grave_burn_intents')
  expect(migration).toContain('create table if not exists public.grave_burns')
  expect(migration).toContain('intent_id uuid not null unique')
  expect(migration).toContain('tx_hash text not null unique')
  expect(migration).toContain("chain_id = 8453")
  expect(migration).toContain("amount_raw > 0")
  expect(migration).toContain('grave_burn_intents_amount_uint256')
  expect(migration).toContain('grave_burns_amount_uint256')
  expect(migration).toContain('115792089237316195423570985008687907853269984665640564039457584007913129639935')
  expect(migration).toContain('grave_burn_intents_created_expiry_idx')
  expect(migration).toContain("where status = 'created'")
  expect(migration).toContain("status in ('pending', 'verified', 'failed', 'orphaned')")
})

test('atomic transitions lock rows and retain unique-constraint protection', () => {
  expect(migration).toContain('function public.expire_grave_burn_intent')
  expect(migration).toContain('function public.authorize_grave_burn_intent')
  expect(migration).toContain('function public.bind_grave_burn')
  expect(migration.match(/for update;/gi)?.length).toBeGreaterThanOrEqual(3)
  expect(migration).toContain('pg_advisory_xact_lock')
  expect(migration).toContain('when unique_violation')
})

test('public stats aggregate inside Postgres and include verified burns only', () => {
  expect(migration).toContain('function public.get_grave_burn_stats')
  expect(migration).toContain("and status = 'verified'")
  expect(migration).toContain('group by wallet_address')
  expect(migration).toContain('limit 3')
  expect(migration).toContain('revoke all on function public.get_grave_burn_stats(uuid)')
})

test('new tables are forced behind the server-only RLS boundary', () => {
  for (const table of ['grave_burn_intents', 'grave_burns']) {
    expect(migration).toContain(`alter table public.${table} force row level security`)
    expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated`)
  }
})

test('late receipt recovery is constrained by the on-chain block timestamp', () => {
  expect(migration).toContain("and status = 'created'")
  expect(migration).not.toContain("status in ('created', 'authorized')")
  expect(migration).toContain('p_transfer_block_timestamp timestamptz')
  expect(migration).toContain('receipt appears after the wall-clock deadline')
  expect(migration).toContain('p_transfer_block_timestamp > locked_intent.expires_at')
  expect(migration).toContain('p_transfer_block_timestamp < locked_intent.authorization_verified_at')

  expect(finishMigration).toContain('function public.expire_grave_burn_intent')
  expect(finishMigration).toContain("and status = 'created'")
  expect(finishMigration).not.toContain("status in ('created', 'authorized')")
  expect(finishMigration).toContain('Preserve an already-broadcast hash')
  expect(finishMigration).toContain('p_transfer_block_timestamp > locked_intent.expires_at')
  expect(finishMigration).toContain('grave_burn_intents_amount_uint256')
  expect(finishMigration).toContain('grave_burns_amount_uint256')
  expect(finishMigration).toContain("set local lock_timeout = '5s'")
  expect(finishMigration).toContain("set local statement_timeout = '60s'")
  expect(finishMigration).toContain(
    'revoke all on function public.expire_grave_burn_intent',
  )
  expect(finishMigration).toContain('revoke all on function public.bind_grave_burn')
  expect(finishMigration).toContain('to service_role')
  expect(normalizedFunctionBody(migration, 'expire_grave_burn_intent'))
    .toBe(normalizedFunctionBody(finishMigration, 'expire_grave_burn_intent'))
  expect(normalizedFunctionBody(migration, 'bind_grave_burn'))
    .toBe(normalizedFunctionBody(finishMigration, 'bind_grave_burn'))
})

test('a receipt artifact can reclaim a hash from an artifact-less pending claim', () => {
  for (const sql of [migration, finishMigration]) {
    const body = normalizedFunctionBody(sql, 'bind_grave_burn')
    expect(sql).toContain('existing_burn.block_number')
    expect(sql).toContain('existing_burn.block_hash')
    expect(sql).toContain('existing_burn.log_index')
    expect(sql).toContain("set status = 'failed'")
    expect(sql).toContain('delete from public.grave_burns')
    expect(sql).toContain('where id = existing_burn.id')
    expect(body.indexOf("if locked_intent.status <> 'authorized'")).toBeLessThan(
      body.indexOf('where tx_hash = lower(p_tx_hash)'),
    )
    expect(body.indexOf('p_transfer_block_timestamp > locked_intent.expires_at'))
      .toBeLessThan(body.indexOf('where tx_hash = lower(p_tx_hash)'))
  }
})

test('scheduler is configured for bounded protected reverification', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'))
  expect(vercel.crons).toContainEqual({
    path: '/api/internal/grave-burns/reverify',
    schedule: '0 3 * * *',
  })
  const route = fs.readFileSync(
    path.join(root, 'src/app/api/internal/grave-burns/reverify/route.ts'),
    'utf8',
  )
  expect(route).toContain('limit: 25')
  expect(route).toContain('authorization')
  expect(route).toContain('reverifySecret')
  expect(route).toContain('export const GET = handleReverify')
  expect(route).toContain('export const POST = handleReverify')
})
