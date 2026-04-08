import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /bury-skill\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
})
