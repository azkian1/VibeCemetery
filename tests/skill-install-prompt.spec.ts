import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  GITLAWB_SKILL_SOURCE_CONTRACT,
  getHermesInstallPrompt,
  getHermesAgentInstallPath,
  getHermesSkillInstallCommand,
  getHermesSkillInstallLink,
  getHermesSkillInstallSource,
} from '../src/components/modals/skillInstall'
import { INSTALLER_CONTRACT } from '../SKILL/install/install-contract.mjs'

test('Hermes install prompt installs the GitLawb Agent Ash skill, not human /bury', () => {
  const prompt = getHermesInstallPrompt()

  expect(prompt).toContain('SKILL/skills/gitlawb')
  expect(prompt).toContain(getHermesSkillInstallLink())
  expect(prompt).toContain(getHermesSkillInstallSource())
  expect(prompt).toContain(getHermesSkillInstallCommand())
  expect(getHermesSkillInstallCommand()).toContain(GITLAWB_SKILL_SOURCE_CONTRACT.repoUrl)
  expect(getHermesSkillInstallCommand()).toContain(`ref=${GITLAWB_SKILL_SOURCE_CONTRACT.installRef}`)
  expect(getHermesSkillInstallCommand()).toContain(`#${GITLAWB_SKILL_SOURCE_CONTRACT.skillPath}`)
  expect(GITLAWB_SKILL_SOURCE_CONTRACT.installRef).toMatch(/^[0-9a-f]{40}$/)
  expect(GITLAWB_SKILL_SOURCE_CONTRACT.installRef).not.toBe(INSTALLER_CONTRACT.installRef)
  expect(prompt).toContain('~/.config/gitlawb/config.json')
  expect(prompt).toContain('agent_ash_token')
  expect(prompt).toContain('/api/agent-ashes')
  expect(prompt).toContain('Never call /api/cremated')
  expect(prompt).toContain('ash_')
  expect(prompt).not.toContain('hermes skills install gitlawb\n')
  expect(prompt).not.toContain('vibecemetery-bury')
  expect(prompt).not.toContain('vc_cli_')
  expect(prompt).not.toContain(INSTALLER_CONTRACT.installRef)
})

test('Skill install modal presents Hermes flow under one button', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'components', 'modals', 'SkillModal.tsx'), 'utf8')

  expect(source).toContain('Install skill')
  expect(source).not.toContain('Install /bury')
  expect(source).not.toContain('Open GitLawb skill source')
  expect(source).not.toContain('getHermesSkillInstallLink')
  expect(source).toContain('getHermesAgentInstallPath()')
  expect(source).not.toContain("handleCopy('hermes', getHermesInstallPrompt())")
})

test('Hermes agent install URL points to an agent-readable route', () => {
  expect(getHermesAgentInstallPath()).toBe('/agents/gitlawb')

  const pageSource = readFileSync(join(process.cwd(), 'src', 'app', 'agents', 'gitlawb', 'page.tsx'), 'utf8')
  expect(pageSource).toContain('Hermes / OpenClaw GitLawb Agent Ash install')
  expect(pageSource).toContain('getHermesInstallPrompt()')
  expect(pageSource).toContain('getHermesSkillInstallCommand()')
  expect(pageSource).toContain('/api/agent-ashes')
  expect(pageSource).toContain('Never use vc_cli_ human tokens')
})
