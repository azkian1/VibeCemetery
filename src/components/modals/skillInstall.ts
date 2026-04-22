import { getInstallerCommand, INSTALLER_CONTRACT } from '../../../SKILL/install/install-contract.mjs'

type SkillPlatform = 'macOS' | 'Windows'

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
  getSkillInstallCommand,
  getSkillInstallDisplayCommand,
  getSkillInstallSecondaryLink,
  getSkillPlatformLabels,
}
export type { SkillPlatform }
