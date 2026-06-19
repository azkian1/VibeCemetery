import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const schema = readFileSync(join(process.cwd(), 'docs', 'supabase-schema.sql'), 'utf8')
const repoDidUniqueMigration = readFileSync(join(process.cwd(), 'docs', 'agent-layer-archive', 'agent-ashes-repo-did-unique.sql'), 'utf8')
const normalizedSchema = schema.replace(/\s+/g, ' ').toLowerCase()
const normalizedRepoDidUniqueMigration = repoDidUniqueMigration.replace(/\s+/g, ' ').toLowerCase()

test.describe('agent_ashes database schema', () => {
  test('defines a separate Agent Ash storage table', () => {
    expect(normalizedSchema).toContain('create table if not exists public.agent_ashes')
    expect(normalizedSchema).toContain('certificate_hash varchar(128) unique not null')
    expect(normalizedSchema).toContain('schema_version varchar(50) not null')
    expect(normalizedSchema).toContain("source varchar(50) not null default 'gitlawb'")
    expect(normalizedSchema).toContain('certificate jsonb not null')
    expect(normalizedSchema).toContain('proof jsonb')
  })

  test('indexes Agent Ash fields without joining human progression', () => {
    expect(normalizedSchema).toContain('create index if not exists agent_ashes_repo_did_idx on public.agent_ashes (repo_did)')
    expect(normalizedSchema).toContain('create index if not exists agent_ashes_agent_did_idx on public.agent_ashes (agent_did)')
    expect(normalizedSchema).toContain('create index if not exists agent_ashes_primary_cause_idx on public.agent_ashes (primary_cause)')
    expect(normalizedSchema).toContain('create index if not exists agent_ashes_verification_status_idx on public.agent_ashes (verification_status)')
    expect(normalizedSchema).toContain('create unique index if not exists agent_ashes_repo_did_unique_idx on public.agent_ashes (repo_did)')
    expect(normalizedSchema).not.toContain('create unique index if not exists agent_ashes_repo_death_unique_idx on public.agent_ashes (repo_did, declared_dead_at)')

    const agentAshBlock = normalizedSchema.slice(
      normalizedSchema.indexOf('create table if not exists public.agent_ashes'),
      normalizedSchema.indexOf('create index if not exists agent_ashes_repo_did_idx'),
    )
    expect(agentAshBlock).not.toContain('references public.users')
    expect(agentAshBlock).not.toContain('references public.graves')
    expect(agentAshBlock).not.toContain('references public.cremated')
    expect(agentAshBlock).not.toContain('slot_id')
    expect(normalizedSchema).not.toContain('increment_agent_ashes_count')
  })

  test('provides a safe repo DID uniqueness migration', () => {
    const createIndexPosition = normalizedRepoDidUniqueMigration.indexOf('create unique index concurrently if not exists agent_ashes_repo_did_unique_idx')
    const dropOldIndexPosition = normalizedRepoDidUniqueMigration.indexOf('drop index concurrently if exists public.agent_ashes_repo_death_unique_idx')

    expect(createIndexPosition).toBeGreaterThan(-1)
    expect(dropOldIndexPosition).toBeGreaterThan(createIndexPosition)
    expect(normalizedRepoDidUniqueMigration).toContain('having count(*) > 1')
  })
})
