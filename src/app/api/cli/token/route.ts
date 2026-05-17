import { NextResponse } from 'next/server'
import { createCliTokenForId, createCliTokenId, requireSessionUsername } from '@/lib/cli-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST() {
  const username = await requireSessionUsername()
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: activeTokens, error: activeTokensError } = await supabaseAdmin
    .from('cli_tokens')
    .select('id')
    .eq('github_username', username)
    .is('revoked_at', null)

  if (activeTokensError) {
    return NextResponse.json({ error: 'Failed to load CLI tokens' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  const activeTokenIds = (activeTokens ?? []).map((token) => token.id).filter(Boolean)
  if (activeTokenIds.length) {
    const { data: linkedTokens, error: linkedTokensError } = await supabaseAdmin
      .from('cli_link_sessions')
      .select('token_id')
      .in('token_id', activeTokenIds)

    if (linkedTokensError) {
      return NextResponse.json({ error: 'Failed to load CLI links' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }

    const linkedTokenIds = new Set((linkedTokens ?? []).map((token) => token.token_id).filter(Boolean))
    const settingsTokenIds = activeTokenIds.filter((tokenId) => !linkedTokenIds.has(tokenId))

    if (settingsTokenIds.length) {
      const { error: revokeError } = await supabaseAdmin
        .from('cli_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .in('id', settingsTokenIds)
        .is('revoked_at', null)

      if (revokeError) {
        return NextResponse.json({ error: 'Failed to revoke previous settings tokens' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
      }
    }
  }

  const tokenId = createCliTokenId()
  const { rawToken, tokenHash, tokenPrefix } = createCliTokenForId(tokenId)

  const { error } = await supabaseAdmin
    .from('cli_tokens')
    .insert({
      id: tokenId,
      github_username: username,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to issue CLI token' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json({ cli_token: rawToken, token_prefix: tokenPrefix }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
