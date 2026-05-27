import type { CrematedData, DeadRepo, GraveData } from '@/types/game'
import { generateEpitaph } from '@/gravedigger/epitaphs'
import { getAutoAssignableGraveSlots } from '@/lib/map-slots'
import { DEMO_USERNAME, isDemoMode } from './mode'

export { DEMO_USERNAME, isDemoMode }

const DEMO_NOW = '2026-05-22T12:00:00.000Z'

const DEMO_CAUSES = [
  'Vibe-coded beyond maintainability',
  'Killed by one more auth rewrite',
  'Abandoned after the demo worked once',
  'Dependency rot reached the crypt',
  'README promised more than the repo could bear',
  'The model changed and nobody updated the prompts',
  'Side project energy evaporated at dawn',
]

const DEMO_LANGUAGES = ['TypeScript', 'Python', 'Rust', 'Go', 'JavaScript', 'Solidity', 'CSS']

const DEMO_REPO_NAMES = [
  'weekend-saas-altar',
  'ai-todo-necromancer',
  'prompt-marketplace-v0',
  'trading-bot-that-prayed',
  'notion-clone-catacomb',
  'web3-coffee-ledger',
  'landing-page-labyrinth',
  'agentic-crm-ghoul',
  'newsletter-bonewheel',
  'portfolio-rewrite-12',
]

const DEMO_GRAVE_NAMES = [
  'calendar-of-doom',
  'stripe-test-sacrifice',
  'habit-tracker-haunting',
  'ai-logo-generator-crypt',
  'micro-saas-mausoleum',
  'bug-report-oracle',
  'dockerfile-cathedral',
  'crypto-tax-gargoyle',
  'chatbot-with-memory-leaks',
  'kanban-curse',
  'rss-revival-failed',
  'terminal-dashboard-ashes',
  'sleep-tracker-poltergeist',
  'budget-app-boneyard',
  'image-upscaler-undead',
  'obsidian-plugin-tomb',
  'oauth-loop-of-sorrow',
  'storybook-without-stories',
  'pixel-rpg-prototype',
  'invoice-ghoul',
  'link-in-bio-catacomb',
  'prompt-vault-v1',
  'serverless-seance',
  'analytics-altar',
  'markdown-cms-crypt',
  'discord-bot-dust',
  'cli-helper-haunt',
  'resume-builder-remains',
]

let addedGraves: GraveData[] = []
let addedCremations: CrematedData[] = []
let nextCremationId = 90_000

function isoDaysAgo(days: number): string {
  return new Date(Date.parse(DEMO_NOW) - days * 86_400_000).toISOString()
}

function makeGithubUrl(name: string): string {
  return `https://github.com/${DEMO_USERNAME}/${name}`
}

export function getDemoDeadRepos(): DeadRepo[] {
  return DEMO_REPO_NAMES.map((name, index) => ({
    id: 70_000 + index,
    name,
    description: `Demo dead repository #${index + 1} for the local recording cemetery.`,
    html_url: makeGithubUrl(name),
    language: DEMO_LANGUAGES[index % DEMO_LANGUAGES.length],
    created_at: isoDaysAgo(360 + index * 17),
    pushed_at: isoDaysAgo(24 + index * 11),
  }))
}

function makeGrave(name: string, index: number, slotId: number): GraveData {
  const cause = DEMO_CAUSES[index % DEMO_CAUSES.length]
  const language = DEMO_LANGUAGES[index % DEMO_LANGUAGES.length]

  return {
    id: `demo-grave-${index + 1}`,
    name,
    born_at: isoDaysAgo(520 + index * 9),
    died_at: isoDaysAgo(30 + index * 5),
    cause,
    epitaph: generateEpitaph({
      name,
      cause,
      stack: [language],
      born_at: isoDaysAgo(520 + index * 9),
      died_at: isoDaysAgo(30 + index * 5),
    }),
    description: `A local demo grave seeded for the video walkthrough.`,
    stack: language,
    github_url: makeGithubUrl(name),
    github_repo_id: 60_000 + index,
    author_github: DEMO_USERNAME,
    slot_id: slotId,
    tier: 0,
    f_count: index % 6,
    last_commit_message: `chore: one last push before ${name} went quiet`,
  }
}

export function getDemoGraves(): GraveData[] {
  const slots = getAutoAssignableGraveSlots()
  const seeded = DEMO_GRAVE_NAMES.map((name, index) => makeGrave(name, index, slots[index].id))
  return [...seeded, ...addedGraves]
}

export function createDemoGrave({
  repo,
  cause,
  usedSlots,
  lastCommitMessage,
}: {
  repo: DeadRepo
  cause: string
  usedSlots: Set<number>
  lastCommitMessage?: string | null
}): GraveData {
  const freeSlot = getAutoAssignableGraveSlots().find((slot) => !usedSlots.has(slot.id))
  if (!freeSlot) {
    throw new Error('No demo grave slots available')
  }

  return {
    id: `demo-grave-new-${repo.id}-${Date.now()}`,
    name: repo.name,
    born_at: repo.created_at,
    died_at: repo.pushed_at,
    cause,
    epitaph: generateEpitaph({
      name: repo.name,
      cause,
      stack: repo.language ? [repo.language] : null,
      born_at: repo.created_at,
      died_at: repo.pushed_at,
    }),
    description: repo.description,
    stack: repo.language,
    github_url: repo.html_url,
    github_repo_id: repo.id,
    author_github: DEMO_USERNAME,
    slot_id: freeSlot.id,
    tier: freeSlot.type === 'grave_tall' ? 1 : 0,
    f_count: 0,
    last_commit_message: lastCommitMessage ?? undefined,
  }
}

export function addDemoGraveFromBody(body: Record<string, unknown>): GraveData {
  const repo: DeadRepo = {
    id: typeof body.github_repo_id === 'number' ? body.github_repo_id : Date.now(),
    name: typeof body.name === 'string' ? body.name : 'demo-unknown-repo',
    description: typeof body.description === 'string' ? body.description : null,
    html_url: typeof body.github_url === 'string' ? body.github_url : makeGithubUrl('demo-unknown-repo'),
    language: Array.isArray(body.stack) && typeof body.stack[0] === 'string' ? body.stack[0] : null,
    created_at: typeof body.born_at === 'string' ? body.born_at : isoDaysAgo(400),
    pushed_at: typeof body.died_at === 'string' ? body.died_at : isoDaysAgo(40),
  }
  const usedSlots = new Set(getDemoGraves().map((grave) => grave.slot_id))
  const grave = createDemoGrave({
    repo,
    cause: typeof body.cause === 'string' ? body.cause : 'Demo cause of death',
    usedSlots,
    lastCommitMessage: typeof body.last_commit_message === 'string' ? body.last_commit_message : null,
  })

  addedGraves.push(grave)
  return grave
}

export function createDemoCremation({
  repo,
  cause,
  lastCommitMessage,
}: {
  repo: DeadRepo
  cause: string
  lastCommitMessage?: string | null
}): CrematedData {
  return {
    id: nextCremationId++,
    name: repo.name,
    cause,
    author_github: DEMO_USERNAME,
    created_at: new Date().toISOString(),
    github_url: repo.html_url,
    last_commit_message: lastCommitMessage ?? null,
    source: 'github',
  }
}

export function addDemoCremationFromBody(body: Record<string, unknown>): CrematedData {
  const repo: DeadRepo = {
    id: Date.now(),
    name: typeof body.name === 'string' ? body.name : 'demo-unknown-repo',
    description: null,
    html_url: typeof body.github_url === 'string' ? body.github_url : makeGithubUrl('demo-unknown-repo'),
    language: null,
    created_at: isoDaysAgo(400),
    pushed_at: isoDaysAgo(40),
  }
  const cremation = createDemoCremation({
    repo,
    cause: typeof body.cause === 'string' ? body.cause : 'Demo cremation',
    lastCommitMessage: typeof body.last_commit_message === 'string' ? body.last_commit_message : null,
  })

  addedCremations.unshift(cremation)
  return cremation
}

export function getDemoCremations(): CrematedData[] {
  return addedCremations
}

export function resetDemoCemetery(): void {
  addedGraves = []
  addedCremations = []
  nextCremationId = 90_000
}
