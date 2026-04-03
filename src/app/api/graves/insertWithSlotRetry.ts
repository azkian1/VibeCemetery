export type GraveInsertError = {
  code?: string
  details?: string | null
  message?: string
} | null

type SlotLike = { id: number }

type InsertResult<T> = {
  data: T | null
  error: GraveInsertError
}

export type InsertWithSlotRetryResult<T> =
  | { status: 'created'; data: T }
  | { status: 'duplicate'; error: GraveInsertError }
  | { status: 'failed'; error: GraveInsertError }
  | { status: 'retry_exhausted' }
  | { status: 'no_slots' }

function isUniqueViolation(error: GraveInsertError): boolean {
  return error?.code === '23505'
}

function isSlotCollision(error: GraveInsertError): boolean {
  return isUniqueViolation(error) && (
    (error?.details ?? '').includes('Key (slot_id)=') ||
    (error?.message ?? '').includes('graves_slot_id_key')
  )
}

function isRepoDuplicate(error: GraveInsertError): boolean {
  return isUniqueViolation(error) && (
    (error?.details ?? '').includes('Key (github_repo_id)=') ||
    (error?.message ?? '').includes('graves_github_repo_id_key')
  )
}

export async function insertGraveWithSlotRetry<T>({
  loadUsedSlotIds,
  pickSlot,
  insertGrave,
  maxAttempts = 3,
}: {
  loadUsedSlotIds: () => Promise<number[]>
  pickSlot: (used: Set<number>) => SlotLike | null
  insertGrave: (slotId: number) => Promise<InsertResult<T>>
  maxAttempts?: number
}): Promise<InsertWithSlotRetryResult<T>> {
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

    const result = await insertGrave(pickedSlot.id)
    if (!result.error && result.data) {
      return { status: 'created', data: result.data }
    }

    if (isRepoDuplicate(result.error)) {
      return { status: 'duplicate', error: result.error }
    }

    if (!isSlotCollision(result.error)) {
      return { status: 'failed', error: result.error }
    }
  }

  return { status: 'retry_exhausted' }
}
