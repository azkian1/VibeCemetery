import { NextResponse } from 'next/server'
import { isUuid, requireSessionUsername } from '@/lib/cli-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const username = await requireSessionUsername()
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid or malformed request body' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const tokenId = typeof body?.token_id === 'string' ? body.token_id.trim() : ''
  if (!isUuid(tokenId)) {
    return NextResponse.json({ error: 'Invalid token id' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const { data, error } = await supabaseAdmin
    .from('cli_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('github_username', username)
    .is('revoked_at', null)
    .select('id')

  if (error) {
    return NextResponse.json({ error: 'Failed to revoke CLI token' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!data?.length) {
    return NextResponse.json({ error: 'CLI token not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
