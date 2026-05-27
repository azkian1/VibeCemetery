import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { decideCemeteryCtaState } from '../src/components/hud/CTAButtons'

test.describe('cemetery CTA buttons', () => {
  test('enables burial and blocks cremation while grave slots are available', () => {
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

  test('desktop ritual CTA explains bury and cremate without CLI skill', () => {
    const source = readFileSync('src/components/hud/CTAButtons.tsx', 'utf8')

    expect(source).toContain('Choose a ritual:')
    expect(source).toContain('Bury')
    expect(source).toContain('Cremate')
    expect(source).toContain('Puts it on the map.')
    expect(source).toContain('Saves it as ashes.')
    expect(source).not.toContain('Bury puts it on the map. Cremate saves it as ashes.')
    expect(source).toContain('left: 16')
    expect(source).toContain('bottom: 16')
    expect(source).toContain('width: 340')
    expect(source).toContain("border: '1px solid #3a3530'")
    expect(source).toContain('borderRadius: 2')
    expect(source).not.toContain(['SHO', 'VEL'].join(''))
    expect(source).not.toContain(['FI', 'RE'].join(''))
    expect(source).not.toContain('CLI SKILL')
    expect(source).not.toContain('right: 16')
  })
})
