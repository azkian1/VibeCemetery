import { expect, test } from '@playwright/test'
import {
  countUserAutoAssignableGraves,
  getDefaultGraveSetForSelectAll,
  getInitialSelectedRepoSet,
  getNextSelectedRepoSet,
  getRepoSubmissionType,
  getSelectedReposForSubmit,
  shouldAllowGraveToggle,
  shouldAutoAssignGraveOnSelection,
  shouldCremateAfterSlotExhaustion,
  shouldFallbackGraveToCremation,
  withDefaultGraveForSelectedRepo,
} from '../src/components/modals/BuryFlowModal'
import type { GraveData } from '../src/types/game'

test.describe('BuryFlowModal grave fallback', () => {
  test('falls back when the map has no free auto-assignable slots', async () => {
    await expect(shouldFallbackGraveToCremation(new Response(null, { status: 507 }))).resolves.toBe(true)
  })

  test('falls back when stale client slots make /api/graves return user slot exhaustion', async () => {
    const res = new Response(JSON.stringify({ code: 'USER_GRAVE_SLOTS_EXHAUSTED' }), { status: 403 })

    await expect(shouldFallbackGraveToCremation(res)).resolves.toBe(true)
  })

  test('does not fall back for unrelated /api/graves 403 responses', async () => {
    const res = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

    await expect(shouldFallbackGraveToCremation(res)).resolves.toBe(false)
  })
})

test.describe('BuryFlowModal default grave selection', () => {
  test('keeps auto grave assignment enabled in burial mode after modal scan', () => {
    expect(shouldAutoAssignGraveOnSelection('burial')).toBe(true)
  })

  test('keeps auto grave assignment disabled in cremation mode', () => {
    expect(shouldAutoAssignGraveOnSelection('cremation')).toBe(false)
  })

  test('burial mode allows only one selected repo at a time', () => {
    expect([...getNextSelectedRepoSet({ selected: new Set([101]), repoId: 202, initialMode: 'burial' })]).toEqual([202])
  })

  test('burial mode initializes with only one preloaded repo selected', () => {
    expect([...getInitialSelectedRepoSet([101, 202], 'burial')]).toEqual([101])
  })

  test('burial mode does not allow manual cremation toggles', () => {
    expect(shouldAllowGraveToggle('burial')).toBe(false)
  })

  test('default mode keeps multi-select behavior', () => {
    expect([...getNextSelectedRepoSet({ selected: new Set([101]), repoId: 202 })]).toEqual([101, 202])
  })

  test('burial mode submits only one selected repo', () => {
    const repos = [repo({ id: 101, name: 'one' }), repo({ id: 202, name: 'two' })]

    expect(getSelectedReposForSubmit({ repos, selected: new Set([101, 202]), initialMode: 'burial' }).map((item) => item.id)).toEqual([101])
  })

  test('burial mode always submits selected repos as graves', () => {
    expect(getRepoSubmissionType({ repoId: 101, graveSet: new Set(), initialMode: 'burial' })).toBe('grave')
  })

  test('burial mode does not cremate after slot exhaustion', () => {
    expect(shouldCremateAfterSlotExhaustion('burial')).toBe(false)
  })

  test('marks a newly selected repo for grave when a grave slot is available', () => {
    const graveSet = withDefaultGraveForSelectedRepo(new Set(), 101, 1)

    expect([...graveSet]).toEqual([101])
  })

  test('keeps a newly selected repo as cremation when grave slots are full', () => {
    const graveSet = withDefaultGraveForSelectedRepo(new Set([101]), 202, 1)

    expect([...graveSet]).toEqual([101])
  })

  test('marks only the first available slots for grave on select all', () => {
    const graveSet = getDefaultGraveSetForSelectAll([101, 202, 303], 2)

    expect([...graveSet]).toEqual([101, 202])
  })
})

test.describe('BuryFlowModal slot counting', () => {
  test('matches GitHub usernames case-insensitively', () => {
    const graves = new Map<number, GraveData>([[10, grave({ author_github: 'OctoCat' })]])

    expect(countUserAutoAssignableGraves({
      graves,
      slotPositions: [],
      username: 'octocat',
    })).toBe(1)
  })
})

function grave(overrides: Partial<GraveData>): GraveData {
  return {
    id: 'grave-id',
    name: 'grave',
    born_at: null,
    died_at: null,
    cause: null,
    epitaph: null,
    description: null,
    stack: null,
    github_url: null,
    github_repo_id: 999,
    author_github: 'octocat',
    slot_id: 10,
    tier: 1,
    ...overrides,
  }
}

function repo(overrides: { id: number; name: string }) {
  return {
    id: overrides.id,
    name: overrides.name,
    description: null,
    html_url: `https://github.com/octocat/${overrides.name}`,
    language: 'TypeScript',
    created_at: '2026-01-01T00:00:00Z',
    pushed_at: '2026-05-01T00:00:00Z',
  }
}
