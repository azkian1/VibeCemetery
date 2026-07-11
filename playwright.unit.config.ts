import { defineConfig } from '@playwright/test'

// Some static route tests import modules that validate server configuration at
// load time. Supply inert values instead of loading developer or CI secrets.
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
  SUPABASE_SERVICE_KEY: 'unit-test-service-key',
  GITHUB_CLIENT_ID: 'unit-test-github-client-id',
  GITHUB_CLIENT_SECRET: 'unit-test-github-client-secret',
  NEXTAUTH_SECRET: 'unit-test-nextauth-secret',
  CLI_TOKEN_SECRET: 'unit-test-cli-token-secret',
  AGENT_ASH_TOKEN_SECRET: 'unit-test-agent-ash-token-secret',
})

// A unit test must never inherit credentials that can send traffic externally.
delete process.env.GITHUB_TOKEN
delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN

export default defineConfig({
  testDir: './tests',
  // Keep this target hermetic: do not load .env.local, start a web server, or run a browser.
  // These specs require a running Next server; api-smoke also writes to Supabase.
  // Run them with playwright.config.ts, which provides the integration webServer and env.
  testIgnore: [
    '**/api-smoke.spec.ts',
    '**/ceremony.spec.ts',
    '**/cli-connect.spec.ts',
    '**/mobile.spec.ts',
  ],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
})
