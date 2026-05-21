import { expect, test } from '@playwright/test'
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
