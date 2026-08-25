import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export const BURN_WRITE_BODY_LIMIT = 4 * 1024

export class BurnHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
  ) {
    super(publicMessage)
  }
}

export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get('origin')
  if (!origin) throw new BurnHttpError(403, 'Invalid request origin')

  let normalizedOrigin: string
  try {
    normalizedOrigin = new URL(origin).origin
  } catch {
    throw new BurnHttpError(403, 'Invalid request origin')
  }

  if (normalizedOrigin !== req.nextUrl.origin) {
    throw new BurnHttpError(403, 'Invalid request origin')
  }
}

export async function readStrictJsonObject(
  req: NextRequest,
  maxBytes = BURN_WRITE_BODY_LIMIT,
): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new BurnHttpError(415, 'Content-Type must be application/json')
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BurnHttpError(413, 'Request body too large')
  }

  let text = ''
  if (req.body) {
    const reader = req.body.getReader()
    const decoder = new TextDecoder()
    let received = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel()
        throw new BurnHttpError(413, 'Request body too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new BurnHttpError(400, 'Invalid JSON body')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BurnHttpError(400, 'Request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

export function assertExactKeys(
  body: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const keys = Object.keys(body).sort()
  const expected = [...expectedKeys].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new BurnHttpError(400, 'Unexpected request fields')
  }
}

export function burnJson(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
): NextResponse {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Pragma', 'no-cache')
  return NextResponse.json(body, { ...init, headers })
}

export function burnHttpErrorResponse(error: unknown): NextResponse {
  if (error instanceof BurnHttpError) {
    return burnJson({ error: error.publicMessage }, { status: error.status })
  }
  const errorName = error instanceof Error
    && /^[A-Za-z][A-Za-z0-9_$]{0,63}$/.test(error.name)
    ? error.name
    : 'unknown_error'
  console.error('[VibeCemetery] Grave offering request failed:', errorName)
  return burnJson({ error: 'Ritual unavailable' }, { status: 500 })
}

export async function enforceBurnRateLimit(
  req: NextRequest,
  action: string,
  walletAddress: string,
  maxRequests = 12,
  windowMs = 60_000,
): Promise<void> {
  const [ipLimit, walletLimit] = await Promise.all([
    checkRateLimit(`grave-burn:${action}:ip:${getClientIp(req)}`, maxRequests, windowMs),
    checkRateLimit(
      `grave-burn:${action}:wallet:${walletAddress.toLowerCase()}`,
      maxRequests,
      windowMs,
    ),
  ])

  if (!ipLimit.allowed || !walletLimit.allowed) {
    throw new BurnHttpError(429, 'Too many ritual requests. Please try again shortly.')
  }
}

export async function enforceBurnIpRateLimit(
  req: NextRequest,
  action: string,
  maxRequests = 12,
  windowMs = 60_000,
): Promise<void> {
  const result = await checkRateLimit(
    `grave-burn:${action}:ip:${getClientIp(req)}`,
    maxRequests,
    windowMs,
  )
  if (!result.allowed) {
    throw new BurnHttpError(429, 'Too many ritual requests. Please try again shortly.')
  }
}

export async function enforceBurnWalletRateLimit(
  action: string,
  walletAddress: string,
  maxRequests = 12,
  windowMs = 60_000,
): Promise<void> {
  const result = await checkRateLimit(
    `grave-burn:${action}:wallet:${walletAddress.toLowerCase()}`,
    maxRequests,
    windowMs,
  )
  if (!result.allowed) {
    throw new BurnHttpError(429, 'Too many ritual requests. Please try again shortly.')
  }
}
