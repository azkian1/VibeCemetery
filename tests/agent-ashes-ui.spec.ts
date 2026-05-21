import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  AGENT_ASHES_TABS,
  AGENT_ASHES_COPY,
  CERTIFICATE_JSON_STYLE,
  buildAgentAshesViewModel,
  loadAgentAshCertificate,
  loadAgentAshTokens,
  revokeAgentAshToken,
  stringifyAgentAshCertificateForDisplay,
  type AgentAshesSummary,
} from '../src/components/modals/AgentAshesModal'
import { CLOSE_BUTTON_STICKY_STYLE, CLOSE_BUTTON_STYLE } from '../src/components/ui/CloseButton'
import { LEADERBOARD_TABS } from '../src/components/modals/LeaderboardModal'
import { TOPBAR_ACTIONS } from '../src/components/hud/TopBar'

test('Necropolis no longer contains the AI-Bots tab', () => {
  expect(LEADERBOARD_TABS.map((tab) => tab.label)).toEqual([
    'Serial Killers',
    'Causes of Death',
  ])
})

test('human layer modals label ranks as GitHub Reapers', () => {
  const source = [
    'src/components/modals/LeaderboardModal.tsx',
    'src/components/modals/CrematoryModal.tsx',
  ].map((path) => readFileSync(path, 'utf8')).join('\n')
  expect(source).toContain('GitHub Reaper')
  expect(source).toContain('GitHub Reapers')
  expect(source).not.toContain('Git Reaper')
})

test('top bar exposes Agent Ashes next to Necropolis', () => {
  expect(TOPBAR_ACTIONS.map((action) => action.label)).toEqual([
    'Necropolis',
    'Agent Ashes',
  ])
})

test('Agent Ashes modal describes the dashboard placeholder', () => {
  expect(AGENT_ASHES_COPY).toMatchObject({
    title: 'Agent Ashes',
    subtitle: 'Machine-readable deaths from GitLawb-verified autonomous projects.',
    emptyCertificates: 'No verified Ash records yet. The witnesses have not arrived.',
    footer: 'Agents produce Ash. Humans earn SOUL.',
  })
})

test('Agent Ashes subtitle highlights GitLawb without linking it', () => {
  const source = readFileSync('src/components/modals/AgentAshesModal.tsx', 'utf8')

  expect(source).toContain("<span style={{ color: '#c8a050', fontSize: 13, letterSpacing: 0.2 }}>")
  expect(source).not.toContain('href="https://gitlawb.com/"')
})

test('Agent Ashes modal exposes certificate and dashboard tabs', () => {
  expect(AGENT_ASHES_TABS.map((tab) => tab.label)).toEqual(['Ash Records', 'Slop Lords', 'Dashboard'])
})

test('Agent Ashes view model preserves empty archive copy', () => {
  expect(buildAgentAshesViewModel(null)).toMatchObject({
    footer: 'Agents produce Ash. Humans earn SOUL.',
    certificateRows: [],
    slopLordRows: [],
    records: [],
  })
})

test('Agent Ashes view model renders verified summary data', () => {
  const summary: AgentAshesSummary = {
    total_verified_ash: 7,
    sampled_verified_ash: 5,
    distinct_agents: 1,
    analytics_window: 'recent_verified_ash',
    analytics_window_limit: 50,
    top_primary_causes: [{ value: 'external_api_break', count: 4 }],
    top_failure_patterns: [{ value: 'api changed before launch', count: 3 }],
    common_death_stages: [{ value: 'prototype', count: 6 }],
    top_agents: [{ value: 'hermes', count: 7 }],
    fragile_stacks: [{ value: 'python', count: 5 }],
    top_domains: [{ value: 'crypto', count: 4 }],
    recent_verified_ash: [{
      id: 'ash-1',
      subject_name: 'dead-agent-prototype',
      repo_did: 'did:gitlawb:z6MkRepoDeadAgentPrototype',
      agent_name: 'hermes',
      agent_did: 'did:key:z6MkAgentHermesLongTail',
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
      agent_did: 'did:key:z6MkAgentHermesLongTail',
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

  const viewModel = buildAgentAshesViewModel(summary)

  expect(viewModel).toMatchObject({
    stats: [
      { label: 'Verified Ash', value: '7', note: '5 sampled for dashboard' },
      { label: 'Agents', value: '1', note: 'Top: hermes in sample' },
      { label: 'Failure Patterns', value: '1', note: 'Top: api changed before launch' },
    ],
    sections: [
      { title: 'Witnessed Agents', body: 'hermes (7 projects)' },
      { title: 'Top Failure Patterns', body: 'api changed before launch (3)' },
      { title: 'Top Causes of Death', body: 'external_api_break (4)' },
      { title: 'Fragile Stacks', body: 'python (5)' },
      { title: 'Repeated Domains', body: 'crypto (4)' },
      { title: 'Death Stages', body: 'prototype (6)' },
    ],
    records: [expect.objectContaining({ subject_name: 'dead-agent-prototype', verification_status: 'gitlawb_http_verified' })],
  })
  expect(viewModel.sections.map((section) => section.title)).toEqual([
    'Witnessed Agents',
    'Top Failure Patterns',
    'Top Causes of Death',
    'Fragile Stacks',
    'Repeated Domains',
    'Death Stages',
  ])
  expect(viewModel.certificateRows[0]).toMatchObject({
    rank: 1,
    id: 'ash-1',
    project: 'dead-agent-prototype',
    agentName: 'hermes',
    agentDid: 'did:key:z6MkAgentHermesLongTail',
    agentDidShort: expect.stringMatching(/^did:key:z6Mk\.\.\..+$/),
    proofLabel: 'OPEN',
  })
  expect(viewModel.slopLordRows[0]).toMatchObject({
    rank: 1,
    agentName: 'hermes',
    agentDid: 'did:key:z6MkAgentHermesLongTail',
    agentDidShort: expect.stringMatching(/^did:key:z6Mk\.\.\..+$/),
    verifiedAsh: '7 projects',
  })
  expect(viewModel.footer).toBe('7 verified Ash · 1 Slop Lord Agent')
})

test('Agent Ashes view model uses distinct agent count beyond visible top agents', () => {
  expect(buildAgentAshesViewModel({
    total_verified_ash: 12,
    sampled_verified_ash: 12,
    distinct_agents: 7,
    analytics_window: 'recent_verified_ash',
    analytics_window_limit: 50,
    top_primary_causes: [],
    top_failure_patterns: [],
    common_death_stages: [],
    top_agents: [
      { value: 'hermes', count: 4 },
      { value: 'openclaw', count: 3 },
      { value: 'agent-three', count: 2 },
      { value: 'agent-four', count: 1 },
      { value: 'agent-five', count: 1 },
    ],
    fragile_stacks: [],
    top_domains: [],
    recent_verified_ash: [],
    resurrection_candidates: [],
  }).stats).toContainEqual({ label: 'Agents', value: '7', note: 'Top: hermes in sample' })
})

test('Agent Ashes certificate JSON wraps inside the modal', () => {
  expect(CERTIFICATE_JSON_STYLE).toMatchObject({
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  })
})

test('modal close button keeps absolute positioning by default', () => {
  expect(CLOSE_BUTTON_STYLE).toMatchObject({
    position: 'absolute',
    right: 12,
  })
  expect(CLOSE_BUTTON_STYLE).not.toHaveProperty('marginLeft')
  expect(CLOSE_BUTTON_STYLE).not.toHaveProperty('display')
  expect(CLOSE_BUTTON_STYLE).not.toHaveProperty('position', 'sticky')
})

test('modal close button supports opt-in sticky positioning', () => {
  expect(CLOSE_BUTTON_STICKY_STYLE).toMatchObject({
    position: 'sticky',
    top: 10,
    marginLeft: 'auto',
    display: 'block',
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
