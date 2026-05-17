import { expect, test } from '@playwright/test'
import { AGENT_ASHES_COPY } from '../src/components/modals/AgentAshesModal'
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
