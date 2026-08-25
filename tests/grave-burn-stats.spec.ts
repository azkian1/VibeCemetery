import { expect, test } from '@playwright/test'
import {
  aggregateGraveBurnStats,
  graveBurnStatsFromAggregate,
} from '../src/lib/web3/graveBurnStats'

const unit = 10n ** 18n

test('stats group strictly by normalized wallet and choose latest GitHub snapshot', () => {
  const stats = aggregateGraveBurnStats([
    {
      walletAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      githubUsername: 'old-name',
      amountRaw: (100n * unit).toString(),
      verifiedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    {
      walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      githubUsername: 'new-name',
      amountRaw: (500n * unit).toString(),
      verifiedAt: '2026-07-02T00:00:00.000Z',
      createdAt: '2026-07-02T00:00:00.000Z',
    },
    {
      walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      githubUsername: null,
      amountRaw: (100n * unit).toString(),
      verifiedAt: '2026-07-03T00:00:00.000Z',
      createdAt: '2026-07-03T00:00:00.000Z',
    },
  ])

  expect(stats.totalBurnedDisplay).toBe('700')
  expect(stats.burnCount).toBe(3)
  expect(stats.topMourners).toHaveLength(2)
  expect(stats.topMourners[0]).toMatchObject({
    displayName: 'new-name',
    githubUsername: 'new-name',
    amountDisplay: '600',
    source: 'github',
  })
  expect(stats.topMourners[1].source).toBe('wallet')
})

test('ranking ties use deterministic normalized address ordering', () => {
  const stats = aggregateGraveBurnStats([
    {
      walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      githubUsername: null,
      amountRaw: unit.toString(),
      verifiedAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    {
      walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      githubUsername: null,
      amountRaw: unit.toString(),
      verifiedAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  ])
  expect(stats.topMourners.map((mourner) => mourner.walletAddress)).toEqual([
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ])
})

test('database aggregate is converted without loading the full burn history', () => {
  const stats = graveBurnStatsFromAggregate({
    totalBurnedRaw: (700n * unit).toString(),
    burnCount: 3,
    topMourners: [{
      walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      githubUsername: 'new-name',
      amountRaw: (600n * unit).toString(),
    }],
  })

  expect(stats).toMatchObject({
    totalBurnedDisplay: '700',
    burnCount: 3,
    topMourners: [{
      displayName: 'new-name',
      amountDisplay: '600',
      source: 'github',
    }],
  })
})
