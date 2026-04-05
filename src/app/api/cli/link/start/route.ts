import { NextRequest, NextResponse } from 'next/server'
import { createCliLinkId, getCliLinkExpiryDate } from '@/lib/cli-auth'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getSiteUrl } from '@/lib/site'
import { supabaseAdmin } from '@/lib/supabase'

const LINK_START_LIMIT = 10
const LINK_START_WINDOW = 60_000

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const result = checkRateLimit(`cli-link-start:${ip}`, LINK_START_LIMIT, LINK_START_WINDOW)

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

  const linkId = createCliLinkId()
  const expiresAt = getCliLinkExpiryDate()

  const { error } = await supabaseAdmin
    .from('cli_link_sessions')
    .insert({
      id: linkId,
      expires_at: expiresAt.toISOString(),
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to start CLI link' }, { status: 500 })
  }

  return NextResponse.json({
    link_id: linkId,
    approve_url: `${getSiteUrl()}/cli/connect?link_id=${linkId}`,
    expires_at: expiresAt.toISOString(),
    poll_interval_ms: 2000,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
