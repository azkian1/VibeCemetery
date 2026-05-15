import { expect, test } from '@playwright/test'
import { shouldFallbackGraveToCremation } from '../src/components/modals/BuryFlowModal'

test.describe('BuryFlowModal grave fallback', () => {
  test('falls back when the map has no free auto-assignable slots', async () => {
    await expect(shouldFallbackGraveToCremation(new Response(null, { status: 507 }))).resolves.toBe(true)
  })

  test('falls back when stale client slots make /api/graves return user slot exhaustion', async () => {
    const res = new Response(JSON.stringify({ code: 'USER_GRAVE_SLOTS_EXHAUSTED' }), { status: 403 })

    await expect(shouldFallbackGraveToCremation(res)).resolves.toBe(true)
  })

  test('does not fall back for unrelated /api/graves 403 responses', async () => {
    const res = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

    await expect(shouldFallbackGraveToCremation(res)).resolves.toBe(false)
  })
})
