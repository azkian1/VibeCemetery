import { expect, test } from '@playwright/test'
import {
  AGENT_ASH_TOKEN_PREFIX,
  isAgentAshEnvelope,
  isAgentAshIngestToken,
} from '../src/lib/agent-ash-boundary'
import { POST as postCremated } from '../src/app/api/cremated/route'
import { POST as postGraves } from '../src/app/api/graves/route'

test.describe('Agent Ash product boundary', () => {
  test('recognizes Agent Ash ingest tokens separately from human CLI tokens', () => {
    expect(AGENT_ASH_TOKEN_PREFIX).toBe('ash_')
    expect(isAgentAshIngestToken('ash_dead_agent_token_123')).toBe(true)
    expect(isAgentAshIngestToken('vc_cli_12345678-1234-4123-8123-123456789abc.sig')).toBe(false)
  })

  test('recognizes certificate proof envelopes as Agent Ash submissions', () => {
    expect(isAgentAshEnvelope({ certificate: {}, proof: {} })).toBe(true)
    expect(isAgentAshEnvelope({ name: 'human cremation', cause: 'operator approved cleanup' })).toBe(false)
    expect(isAgentAshEnvelope(null)).toBe(false)
  })

  test('human cremation endpoint rejects Agent Ash tokens before reading body', async () => {
    const response = await postCremated(new Request('http://localhost/api/cremated', {
      method: 'POST',
      headers: { authorization: 'Bearer ash_dead_agent_token_123' },
      body: '{',
    }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Agent Ash ingest tokens cannot access human cremations',
    })
  })

  test('human grave endpoint rejects Agent Ash tokens before session auth', async () => {
    const response = await postGraves(new Request('http://localhost/api/graves', {
      method: 'POST',
      headers: { authorization: 'Bearer ash_dead_agent_token_123' },
      body: '{',
    }) as never)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Agent Ash ingest tokens cannot create graves',
    })
  })
})
