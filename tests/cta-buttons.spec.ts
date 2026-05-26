import { expect, test } from '@playwright/test'
import { decideCemeteryCtaState } from '../src/components/hud/CTAButtons'

test.describe('cemetery CTA buttons', () => {
  test('enables shovel and disables fire while grave slots are available', () => {
    expect(decideCemeteryCtaState(1)).toEqual({
      shovelDisabled: false,
      fireDisabled: true,
    })
  })

  test('disables shovel and enables fire when grave slots are full', () => {
    expect(decideCemeteryCtaState(0)).toEqual({
      shovelDisabled: true,
      fireDisabled: false,
    })
  })
})
