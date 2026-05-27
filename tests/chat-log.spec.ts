import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { CHAT_STATUS_ITEMS, getAgentAshCountFromSummary } from '../src/components/hud/ChatLog'

test('chat status bar includes Souls, Cremated, and Ashes counters', () => {
  expect(CHAT_STATUS_ITEMS).toEqual([
    { key: 'souls', label: 'Souls', emoji: '💀' },
    { key: 'cremated', label: 'Cremated', emoji: '🔥' },
    { key: 'ashes', label: 'Ashes', emoji: '⚱️' },
  ])
})

test('chat Ashes counter uses verified Agent Ash summary total', () => {
  expect(getAgentAshCountFromSummary({ total_verified_ash: 1 })).toBe(1)
  expect(getAgentAshCountFromSummary({ total_verified_ash: -1 })).toBe(0)
  expect(getAgentAshCountFromSummary({ total_verified_ash: 1.5 })).toBe(0)
  expect(getAgentAshCountFromSummary({ total_verified_ash: Infinity })).toBe(0)
  expect(getAgentAshCountFromSummary({})).toBe(0)
})

test('desktop chat is lifted above the ritual CTA column', () => {
  const source = readFileSync('src/components/hud/ChatLog.tsx', 'utf8')

  expect(source).toContain('left: 16')
  expect(source).toContain('bottom: 126')
  expect(source).toContain('width: 340')
})
