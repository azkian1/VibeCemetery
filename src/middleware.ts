import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

function toOrigin(url: string): string {
  try { return new URL(url).origin }
  catch { return url.replace(/\/+$/, '') }
}

const ALLOWED_ORIGINS = [
  toOrigin(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
]

/** Per-IP read rate limit: 60 requests per 60 seconds */
const READ_LIMIT = 60
const READ_WINDOW = 60_000

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const isAllowed = ALLOWED_ORIGINS.includes(origin)

  if (req.method === 'OPTIONS') {
    if (!isAllowed) return new NextResponse(null, { status: 403 })
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Rate-limit GET requests on public endpoints
  if (req.method === 'GET') {
    const ip = getClientIp(req)
    const result = checkRateLimit(`read:${ip}`, READ_LIMIT, READ_WINDOW)
    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) },
        },
      )
    }
  }

  const res = NextResponse.next()
  if (isAllowed) {
    res.headers.set('Access-Control-Allow-Origin', origin)
  }
  return res
}

export const config = {
  matcher: '/api/:path*',
}
