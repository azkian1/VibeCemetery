import { NextResponse } from 'next/server'

// Kept as a retired endpoint so old clients cannot grant a sharing allowance.
export async function POST() {
  return NextResponse.json({ error: 'Sharing no longer unlocks grave slots' }, { status: 410 })
}
