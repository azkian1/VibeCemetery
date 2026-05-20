import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { GET } from '../src/app/skills/bury/v1/[...path]/route'

async function readResponseText(path: string[]) {
  const response = await GET(new Request(`https://vibecemetery.app/skills/bury/v1/${path.join('/')}`), {
    params: Promise.resolve({ path }),
  })
  return { response, text: await response.text() }
}

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

function canonicalPayloadHash(files: Array<{ source: string; sha256: string }>) {
  const payloadFiles = files
    .filter((file) => !['SKILL/install/install-bury.sh', 'SKILL/install/install-bury.ps1'].includes(file.source))
    .map((file) => ({ source: file.source, sha256: file.sha256 }))
  return sha256(JSON.stringify({ files: payloadFiles }))
}

test('/skills/bury/v1 page renders install commands and source sections', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'app', 'skills', 'bury', 'v1', 'page.tsx'), 'utf8')

  expect(source).toContain('curl -fsSL https://vibecemetery.app/skills/bury/v1/install.sh | bash')
  expect(source).toContain('powershell -NoProfile -ExecutionPolicy Bypass -Command')
  expect(source).toContain('What /bury does')
  expect(source).toContain('What will be installed')
  expect(source).toContain('Target paths')
  expect(source).toContain('View skill contents')
  expect(source).toContain('Security boundaries')
  expect(source).toContain('Manual install notes')
})

test('Next tracing includes site-served skill distribution files', () => {
  const source = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

  expect(source).toContain('outputFileTracingIncludes')
  expect(source).toContain("'/skills/bury/v1/\\\\[\\\\.\\\\.\\\\.path\\\\]'")
  expect(source).toContain("'./SKILL/**/*'")
})

test('skill distribution route serves installer scripts and manifest', async () => {
  const shell = await readResponseText(['install.sh'])
  expect(shell.response.status).toBe(200)
  expect(shell.response.headers.get('content-type')).toContain('text/x-shellscript')
  expect(shell.text).toContain('#!/usr/bin/env bash')
  expect(shell.text).toContain('https://vibecemetery.app/skills/bury/v1')

  const powershell = await readResponseText(['install.ps1'])
  expect(powershell.response.status).toBe(200)
  expect(powershell.response.headers.get('content-type')).toContain('text/plain')
  expect(powershell.text).toContain("$ErrorActionPreference = 'Stop'")
  expect(powershell.text).toContain('https://vibecemetery.app/skills/bury/v1')

  const manifest = await readResponseText(['manifest.json'])
  expect(manifest.response.status).toBe(200)
  expect(manifest.response.headers.get('content-type')).toContain('application/json')
  expect(JSON.parse(manifest.text)).toMatchObject({
    name: 'bury',
    version: '1.0.0',
    base_url: 'https://vibecemetery.app/skills/bury/v1',
  })
  expect(manifest.text).toContain('/skills/bury/v1/files/commands/bury.md')
})

test('skill manifest includes sha256 for every served distribution file', async () => {
  const manifest = await readResponseText(['manifest.json'])
  const body = JSON.parse(manifest.text) as {
    payload_sha256: string
    files: Array<{ url: string; target?: string; source: string; sha256: string }>
  }
  const expectedUrls = [
    '/skills/bury/v1/install.sh',
    '/skills/bury/v1/install.ps1',
    '/skills/bury/v1/SKILL/install/install-contract.mjs',
    '/skills/bury/v1/SKILL/install/install-runner.mjs',
    '/skills/bury/v1/files/commands/bury.md',
    '/skills/bury/v1/files/skills/bury-workflow/SKILL.md',
    '/skills/bury/v1/files/skills/bury-workflow/scripts/bury-helper.mjs',
    '/skills/bury/v1/files/skills/bury-workflow/references/contract.md',
    '/skills/bury/v1/files/skills/bury-workflow/references/security.md',
    '/skills/bury/v1/files/skills/bury-workflow/references/character.md',
  ]

  expect(body.files.map((file) => file.url)).toEqual(expectedUrls)
  expect(body.payload_sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(body.payload_sha256).toBe(canonicalPayloadHash(body.files))

  for (const file of body.files) {
    expect(file.source).toMatch(/^SKILL\//)
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/)

    const routePath = file.url.replace('/skills/bury/v1/', '').split('/')
    const served = await readResponseText(routePath)
    expect(served.response.status).toBe(200)
    expect(sha256(served.text)).toBe(file.sha256)
  }
})

test('skill distribution route serves public source files and rejects unknown paths', async () => {
  const command = await readResponseText(['files', 'commands', 'bury.md'])
  expect(command.response.status).toBe(200)
  expect(command.response.headers.get('content-type')).toContain('text/markdown')
  expect(command.text).toContain('/bury')

  const internalCommand = await readResponseText(['SKILL', 'commands', 'bury.md'])
  expect(internalCommand.response.status).toBe(200)
  expect(internalCommand.text).toBe(command.text)

  const unknown = await readResponseText(['files', 'commands', 'missing.md'])
  expect(unknown.response.status).toBe(404)

  const traversal = await readResponseText(['files', '..', 'install-contract.mjs'])
  expect(traversal.response.status).toBe(404)
})
