import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const root = process.cwd().replace(/\\/g, '/')
const shellScriptPath = `${root}/SKILL/install/install-bury.sh`
const powerShellScriptPath = `${root}/SKILL/install/install-bury.ps1`

test('shell installer follows the shared contract', async () => {
  const script = readFileSync(shellScriptPath, 'utf8')
  const installRef = 'ba4d1a0765b81d071b2824e92460687537786dd6'

  expect(script).toContain('set -euo pipefail')
  expect(script).toContain('install-contract.mjs')
  expect(script).toContain('install-runner.mjs')
  expect(script).toContain(`VIBECEMETERY_INSTALL_REF:-${installRef}`)
  expect(script).toContain('raw.githubusercontent.com/azkian1/VibeCemetery/${install_ref}')
  expect(script).toContain('node "$tmp_dir/install-runner.mjs" "$@"')
})

test('powershell installer follows the shared contract', async () => {
  const script = readFileSync(powerShellScriptPath, 'utf8')
  const installRef = 'ba4d1a0765b81d071b2824e92460687537786dd6'

  expect(script).toContain("$ErrorActionPreference = 'Stop'")
  expect(script).toContain('install-contract.mjs')
  expect(script).toContain('install-runner.mjs')
  expect(script).toContain(`else { '${installRef}' }`)
  expect(script).toContain('raw.githubusercontent.com/azkian1/VibeCemetery/$installRef')
  expect(script).toContain("& node (Join-Path $tmpDir.FullName 'install-runner.mjs') @args")
})
