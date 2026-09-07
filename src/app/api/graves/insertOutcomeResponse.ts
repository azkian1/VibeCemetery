import { NextResponse } from 'next/server'
import type { AtomicInsertWithSlotRetryResult } from './atomicInsertWithSlotRetry'
import { CEMETERY_BURIALS_PAUSED, CEMETERY_VERSION_RETIRED } from '@/lib/map-version'

export function insertOutcomeResponse<T>(
  insertOutcome: AtomicInsertWithSlotRetryResult<T>,
): NextResponse | null {
  if (insertOutcome.status === 'duplicate_repo') {
    return NextResponse.json(
      { error: 'This repository has already been buried' },
      { status: 409 },
    )
  }

  if (insertOutcome.status === 'no_slots') {
    return NextResponse.json(
      { error: 'No free grave slots available on the map' },
      { status: 507 },
    )
  }

  if (insertOutcome.status === 'rate_limited') {
    return NextResponse.json(
      { error: 'Rate limit: max 20 graves per day' },
      { status: 429 },
    )
  }

  if (insertOutcome.status === 'retry_exhausted') {
    return NextResponse.json(
      { error: 'Failed to reserve a grave slot. Please try again.' },
      { status: 503 },
    )
  }

  if (insertOutcome.status === 'failed') {
    if (insertOutcome.message === CEMETERY_BURIALS_PAUSED.code) {
      return NextResponse.json(CEMETERY_BURIALS_PAUSED, { status: 503, headers: { 'Retry-After': '60' } })
    }
    if (insertOutcome.message === CEMETERY_VERSION_RETIRED.code) {
      return NextResponse.json(CEMETERY_VERSION_RETIRED, { status: 410 })
    }
    return NextResponse.json({ error: 'Burial service unavailable. Please try again later.' }, { status: 503 })
  }

  if (insertOutcome.status === 'user_slots_exhausted') {
    return NextResponse.json(
      {
        code: 'USER_GRAVE_SLOTS_EXHAUSTED',
        error: 'No user grave slots available',
        slots_unlocked: insertOutcome.slots_unlocked,
        slots_used: insertOutcome.slots_used,
      },
      { status: 403 },
    )
  }

  return null
}
