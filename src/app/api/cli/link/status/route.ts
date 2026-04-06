import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { buildCliTokenFromId, hashCliClaimToken, isCliLinkExpired, isUuid } from '@/lib/cli-auth'
import { supabaseAdmin } from '@/lib/supabase'

function claimTokenMatches(expectedHash: string, claimToken: string): boolean {
  const expected = Buffer.from(expectedHash, 'hex')
  const actual = Buffer.from(hashCliClaimToken(claimToken), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const linkId = searchParams.get('link_id')?.trim() ?? ''
  const claimToken = request.headers.get('x-cli-claim-token')?.trim() ?? ''

  if (!isUuid(linkId)) {
    return NextResponse.json({ error: 'Invalid link id' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  if (claimToken.length < 20) {
    return NextResponse.json({ error: 'Invalid claim token' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: linkSession, error } = await supabaseAdmin
    .from('cli_link_sessions')
    .select('id, github_username, token_id, approved_at, claimed_at, expires_at, claim_token_hash')
    .eq('id', linkId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Failed to load CLI link' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!linkSession) {
    return NextResponse.json({ error: 'Link session not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!linkSession.claim_token_hash || !claimTokenMatches(linkSession.claim_token_hash, claimToken)) {
    return NextResponse.json({ error: 'Invalid claim token' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  if (isCliLinkExpired(linkSession.expires_at) && !linkSession.claimed_at) {
    if (linkSession.token_id) {
      await supabaseAdmin
        .from('cli_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', linkSession.token_id)
        .is('revoked_at', null)
    }

    return NextResponse.json({ status: 'expired' }, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (!linkSession.approved_at || !linkSession.token_id || !linkSession.github_username) {
    return NextResponse.json({ status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (linkSession.claimed_at) {
    return NextResponse.json({
      status: 'claimed',
      github_username: linkSession.github_username,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const cliToken = buildCliTokenFromId(linkSession.token_id)
  const claimedAt = new Date().toISOString()

  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .from('cli_link_sessions')
    .update({ claimed_at: claimedAt })
    .eq('id', linkId)
    .is('claimed_at', null)
    .select('id')

  if (claimError) {
    return NextResponse.json({ error: 'Failed to claim CLI token' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!claimedRows?.length) {
    return NextResponse.json({
      status: 'claimed',
      github_username: linkSession.github_username,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json({
    status: 'approved',
    github_username: linkSession.github_username,
    cli_token: cliToken,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
