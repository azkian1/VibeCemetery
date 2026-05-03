import { expect, test } from '@playwright/test'
import nextConfig, { createContentSecurityPolicy } from '../next.config'

test('production CSP does not allow script eval', async () => {
  const headers = typeof nextConfig.headers === 'function'
    ? await nextConfig.headers()
    : []
  const csp = headers
    .flatMap((entry) => entry.headers)
    .find((header) => header.key.toLowerCase() === 'content-security-policy')
    ?.value

  expect(csp).toBeTruthy()
  expect(csp).not.toContain("'unsafe-eval'")
})

test('development CSP keeps eval available for Next dev tooling only', () => {
  expect(createContentSecurityPolicy('development')).toContain("'unsafe-eval'")
  expect(createContentSecurityPolicy('production')).not.toContain("'unsafe-eval'")
})
