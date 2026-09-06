import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: ['web3-burn.e2e.spec.ts', 'simplification.e2e.spec.ts'],
  timeout: 45_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3010',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- -p 3010 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3010',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...process.env,
      PLAYWRIGHT_E2E: '1',
      NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED: 'true',
      WEB3_GRAVE_BURNS_ENABLED: 'true',
      BASE_RPC_URL: 'http://127.0.0.1:9',
    },
  },
})
