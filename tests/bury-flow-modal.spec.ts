import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
test('burial submits only graves on the current map, never an overflow fallback', () => {
  const s=readFileSync('src/components/modals/BuryFlowModal.tsx','utf8')
  expect(s).toContain("fetch('/api/graves'")
  expect(s).toContain('map_version: mapVersion')
  expect(s).not.toMatch(/cremat|api\/cremated/i)
  expect(s).toContain('useAccountGraves')
})
