import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

test.describe('profile burial rights', () => {
  test('profile shows source-specific rights without an unfinished agent action', () => {
    const source = readFileSync('src/components/modals/ProfileModal.tsx', 'utf8')

    expect(source).toContain("open('bury', { flowMode: 'cemetery-shovel' })")
    expect(source).toContain('Burial Rights')
    expect(source).not.toContain('Use local AI agent')
    expect(source).not.toContain('Bury or Cremate Your First Project')
    expect(source).not.toContain('How to unlock more slots?')
    expect(source).not.toContain('Mission')
    expect(source).not.toContain('Souls')
  })
})
