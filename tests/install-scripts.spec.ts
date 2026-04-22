import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const root = process.cwd().replace(/\\/g, '/')
const shellScriptPath = `${root}/SKILL/install/install-bury.sh`
const powerShellScriptPath = `${root}/SKILL/install/install-bury.ps1`

test('shell installer follows the shared contract', async () => {
  const script = readFileSync(shellScriptPath, 'utf8')

  expect(script).toContain('set -euo pipefail')
  expect(script).toContain('install-contract.mjs')
  expect(script).toContain('install-runner.mjs')
  expect(script).toContain('raw.githubusercontent.com/azkian1/VibeCemetery/master')
  expect(script).toContain('node "$tmp_dir/install-runner.mjs" "$@"')
})

test('powershell installer follows the shared contract', async () => {
  const script = readFileSync(powerShellScriptPath, 'utf8')

  expect(script).toContain("$ErrorActionPreference = 'Stop'")
  expect(script).toContain('install-contract.mjs')
  expect(script).toContain('install-runner.mjs')
  expect(script).toContain('raw.githubusercontent.com/azkian1/VibeCemetery/master')
  expect(script).toContain("& node (Join-Path $tmpDir.FullName 'install-runner.mjs') @args")
})
