import { expect, test } from '@playwright/test'
import {
  countUserAutoAssignableGraves,
  getDefaultGraveSetForSelectAll,
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
