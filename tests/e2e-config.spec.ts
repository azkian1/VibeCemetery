import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('the local E2E server is isolated from shared Upstash and explicitly marked as Playwright', () => {
  const source = readFileSync('playwright.config.ts', 'utf8')

  expect(source).toContain('delete process.env.UPSTASH_REDIS_REST_URL')
  expect(source).toContain('delete process.env.UPSTASH_REDIS_REST_TOKEN')
  expect(source).toContain('delete e2eServerEnv.UPSTASH_REDIS_REST_URL')
  expect(source).toContain('delete e2eServerEnv.UPSTASH_REDIS_REST_TOKEN')
  expect(source).toContain("e2eServerEnv.PLAYWRIGHT_E2E = '1'")
  expect(source).toContain('reuseExistingServer: false')
  expect(source).toContain('env: e2eServerEnv')
})
