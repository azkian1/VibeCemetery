import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  AGENT_ASH_SKILL_SOURCE_CONTRACT,
  GITLAWB_OFFICIAL_SETUP_URL,
  getAgentAshInstallContract,
  getAgentAshInstallPath,
  getAgentAshSkillInstallCommand,
  getAgentAshSkillInstallLink,
  getAgentAshSkillInstallSource,
} from '../src/lib/agent-ash-install'

test('paused Agent Ash install contract points to archived GitLawb setup and VibeCemetery skill only', () => {
  const contract = getAgentAshInstallContract()

  expect(contract).toContain('## Task')
  expect(contract).toContain('## Status')
  expect(contract).toContain('The VibeCemetery GitLawb / Agent Ash layer is paused')
  expect(contract).toContain('Do not install or activate this skill for normal VibeCemetery use')
  expect(contract).toContain('## Official GitLawb Setup')
  expect(contract).toContain('## Archived VibeCemetery Agent Skill for GitLawb')
  expect(contract).toContain('## Config')
  expect(contract).toContain('## Archived Allowed Actions If Revived')
  expect(contract).toContain('## Forbidden Actions')
  expect(contract).toContain('## Archived Submission Endpoint')
  expect(contract).toContain(GITLAWB_OFFICIAL_SETUP_URL)
  expect(contract).toContain('If GitLawb is not installed or configured, go to https://gitlawb.com/.')
  expect(contract).toContain('Do not install GitLawb from VibeCemetery.')
  expect(contract).toContain('VibeCemetery only provides the VibeCemetery Agent Skill for GitLawb.')
  expect(contract).toContain('https://vibecemetery.app/agents/gitlawb/v1')
  expect(contract).toContain('curl -fsSL https://vibecemetery.app/agents/gitlawb/v1/install.sh | bash')
  expect(contract).toContain('powershell -NoProfile -ExecutionPolicy Bypass -Command')
  expect(contract).toContain(getAgentAshSkillInstallLink())
  expect(contract).toContain(getAgentAshSkillInstallSource())
  expect(contract).toContain(getAgentAshSkillInstallCommand())
  expect(getAgentAshSkillInstallCommand()).toBe('curl -fsSL https://vibecemetery.app/agents/gitlawb/v1/install.sh | bash')
  expect(AGENT_ASH_SKILL_SOURCE_CONTRACT.siteBaseUrl).toBe('https://vibecemetery.app/agents/gitlawb/v1')
  expect(AGENT_ASH_SKILL_SOURCE_CONTRACT.skillPath).toBe('~/.hermes/skills/gitlawb')
  expect(contract).toContain('~/.config/gitlawb/config.json')
  expect(contract).toContain('agent_ash_token')
  expect(contract).toContain('ash_')
  expect(contract).toContain('POST https://vibecemetery.app/api/agent-ash/link/start')
  expect(contract).toContain('open approve_url')
  expect(contract).toContain('GET https://vibecemetery.app/api/agent-ash/link/status?link_id=...')
  expect(contract).not.toMatch(/ash_[A-Za-z0-9._~-]{16,}/)
  expect(contract).not.toMatch(/[\u0400-\u04FF]/)
  expect(contract).toContain('Use the GitLawb config created by the official GitLawb setup.')
  expect(contract).toContain('Do not create or rewrite GitLawb node config from VibeCemetery instructions.')
  expect(contract).toContain('If revived, writes must use delegated ash_ tokens')
  expect(contract).toContain('Delegated mode treats GitLawb as read-only proof')
  expect(contract).toContain('Do not try to delete, archive, label, or mark the GitLawb repo dead')
  expect(contract).toContain('Those native fields are future-only and are not required for delegated submit-delegated')
  expect(contract).toContain('submit-delegated: record Agent Ash')
  expect(contract).toContain('Archived delegated write commands:')
  expect(contract).not.toContain('optional delegated legacy fallback')
  expect(contract).not.toContain('Agent-native is the default')
  expect(contract).not.toContain('After GitLawb-side death is visible')
  expect(contract).not.toContain('"gitlawb_node_url"')
  expect(contract).not.toContain('"agent_did"')
  expect(contract.slice(contract.indexOf('Expected config shape:'), contract.indexOf('agent_ash_token is an authorization credential'))).not.toContain('vc_cli_')
  expect(contract).toContain('agent_ash_token is an authorization credential, not ERC-20, points, rewards, or tokenomics value.')
  expect(contract).not.toContain('If no real ash_ token is available')
  expect(contract).toContain('Obtain the token only through browser-approved Agent Ash connect.')
  expect(contract).toContain('/api/agent-ashes')
  expect(contract).toContain('Do not request or generate vc_cli_* human CLI credentials for agents.')
  expect(contract).not.toContain('hermes skills install gitlawb\n')
  expect(contract).not.toContain('87222203d7d7c5b55e8694eaf2de5ea9811872c9')
  expect(contract).not.toContain('vibecemetery-bury')
})

test('legacy skill modal points to agent instructions without installation or copy actions', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/modals/SkillModal.tsx'), 'utf8')
  expect(source).toContain('AGENT_INSTRUCTIONS_PATH')
  expect(source).toContain('vibecemetery.app')
  expect(source).not.toContain('clipboard')
  expect(source).not.toContain('getSkillInstallCommand')
  expect(source).not.toContain('Install skill')
  expect(source).not.toContain('if (isMobile) return null')
})

test('CTA offers burial without skill installation', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'components', 'hud', 'CTAButtons.tsx'), 'utf8')

  expect(source).toContain('Bury')
  expect(source).toContain("open('bury', { flowMode: 'cemetery-shovel' })")
  expect(source).not.toContain("open('skill')")
  expect(source).not.toContain("open('agentSkill')")
  expect(source).toContain('>BURY</button>')
})

test('Agent skill modal is paused legacy copy', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'components', 'modals', 'AgentSkillModal.tsx'), 'utf8')

  expect(source).toContain('PAUSED AGENT SKILL')
  expect(source).toContain('maxWidth={560}')
  expect(source).toContain('GitLawb / Agent Ash experiment is paused')
  expect(source).toContain('Archived Hermes / OpenClaw Agent Ashes')
  expect(source).toContain('COPY ARCHIVE URL')
  expect(source).toContain('getAgentAshInstallPath')
  expect(source).toContain('For local projects, follow the instructions for AI agents.')
})

test('Hermes agent install URL points to an agent-readable route', () => {
  expect(getAgentAshInstallPath()).toBe('/agents/gitlawb')

  const pageSource = readFileSync(join(process.cwd(), 'src', 'app', 'agents', 'gitlawb', 'page.tsx'), 'utf8')
  expect(pageSource).toContain('Paused VibeCemetery Agent Skill for GitLawb')
  expect(pageSource).toContain('The GitLawb / Agent Ash experiment is paused')
  expect(pageSource).toContain('getAgentAshInstallContract()')
  expect(pageSource).toContain('getAgentAshSkillInstallCommand()')
  expect(pageSource).toContain('getAgentAshPowerShellInstallCommand()')
  expect(pageSource).toContain('/agents/gitlawb/v1')
  expect(pageSource).toContain('https://gitlawb.com/')
  expect(pageSource).toContain('Do not install this archived Agent Skill for normal VibeCemetery use')
  expect(pageSource).toContain('VibeCemetery does not install GitLawb')
  expect(pageSource).toContain('/api/agent-ashes')
  expect(pageSource).not.toContain('vc_cli_')
  expect(pageSource).not.toContain('vibecemetery-bury')
  expect(pageSource).not.toContain('@/components/modals/skillInstall')

  const v1PageSource = readFileSync(join(process.cwd(), 'src', 'app', 'agents', 'gitlawb', 'v1', 'page.tsx'), 'utf8')
  expect(v1PageSource).toContain('Paused VibeCemetery Agent Skill for GitLawb')
  expect(v1PageSource).toContain('Do not install this archived skill for normal VibeCemetery use')
})

test('Agent Ash install module is separated from the human /bury installer contract', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'lib', 'agent-ash-install.ts'), 'utf8')

  expect(source).not.toContain('INSTALLER_CONTRACT')
  expect(source).not.toContain('install-contract.mjs')
})
