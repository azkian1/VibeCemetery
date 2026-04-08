import { NextResponse } from 'next/server'
import {
  createCliTokenForId,
  createCliTokenId,
  hashCliClaimToken,
  isCliLinkExpired,
  isUuid,
  requireSessionUsername,
} from '@/lib/cli-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const username = await requireSessionUsername()
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid or malformed request body' }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const linkId = typeof body?.link_id === 'string' ? body.link_id.trim() : ''
  const claimToken = typeof body?.claim_token === 'string' ? body.claim_token.trim() : ''
  if (!isUuid(linkId)) {
    return NextResponse.json({ error: 'Invalid link id' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  if (claimToken.length < 20) {
    return NextResponse.json({ error: 'Invalid claim token' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: linkSession, error: loadError } = await supabaseAdmin
    .from('cli_link_sessions')
    .select('id, token_id, approved_at, claimed_at, expires_at, claim_token_hash')
    .eq('id', linkId)
    .maybeSingle()

  if (loadError) {
    return NextResponse.json({ error: 'Failed to load CLI link' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!linkSession) {
    return NextResponse.json({ error: 'Link session not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!linkSession.claim_token_hash || hashCliClaimToken(claimToken) !== linkSession.claim_token_hash) {
    return NextResponse.json({ error: 'Invalid claim token' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  if (isCliLinkExpired(linkSession.expires_at)) {
    return NextResponse.json({ error: 'Link session expired' }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
  }

  if (linkSession.claimed_at) {
    return NextResponse.json({ error: 'Link session already claimed' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
  }

  if (linkSession.approved_at && linkSession.token_id) {
    return NextResponse.json({ status: 'approved' }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const tokenId = createCliTokenId()
  const { tokenHash, tokenPrefix } = createCliTokenForId(tokenId)
  const approvedAt = new Date().toISOString()

  const { error: insertTokenError } = await supabaseAdmin
    .from('cli_tokens')
    .insert({
      id: tokenId,
      github_username: username,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
    })

  if (insertTokenError) {
    return NextResponse.json({ error: 'Failed to issue CLI token' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from('cli_link_sessions')
    .update({
      github_username: username,
      token_id: tokenId,
      approved_at: approvedAt,
    })
    .eq('id', linkId)
    .is('approved_at', null)
    .select('id')

  if (updateError) {
    await supabaseAdmin.from('cli_tokens').delete().eq('id', tokenId)
    return NextResponse.json({ error: 'Failed to approve CLI link' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!updatedRows?.length) {
    await supabaseAdmin.from('cli_tokens').delete().eq('id', tokenId)
    return NextResponse.json({ error: 'Link session already approved' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json({ status: 'approved' }, { headers: { 'Cache-Control': 'no-store' } })
}
