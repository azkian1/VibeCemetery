import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const schema = readFileSync(join(process.cwd(), 'docs', 'supabase-schema.sql'), 'utf8')
const hardeningMigration = readFileSync(join(process.cwd(), 'docs', 'supabase-rls-hardening.sql'), 'utf8')
const normalizedSchema = schema.replace(/\s+/g, ' ').toLowerCase()
const normalizedMigration = hardeningMigration.replace(/\s+/g, ' ').toLowerCase()

const BASE_SERVER_ONLY_TABLES = [
  'users',
  'graves',
  'f_votes',
  'cremated',
  'cli_tokens',
  'cli_link_sessions',
  'agent_ashes',
]

const LEGACY_SERVER_ONLY_TABLES = [
  'agent_ash_tokens',
  'agent_ash_link_sessions',
]

function expectRlsBoundary(sql: string, table: string) {
  expect(sql).toContain(`alter table if exists public.${table} enable row level security`)
  expect(sql).toContain(`alter table if exists public.${table} force row level security`)
  expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated`)
}

test.describe('Supabase RLS hardening', () => {
  test('base schema closes every current server-only table to Data API roles', () => {
    for (const table of BASE_SERVER_ONLY_TABLES) {
      expect(normalizedSchema).toContain(`alter table public.${table} enable row level security`)
      expect(normalizedSchema).toContain(`alter table public.${table} force row level security`)
      expect(normalizedSchema).toContain(`revoke all on table public.${table} from anon, authenticated`)
    }
  })

  test('idempotent hardening migration also covers legacy Agent Ash auth tables', () => {
    for (const table of [...BASE_SERVER_ONLY_TABLES, ...LEGACY_SERVER_ONLY_TABLES]) {
      expectRlsBoundary(normalizedMigration, table)
    }
  })
})
