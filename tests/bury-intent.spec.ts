import { expect, test } from '@playwright/test'
import {
  getBuryLoginCallbackUrl,
  removeBuryModalIntentFromUrl,
  shouldOpenBuryModalFromSearchParams,
} from '../src/lib/bury-intent'

test.describe('bury login intent', () => {
  test('returns to the cemetery with the bury modal intent after GitHub login', () => {
    expect(getBuryLoginCallbackUrl()).toBe('/?modal=bury')
  })

  test('opens only for the bury modal query intent', () => {
    expect(shouldOpenBuryModalFromSearchParams(new URLSearchParams('modal=bury'))).toBe(true)
    expect(shouldOpenBuryModalFromSearchParams(new URLSearchParams('modal=skill'))).toBe(false)
    expect(shouldOpenBuryModalFromSearchParams(new URLSearchParams('grave=abc'))).toBe(false)
  })

  test('removes only the bury modal query intent after consuming it', () => {
    expect(removeBuryModalIntentFromUrl('https://vibecemetery.app/?modal=bury&grave=abc')).toBe('/?grave=abc')
    expect(removeBuryModalIntentFromUrl('https://vibecemetery.app/?modal=bury')).toBe('/')
    expect(removeBuryModalIntentFromUrl('https://vibecemetery.app/?modal=bury&grave=abc#top')).toBe('/?grave=abc#top')
  })
})
