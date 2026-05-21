import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { GET } from '../src/app/agents/gitlawb/v1/[...path]/route'

async function readResponseText(path: string[]) {
  const response = await GET(new Request(`https://vibecemetery.app/agents/gitlawb/v1/${path.join('/')}`), {
    params: Promise.resolve({ path }),
  })
  return { response, text: await response.text() }
}

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

function canonicalPayloadHash(files: Array<{ source: string; sha256: string }>) {
  const payloadFiles = files
    .filter((file) => !['SKILL/agent-install/install-gitlawb.sh', 'SKILL/agent-install/install-gitlawb.ps1'].includes(file.source))
    .map((file) => ({ source: file.source, sha256: file.sha256 }))
  return sha256(JSON.stringify({ files: payloadFiles }))
}

test('/agents/gitlawb/v1 page renders source mirror and security sections', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'app', 'agents', 'gitlawb', 'v1', 'page.tsx'), 'utf8')

  expect(source).toContain('VibeCemetery Agent Skill for GitLawb')
  expect(source).toContain('https://gitlawb.com/')
  expect(source).toContain('curl -fsSL https://vibecemetery.app/agents/gitlawb/v1/install.sh | bash')
  expect(source).toContain('powershell -NoProfile -ExecutionPolicy Bypass -Command')
  expect(source).toContain('`${baseUrl}/manifest.json`')
  expect(source).toContain('/agents/gitlawb/v1/files/skills/gitlawb/SKILL.md')
  expect(source).toContain('/agents/gitlawb/v1/files/skills/gitlawb/scripts/gitlawb-helper.mjs')
  expect(source).toContain('Security boundaries')
  expect(source).toContain('VibeCemetery does not install GitLawb')
})

test('Next tracing includes site-served GitLawb agent skill files', () => {
  const source = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

  expect(source).toContain('outputFileTracingIncludes')
  expect(source).toContain("'/agents/gitlawb/v1/\\\\[\\\\.\\\\.\\\\.path\\\\]'")
  expect(source).toContain("'./SKILL/skills/gitlawb/**/*'")
  expect(source).toContain("'./SKILL/agent-install/install-gitlawb.sh'")
  expect(source).toContain("'./SKILL/agent-install/install-gitlawb.ps1'")
  expect(source).toContain("'./SKILL/agent-install/install-gitlawb-runner.mjs'")
})

test('agent skill distribution route serves manifest', async () => {
  const shell = await readResponseText(['install.sh'])
  expect(shell.response.status).toBe(200)
  expect(shell.response.headers.get('content-type')).toContain('text/x-shellscript')
  expect(shell.response.headers.get('cache-control')).toContain('no-store')
  expect(shell.text).toContain('#!/usr/bin/env bash')
  expect(shell.text).toContain('https://vibecemetery.app/agents/gitlawb/v1')

  const powershell = await readResponseText(['install.ps1'])
  expect(powershell.response.status).toBe(200)
  expect(powershell.response.headers.get('content-type')).toContain('text/plain')
  expect(powershell.response.headers.get('cache-control')).toContain('no-store')
  expect(powershell.text).toContain("$ErrorActionPreference = 'Stop'")
  expect(powershell.text).toContain('https://vibecemetery.app/agents/gitlawb/v1')

  const manifest = await readResponseText(['manifest.json'])

  expect(manifest.response.status).toBe(200)
  expect(manifest.response.headers.get('content-type')).toContain('application/json')
  expect(manifest.response.headers.get('cache-control')).toContain('no-store')
  expect(JSON.parse(manifest.text)).toMatchObject({
    name: 'gitlawb',
    version: '1.0.0',
    kind: 'agent-ash-skill',
    base_url: 'https://vibecemetery.app/agents/gitlawb/v1',
    target_root: '~/.hermes/skills/gitlawb',
  })
})

test('agent skill manifest includes exact source file URLs and hashes', async () => {
  const manifest = await readResponseText(['manifest.json'])
  const body = JSON.parse(manifest.text) as {
    payload_sha256: string
    files: Array<{ url: string; target: string; source: string; sha256: string }>
  }
  const expectedUrls = [
    '/agents/gitlawb/v1/install.sh',
    '/agents/gitlawb/v1/install.ps1',
    '/agents/gitlawb/v1/SKILL/agent-install/install-gitlawb-runner.mjs',
    '/agents/gitlawb/v1/files/skills/gitlawb/SKILL.md',
    '/agents/gitlawb/v1/files/skills/gitlawb/scripts/gitlawb-helper.mjs',
  ]

  expect(body.files.map((file) => file.url)).toEqual(expectedUrls)
  expect(body.files.map((file) => file.source)).toEqual([
    'SKILL/agent-install/install-gitlawb.sh',
    'SKILL/agent-install/install-gitlawb.ps1',
    'SKILL/agent-install/install-gitlawb-runner.mjs',
    'SKILL/skills/gitlawb/SKILL.md',
    'SKILL/skills/gitlawb/scripts/gitlawb-helper.mjs',
  ])
  expect(body.files.map((file) => file.target)).toEqual([undefined, undefined, undefined, 'SKILL.md', 'scripts/gitlawb-helper.mjs'])
  expect(body.payload_sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(body.payload_sha256).toBe(canonicalPayloadHash(body.files))

  for (const file of body.files) {
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/)

    const routePath = file.url.replace('/agents/gitlawb/v1/', '').split('/')
    const served = await readResponseText(routePath)
    expect(served.response.status).toBe(200)
    expect(served.response.headers.get('cache-control')).toContain('no-store')
    expect(sha256(served.text)).toBe(file.sha256)
  }
})

test('agent skill distribution route serves only allowlisted files', async () => {
  const skill = await readResponseText(['files', 'skills', 'gitlawb', 'SKILL.md'])
  expect(skill.response.status).toBe(200)
  expect(skill.response.headers.get('content-type')).toContain('text/markdown')
  expect(skill.text).toContain('GitLawb')
  expect(skill.text).toContain('## Golden Rules')
  expect(skill.text).toContain('## Fail-Fast Checks')
  expect(skill.text).toContain('## 422 Diagnostic Protocol')
  expect(skill.text).toContain('The `claim_token` is only for polling this browser approval session')
  expect(skill.text).toContain('/api/agent-ashes')

  const helper = await readResponseText(['files', 'skills', 'gitlawb', 'scripts', 'gitlawb-helper.mjs'])
  expect(helper.response.status).toBe(200)
  expect(helper.response.headers.get('content-type')).toContain('text/javascript')
  expect(helper.text).toContain('agent-ash')

  const unknown = await readResponseText(['files', 'skills', 'gitlawb', 'references', 'secret.md'])
  expect(unknown.response.status).toBe(404)

  const traversal = await readResponseText(['files', 'skills', '..', 'commands', 'bury.md'])
  expect(traversal.response.status).toBe(404)
})
