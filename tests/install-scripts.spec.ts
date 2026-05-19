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
  expect(script).toContain('manifest.json')
  expect(script).toContain('sha256')
  expect(script).toContain('VIBECEMETERY_INSTALL_RAW_BASE_URL')
  expect(script).toContain('raw_base="${raw_base%/}"')
  expect(script).toContain('localhost')
  expect(script).toContain('127.0.0.1')
  expect(script).toContain('SKILL/install/install-contract.mjs')
  expect(script).toContain('SKILL/install/install-runner.mjs')
  expect(script).toContain('https://vibecemetery.app/skills/bury/v1')
  expect(script).not.toContain('raw.githubusercontent.com')
  expect(script).not.toContain('VIBECEMETERY_INSTALL_REF')
  expect(script).toContain('node "$tmp_dir/install-runner.mjs" --manifest "$tmp_dir/manifest.json" "$@"')
})

test('powershell installer follows the shared contract', async () => {
  const script = readFileSync(powerShellScriptPath, 'utf8')

  expect(script).toContain("$ErrorActionPreference = 'Stop'")
  expect(script).toContain('install-contract.mjs')
  expect(script).toContain('install-runner.mjs')
  expect(script).toContain('manifest.json')
  expect(script).toContain('Get-FileHash')
  expect(script).toContain('VIBECEMETERY_INSTALL_RAW_BASE_URL')
  expect(script).toContain("$rawBase = $rawBase.TrimEnd('/')")
  expect(script).toContain('localhost')
  expect(script).toContain('127.0.0.1')
  expect(script).toContain('SKILL/install/install-contract.mjs')
  expect(script).toContain('SKILL/install/install-runner.mjs')
  expect(script).toContain('https://vibecemetery.app/skills/bury/v1')
  expect(script).not.toContain('raw.githubusercontent.com')
  expect(script).not.toContain('VIBECEMETERY_INSTALL_REF')
  expect(script).toContain("& node (Join-Path $tmpDir.FullName 'install-runner.mjs') --manifest (Join-Path $tmpDir.FullName 'manifest.json') @args")
})
