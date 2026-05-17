import { getInstallerCommand, INSTALLER_CONTRACT } from '../../../SKILL/install/install-contract.mjs'

type SkillPlatform = 'macOS' | 'Windows'

const GITLAWB_SKILL_SOURCE_CONTRACT = {
  repoUrl: 'https://github.com/azkian1/VibeCemetery.git',
  installRef: '97538aba6566411d7361b7c12fcc502a17b997dc',
  skillPath: 'SKILL/skills/gitlawb',
}

function getHermesAgentInstallPath() {
  return '/agents/gitlawb'
}

function getRepoWebUrl(repoUrl: string) {
  return repoUrl.replace(/\.git$/, '')
}

function getHermesSkillInstallSource() {
  const { repoUrl, installRef, skillPath } = GITLAWB_SKILL_SOURCE_CONTRACT
  return `${repoUrl}?ref=${installRef}#${skillPath}`
}

function getSkillAgentInstallPrompt() {
  return `Install the VibeCemetery /bury command for Claude Code, OpenCode, or Cursor from:
https://github.com/azkian1/VibeCemetery

Detect my operating system.
Run exactly one official pinned installer for my OS:

macOS/Linux:
${getInstallerCommand('macOS')}

Windows PowerShell:
${getInstallerCommand('Windows')}

Do not use a floating branch.
Do not run /bury yet.`
}

function getHermesSkillInstallLink() {
  const { repoUrl, installRef, skillPath } = GITLAWB_SKILL_SOURCE_CONTRACT
  return `${getRepoWebUrl(repoUrl)}/tree/${installRef}/${skillPath}`
}

function getHermesSkillInstallCommand() {
  return `hermes skills install '${getHermesSkillInstallSource()}'`
}

function getHermesInstallPrompt() {
  return `Install the Hermes / OpenClaw VibeCemetery Agent Ashes skill for GitLawb.

Direct skill source link:
${getHermesSkillInstallLink()}

Source path:
${GITLAWB_SKILL_SOURCE_CONTRACT.skillPath}

Pinned source:
${getHermesSkillInstallSource()}

Install the skill:
${getHermesSkillInstallCommand()}

Install target:
~/.hermes/skills/gitlawb

Create config:
~/.config/gitlawb/config.json

Expected config shape:
{
  "gitlawb_node_url": "https://node.gitlawb.com",
  "agent_name": "hermes",
  "agent_did": "did:key:z6MkAgentHermes",
  "agent_ash_token": "ash_xxxxxxxxxxxxxxxxx",
  "vc_url": "https://vibecemetery.app"
}

If agent_ash_token is missing, ask the operator to issue an ash_ token. Do not use human CLI tokens.

After installation, read SKILL.md inside the skill and follow it strictly.

Flow:
- one-shot: record death for an explicitly requested GitLawb repo DID;
- watchlist: scan ~/.config/gitlawb/watchlist.json, report candidates, wait for explicit human approval;
- submit verified Ash only to https://vibecemetery.app/api/agent-ashes.

Never create graves. Never award SOUL. Never call /api/cremated.`
}

function detectSkillPlatform(platformValue?: string) {
  return platformValue?.toLowerCase().includes('win') ? 'Windows' : 'macOS'
}

function getSkillInstallCommand(platform: SkillPlatform) {
  return getInstallerCommand(platform)
}

function getSkillInstallDisplayCommand(platform: SkillPlatform) {
  return getInstallerCommand(platform)
}

function getSkillInstallSecondaryLink() {
  return `${INSTALLER_CONTRACT.repoUrl.replace(/\.git$/, '')}/blob/${INSTALLER_CONTRACT.installRef}/README.md#command-cli`
}

function getSkillPlatformLabels() {
  return INSTALLER_CONTRACT.platforms as SkillPlatform[]
}

export {
  detectSkillPlatform,
  GITLAWB_SKILL_SOURCE_CONTRACT,
  getHermesAgentInstallPath,
  getHermesInstallPrompt,
  getHermesSkillInstallCommand,
  getHermesSkillInstallLink,
  getHermesSkillInstallSource,
  getSkillAgentInstallPrompt,
  getSkillInstallCommand,
  getSkillInstallDisplayCommand,
  getSkillInstallSecondaryLink,
  getSkillPlatformLabels,
}
export type { SkillPlatform }
