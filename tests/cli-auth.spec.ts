import { test, expect } from '@playwright/test'
import {
  buildCliRawToken,
  createCliClaimToken,
  createCliTokenRecord,
  hashCliClaimToken,
  isCliLinkExpired,
  hashCliToken,
  maskCliTokenPrefix,
} from '../src/lib/cli-auth'

test.describe('cli-auth helpers', () => {
  test('creates deterministic raw tokens from token id and server secret', async () => {
    const tokenA = buildCliRawToken({
      tokenId: '11111111-1111-4111-8111-111111111111',
      secret: 'super-secret',
    })
    const tokenB = buildCliRawToken({
      tokenId: '11111111-1111-4111-8111-111111111111',
      secret: 'super-secret',
    })
    const tokenC = buildCliRawToken({
      tokenId: '22222222-2222-4222-8222-222222222222',
      secret: 'super-secret',
    })

    expect(tokenA).toBe(tokenB)
    expect(tokenA).toMatch(/^vc_cli_[a-f0-9-]+\.[A-Za-z0-9_-]+$/)
    expect(tokenC).not.toBe(tokenA)
  })

  test('stores only derived hash and masked prefix for database persistence', async () => {
    const record = createCliTokenRecord({
      tokenId: '11111111-1111-4111-8111-111111111111',
      secret: 'super-secret',
    })

    expect(record.rawToken).toBe(buildCliRawToken({
      tokenId: '11111111-1111-4111-8111-111111111111',
      secret: 'super-secret',
    }))
    expect(record.tokenHash).toBe(hashCliToken(record.rawToken))
    expect(record.tokenPrefix).toBe(maskCliTokenPrefix(record.rawToken))
    expect(record.tokenHash).not.toContain(record.rawToken)
    expect(record.tokenPrefix.endsWith('...')).toBe(true)
  })

  test('creates a high-entropy CLI claim token and hashes it deterministically', async () => {
    const claimToken = createCliClaimToken()

    expect(claimToken.length).toBeGreaterThan(20)
    expect(hashCliClaimToken(claimToken)).toBe(hashCliClaimToken(claimToken))
    expect(hashCliClaimToken(createCliClaimToken())).not.toBe(hashCliClaimToken(claimToken))
  })

  test('treats link sessions as expired once they pass the TTL boundary', async () => {
    expect(isCliLinkExpired('2026-01-01T00:09:59.000Z', Date.parse('2026-01-01T00:10:00.000Z'))).toBe(true)
    expect(isCliLinkExpired('2026-01-01T00:10:01.000Z', Date.parse('2026-01-01T00:10:00.000Z'))).toBe(false)
  })
})
