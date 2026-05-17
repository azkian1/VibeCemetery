import { expect, test } from '@playwright/test'
import {
  buildGraveShareCard,
  buildGraveShareMetadata,
  buildGraveTweetIntentUrl,
  buildNoIndexMetadata,
} from '../src/lib/grave-share'
import { confirmFirstGraveShare } from '../src/app/api/graves/[id]/share-confirm/confirmShare'

test.describe('grave share card', () => {
  test('builds grave-specific share metadata from grave data', () => {
    const card = buildGraveShareCard({
      siteUrl: 'https://vibecemetery.app',
      grave: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'LegacyApp',
        cause: 'Lost interest',
        epitaph: 'It shipped one demo and never returned.',
        born_at: '2026-01-10T00:00:00.000Z',
        died_at: '2026-02-20T00:00:00.000Z',
        stack: 'Next.js',
        author_github: 'demo-user',
      },
    })

    expect(card.title).toBe('LegacyApp · VibeCemetery')
    expect(card.description).toBe('It shipped one demo and never returned.')
    expect(card.url).toBe('https://vibecemetery.app/grave/11111111-1111-4111-8111-111111111111')
    expect(card.imageUrl).toBe('https://vibecemetery.app/grave/11111111-1111-4111-8111-111111111111/opengraph-image?v=social-v2')
    expect(card.cause).toBe('Lost interest')
    expect(card.authorGithub).toBe('demo-user')
  })

  test('falls back to a deterministic epitaph when a grave has none', () => {
    const card = buildGraveShareCard({
      siteUrl: 'https://vibecemetery.app',
      grave: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'DemoBot',
        cause: 'Scope creep',
        epitaph: null,
        born_at: '2026-01-10T00:00:00.000Z',
        died_at: '2026-02-20T00:00:00.000Z',
        stack: 'Phaser',
        author_github: null,
      },
    })

    expect(card.description.length).toBeGreaterThan(0)
    expect(card.description).not.toBe('Scope creep')
    expect(card.description).toContain('DemoBot')
  })

  test('builds route metadata that points to the grave-specific OG image', () => {
    const metadata = buildGraveShareMetadata({
      siteUrl: 'https://vibecemetery.app',
      grave: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'MyVibe',
        cause: 'Dead on arrival',
        epitaph: 'Dead on arrival. No rollback.',
        born_at: null,
        died_at: null,
        stack: null,
        author_github: 'mogilschik',
      },
    })

    expect(metadata.title).toBe('MyVibe · VibeCemetery')
    expect(metadata.description).toBe('Dead on arrival. No rollback.')
    expect(metadata.alternates?.canonical).toBe('https://vibecemetery.app/grave/33333333-3333-4333-8333-333333333333')
    expect(metadata.openGraph?.images).toEqual([
      {
        url: 'https://vibecemetery.app/grave/33333333-3333-4333-8333-333333333333/opengraph-image?v=social-v2',
        width: 1200,
        height: 630,
      },
    ])
    expect(metadata.twitter?.images).toEqual([
      'https://vibecemetery.app/grave/33333333-3333-4333-8333-333333333333/opengraph-image?v=social-v2',
    ])
  })

  test('builds X intent text for grave sharing', () => {
    const intentUrl = buildGraveTweetIntentUrl({
      graveUrl: 'https://vibecemetery.app/grave/11111111-1111-4111-8111-111111111111',
      name: 'MYVIBE',
      cause: 'Zero users',
    })

    const parsed = new URL(intentUrl)

    expect(parsed.origin + parsed.pathname).toBe('https://twitter.com/intent/tweet')
    expect(parsed.searchParams.get('text')).toBe([
      'I buried MYVIBE in VibeCemetery.',
      '',
      'Cause of death: Zero users.',
      '',
      'Pay respects:',
    ].join('\n'))
    expect(parsed.searchParams.get('url')).toBe('https://vibecemetery.app/grave/11111111-1111-4111-8111-111111111111')
  })

  test('truncates long grave names and causes in X intent text', () => {
    const intentUrl = buildGraveTweetIntentUrl({
      graveUrl: 'https://vibecemetery.app/grave/long',
      name: 'A'.repeat(120),
      cause: 'B'.repeat(180),
    })

    const text = new URL(intentUrl).searchParams.get('text') ?? ''

    expect(text).toContain(`${'A'.repeat(59)}...`)
    expect(text).toContain(`${'B'.repeat(89)}...`)
    expect(text.length).toBeLessThanOrEqual(240)
  })

  test('returns no-index metadata for invalid or unavailable grave routes', () => {
    expect(buildNoIndexMetadata()).toEqual({
      robots: {
        index: false,
        follow: false,
      },
    })
  })
})

test.describe('first grave share confirmation', () => {
  test('unlocks the social slot for the grave owner', async () => {
    const updates: Array<{ username: string; sharedAt: string }> = []

    const result = await confirmFirstGraveShare({
      graveId: '11111111-1111-4111-8111-111111111111',
      username: 'demo-user',
      now: () => new Date('2026-05-16T12:00:00.000Z'),
      db: {
        loadGraveOwner: async () => 'demo-user',
        loadUserShareTimestamp: async () => null,
        markUserSharedFirstGrave: async (username, sharedAt) => {
          updates.push({ username, sharedAt })
          return sharedAt
        },
      },
    })

    expect(result).toEqual({
      status: 'unlocked',
      x_first_grave_shared_at: '2026-05-16T12:00:00.000Z',
    })
    expect(updates).toEqual([{ username: 'demo-user', sharedAt: '2026-05-16T12:00:00.000Z' }])
  })

  test('does not unlock social slot for a grave owned by another user', async () => {
    let updated = false

    const result = await confirmFirstGraveShare({
      graveId: '11111111-1111-4111-8111-111111111111',
      username: 'intruder',
      db: {
        loadGraveOwner: async () => 'demo-user',
        loadUserShareTimestamp: async () => null,
        markUserSharedFirstGrave: async () => {
          updated = true
          return '2026-05-16T12:00:00.000Z'
        },
      },
    })

    expect(result).toEqual({ status: 'forbidden' })
    expect(updated).toBe(false)
  })

  test('rejects invalid grave ids before reading the database', async () => {
    let loaded = false

    const result = await confirmFirstGraveShare({
      graveId: 'not-a-uuid',
      username: 'demo-user',
      db: {
        loadGraveOwner: async () => {
          loaded = true
          return 'demo-user'
        },
        loadUserShareTimestamp: async () => null,
        markUserSharedFirstGrave: async () => '2026-05-16T12:00:00.000Z',
      },
    })

    expect(result).toEqual({ status: 'invalid_grave_id' })
    expect(loaded).toBe(false)
  })

  test('returns not_found when the grave does not exist', async () => {
    const result = await confirmFirstGraveShare({
      graveId: '11111111-1111-4111-8111-111111111111',
      username: 'demo-user',
      db: {
        loadGraveOwner: async () => null,
        loadUserShareTimestamp: async () => null,
        markUserSharedFirstGrave: async () => '2026-05-16T12:00:00.000Z',
      },
    })

    expect(result).toEqual({ status: 'not_found' })
  })

  test('is idempotent when the social slot is already unlocked', async () => {
    let updated = false

    const result = await confirmFirstGraveShare({
      graveId: '11111111-1111-4111-8111-111111111111',
      username: 'demo-user',
      db: {
        loadGraveOwner: async () => 'demo-user',
        loadUserShareTimestamp: async () => '2026-05-16T10:00:00.000Z',
        markUserSharedFirstGrave: async () => {
          updated = true
          return '2026-05-16T12:00:00.000Z'
        },
      },
    })

    expect(result).toEqual({
      status: 'already_unlocked',
      x_first_grave_shared_at: '2026-05-16T10:00:00.000Z',
    })
    expect(updated).toBe(false)
  })
})
