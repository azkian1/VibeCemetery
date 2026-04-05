import { createHash, createHmac, randomUUID } from 'node:crypto'

if (typeof window !== 'undefined') {
  throw new Error('cli-auth helpers must only run on the server')
}

const CLI_TOKEN_PREFIX = 'vc_cli_'
const CLI_LINK_TTL_MS = 10 * 60 * 1000

export type CliActorSource = 'session' | 'cli'

export interface CliActor {
  username: string
  source: CliActorSource
}

function getCliTokenSecret(): string {
  const secret = process.env.CLI_TOKEN_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()
  if (!secret) {
    throw new Error('Missing CLI_TOKEN_SECRET or NEXTAUTH_SECRET')
  }
  return secret
}

export function createCliLinkId(): string {
  return randomUUID()
}

export function createCliTokenId(): string {
  return randomUUID()
}

export function getCliLinkExpiryDate(now = Date.now()): Date {
  return new Date(now + CLI_LINK_TTL_MS)
}

export function isCliLinkExpired(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now
}

export function buildCliRawToken({ tokenId, secret }: { tokenId: string, secret: string }): string {
  const signature = createHmac('sha256', secret)
    .update(`cli-token:${tokenId}`)
    .digest('base64url')

  return `${CLI_TOKEN_PREFIX}${tokenId}.${signature}`
}

export function hashCliToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function maskCliTokenPrefix(rawToken: string): string {
  return `${rawToken.slice(0, 18)}...`
}

export function createCliTokenRecord({ tokenId, secret }: { tokenId: string, secret: string }) {
  const rawToken = buildCliRawToken({ tokenId, secret })
  return {
    rawToken,
    tokenHash: hashCliToken(rawToken),
    tokenPrefix: maskCliTokenPrefix(rawToken),
  }
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export function buildCliTokenFromId(tokenId: string): string {
  return buildCliRawToken({ tokenId, secret: getCliTokenSecret() })
}

export async function resolveCliActor(request: Request): Promise<CliActor | null> {
  const { getServerSession } = await import('next-auth')
  const { authOptions } = await import('@/app/api/auth/[...nextauth]/route')
  const { supabaseAdmin } = await import('@/lib/supabase')
  const session = await getServerSession(authOptions)
  if (session?.user?.github_username) {
    return {
      username: session.user.github_username,
      source: 'session',
    }
  }

  const bearerToken = extractBearerToken(request)
  if (!bearerToken) {
    return null
  }

  const { data: cliToken } = await supabaseAdmin
    .from('cli_tokens')
    .select('id, github_username')
    .eq('token_hash', hashCliToken(bearerToken))
    .is('revoked_at', null)
    .maybeSingle()

  if (!cliToken?.github_username) {
    return null
  }

  await supabaseAdmin
    .from('cli_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', cliToken.id)

  return {
    username: cliToken.github_username,
    source: 'cli',
  }
}

export async function requireSessionUsername(): Promise<string | null> {
  const { getServerSession } = await import('next-auth')
  const { authOptions } = await import('@/app/api/auth/[...nextauth]/route')
  const session = await getServerSession(authOptions)
  return session?.user?.github_username ?? null
}

export function createCliTokenForId(tokenId: string) {
  return createCliTokenRecord({ tokenId, secret: getCliTokenSecret() })
}
