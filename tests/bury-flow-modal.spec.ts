import { expect, test } from '@playwright/test'
import {
  countUserAutoAssignableGraves,
  getBuryFlowUi,
  getDefaultGraveSetForSelectAll,
  getInitialSelectedRepoSet,
  getNextSelectedRepoSet,
  getRepoSubmissionType,
  getSelectedReposForSubmit,
  resolveBuryFlowMode,
  shouldAllowGraveToggle,
  shouldAutoAssignGraveOnSelection,
  shouldCremateAfterSlotExhaustion,
  shouldFallbackGraveToCremation,
  withDefaultGraveForSelectedRepo,
} from '../src/components/modals/BuryFlowModal'
import { getStepDonePrimaryAction } from '../src/components/modals/bury/StepDone'
import {
  shouldShowStepSelectActionToggles,
  shouldShowStepSelectBulkToggle,
  shouldShowStepSelectCheckboxes,
  shouldShowStepSelectStatusBlock,
} from '../src/components/modals/bury/StepSelect'
import {
  LOCAL_TERMINAL_CREMATION_COPY,
  LOCAL_TERMINAL_CREMATION_PROMPT_MARGIN_TOP,
  shouldShowCremationSkillPrompt,
  shouldShowRescanAfterSuccessfulScan,
} from '../src/components/modals/bury/StepScan'
import { shouldHighlightShareGrave } from '../src/components/modals/GraveModal'
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
  test('resolves explicit bury flow modes without inferring from stale local state', () => {
    expect(resolveBuryFlowMode({ flowMode: 'home-preselected-burial' })).toBe('home-preselected-burial')
    expect(resolveBuryFlowMode({ flowMode: 'home-preselected-cremation' })).toBe('home-preselected-cremation')
    expect(resolveBuryFlowMode({ flowMode: 'cemetery-shovel' })).toBe('cemetery-shovel')
    expect(resolveBuryFlowMode({ flowMode: 'cemetery-fire' })).toBe('cemetery-fire')
    expect(resolveBuryFlowMode(null)).toBe('default-scanner')
  })

  test('flow mode UI rules separate home preselected burial from map shovel', () => {
    expect(getBuryFlowUi('home-preselected-burial')).toMatchObject({
      isBurial: true,
      isCremation: false,
      isSingleSelection: true,
      startsAtSelect: true,
      selectedProjectOnly: true,
      closeSelectBack: true,
    })
    expect(getBuryFlowUi('cemetery-shovel')).toMatchObject({
      isBurial: true,
      isCremation: false,
      isSingleSelection: true,
      startsAtSelect: false,
      selectedProjectOnly: false,
      closeSelectBack: false,
    })
  })

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

  test('cremation-only selection hides grave/fire choices and slot status', () => {
    expect(shouldShowStepSelectActionToggles(true)).toBe(false)
    expect(shouldShowStepSelectStatusBlock(true, false, false, false, false, false)).toBe(false)
  })

  test('cremation completion opens urn instead of profile', () => {
    expect(getStepDonePrimaryAction([{ name: 'ashes', success: true, type: 'cremated', cremated: cremation({ name: 'ashes' }) }])).toBe('urn')
    expect(getStepDonePrimaryAction([{ name: 'grave', success: true, type: 'grave', grave: grave({}) }])).toBe('profile')
  })

  test('successful scan shows only Next, while cremation scan shows local terminal setup copy', () => {
    expect(shouldShowRescanAfterSuccessfulScan()).toBe(false)
    expect(shouldShowCremationSkillPrompt(true)).toBe(true)
    expect(shouldShowCremationSkillPrompt(false)).toBe(false)
    expect(LOCAL_TERMINAL_CREMATION_COPY).toBe('For local folders, set up /bury terminal cremation')
    expect(LOCAL_TERMINAL_CREMATION_PROMPT_MARGIN_TOP).toBe(28)
  })

  test('mixed selection keeps grave/fire choices and slot status visible', () => {
    expect(shouldShowStepSelectActionToggles(false)).toBe(true)
    expect(shouldShowStepSelectStatusBlock(false, false, false, false, false, false)).toBe(true)
  })

  test('burial-only preselected project hides selection controls and slot status', () => {
    expect(shouldShowStepSelectBulkToggle(true, false)).toBe(false)
    expect(shouldShowStepSelectCheckboxes(true)).toBe(false)
    expect(shouldShowStepSelectActionToggles(false, true)).toBe(false)
    expect(shouldShowStepSelectStatusBlock(false, true, false, false, false, false)).toBe(false)
  })

  test('map shovel scan keeps one-project selection controls visible', () => {
    expect(shouldShowStepSelectBulkToggle(false, false)).toBe(true)
    expect(shouldShowStepSelectCheckboxes(false)).toBe(true)
    expect(shouldShowStepSelectActionToggles(false, false)).toBe(true)
    expect(shouldShowStepSelectStatusBlock(false, false, true, false, false, false)).toBe(false)
  })

  test('mixed selection keeps slot status visible', () => {
    expect(shouldShowStepSelectStatusBlock(false, false, false, false, false, false)).toBe(true)
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

test.describe('GraveModal sharing', () => {
  test('highlights Share Grave only for own unshared grave', () => {
    expect(shouldHighlightShareGrave({ isOwnGrave: true, firstGraveSharedAt: null, shareUnlockStatus: 'idle' })).toBe(true)
    expect(shouldHighlightShareGrave({ isOwnGrave: true, firstGraveSharedAt: '2026-05-27T00:00:00.000Z', shareUnlockStatus: 'idle' })).toBe(false)
    expect(shouldHighlightShareGrave({ isOwnGrave: false, firstGraveSharedAt: null, shareUnlockStatus: 'idle' })).toBe(false)
    expect(shouldHighlightShareGrave({ isOwnGrave: true, firstGraveSharedAt: null, shareUnlockStatus: 'unlocked' })).toBe(false)
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

function cremation(overrides: { name: string }) {
  return {
    id: 1,
    name: overrides.name,
    cause: 'dead',
    author_github: 'octocat',
    created_at: '2026-05-01T00:00:00Z',
    source: 'github' as const,
  }
}
