import { expect, test } from '@playwright/test'

const contractPath = `${process.cwd().replace(/\\/g, '/')}/SKILL/install/install-contract.mjs`

async function loadContract() {
  return await import(`file:///${contractPath}`)
}

test('exports the canonical installer contract', async () => {
  const contract = await loadContract()
  const installRef = 'ba4d1a0765b81d071b2824e92460687537786dd6'

  expect(contract.INSTALLER_CONTRACT).toEqual({
    repoUrl: 'https://github.com/azkian1/VibeCemetery.git',
    rawBaseUrl: `https://raw.githubusercontent.com/azkian1/VibeCemetery/${installRef}`,
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
    `https://raw.githubusercontent.com/azkian1/VibeCemetery/${installRef}/SKILL/commands/bury.md`,
  )
  expect(contract.getInstallerSourceUrl('SKILL/skills/bury-workflow/scripts/bury-helper.mjs')).toBe(
    `https://raw.githubusercontent.com/azkian1/VibeCemetery/${installRef}/SKILL/skills/bury-workflow/scripts/bury-helper.mjs`,
  )

  expect(contract.getInstallerCommand('macOS')).toBe(
    `curl -fsSL https://raw.githubusercontent.com/azkian1/VibeCemetery/${installRef}/SKILL/install/install-bury.sh | VIBECEMETERY_INSTALL_REF=${installRef} bash`,
  )
  expect(contract.getInstallerCommand('Windows')).toBe(
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:VIBECEMETERY_INSTALL_REF='${installRef}'; iwr https://raw.githubusercontent.com/azkian1/VibeCemetery/${installRef}/SKILL/install/install-bury.ps1 -UseBasicParsing | iex"`,
  )
})
