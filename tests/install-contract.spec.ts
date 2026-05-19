import { expect, test } from '@playwright/test'
import * as contract from '../SKILL/install/install-contract.mjs'

test('exports the canonical installer contract', async () => {
  expect(contract.INSTALLER_CONTRACT).toEqual({
    repoUrl: 'https://github.com/azkian1/VibeCemetery.git',
    rawBaseUrl: 'https://vibecemetery.app/skills/bury/v1',
    publicBaseUrl: 'https://vibecemetery.app/skills/bury/v1',
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
    files: [
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
    ],
    completionLines: ['Restart Claude Code.', 'Then run /bury.'],
  })

  expect(contract.getInstallerSourceUrl('SKILL/commands/bury.md')).toBe(
    'https://vibecemetery.app/skills/bury/v1/SKILL/commands/bury.md',
  )
  expect(contract.getInstallerSourceUrl('SKILL/skills/bury-workflow/scripts/bury-helper.mjs')).toBe(
    'https://vibecemetery.app/skills/bury/v1/SKILL/skills/bury-workflow/scripts/bury-helper.mjs',
  )

  expect(contract.getInstallerCommand('macOS')).toBe(
    'curl -fsSL https://vibecemetery.app/skills/bury/v1/install.sh | bash',
  )
  expect(contract.getInstallerCommand('Windows')).toBe(
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://vibecemetery.app/skills/bury/v1/install.ps1 -UseBasicParsing | iex"',
  )
  expect(contract.getInstallerCommand('macOS')).not.toContain('raw.githubusercontent.com')
  expect(contract.getInstallerCommand('Windows')).not.toContain('raw.githubusercontent.com')
  expect(contract.INSTALLER_CONTRACT).not.toHaveProperty('installRef')
})
