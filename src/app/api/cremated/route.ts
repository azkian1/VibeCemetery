import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ error: 'Project cremation has been retired. Read /agent-instructions for burial.', code: 'RETIRED' }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
}
export const POST = GET
