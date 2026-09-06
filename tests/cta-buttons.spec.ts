import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
test('cemetery CTA offers only burial under the account allowance', () => {
  const s=readFileSync('src/components/hud/CTAButtons.tsx','utf8')
  expect(s).toContain('Bury a project'); expect(s).toContain('canCreateGrave'); expect(s).not.toMatch(/cremat/i)
})
