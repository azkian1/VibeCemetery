import { NextResponse } from 'next/server'
import { requireSessionUsername } from '@/lib/cli-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const username = await requireSessionUsername()
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const { data, error } = await supabaseAdmin
    .from('cli_tokens')
    .select('id, token_prefix, created_at, last_used_at, revoked_at')
    .eq('github_username', username)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to load CLI tokens' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json({ tokens: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
