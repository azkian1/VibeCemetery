import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { GET } from '../src/app/agents/gitlawb/v1/[...path]/route'

const root = process.cwd()
const runnerPath = path.join(root, 'SKILL', 'agent-install', 'install-gitlawb-runner.mjs')
const manifestFiles = [
  'SKILL/agent-install/install-gitlawb-runner.mjs',
  'SKILL/skills/gitlawb/SKILL.md',
  'SKILL/skills/gitlawb/scripts/gitlawb-helper.mjs',
]

function hashFixture(relativePath: string) {
  return createHash('sha256').update(readFileSync(path.join(root, relativePath), 'utf8')).digest('hex')
}

function payloadSha256(files: Array<{ source: string; sha256: string }>) {
  return createHash('sha256').update(JSON.stringify({ files: files.map((file) => ({ source: file.source, sha256: file.sha256 })) })).digest('hex')
}

function buildFixtureManifest(overrides: Record<string, Partial<{ target: string; sha256: string }>> = {}) {
  const files = manifestFiles.map((source) => ({
    url: source === 'SKILL/skills/gitlawb/SKILL.md'
      ? '/agents/gitlawb/v1/files/skills/gitlawb/SKILL.md'
      : source === 'SKILL/skills/gitlawb/scripts/gitlawb-helper.mjs'
        ? '/agents/gitlawb/v1/files/skills/gitlawb/scripts/gitlawb-helper.mjs'
        : `/agents/gitlawb/v1/${source}`,
    source,
    target: source === 'SKILL/skills/gitlawb/SKILL.md' ? 'SKILL.md' : source === 'SKILL/skills/gitlawb/scripts/gitlawb-helper.mjs' ? 'scripts/gitlawb-helper.mjs' : undefined,
    sha256: hashFixture(source),
    ...overrides[source],
  }))

  return JSON.stringify({
    name: 'gitlawb',
    version: '1.0.0',
    kind: 'agent-ash-skill',
    base_url: 'http://127.0.0.1',
    target_root: '~/.hermes/skills/gitlawb',
    payload_sha256: payloadSha256(files),
    files,
  })
}

function startFixtureServer(tamperedFiles: Record<string, string> = {}) {
  const server = createServer((req, res) => {
    const requestPath = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (requestPath === '/manifest.json') {
      res.setHeader('content-type', 'application/json')
      res.end(buildFixtureManifest())
      return
    }

    const relativePath = requestPath.replace(/^\/agents\/gitlawb\/v1\//, '').replace(/^\/+/, '')
    const sourcePath = relativePath === 'files/skills/gitlawb/SKILL.md'
      ? 'SKILL/skills/gitlawb/SKILL.md'
      : relativePath === 'files/skills/gitlawb/scripts/gitlawb-helper.mjs'
        ? 'SKILL/skills/gitlawb/scripts/gitlawb-helper.mjs'
        : relativePath
    if (tamperedFiles[sourcePath] || tamperedFiles[relativePath]) {
      res.statusCode = 200
      res.end(tamperedFiles[sourcePath] || tamperedFiles[relativePath])
      return
    }

    try {
      res.statusCode = 200
      res.end(readFileSync(path.join(root, sourcePath)))
    } catch {
      res.statusCode = 404
      res.end('not found')
    }
  })

  return new Promise<{ server: ReturnType<typeof createServer>, port: number }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('failed to bind test server')
      resolve({ server, port: address.port })
    })
  })
}

function startRouteBackedServer() {
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
    const routePath = requestUrl.pathname.replace(/^\/agents\/gitlawb\/v1\//, '').split('/').filter(Boolean)
    const response = await GET(new Request(`https://vibecemetery.app${requestUrl.pathname}`), {
      params: Promise.resolve({ path: routePath }),
    })

    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(await response.text())
  })

  return new Promise<{ server: ReturnType<typeof createServer>, port: number }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('failed to bind test server')
      resolve({ server, port: address.port })
    })
  })
}

function runRunner(args: string[], homeDir: string, env: Record<string, string> = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('node', [runnerPath, '--home', homeDir, ...args], {
      cwd: root,
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`runner exited with ${code}\n${stdout}\n${stderr}`))
    })
  })
}

test('runner installs SKILL.md and helper under ~/.hermes/skills/gitlawb', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-home-'))
  const { server, port } = await startFixtureServer()

  try {
    const result = await runRunner(['--raw-base-url', `http://127.0.0.1:${port}`], homeDir)

    expect(result.stdout).toContain('Restart Hermes or OpenClaw')
    expect(existsSync(path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'SKILL.md'))).toBe(true)
    expect(existsSync(path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'scripts', 'gitlawb-helper.mjs'))).toBe(true)
    expect(readFileSync(path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'SKILL.md'), 'utf8')).toBe(readFileSync(path.join(root, 'SKILL', 'skills', 'gitlawb', 'SKILL.md'), 'utf8'))
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner installs from the actual site route URL contract', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-home-'))
  const { server, port } = await startRouteBackedServer()

  try {
    await runRunner(['--raw-base-url', `http://127.0.0.1:${port}`], homeDir)

    expect(readFileSync(path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'SKILL.md'), 'utf8')).toBe(readFileSync(path.join(root, 'SKILL', 'skills', 'gitlawb', 'SKILL.md'), 'utf8'))
    expect(readFileSync(path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'scripts', 'gitlawb-helper.mjs'), 'utf8')).toBe(readFileSync(path.join(root, 'SKILL', 'skills', 'gitlawb', 'scripts', 'gitlawb-helper.mjs'), 'utf8'))
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner dry-run prints target files and hashes without writing', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-home-'))
  const { server, port } = await startFixtureServer()

  try {
    const result = await runRunner(['--raw-base-url', `http://127.0.0.1:${port}`, '--dry-run'], homeDir)

    expect(result.stdout).toContain('Dry run: no files written.')
    expect(result.stdout).toContain(path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'SKILL.md'))
    expect(result.stdout).toContain(path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'scripts', 'gitlawb-helper.mjs'))
    expect(result.stdout).toContain(hashFixture('SKILL/skills/gitlawb/SKILL.md'))
    expect(existsSync(path.join(homeDir, '.hermes'))).toBe(false)
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner rejects sha256 mismatch before installing', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-home-'))
  const { server, port } = await startFixtureServer({ 'SKILL/skills/gitlawb/SKILL.md': 'tampered skill' })

  try {
    await expect(runRunner(['--raw-base-url', `http://127.0.0.1:${port}`], homeDir)).rejects.toThrow(/sha256|hash|integrity/i)
    expect(existsSync(path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'SKILL.md'))).toBe(false)
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner keeps the first manifest argument so bootstrap manifest cannot be overridden', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-home-'))
  const trustedManifest = path.join(homeDir, 'trusted-manifest.json')
  const evilManifest = path.join(homeDir, 'evil-manifest.json')
  const { server, port } = await startFixtureServer()

  try {
    writeFileSync(trustedManifest, buildFixtureManifest())
    writeFileSync(evilManifest, '{"files":[]}')
    await runRunner(['--raw-base-url', `http://127.0.0.1:${port}`, '--manifest', trustedManifest, '--manifest', evilManifest, '--dry-run'], homeDir)
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner rejects traversal target paths', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-home-'))
  const manifestPath = path.join(homeDir, 'traversal-manifest.json')

  try {
    writeFileSync(manifestPath, buildFixtureManifest({ 'SKILL/skills/gitlawb/SKILL.md': { target: '../outside.md' } }))
    await expect(runRunner(['--raw-base-url', 'http://127.0.0.1', '--manifest', manifestPath, '--dry-run'], homeDir)).rejects.toThrow(/traversal|target|outside|escape/i)
  } finally {
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner rejects non-local source overrides', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-home-'))

  try {
    await expect(runRunner(['--raw-base-url', 'https://example.com/not-allowed'], homeDir)).rejects.toThrow(/override|local|localhost|127\.0\.0\.1/i)
  } finally {
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner rejects symlink redirected target paths', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-home-'))
  const redirectedDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-redirected-'))
  const hermesSkillsDir = path.join(homeDir, '.hermes', 'skills')
  const gitlawbLink = path.join(hermesSkillsDir, 'gitlawb')
  const { server, port } = await startFixtureServer()

  mkdirSync(hermesSkillsDir, { recursive: true })
  symlinkSync(redirectedDir, gitlawbLink, 'junction')

  try {
    await expect(runRunner(['--raw-base-url', `http://127.0.0.1:${port}`], homeDir)).rejects.toThrow(/redirect|symlink|junction|outside/i)
    expect(existsSync(path.join(redirectedDir, 'SKILL.md'))).toBe(false)
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(redirectedDir, { recursive: true, force: true })
  }
})

test('runner rejects symlinks inside an existing install before backup', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-home-'))
  const redirectedDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-hermes-existing-redirected-'))
  const targetScriptsDir = path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'scripts')
  const { server, port } = await startFixtureServer()

  mkdirSync(targetScriptsDir, { recursive: true })
  writeFileSync(path.join(homeDir, '.hermes', 'skills', 'gitlawb', 'SKILL.md'), 'existing skill')
  symlinkSync(redirectedDir, path.join(targetScriptsDir, 'redirected'), 'junction')

  try {
    await expect(runRunner(['--raw-base-url', `http://127.0.0.1:${port}`], homeDir)).rejects.toThrow(/symlink|junction/i)
    expect(existsSync(path.join(redirectedDir, 'SKILL.md'))).toBe(false)
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(redirectedDir, { recursive: true, force: true })
  }
})
