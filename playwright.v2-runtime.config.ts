import { defineConfig } from '@playwright/test'

// Executes the real Phaser camera and v2 scene code in an isolated browser.
// No Next server, application credentials, wallet or network is needed.
export default defineConfig({
  testDir: './tests',
  testMatch: 'v2-runtime.e2e.spec.ts',
  outputDir: './test-results/v2-runtime',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: { browserName: 'chromium' },
})
