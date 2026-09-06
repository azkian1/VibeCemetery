import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { CHAT_STATUS_ITEMS, getChatStatusCounts } from '../src/components/hud/ChatLog'

test('chat status bar includes Total, Buried, and Cremated counters', () => {
  expect(CHAT_STATUS_ITEMS).toEqual([
    { key: 'total', label: 'Total', emoji: '💀' },
    { key: 'buried', label: 'Buried', emoji: '🪦' },
  ])
})

test('chat status counts graves plus cremations as total records', () => {
  expect(getChatStatusCounts({ graveCount: 3 })).toEqual({
    total: 3,
    buried: 3,
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

test('desktop chat clears its delayed greeting timer on unmount', () => {
  const source = readFileSync('src/components/hud/ChatLog.tsx', 'utf8')
  const greetingEffect = source.slice(
    source.indexOf('// On mount: system greeting + gravedigger greeting'),
    source.indexOf('// Idle timer: random gravedigger phrase'),
  )

  expect(source).not.toContain('mountedRef')
  expect(greetingEffect).toContain('gravediggerGreetingSentRef.current = true')
  expect(greetingEffect).toContain('const greetingTimer = setTimeout')
  expect(greetingEffect).toContain('return () => clearTimeout(greetingTimer)')
})
