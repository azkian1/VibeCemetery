import { defineConfig } from '@playwright/test'

// These browser tests stub every application API write and wallet transaction.
// Explicit values also override Next.js .env.local loading. Deleting inherited
// keys would let the dev server reload live credentials from that file.
const testServerEnv = {
  ...process.env,
  // The v1 image loader uses this origin too; Chromium blocks port 9 before
  // Playwright can intercept its image requests. Use the local app origin.
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3010',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-only-anon-key',
  SUPABASE_SERVICE_KEY: 'e2e-only-service-key',
  GITHUB_CLIENT_ID: 'e2e-only-github-client',
  GITHUB_CLIENT_SECRET: 'e2e-only-github-secret',
  GITHUB_TOKEN: 'e2e-only-unusable-token',
  NEXTAUTH_SECRET: 'e2e-only-nextauth-secret',
  CLI_TOKEN_SECRET: 'e2e-only-cli-token-secret',
  AGENT_ASH_TOKEN_SECRET: 'e2e-only-agent-ash-token-secret',
  NEXTAUTH_URL: 'http://127.0.0.1:3010',
  NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3010',
  UPSTASH_REDIS_REST_URL: '',
  UPSTASH_REDIS_REST_TOKEN: '',
  BASE_RPC_URL: 'http://127.0.0.1:9',
  // Read through the injected test wallet, never a developer's public RPC.
  NEXT_PUBLIC_BASE_READ_RPC_URL: '',
  GRAVE_BURN_REVERIFY_SECRET: 'e2e-only-reverify-secret',
  CRON_SECRET: 'e2e-only-cron-secret',
}

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
      ...testServerEnv,
      PLAYWRIGHT_E2E: '1',
      NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED: 'true',
      WEB3_GRAVE_BURNS_ENABLED: 'true',
    },
  },
})
