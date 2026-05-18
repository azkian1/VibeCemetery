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
import { INSTALLER_CONTRACT } from '../SKILL/install/install-contract.mjs'

test('Agent Ash install contract points to external GitLawb setup and VibeCemetery skill only', () => {
  const contract = getAgentAshInstallContract()

  expect(contract).toContain('## Task')
  expect(contract).toContain('## Official GitLawb Setup')
  expect(contract).toContain('## Install VibeCemetery Agent Ash Skill')
  expect(contract).toContain('## Config')
  expect(contract).toContain('## Allowed Actions')
  expect(contract).toContain('## Forbidden Actions')
  expect(contract).toContain('## Submission Endpoint')
  expect(contract).toContain(GITLAWB_OFFICIAL_SETUP_URL)
  expect(contract).toContain('If GitLawb is not installed or configured, go to https://gitlawb.com/.')
  expect(contract).toContain('Do not install GitLawb from VibeCemetery.')
  expect(contract).toContain('VibeCemetery only provides the Agent Ash skill.')
  expect(contract).toContain('SKILL/skills/gitlawb')
  expect(contract).toContain(getAgentAshSkillInstallLink())
  expect(contract).toContain(getAgentAshSkillInstallSource())
  expect(contract).toContain(getAgentAshSkillInstallCommand())
  expect(getAgentAshSkillInstallCommand()).toContain(AGENT_ASH_SKILL_SOURCE_CONTRACT.repoUrl)
  expect(getAgentAshSkillInstallCommand()).toContain(`ref=${AGENT_ASH_SKILL_SOURCE_CONTRACT.installRef}`)
  expect(getAgentAshSkillInstallCommand()).toContain(`#${AGENT_ASH_SKILL_SOURCE_CONTRACT.skillPath}`)
  expect(AGENT_ASH_SKILL_SOURCE_CONTRACT.installRef).toMatch(/^[0-9a-f]{40}$/)
  expect(AGENT_ASH_SKILL_SOURCE_CONTRACT.installRef).toBe('5ebae02499c26ab4dcc9ce6dda635bc9474d6b7b')
  expect(AGENT_ASH_SKILL_SOURCE_CONTRACT.installRef).not.toBe(INSTALLER_CONTRACT.installRef)
  expect(AGENT_ASH_SKILL_SOURCE_CONTRACT.skillPath).toBe('SKILL/skills/gitlawb')
  expect(contract).toContain('~/.config/gitlawb/config.json')
  expect(contract).toContain('agent_ash_token')
  expect(contract).toContain('ash_')
  expect(contract).not.toMatch(/\\p{Script=Cyrillic}/)
  expect(contract).toContain('Use the GitLawb config created by the official GitLawb setup.')
  expect(contract).toContain('Do not create or rewrite GitLawb node config from VibeCemetery instructions.')
  expect(contract).not.toContain('"gitlawb_node_url"')
  expect(contract).not.toContain('"agent_did"')
  expect(contract.slice(contract.indexOf('Expected config shape:'), contract.indexOf('agent_ash_token is an authorization credential'))).not.toContain('vc_cli_')
  expect(contract).toContain('agent_ash_token is an authorization credential, not ERC-20, points, rewards, or SOUL.')
  expect(contract).toContain('If no real ash_ token is available, install and prepare only; do not submit.')
  expect(contract).toContain('/api/agent-ashes')
  expect(contract).toContain('Never call /api/cremated')
  expect(contract).toContain('Do not request or generate vc_cli_* human CLI credentials for agents.')
  expect(contract).not.toContain('hermes skills install gitlawb\n')
  expect(contract).not.toContain('vibecemetery-bury')
  expect(contract).not.toContain(INSTALLER_CONTRACT.installRef)
})

test('Skill install modal is only for the human CLI skill', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'components', 'modals', 'SkillModal.tsx'), 'utf8')

  expect(source).toContain('Install skill')
  expect(source).toContain('maxWidth={560}')
  expect(source).toContain('CLI SKILL')
  expect(source).toContain('/bury')
  expect(source).not.toContain('Hermes')
  expect(source).not.toContain('OpenClaw')
  expect(source).not.toContain('GitLawb')
  expect(source).not.toContain('Agent Ash')
  expect(source).not.toContain('getAgentAshInstallPath')
  expect(source).not.toContain('COPY AGENT')
  expect(source).not.toContain("handleCopy('hermes', getAgentAshInstallContract())")
  expect(source).not.toContain("handleCopy('hermes', getHermesInstallPrompt())")
})

test('CTA buttons expose BURY, CLI SKILL, and AGENT SKILL separately', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'components', 'hud', 'CTAButtons.tsx'), 'utf8')

  expect(source).toContain('BURY')
  expect(source).toContain('CLI SKILL')
  expect(source).toContain('AGENT SKILL')
  expect(source).toContain("open('skill')")
  expect(source).toContain("open('agentSkill')")
  expect(source).toContain('0 0 18px')
})

test('Agent skill modal owns the Hermes and GitLawb setup copy', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'components', 'modals', 'AgentSkillModal.tsx'), 'utf8')

  expect(source).toContain('AGENT SKILL')
  expect(source).toContain('maxWidth={560}')
  expect(source).toContain('Hermes')
  expect(source).toContain('GitLawb')
  expect(source).toContain('GitHub-like layer for agent loops')
  expect(source).toContain('COPY AGENT URL')
  expect(source).toContain('getAgentAshInstallPath')
  expect(source).toContain('Not the human /bury CLI')
})

test('Hermes agent install URL points to an agent-readable route', () => {
  expect(getAgentAshInstallPath()).toBe('/agents/gitlawb')

  const pageSource = readFileSync(join(process.cwd(), 'src', 'app', 'agents', 'gitlawb', 'page.tsx'), 'utf8')
  expect(pageSource).toContain('Hermes / OpenClaw GitLawb Agent Ash install')
  expect(pageSource).toContain('getAgentAshInstallContract()')
  expect(pageSource).toContain('getAgentAshSkillInstallCommand()')
  expect(pageSource).toContain('https://gitlawb.com/')
  expect(pageSource).toContain('VibeCemetery does not install GitLawb')
  expect(pageSource).toContain('/api/agent-ashes')
  expect(pageSource).not.toContain('vc_cli_')
  expect(pageSource).not.toContain('vibecemetery-bury')
  expect(pageSource).not.toContain('@/components/modals/skillInstall')
})

test('Agent Ash install module is separated from the human /bury installer contract', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'lib', 'agent-ash-install.ts'), 'utf8')

  expect(source).not.toContain('INSTALLER_CONTRACT')
  expect(source).not.toContain('install-contract.mjs')
})
