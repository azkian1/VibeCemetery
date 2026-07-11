import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

function loadEnvLocal() {
  try {
    const envLocal = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of envLocal.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex <= 0) continue;
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Playwright can still run if env is already provided externally.
  }
}

loadEnvLocal();

// API smoke still receives its Supabase/auth settings, but browser and direct
// route tests must never inherit a developer's shared rate-limit backend.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

// Browser E2E runs must not mutate or wait on a developer's shared Upstash
// instance. The local server uses the in-memory fallback instead.
const e2eServerEnv = { ...process.env } as Record<string, string>;
delete e2eServerEnv.UPSTASH_REDIS_REST_URL;
delete e2eServerEnv.UPSTASH_REDIS_REST_TOKEN;
e2eServerEnv.PLAYWRIGHT_E2E = '1';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // The suite shares one local Next server, in-memory rate limits, and a Phaser boot path.
  // Keep execution serial until tests run against an isolated app/test backend.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    // A reused developer server may retain real Upstash credentials and omit
    // PLAYWRIGHT_E2E, defeating the isolated test environment above.
    reuseExistingServer: false,
    timeout: 60_000,
    env: e2eServerEnv,
  },
});
