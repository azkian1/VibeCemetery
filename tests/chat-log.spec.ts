import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { CHAT_STATUS_ITEMS, getChatStatusCounts } from '../src/components/hud/ChatLog'

test('chat status bar includes Souls, Buried, and Cremated counters', () => {
  expect(CHAT_STATUS_ITEMS).toEqual([
    { key: 'souls', label: 'Souls', emoji: '💀' },
    { key: 'buried', label: 'Buried', emoji: '🪦' },
    { key: 'cremated', label: 'Cremated', emoji: '🔥' },
  ])
})

test('chat status counts graves plus cremations as Souls', () => {
  expect(getChatStatusCounts({ graveCount: 3, crematedCount: 2 })).toEqual({
    souls: 5,
    buried: 3,
    cremated: 2,
  })
})

test('chat status no longer fetches Agent Ashes', () => {
  const source = readFileSync('src/components/hud/ChatLog.tsx', 'utf8')

  expect(source).not.toContain('/api/agent-ashes/summary')
  expect(source).not.toContain('getAgentAshCountFromSummary')
  expect(source).not.toContain("key: 'ashes'")
})

test('desktop chat is lifted above the ritual CTA column', () => {
  const source = readFileSync('src/components/hud/ChatLog.tsx', 'utf8')

  expect(source).toContain('left: 16')
  expect(source).toContain('bottom: 126')
  expect(source).toContain('width: 340')
})
