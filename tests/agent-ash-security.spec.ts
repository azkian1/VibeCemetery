import { expect, test } from '@playwright/test'
import {
  AGENT_ASH_MAX_BODY_BYTES,
  AGENT_ASH_INGEST_RATE_LIMIT_MAX,
  AGENT_ASH_INGEST_RATE_LIMIT_WINDOW_MS,
  agentAshNoStoreHeaders,
  authenticateAgentAshIngestRequest,
  checkAgentAshIngestRateLimit,
  getAgentAshIngestConfig,
  isAgentAshBodyTooLarge,
  isAllowedGitlawbNodeUrl,
  readAgentAshJsonWithLimit,
  validateAgentAshProofSecurity,
} from '../src/lib/agent-ash-security'

test.describe('Agent Ash server security controls', () => {
  test('loads ingest token and GitLawb node allowlist from server env', () => {
    expect(getAgentAshIngestConfig({
      AGENT_ASH_INGEST_TOKEN: ' ash_test_secret_123456 ',
      GITLAWB_ALLOWED_NODE_URLS: ' https://node.gitlawb.com,https://mirror.gitlawb.com/ ',
    })).toEqual({
      ingestToken: 'ash_test_secret_123456',
      allowedNodeUrls: ['https://node.gitlawb.com', 'https://mirror.gitlawb.com'],
    })
  })

  test('rejects weak ingest tokens and non-HTTPS node config', () => {
    expect(() => getAgentAshIngestConfig({
      AGENT_ASH_INGEST_TOKEN: 'ash_',
      GITLAWB_ALLOWED_NODE_URLS: 'https://node.gitlawb.com',
    })).toThrow('Missing AGENT_ASH_INGEST_TOKEN')

    expect(() => getAgentAshIngestConfig({
      AGENT_ASH_INGEST_TOKEN: 'ash_test_secret_123456',
      GITLAWB_ALLOWED_NODE_URLS: 'http://node.gitlawb.com',
    })).toThrow('Missing GITLAWB_ALLOWED_NODE_URLS')
  })

  test('requires an ash-prefixed bearer token for ingest', () => {
    const config = { ingestToken: 'ash_test_secret_123456', allowedNodeUrls: ['https://node.gitlawb.com'] }

    expect(authenticateAgentAshIngestRequest(new Request('http://localhost/api/agent-ashes'), config)).toEqual({
      ok: false,
      status: 401,
      error: 'Missing Agent Ash ingest token',
    })
    expect(authenticateAgentAshIngestRequest(new Request('http://localhost/api/agent-ashes', {
      headers: { authorization: 'Bearer vc_cli_not_allowed' },
    }), config)).toEqual({
      ok: false,
      status: 401,
      error: 'Invalid Agent Ash ingest token',
    })
    expect(authenticateAgentAshIngestRequest(new Request('http://localhost/api/agent-ashes', {
      headers: { authorization: 'Bearer ash_test_secret_123456' },
    }), config)).toEqual({ ok: true })
  })

  test('matches GitLawb node URLs against the allowlist after normalization', () => {
    expect(isAllowedGitlawbNodeUrl('https://node.gitlawb.com/', ['https://node.gitlawb.com'])).toBe(true)
    expect(isAllowedGitlawbNodeUrl('https://evil.example', ['https://node.gitlawb.com'])).toBe(false)
    expect(isAllowedGitlawbNodeUrl('http://node.gitlawb.com', ['https://node.gitlawb.com'])).toBe(false)
    expect(isAllowedGitlawbNodeUrl('not-a-url', ['https://node.gitlawb.com'])).toBe(false)
  })

  test('rejects unsupported proof types and unsupported GitLawb nodes', () => {
    expect(validateAgentAshProofSecurity({ type: 'gitlawb_signature_v1', node_url: 'https://node.gitlawb.com' }, ['https://node.gitlawb.com'])).toEqual({
      ok: false,
      status: 400,
      error: 'Unsupported Agent Ash proof type',
    })
    expect(validateAgentAshProofSecurity({ type: 'gitlawb_http_node_v1', node_url: 'https://evil.example' }, ['https://node.gitlawb.com'])).toEqual({
      ok: false,
      status: 403,
      error: 'Unsupported GitLawb node',
    })
  })

  test('exposes request-size and no-store response controls', () => {
    expect(AGENT_ASH_MAX_BODY_BYTES).toBe(256 * 1024)
    expect(isAgentAshBodyTooLarge(new Request('http://localhost/api/agent-ashes', {
      headers: { 'content-length': String(AGENT_ASH_MAX_BODY_BYTES + 1) },
    }))).toBe(true)
    expect(agentAshNoStoreHeaders()).toEqual({ 'Cache-Control': 'no-store' })
  })

  test('reads JSON body with an enforced streaming size limit', async () => {
    await expect(readAgentAshJsonWithLimit(new Request('http://localhost/api/agent-ashes', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    }))).resolves.toEqual({ ok: true, value: { ok: true } })

    await expect(readAgentAshJsonWithLimit(new Request('http://localhost/api/agent-ashes', {
      method: 'POST',
      body: 'x'.repeat(AGENT_ASH_MAX_BODY_BYTES + 1),
    }))).resolves.toEqual({
      ok: false,
      status: 413,
      error: 'Agent Ash request body too large',
    })
  })

  test('builds a dedicated ingest rate-limit key from the client IP', async () => {
    const calls: Array<[string, number, number]> = []
    const result = await checkAgentAshIngestRateLimit(
      new Request('http://localhost/api/agent-ashes') as never,
      async (key, maxRequests, windowMs) => {
        calls.push([key, maxRequests, windowMs])
        return { allowed: true }
      },
    )

    expect(result).toEqual({ allowed: true })
    expect(calls).toEqual([[
      'agent-ash-ingest:0.0.0.0',
      AGENT_ASH_INGEST_RATE_LIMIT_MAX,
      AGENT_ASH_INGEST_RATE_LIMIT_WINDOW_MS,
    ]])
  })
})
