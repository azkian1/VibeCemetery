import { test, expect } from '@playwright/test'
import { insertGraveWithSlotRetry, type GraveInsertError } from '../src/app/api/graves/insertWithSlotRetry'

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
