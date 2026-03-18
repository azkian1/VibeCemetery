import { NextRequest, NextResponse } from 'next/server'

function toOrigin(url: string): string {
  try { return new URL(url).origin }
  catch { return url.replace(/\/+$/, '') }
}

const ALLOWED_ORIGINS = [
  toOrigin(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
]

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

  const res = NextResponse.next()
  if (isAllowed) {
    res.headers.set('Access-Control-Allow-Origin', origin)
  }
  return res
}

export const config = {
  matcher: '/api/:path*',
}
