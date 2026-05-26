import { expect, test } from '@playwright/test'
import { filterGravesByAuthor } from '../src/lib/crypt-filter'
import type { GraveData } from '../src/types/game'

test.describe('Crypt author filter', () => {
  test('keeps Oroshimoro grave visible when opened from Necropolis', () => {
    const graves = [
      grave({ author_github: 'azkian1', name: 'myvibe', slot_id: 84 }),
      grave({ author_github: 'Oroshimoro', name: 'RadiantAutocompounder', slot_id: 289 }),
    ]

    expect(filterGravesByAuthor(graves, 'Oroshimoro').map((item) => item.name)).toEqual([
      'RadiantAutocompounder',
    ])
  })

  test('matches GitHub usernames case-insensitively', () => {
    const graves = [grave({ author_github: 'Oroshimoro', name: 'RadiantAutocompounder', slot_id: 289 })]

    expect(filterGravesByAuthor(graves, 'oroshimoro').map((item) => item.name)).toEqual([
      'RadiantAutocompounder',
    ])
  })

  test('preserves the full Crypt list without an author filter', () => {
    const graves = [grave({ author_github: 'azkian1' }), grave({ author_github: 'Oroshimoro' })]

    expect(filterGravesByAuthor(graves)).toHaveLength(2)
  })
})

function grave(overrides: Partial<GraveData>): GraveData {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'grave',
    born_at: null,
    died_at: null,
    cause: 'Unknown',
    epitaph: null,
    description: null,
    stack: null,
    github_url: null,
    github_repo_id: 1,
    author_github: null,
    slot_id: 1,
    tier: 1,
    ...overrides,
  }
}
