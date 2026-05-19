import { getInstallerCommand, INSTALLER_CONTRACT } from '../../../SKILL/install/install-contract.mjs'

type SkillPlatform = 'macOS' | 'Windows'

function getSkillAgentInstallPrompt() {
  return `Install the VibeCemetery /bury command for Claude Code, OpenCode, or Cursor from:
${INSTALLER_CONTRACT.publicBaseUrl}

Detect my operating system.
Run exactly one official versioned installer for my OS:

macOS/Linux:
${getInstallerCommand('macOS')}

Windows PowerShell:
${getInstallerCommand('Windows')}

Do not use a floating branch.
Do not run /bury yet.`
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
  return getSkillContentsUrl()
}

function getSkillContentsUrl() {
  return '/skills/bury/v1'
}

function getSkillPlatformLabels() {
  return INSTALLER_CONTRACT.platforms as SkillPlatform[]
}

export {
  detectSkillPlatform,
  getSkillAgentInstallPrompt,
  getSkillInstallCommand,
  getSkillInstallDisplayCommand,
  getSkillContentsUrl,
  getSkillInstallSecondaryLink,
  getSkillPlatformLabels,
}
export type { SkillPlatform }
