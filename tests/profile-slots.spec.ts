import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { getSlotsAvailableLabel } from '../src/components/modals/ProfileModal'

test.describe('profile slot availability label', () => {
  test('formats available grave slots clearly', () => {
    expect(getSlotsAvailableLabel(0)).toBe('0 slots available')
    expect(getSlotsAvailableLabel(1)).toBe('1 slot available')
    expect(getSlotsAvailableLabel(3)).toBe('3 slots available')
  })

  test('profile exposes separate bury and cremate actions without souls progression copy', () => {
    const source = readFileSync('src/components/modals/ProfileModal.tsx', 'utf8')

    expect(source).toContain("open('bury', { flowMode: 'cemetery-shovel' })")
    expect(source).toContain("open('bury', { flowMode: 'cemetery-fire' })")
    expect(source).toContain('const cremateDisabled = slotsAvailable > 0')
    expect(source).toContain('disabled={cremateDisabled}')
    expect(source).toContain('Bury')
    expect(source).toContain('Cremate')
    expect(source).not.toContain('Bury or Cremate Your First Project')
    expect(source).not.toContain('How to unlock more slots?')
    expect(source).not.toContain('Souls')
  })
})
