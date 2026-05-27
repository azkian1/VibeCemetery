import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  calculateAvailableGraveSlotsForHome,
  decideHomeRepoAction,
  filterFreshDeadRepos,
  formatLastPushAge,
  shouldShowHomeScannerChrome,
} from '../src/components/HomeScannerLanding'
import type { CrematedData, DeadRepo, GraveData } from '../src/types/game'

test.describe('home scanner entry flow', () => {
  test('formats last push age for result cards', () => {
    expect(formatLastPushAge('2026-05-15T00:00:00Z', new Date('2026-05-25T00:00:00Z'))).toBe('10 days ago')
    expect(formatLastPushAge('2026-05-24T00:00:00Z', new Date('2026-05-25T00:00:00Z'))).toBe('1 day ago')
    expect(formatLastPushAge('', new Date('2026-05-25T00:00:00Z'))).toBe('unknown')
  })

  test('filters already buried and cremated repos from first-page results', () => {
    const repos: DeadRepo[] = [
      repo({ id: 1, name: 'buried' }),
      repo({ id: 2, name: 'cremated' }),
      repo({ id: 3, name: 'fresh' }),
    ]
    const graves = new Map<number, GraveData>([[10, grave({ github_repo_id: 1 })]])
    const cremated: CrematedData[] = [cremation({ name: 'Cremated', author_github: 'octocat' })]

    expect(filterFreshDeadRepos({ repos, graves, cremated, username: 'octocat' }).map((item) => item.name)).toEqual(['fresh'])
  })

  test('routes first-page repo action to burial while grave slots remain', () => {
    const graves = new Map<number, GraveData>()

    const availableSlots = calculateAvailableGraveSlotsForHome({
      graves,
      username: 'octocat',
      hasSharedFirstGrave: false,
    })

    expect(availableSlots).toBe(4)
    expect(decideHomeRepoAction(availableSlots)).toEqual({ label: 'Bury', flowMode: 'home-preselected-burial' })
  })

  test('routes first-page repo action to cremation when no grave slots remain', () => {
    const graves = new Map<number, GraveData>()
    for (let i = 0; i < 4; i++) {
      graves.set(i + 1, grave({ slot_id: i + 1, author_github: 'octocat' }))
    }

    const availableSlots = calculateAvailableGraveSlotsForHome({
      graves,
      username: 'octocat',
      hasSharedFirstGrave: false,
    })

    expect(availableSlots).toBe(0)
    expect(decideHomeRepoAction(availableSlots)).toEqual({ label: 'Cremate', flowMode: 'home-preselected-cremation' })
  })

  test('ignores non-auto graves when map slot positions are known', () => {
    const graves = new Map<number, GraveData>([[99, grave({ slot_id: 99, author_github: 'octocat' })]])

    expect(calculateAvailableGraveSlotsForHome({
      graves,
      username: 'octocat',
      hasSharedFirstGrave: false,
      slotPositions: [{ id: 99, type: 'grave_special', name: 'Special', x: 0, y: 0, width: 1, height: 1 }],
    })).toBe(4)
  })

  test('hides scanner chrome after scan results exist', () => {
    expect(shouldShowHomeScannerChrome(null)).toBe(true)
    expect(shouldShowHomeScannerChrome([])).toBe(false)
    expect(shouldShowHomeScannerChrome([repo({ id: 4, name: 'dead' })])).toBe(false)
  })

  test('home keeps wallet hidden and routes Agent Layer to the hub', () => {
    const source = readFileSync('src/components/HomeScannerLanding.tsx', 'utf8')

    expect(source).toContain('Connect Wallet')
    expect(source).toContain('<span style={{ gridColumn: 2')
    expect(source).toContain("display: 'none'")
    expect(source).toContain('Agent Layer')
    expect(source).toContain('href="/agents"')
    expect(source).toContain('flowMode: repoAction.flowMode')
    expect(source).not.toContain('Agent / GitLawb Layer')
    expect(source).not.toContain('href="/agents/gitlawb"')
  })

  test('lays scanned repo cards out as three columns on desktop', () => {
    const source = readFileSync('src/components/HomeScannerLanding.tsx', 'utf8')

    expect(source).toContain("gridTemplateColumns: isCompactViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))'")
    expect(source).toContain("width: repos ? 'min(100%, 1040px)' : 'min(100%, 430px)'")
  })
})

function repo(overrides: Partial<DeadRepo>): DeadRepo {
  return {
    id: 999,
    name: 'repo',
    description: null,
    html_url: 'https://github.com/octocat/repo',
    language: 'TypeScript',
    created_at: '2026-01-01T00:00:00Z',
    pushed_at: '2026-05-01T00:00:00Z',
    ...overrides,
  }
}

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

function cremation(overrides: Partial<CrematedData>): CrematedData {
  return {
    id: 1,
    name: 'cremated',
    cause: 'dead',
    author_github: 'octocat',
    created_at: '2026-05-01T00:00:00Z',
    source: 'github',
    ...overrides,
  }
}
