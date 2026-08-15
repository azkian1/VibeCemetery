import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const migration = fs.readFileSync(path.join(root, 'docs/web3-grave-burn-mvp.sql'), 'utf8')
const hardening = fs.readFileSync(path.join(root, 'docs/supabase-rls-hardening.sql'), 'utf8')

test('migration creates constrained intent and burn tables', () => {
  expect(migration).toContain('create table if not exists public.grave_burn_intents')
  expect(migration).toContain('create table if not exists public.grave_burns')
  expect(migration).toContain('intent_id uuid not null unique')
  expect(migration).toContain('tx_hash text not null unique')
  expect(migration).toContain("chain_id = 8453")
  expect(migration).toContain("amount_raw > 0")
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
    expect(hardening).toContain(`ALTER TABLE IF EXISTS public.${table} FORCE ROW LEVEL SECURITY`)
  }
})

test('scheduler is configured for bounded protected reverification', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'))
  expect(vercel.crons).toContainEqual({
    path: '/api/internal/grave-burns/reverify',
    schedule: '*/5 * * * *',
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
