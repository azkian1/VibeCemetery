import { test, expect } from '@playwright/test'
import { insertGraveWithSlotRetry, type GraveInsertError } from '../src/app/api/graves/insertWithSlotRetry'
import { insertGraveAtomicallyWithSlotRetry } from '../src/app/api/graves/atomicInsertWithSlotRetry'
import { insertOutcomeResponse } from '../src/app/api/graves/insertOutcomeResponse'

function makeError(error: GraveInsertError): GraveInsertError {
  return error
}

test.describe('insertGraveWithSlotRetry', () => {
  test('retries slot collisions until a free slot succeeds', async () => {
    const pickedSlots: number[] = []
    let insertAttempts = 0

    const result = await insertGraveWithSlotRetry<{ id: string; slot_id: number }>({
      maxAttempts: 3,
      loadUsedSlotIds: async () => (insertAttempts === 0 ? [10] : [10, 11]),
      pickSlot: (used: Set<number>) => {
        if (!used.has(11)) return { id: 11 }
        if (!used.has(12)) return { id: 12 }
        return null
      },
      insertGrave: async (slotId: number) => {
        pickedSlots.push(slotId)
        insertAttempts += 1

        if (insertAttempts === 1) {
          return {
            data: null,
            error: makeError({ code: '23505', details: 'Key (slot_id)=(11) already exists.' }),
          }
        }

        return {
          data: { id: 'grave-1', slot_id: slotId },
          error: null,
        }
      },
    })

    expect(result).toEqual({
      status: 'created',
      data: { id: 'grave-1', slot_id: 12 },
    })
    expect(pickedSlots).toEqual([11, 12])
  })

  test('returns duplicate without retrying on repo uniqueness errors', async () => {
    let insertAttempts = 0

    const result = await insertGraveWithSlotRetry({
      loadUsedSlotIds: async () => [],
      pickSlot: () => ({ id: 21 }),
      insertGrave: async () => {
        insertAttempts += 1
        return {
          data: null,
          error: makeError({ code: '23505', details: 'Key (github_repo_id)=(42) already exists.' }),
        }
      },
    })

    expect(result).toEqual({
      status: 'duplicate',
      error: { code: '23505', details: 'Key (github_repo_id)=(42) already exists.' },
    })
    expect(insertAttempts).toBe(1)
  })

  test('returns failed on non-retryable insert errors', async () => {
    const result = await insertGraveWithSlotRetry({
      loadUsedSlotIds: async () => [],
      pickSlot: () => ({ id: 30 }),
      insertGrave: async () => ({
        data: null,
        error: makeError({ code: '42501', message: 'permission denied for table graves' }),
      }),
    })

    expect(result).toEqual({
      status: 'failed',
      error: { code: '42501', message: 'permission denied for table graves' },
    })
  })

  test('returns retry_exhausted when collisions consume all retry attempts', async () => {
    const result = await insertGraveWithSlotRetry({
      maxAttempts: 2,
      loadUsedSlotIds: async () => [],
      pickSlot: (used: Set<number>) => {
        if (!used.has(40)) return { id: 40 }
        if (!used.has(41)) return { id: 41 }
        return null
      },
      insertGrave: async () => ({
        data: null,
        error: makeError({ code: '23505', details: 'Key (slot_id)=(40) already exists.' }),
      }),
    })

    expect(result).toEqual({ status: 'retry_exhausted' })
  })
})

test.describe('insertGraveAtomicallyWithSlotRetry', () => {
  test('returns created when the RPC inserts the grave', async () => {
    const result = await insertGraveAtomicallyWithSlotRetry<{ id: string; slot_id: number }>({
      loadUsedSlotIds: async () => [100],
      pickSlot: (used: Set<number>) => used.has(101) ? null : { id: 101 },
      insertGrave: async (slotId: number) => ({
        status: 'created',
        grave: { id: 'grave-atomic-1', slot_id: slotId },
      }),
    })

    expect(result).toEqual({
      status: 'created',
      data: { id: 'grave-atomic-1', slot_id: 101 },
    })
  })

  test('returns user_slots_exhausted without retrying other map slots', async () => {
    let insertAttempts = 0

    const result = await insertGraveAtomicallyWithSlotRetry({
      loadUsedSlotIds: async () => [],
      pickSlot: () => ({ id: 110 }),
      insertGrave: async () => {
        insertAttempts += 1
        return { status: 'user_slots_exhausted', slots_unlocked: 2, slots_used: 2 }
      },
    })

    expect(result).toEqual({ status: 'user_slots_exhausted', slots_unlocked: 2, slots_used: 2 })
    expect(insertAttempts).toBe(1)
  })

  test('returns duplicate_repo without retrying other map slots', async () => {
    let insertAttempts = 0

    const result = await insertGraveAtomicallyWithSlotRetry({
      loadUsedSlotIds: async () => [],
      pickSlot: () => ({ id: 120 }),
      insertGrave: async () => {
        insertAttempts += 1
        return { status: 'duplicate_repo' }
      },
    })

    expect(result).toEqual({ status: 'duplicate_repo' })
    expect(insertAttempts).toBe(1)
  })

  test('returns rate_limited without retrying other map slots', async () => {
    let insertAttempts = 0

    const result = await insertGraveAtomicallyWithSlotRetry({
      loadUsedSlotIds: async () => [],
      pickSlot: () => ({ id: 125 }),
      insertGrave: async () => {
        insertAttempts += 1
        return { status: 'rate_limited' }
      },
    })

    expect(result).toEqual({ status: 'rate_limited' })
    expect(insertAttempts).toBe(1)
  })

  test('returns failed when a created RPC response has no grave payload', async () => {
    const result = await insertGraveAtomicallyWithSlotRetry<{ id: string }>({
      loadUsedSlotIds: async () => [],
      pickSlot: () => ({ id: 126 }),
      insertGrave: async () => ({ status: 'created' }),
    })

    expect(result).toEqual({
      status: 'failed',
      message: 'Invalid created atomic insert RPC response',
    })
  })

  test('returns failed when a user slot exhaustion RPC response has invalid counts', async () => {
    const result = await insertGraveAtomicallyWithSlotRetry({
      loadUsedSlotIds: async () => [],
      pickSlot: () => ({ id: 127 }),
      insertGrave: async () => ({ status: 'user_slots_exhausted', slots_unlocked: '2', slots_used: 2 }),
    })

    expect(result).toEqual({
      status: 'failed',
      message: 'Invalid user slot exhaustion RPC response',
    })
  })

  test('retries RPC slot collisions and then reports retry exhaustion', async () => {
    const pickedSlots: number[] = []

    const result = await insertGraveAtomicallyWithSlotRetry({
      maxAttempts: 2,
      loadUsedSlotIds: async () => [],
      pickSlot: (used: Set<number>) => {
        if (!used.has(130)) return { id: 130 }
        if (!used.has(131)) return { id: 131 }
        return null
      },
      insertGrave: async (slotId: number) => {
        pickedSlots.push(slotId)
        return { status: 'slot_collision' }
      },
    })

    expect(result).toEqual({ status: 'retry_exhausted' })
    expect(pickedSlots).toEqual([130, 131])
  })

  test('returns failed when the RPC returns an unknown status', async () => {
    const result = await insertGraveAtomicallyWithSlotRetry<{ id: string }>({
      loadUsedSlotIds: async () => [],
      pickSlot: () => ({ id: 140 }),
      insertGrave: async () => ({ status: 'unexpected_success' }),
    })

    expect(result).toEqual({
      status: 'failed',
      message: 'Unknown atomic insert RPC status: unexpected_success',
    })
  })
})

test.describe('insertOutcomeResponse', () => {
  test('maps duplicate_repo to HTTP 409', async () => {
    const response = insertOutcomeResponse({ status: 'duplicate_repo' })

    expect(response?.status).toBe(409)
    await expect(response?.json()).resolves.toEqual({ error: 'This repository has already been buried' })
  })

  test('maps user_slots_exhausted to HTTP 403 with slot counts', async () => {
    const response = insertOutcomeResponse({
      status: 'user_slots_exhausted',
      slots_unlocked: 2,
      slots_used: 2,
    })

    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual({
      code: 'USER_GRAVE_SLOTS_EXHAUSTED',
      error: 'No user grave slots available',
      slots_unlocked: 2,
      slots_used: 2,
    })
  })

  test('maps retry_exhausted to HTTP 503', async () => {
    const response = insertOutcomeResponse({ status: 'retry_exhausted' })

    expect(response?.status).toBe(503)
    await expect(response?.json()).resolves.toEqual({ error: 'Failed to reserve a grave slot. Please try again.' })
  })

  test('maps rate_limited to HTTP 429', async () => {
    const response = insertOutcomeResponse({ status: 'rate_limited' })

    expect(response?.status).toBe(429)
    await expect(response?.json()).resolves.toEqual({ error: 'Rate limit: max 20 graves per day' })
  })

  test('maps no_slots to HTTP 507', async () => {
    const response = insertOutcomeResponse({ status: 'no_slots' })

    expect(response?.status).toBe(507)
    await expect(response?.json()).resolves.toEqual({ error: 'No free grave slots available on the map' })
  })

  test('maps failed to HTTP 500', async () => {
    const response = insertOutcomeResponse({ status: 'failed', message: 'rpc failed' })

    expect(response?.status).toBe(500)
    await expect(response?.json()).resolves.toEqual({ error: 'Failed to create grave' })
  })

  test('leaves created outcomes unhandled', () => {
    const response = insertOutcomeResponse({ status: 'created', data: { id: 'grave-1' } })

    expect(response).toBeNull()
  })
})
