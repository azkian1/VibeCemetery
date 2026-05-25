import { expect, test } from '@playwright/test'
import {
  filterFreshDeadRepos,
  formatLastPushAge,
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
