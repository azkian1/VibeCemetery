import { expect, test } from '@playwright/test'
import { getSlotsAvailableLabel } from '../src/components/modals/ProfileModal'

test.describe('profile slot availability label', () => {
  test('formats available grave slots clearly', () => {
    expect(getSlotsAvailableLabel(0)).toBe('0 slots available')
    expect(getSlotsAvailableLabel(1)).toBe('1 slot available')
    expect(getSlotsAvailableLabel(3)).toBe('3 slots available')
  })
})
