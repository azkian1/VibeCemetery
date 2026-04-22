import { getInstallerCommand, INSTALLER_CONTRACT } from '../../../SKILL/install/install-contract.mjs'

type SkillPlatform = 'macOS' | 'Windows'

function detectSkillPlatform(platformValue?: string) {
  return platformValue?.toLowerCase().includes('win') ? 'Windows' : 'macOS'
}

function getSkillInstallCommand(platform: SkillPlatform) {
  return getInstallerCommand(platform)
}

function getSkillInstallDisplayCommand(platform: SkillPlatform) {
  if (platform === 'macOS') {
    return `curl -fsSL \\
  https://raw.githubusercontent.com/azkian1/VibeCemetery/master/SKILL/install/install-bury.sh | bash`
  }

  return `powershell -NoProfile -ExecutionPolicy Bypass -Command \
  "iwr https://raw.githubusercontent.com/azkian1/VibeCemetery/master/SKILL/install/install-bury.ps1 -UseBasicParsing | iex"`
}

function getSkillInstallSecondaryLink() {
  return `${INSTALLER_CONTRACT.repoUrl.replace(/\.git$/, '')}/blob/master/README.md#command-cli`
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
