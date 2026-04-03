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
    reuseExistingServer: true,
    timeout: 60_000,
    env: process.env as Record<string, string>,
  },
});
