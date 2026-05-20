import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { GET } from '../src/app/agents/gitlawb/v1/[...path]/route'

const root = process.cwd().replace(/\\/g, '/')
const shellScriptPath = `${root}/SKILL/agent-install/install-gitlawb.sh`
const powerShellScriptPath = `${root}/SKILL/agent-install/install-gitlawb.ps1`

async function readManifestPayloadSha256() {
  const response = await GET(new Request('https://vibecemetery.app/agents/gitlawb/v1/manifest.json'), {
    params: Promise.resolve({ path: ['manifest.json'] }),
  })
  const body = await response.json()
  return body.payload_sha256
}

test('shell GitLawb installer follows the Agent Ash contract', async () => {
  const script = readFileSync(shellScriptPath, 'utf8')

  expect(script).toContain('set -euo pipefail')
  expect(script).toContain('install-gitlawb-runner.mjs')
  expect(script).toContain('manifest.json')
  expect(script).toContain('EXPECTED_MANIFEST_PAYLOAD_SHA256=')
  expect(script).toContain('payload_sha256')
  expect(script).toContain('computedPayloadSha256')
  expect(script).toContain('JSON.stringify({ files: payloadFiles })')
  expect(script).toContain('VIBECEMETERY_AGENT_SKILL_INSTALL_BASE_URL')
  expect(script).toContain('raw_base="${raw_base%/}"')
  expect(script).toContain('localhost')
  expect(script).toContain('127.0.0.1')
  expect(script).toContain('SKILL/agent-install/install-gitlawb-runner.mjs')
  expect(script).toContain('https://vibecemetery.app/agents/gitlawb/v1')
  expect(script).not.toContain('raw.githubusercontent.com')
  expect(script).not.toContain('VIBECEMETERY_INSTALL_REF')
  expect(script).toContain('node "$tmp_dir/install-gitlawb-runner.mjs" --manifest "$tmp_dir/manifest.json" "$@"')

  const pinnedHash = script.match(/EXPECTED_MANIFEST_PAYLOAD_SHA256="([a-f0-9]{64})"/)?.[1]
  expect(pinnedHash).toBe(await readManifestPayloadSha256())
})

test('PowerShell GitLawb installer follows the Agent Ash contract', async () => {
  const script = readFileSync(powerShellScriptPath, 'utf8')

  expect(script).toContain("$ErrorActionPreference = 'Stop'")
  expect(script).toContain('install-gitlawb-runner.mjs')
  expect(script).toContain('manifest.json')
  expect(script).toContain('Get-FileHash')
  expect(script).toContain('$expectedManifestPayloadSha256 =')
  expect(script).toContain('payload_sha256')
  expect(script).toContain('computedPayloadSha256')
  expect(script).toContain('JSON.stringify({ files: payloadFiles })')
  expect(script).toContain('VIBECEMETERY_AGENT_SKILL_INSTALL_BASE_URL')
  expect(script).toContain("$rawBase = $rawBase.TrimEnd('/')")
  expect(script).toContain('localhost')
  expect(script).toContain('127.0.0.1')
  expect(script).toContain('SKILL/agent-install/install-gitlawb-runner.mjs')
  expect(script).toContain('https://vibecemetery.app/agents/gitlawb/v1')
  expect(script).not.toContain('raw.githubusercontent.com')
  expect(script).not.toContain('VIBECEMETERY_INSTALL_REF')
  expect(script).toContain("& node (Join-Path $tmpDir.FullName 'install-gitlawb-runner.mjs') --manifest (Join-Path $tmpDir.FullName 'manifest.json') @args")

  const pinnedHash = script.match(/\$expectedManifestPayloadSha256 = '([a-f0-9]{64})'/)?.[1]
  expect(pinnedHash).toBe(await readManifestPayloadSha256())
})
