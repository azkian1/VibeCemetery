export const AGENT_ASH_TOKEN_PREFIX = 'ash_'
const AGENT_ASH_TOKEN_PATTERN = /^ash_[A-Za-z0-9._~-]{16,}$/

export function isAgentAshIngestToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && AGENT_ASH_TOKEN_PATTERN.test(token)
}

export function isAgentAshEnvelope(value: unknown): boolean {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && 'certificate' in value
      && 'proof' in value,
  )
}
