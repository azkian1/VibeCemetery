import { expect, test } from '@playwright/test'
import { shouldShowBuryOnboardingPrompt } from '../src/components/hud/CTAButtons'

test.describe('bury onboarding prompt', () => {
  test('shows only for unauthenticated desktop users before clicking bury', () => {
    expect(shouldShowBuryOnboardingPrompt({ status: 'unauthenticated', isMobile: false, dismissed: false })).toBe(true)
    expect(shouldShowBuryOnboardingPrompt({ status: 'authenticated', isMobile: false, dismissed: false })).toBe(false)
    expect(shouldShowBuryOnboardingPrompt({ status: 'loading', isMobile: false, dismissed: false })).toBe(false)
    expect(shouldShowBuryOnboardingPrompt({ status: 'unauthenticated', isMobile: true, dismissed: false })).toBe(false)
    expect(shouldShowBuryOnboardingPrompt({ status: 'unauthenticated', isMobile: false, dismissed: true })).toBe(false)
  })
})
