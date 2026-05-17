import { expect, test } from '@playwright/test'
import { CHAT_STATUS_ITEMS } from '../src/components/hud/ChatLog'

test('chat status bar includes Souls, Cremated, and Ashes counters', () => {
  expect(CHAT_STATUS_ITEMS).toEqual([
    { key: 'souls', label: 'Souls', emoji: '💀' },
    { key: 'cremated', label: 'Cremated', emoji: '🔥' },
    { key: 'ashes', label: 'Ashes', emoji: '⚱️' },
  ])
})
