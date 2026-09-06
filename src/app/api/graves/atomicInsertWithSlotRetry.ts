type SlotLike = { id: number }

export type AtomicInsertRpcResult<T> =
  | { status: 'created'; grave: T }
  | { status: 'replayed'; grave: T }
  | { status: 'duplicate_repo' }
  | { status: 'user_slots_exhausted'; slots_unlocked: number; slots_used: number }
  | { status: 'rate_limited' }
  | { status: 'slot_collision' }
  | { status: 'no_slots' }
  | { status: 'failed'; message?: string }

export type AtomicInsertWithSlotRetryResult<T> =
  | { status: 'created'; data: T }
  | { status: 'replayed'; data: T }
  | { status: 'duplicate_repo' }
  | { status: 'user_slots_exhausted'; slots_unlocked: number; slots_used: number }
  | { status: 'rate_limited' }
  | { status: 'failed'; message?: string }
  | { status: 'retry_exhausted' }
  | { status: 'no_slots' }

function normalizeRpcResult<T>(result: unknown): AtomicInsertRpcResult<T> {
  if (!result || typeof result !== 'object' || !('status' in result)) {
    return { status: 'failed', message: 'Invalid atomic insert RPC response' }
  }

  const status = String(result.status)
  if (status === 'created' || status === 'replayed') {
    if (!('grave' in result) || !result.grave || typeof result.grave !== 'object') {
      return { status: 'failed', message: 'Invalid created atomic insert RPC response' }
    }

    return result as AtomicInsertRpcResult<T>
  }

  if (status === 'user_slots_exhausted') {
    if (!('slots_unlocked' in result) || typeof result.slots_unlocked !== 'number' || !('slots_used' in result) || typeof result.slots_used !== 'number') {
      return { status: 'failed', message: 'Invalid user slot exhaustion RPC response' }
    }

    return result as AtomicInsertRpcResult<T>
  }

  if (status === 'no_slots' || status === 'duplicate_repo' || status === 'rate_limited' || status === 'slot_collision' || status === 'failed') {
    return result as AtomicInsertRpcResult<T>
  }

  return { status: 'failed', message: `Unknown atomic insert RPC status: ${status}` }
}

export async function insertGraveAtomicallyWithSlotRetry<T>({
  loadUsedSlotIds,
  pickSlot,
  insertGrave,
  maxAttempts = 3,
}: {
  loadUsedSlotIds: () => Promise<number[]>
  pickSlot: (used: Set<number>) => SlotLike | null
  insertGrave: (slotId: number) => Promise<unknown>
  maxAttempts?: number
}): Promise<AtomicInsertWithSlotRetryResult<T>> {
  const seenSlotIds = new Set<number>()

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const usedSlotIds = new Set(await loadUsedSlotIds())
    for (const slotId of seenSlotIds) {
      usedSlotIds.add(slotId)
    }

    const pickedSlot = pickSlot(usedSlotIds)
    if (!pickedSlot) {
      return { status: 'no_slots' }
    }

    seenSlotIds.add(pickedSlot.id)

    const result = normalizeRpcResult<T>(await insertGrave(pickedSlot.id))
    if (result.status === 'created' || result.status === 'replayed') {
      return { status: result.status, data: result.grave }
    }

    if (result.status === 'slot_collision') {
      continue
    }

    return result
  }

  return { status: 'retry_exhausted' }
}
