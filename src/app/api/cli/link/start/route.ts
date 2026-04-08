import { NextRequest, NextResponse } from 'next/server'
import { createCliClaimToken, createCliLinkId, getCliLinkExpiryDate, hashCliClaimToken } from '@/lib/cli-auth'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getCliApprovalSiteUrl } from '@/lib/site'
import { supabaseAdmin } from '@/lib/supabase'

const LINK_START_LIMIT = 10
const LINK_START_WINDOW = 60_000

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const result = await checkRateLimit(`cli-link-start:${ip}`, LINK_START_LIMIT, LINK_START_WINDOW)

  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Too many CLI link attempts' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
        },
      },
    )
  }

  let approvalSiteUrl: string
  try {
    approvalSiteUrl = getCliApprovalSiteUrl()
  } catch {
    return NextResponse.json(
      { error: 'CLI approval site URL is not configured' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  }

  const linkId = createCliLinkId()
  const claimToken = createCliClaimToken()
  const expiresAt = getCliLinkExpiryDate()

  const { error } = await supabaseAdmin
    .from('cli_link_sessions')
    .insert({
      id: linkId,
      claim_token_hash: hashCliClaimToken(claimToken),
      expires_at: expiresAt.toISOString(),
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to start CLI link' }, { status: 500 })
  }

  return NextResponse.json({
    link_id: linkId,
    approve_url: `${approvalSiteUrl}/cli/connect?link_id=${linkId}#claim_token=${encodeURIComponent(claimToken)}`,
    claim_token: claimToken,
    expires_at: expiresAt.toISOString(),
    poll_interval_ms: 2000,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
