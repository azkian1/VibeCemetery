import { expect, test } from '@playwright/test'
import {
  AGENT_ASHES_COPY,
  buildAgentAshesViewModel,
  loadAgentAshCertificate,
  loadAgentAshTokens,
  revokeAgentAshToken,
  stringifyAgentAshCertificateForDisplay,
  type AgentAshesSummary,
} from '../src/components/modals/AgentAshesModal'
import { LEADERBOARD_TABS } from '../src/components/modals/LeaderboardModal'
import { TOPBAR_ACTIONS } from '../src/components/hud/TopBar'

test('Necropolis no longer contains the AI-Bots tab', () => {
  expect(LEADERBOARD_TABS.map((tab) => tab.label)).toEqual([
    'Serial Killers',
    'Causes of Death',
  ])
})

test('top bar exposes Agent Ashes next to Necropolis', () => {
  expect(TOPBAR_ACTIONS.map((action) => action.label)).toEqual([
    'Necropolis',
    'Agent Ashes',
  ])
})

test('Agent Ashes modal describes the dashboard placeholder and future API', () => {
  expect(AGENT_ASHES_COPY).toEqual({
    title: 'Agent Ashes',
    subtitle: 'Failure intelligence from autonomous project deaths.',
    intro: 'Hermes and other agents will submit verified Ash here. Once enough records exist, this dashboard will surface repeated failure patterns, stack risks, resurrection candidates, and prevention guardrails.',
    stats: [
      { label: 'Verified Ash', value: '0', note: 'Awaiting Hermes certificates' },
      { label: 'Failure Patterns', value: 'Soon', note: 'Needs verified data' },
      { label: 'Resurrection Candidates', value: 'Soon', note: 'Scored after ingestion' },
      { label: 'Agent API', value: 'Later', note: 'Structured access locked' },
    ],
    sections: [
      { title: 'Top Failure Patterns', body: 'Waiting for verified Ash.' },
      { title: 'Fragile Stacks', body: 'Not enough data yet.' },
      { title: 'Resurrection Queue', body: 'No candidates yet.' },
      { title: 'Raw Certificates', body: 'Expandable records will appear after Hermes submissions.' },
    ],
    api: {
      title: 'Agent API',
      status: 'Coming later.',
      body: 'Structured access will open after the archive has enough verified data.',
      action: 'Request Early Access',
    },
  })
})

test('Agent Ashes view model preserves empty archive copy', () => {
  expect(buildAgentAshesViewModel(null)).toMatchObject({
    stats: [
      { label: 'Verified Ash', value: '0', note: 'Awaiting Hermes certificates' },
      { label: 'Failure Patterns', value: 'Soon', note: 'Needs verified data' },
      { label: 'Resurrection Candidates', value: 'Soon', note: 'Scored after ingestion' },
      { label: 'Agent API', value: 'Later', note: 'Structured access locked' },
    ],
    sections: [
      { title: 'Top Failure Patterns', body: 'Waiting for verified Ash.' },
      { title: 'Fragile Stacks', body: 'Not enough data yet.' },
      { title: 'Resurrection Queue', body: 'No candidates yet.' },
      { title: 'Raw Certificates', body: 'Expandable records will appear after Hermes submissions.' },
    ],
    records: [],
  })
})

test('Agent Ashes view model renders verified summary data', () => {
  const summary: AgentAshesSummary = {
    total_verified_ash: 7,
    sampled_verified_ash: 5,
    analytics_window: 'recent_verified_ash',
    analytics_window_limit: 50,
    top_primary_causes: [{ value: 'external_api_break', count: 4 }],
    top_failure_patterns: [{ value: 'api changed before launch', count: 3 }],
    common_death_stages: [{ value: 'prototype', count: 6 }],
    fragile_stacks: [{ value: 'python', count: 5 }],
    top_domains: [{ value: 'crypto', count: 4 }],
    recent_verified_ash: [{
      id: 'ash-1',
      subject_name: 'dead-agent-prototype',
      repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
      agent_name: 'hermes',
      primary_cause: 'external_api_break',
      failure_pattern: 'api changed before launch',
      death_stage: 'prototype',
      verification_status: 'gitlawb_http_verified',
      verification_url: 'https://node.gitlawb.com/repo/1',
      declared_dead_at: '2026-03-06T12:11:00Z',
      created_at: '2026-03-06T12:12:00Z',
    }],
    resurrection_candidates: [{
      id: 'ash-1',
      subject_name: 'dead-agent-prototype',
      repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
      agent_name: 'hermes',
      primary_cause: 'external_api_break',
      failure_pattern: 'api changed before launch',
      death_stage: 'prototype',
      verification_status: 'gitlawb_http_verified',
      verification_url: 'https://node.gitlawb.com/repo/1',
      declared_dead_at: '2026-03-06T12:11:00Z',
      created_at: '2026-03-06T12:12:00Z',
      resurrection_score: 0.64,
    }],
  }

  expect(buildAgentAshesViewModel(summary)).toMatchObject({
    stats: [
      { label: 'Verified Ash', value: '7', note: '5 sampled for dashboard' },
      { label: 'Failure Patterns', value: '1', note: 'Top: api changed before launch' },
      { label: 'Resurrection Candidates', value: '1', note: 'Highest score 0.64' },
      { label: 'Agent API', value: 'Later', note: 'Structured access locked' },
    ],
    sections: [
      { title: 'Top Failure Patterns', body: 'api changed before launch (3)' },
      { title: 'Top Causes of Death', body: 'external_api_break (4)' },
      { title: 'Fragile Stacks', body: 'python (5)' },
      { title: 'Repeated Domains', body: 'crypto (4)' },
      { title: 'Death Stages', body: 'prototype (6)' },
      { title: 'Resurrection Queue', body: 'dead-agent-prototype (0.64)' },
      { title: 'Certificate Trail', body: 'Terminal archive view with repo DIDs, verification logs, proof URLs, and JSON certificates.' },
    ],
    records: [expect.objectContaining({ subject_name: 'dead-agent-prototype', verification_status: 'gitlawb_http_verified' })],
  })
})

test('Agent Ashes certificate detail loader fetches raw certificate JSON by id', async () => {
  const calls: string[] = []
  const certificate = {
    subject: { name: 'dead-agent-prototype', repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype' },
    proof: { type: 'gitlawb_http_node_v1' },
  }

  await expect(loadAgentAshCertificate('ash-1', async (url, init) => {
    calls.push(`${url} ${init?.cache}`)
    return new Response(JSON.stringify(certificate), { status: 200 })
  })).resolves.toEqual(certificate)
  expect(calls).toEqual(['/api/agent-ashes/ash-1/certificate no-store'])

  await expect(loadAgentAshCertificate('bad id', async () => new Response('{}'))).rejects.toThrow('Invalid Agent Ash id')
  await expect(loadAgentAshCertificate('ash-404', async () => new Response('{}', { status: 404 }))).rejects.toThrow('certificate request failed')
})

test('Agent Ashes certificate display redacts raw ash tokens', () => {
  const displayJson = stringifyAgentAshCertificateForDisplay({
    subject: { name: 'dead-agent-prototype' },
    raw: {
      agent_ash_token: 'ash_tokenid.abcdefghijklmnopqrstuvwxyz1234567890',
      nested: ['safe', 'ash_otherid.abcdefghijklmnopqrstuvwxyz1234567890'],
      safe_prefix: 'ash_safe...',
    },
  })

  expect(displayJson).toContain('[redacted_agent_ash_token]')
  expect(displayJson).toContain('ash_safe...')
  expect(displayJson).not.toContain('abcdefghijklmnopqrstuvwxyz1234567890')
})

test('Agent Ashes connected agents loader exposes only safe token metadata', async () => {
  const calls: string[] = []
  const tokens = await loadAgentAshTokens(async (url, init) => {
    calls.push(`${url} ${init?.cache}`)
    return new Response(JSON.stringify({
      tokens: [{
        id: 'token-owned-new',
        token_prefix: 'ash_new...',
        agent_name: 'hermes',
        agent_did: 'did:key:z6MkAgentHermes',
        gitlawb_node_url: 'https://node.gitlawb.com',
        scopes: ['agent_ashes:write'],
        created_at: '2026-05-18T12:00:00.000Z',
        last_used_at: '2026-05-18T12:03:00.000Z',
        agent_ash_token: 'ash_raw_must_not_render',
      }],
    }), { status: 200 })
  })

  expect(calls).toEqual(['/api/agent-ash/tokens no-store'])
  expect(tokens).toEqual([{
    id: 'token-owned-new',
    token_prefix: 'ash_new...',
    agent_name: 'hermes',
    agent_did: 'did:key:z6MkAgentHermes',
    gitlawb_node_url: 'https://node.gitlawb.com',
    scopes: ['agent_ashes:write'],
    created_at: '2026-05-18T12:00:00.000Z',
    last_used_at: '2026-05-18T12:03:00.000Z',
  }])
  expect(JSON.stringify(tokens)).not.toContain('ash_raw_must_not_render')
})

test('Agent Ashes connected agents loader rejects unredacted token prefixes', async () => {
  const tokens = await loadAgentAshTokens(async () => new Response(JSON.stringify({
    tokens: [{
      id: 'token-owned-new',
      token_prefix: 'ash_tokenid.fullRawSignatureMustNotRender',
      agent_name: 'hermes',
      agent_did: null,
      gitlawb_node_url: 'https://node.gitlawb.com',
      scopes: ['agent_ashes:write'],
      created_at: '2026-05-18T12:00:00.000Z',
      last_used_at: null,
    }],
  }), { status: 200 }))

  expect(tokens).toEqual([])
  expect(JSON.stringify(tokens)).not.toContain('fullRawSignatureMustNotRender')
})

test('Agent Ashes revoke helper posts token id without raw token material', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  await revokeAgentAshToken('token-owned-new', async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  })

  expect(calls).toHaveLength(1)
  expect(calls[0].url).toBe('/api/agent-ash/token/revoke')
  expect(calls[0].init?.method).toBe('POST')
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ token_id: 'token-owned-new' })
  expect(String(calls[0].init?.body)).not.toContain('ash_')

  await expect(revokeAgentAshToken('bad token id', async () => new Response('{}'))).rejects.toThrow('Invalid Agent Ash token id')
})
