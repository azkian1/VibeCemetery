import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAgentAshAuthStore, handleAgentAshLinkStart } from '@/lib/agent-ash-auth'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getSiteUrl } from '@/lib/site'

const LINK_START_LIMIT = 10
const LINK_START_WINDOW = 60_000

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(`agent-ash-link-start:${getClientIp(request)}`, LINK_START_LIMIT, LINK_START_WINDOW)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many Agent Ash link attempts' }, {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)),
      },
    })
  }

  try {
    return await handleAgentAshLinkStart(request, {
      store: createSupabaseAgentAshAuthStore(),
      siteUrl: getSiteUrl(),
    })
  } catch (error) {
    console.error('Agent Ash link start failed:', error)
    return NextResponse.json({ error: 'Failed to start Agent Ash link' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
