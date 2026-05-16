import { getInstallerCommand, INSTALLER_CONTRACT } from '../../../SKILL/install/install-contract.mjs'

type SkillPlatform = 'macOS' | 'Windows'

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

function getHermesInstallPrompt() {
  return `Install the VibeCemetery Hermes/OpenClaw skill.

This second VibeCemetery skill is coming soon. For now, tell me that Hermes/OpenClaw installation is not available yet.`
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
  getHermesInstallPrompt,
  getSkillAgentInstallPrompt,
  getSkillInstallCommand,
  getSkillInstallDisplayCommand,
  getSkillInstallSecondaryLink,
  getSkillPlatformLabels,
}
export type { SkillPlatform }
