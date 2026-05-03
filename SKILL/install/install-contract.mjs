const owner = 'azkian1'
const repo = 'VibeCemetery'
const installRef = 'e7a04921dfee5af3880f603763bff20bfe672621'

const rawBaseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${installRef}`

const files = [
  {
    source: 'SKILL/commands/bury.md',
    destination: 'bury.md',
  },
  {
    source: 'SKILL/skills/bury-workflow/SKILL.md',
    destination: 'bury-workflow/SKILL.md',
  },
  {
    source: 'SKILL/skills/bury-workflow/scripts/bury-helper.mjs',
    destination: 'bury-workflow/scripts/bury-helper.mjs',
  },
  {
    source: 'SKILL/skills/bury-workflow/references/contract.md',
    destination: 'bury-workflow/references/contract.md',
  },
  {
    source: 'SKILL/skills/bury-workflow/references/security.md',
    destination: 'bury-workflow/references/security.md',
  },
  {
    source: 'SKILL/skills/bury-workflow/references/character.md',
    destination: 'bury-workflow/references/character.md',
  },
]

const INSTALLER_CONTRACT = {
  repoUrl: `https://github.com/${owner}/${repo}.git`,
  rawBaseUrl,
  installRef,
  platforms: ['macOS', 'Windows'],
  targets: {
    macOS: {
      commandsDir: '~/.claude/commands',
      skillsDir: '~/.claude/skills',
    },
    Windows: {
      commandsDir: '$HOME\\.claude\\commands',
      skillsDir: '$HOME\\.claude\\skills',
    },
  },
  files,
  completionLines: ['Restart Claude Code.', 'Then run /bury.'],
}

function getInstallerSourceUrl(sourcePath) {
  return `${rawBaseUrl}/${sourcePath}`
}

function getInstallerCommand(platform) {
  if (platform === 'macOS') {
    return `curl -fsSL ${getInstallerSourceUrl('SKILL/install/install-bury.sh')} | bash`
  }

  if (platform === 'Windows') {
    return `powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr ${getInstallerSourceUrl('SKILL/install/install-bury.ps1')} -UseBasicParsing | iex"`
  }

  throw new Error(`Unsupported installer platform: ${platform}`)
}

export { INSTALLER_CONTRACT, getInstallerCommand, getInstallerSourceUrl }
