import { expect, test } from '@playwright/test'
import {
  buildGraveShareCard,
  buildGraveShareMetadata,
  buildGraveTweetIntentUrl,
  buildNoIndexMetadata,
} from '../src/lib/grave-share'

test.describe('grave share card', () => {
  test('builds grave-specific share metadata from grave data', () => {
    const card = buildGraveShareCard({
      siteUrl: 'https://vibecemetery.app',
      grave: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'DemoCast',
        cause: 'Lost interest',
        epitaph: 'It shipped one demo and never returned.',
        born_at: '2026-01-10T00:00:00.000Z',
        died_at: '2026-02-20T00:00:00.000Z',
        stack: 'Next.js',
        author_github: 'demo-user',
      },
    })

    expect(card.title).toBe('DemoCast · VibeCemetery')
    expect(card.description).toBe('It shipped one demo and never returned.')
    expect(card.url).toBe('https://vibecemetery.app/grave/11111111-1111-4111-8111-111111111111')
    expect(card.imageUrl).toBe('https://vibecemetery.app/grave/11111111-1111-4111-8111-111111111111/opengraph-image?v=grave-art-v1')
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
        url: 'https://vibecemetery.app/grave/33333333-3333-4333-8333-333333333333/opengraph-image?v=grave-art-v1',
        width: 1200,
        height: 630,
      },
    ])
    expect(metadata.twitter?.images).toEqual([
      'https://vibecemetery.app/grave/33333333-3333-4333-8333-333333333333/opengraph-image?v=grave-art-v1',
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
      'I buried MYVIBE in @vibecmtry.',
      '',
      'Cause of death: Zero users.',
      '',
      'Pay respects:',
    ].join('\n'))
    expect(parsed.searchParams.get('url')).toBe('https://vibecemetery.app/grave/11111111-1111-4111-8111-111111111111')
  })

  test('builds visitor X intent text without claiming the burial', () => {
    const intentUrl = buildGraveTweetIntentUrl({
      graveUrl: 'https://vibecemetery.app/grave/11111111-1111-4111-8111-111111111111',
      name: 'MYVIBE',
      cause: 'Zero users',
      perspective: 'visitor',
    })

    const parsed = new URL(intentUrl)

    expect(parsed.searchParams.get('text')).toBe([
      'I paid respects to MYVIBE in @vibecmtry.',
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
