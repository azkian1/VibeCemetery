import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { INSTALLER_CONTRACT } from '../SKILL/install/install-contract.mjs'

const root = process.cwd().replace(/\\/g, '/')
const shellScriptPath = `${root}/SKILL/install/install-bury.sh`
const powerShellScriptPath = `${root}/SKILL/install/install-bury.ps1`

function readArchivedPayloadSha256() {
  const sources = [
    'SKILL/install/install-contract.mjs',
    'SKILL/install/install-runner.mjs',
    ...INSTALLER_CONTRACT.files.map((file: { source: string }) => file.source),
  ]
  const files = sources.map(source => ({
    source,
    sha256: createHash('sha256').update(readFileSync(source, 'utf8')).digest('hex'),
  }))
  return createHash('sha256').update(JSON.stringify({ files })).digest('hex')
}

test('shell installer follows the shared contract', async () => {
  const script = readFileSync(shellScriptPath, 'utf8')

  expect(script).toContain('set -euo pipefail')
  expect(script).toContain('install-contract.mjs')
  expect(script).toContain('install-runner.mjs')
  expect(script).toContain('manifest.json')
  expect(script).toContain('sha256')
  expect(script).toContain('EXPECTED_MANIFEST_PAYLOAD_SHA256=')
  expect(script).toContain('payload_sha256')
  expect(script).toContain('computedPayloadSha256')
  expect(script).toContain('JSON.stringify({ files: payloadFiles })')
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

  const pinnedHash = script.match(/EXPECTED_MANIFEST_PAYLOAD_SHA256="([a-f0-9]{64})"/)?.[1]
  expect(pinnedHash).toBe(readArchivedPayloadSha256())
})

test('powershell installer follows the shared contract', async () => {
  const script = readFileSync(powerShellScriptPath, 'utf8')

  expect(script).toContain("$ErrorActionPreference = 'Stop'")
  expect(script).toContain('install-contract.mjs')
  expect(script).toContain('install-runner.mjs')
  expect(script).toContain('manifest.json')
  expect(script).toContain('Get-FileHash')
  expect(script).toContain('$expectedManifestPayloadSha256 =')
  expect(script).toContain('payload_sha256')
  expect(script).toContain('computedPayloadSha256')
  expect(script).toContain('JSON.stringify({ files: payloadFiles })')
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

  const pinnedHash = script.match(/\$expectedManifestPayloadSha256 = '([a-f0-9]{64})'/)?.[1]
  expect(pinnedHash).toBe(readArchivedPayloadSha256())
})
