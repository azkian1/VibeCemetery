import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

const root = process.cwd()
const runnerPath = path.join(root, 'SKILL', 'install', 'install-runner.mjs')
const manifestFiles = [
  'SKILL/install/install-bury.sh',
  'SKILL/install/install-bury.ps1',
  'SKILL/install/install-contract.mjs',
  'SKILL/install/install-runner.mjs',
  'SKILL/commands/bury.md',
  'SKILL/skills/bury-workflow/SKILL.md',
  'SKILL/skills/bury-workflow/scripts/bury-helper.mjs',
  'SKILL/skills/bury-workflow/references/contract.md',
  'SKILL/skills/bury-workflow/references/security.md',
  'SKILL/skills/bury-workflow/references/character.md',
]

function hashFixture(relativePath: string) {
  return createHash('sha256').update(readFileSync(path.join(root, relativePath), 'utf8')).digest('hex')
}

function buildFixtureManifest() {
  return JSON.stringify({
    name: 'bury',
    version: '1.0.0',
    base_url: 'http://127.0.0.1',
    files: manifestFiles.map((source) => ({
      url: `/skills/bury/v1/${source}`,
      source,
      sha256: hashFixture(source),
    })),
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

    const relativePath = requestPath.replace(/^\/+/, '')
    if (tamperedFiles[relativePath]) {
      res.statusCode = 200
      res.end(tamperedFiles[relativePath])
      return
    }

    const filePath = path.join(root, requestPath)

    try {
      const body = readFileSync(filePath)
      res.statusCode = 200
      res.end(body)
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

test('runner installs and refreshes the workflow tree', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-home-'))
  const { server, port } = await startFixtureServer()
  const rawBaseUrl = `http://127.0.0.1:${port}`

  async function runRunner() {
    return await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      const child = spawn('node', [runnerPath, '--home', homeDir, '--raw-base-url', rawBaseUrl], {
        cwd: root,
        env: {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`runner exited with ${code}\n${stdout}\n${stderr}`))
        }
      })
    })
  }

  try {
    const firstRun = await runRunner()
    expect(firstRun.stdout).toContain('Restart Claude Code.')
    expect(firstRun.stdout).toContain('Then run /bury.')

    const commandsDir = path.join(homeDir, '.claude', 'commands')
    const workflowDir = path.join(homeDir, '.claude', 'skills', 'bury-workflow')

    expect(existsSync(path.join(commandsDir, 'bury.md'))).toBe(true)
    expect(existsSync(path.join(workflowDir, 'SKILL.md'))).toBe(true)
    expect(existsSync(path.join(workflowDir, 'scripts', 'bury-helper.mjs'))).toBe(true)
    expect(readFileSync(path.join(commandsDir, 'bury.md'), 'utf8')).toBe(
      readFileSync(path.join(root, 'SKILL', 'commands', 'bury.md'), 'utf8'),
    )

    writeFileSync(path.join(commandsDir, 'bury.md'), 'mutated command')
    writeFileSync(path.join(workflowDir, 'scripts', 'bury-helper.mjs'), 'mutated helper')
    mkdirSync(path.join(workflowDir, 'extra'), { recursive: true })
    writeFileSync(path.join(workflowDir, 'extra', 'stale.txt'), 'stale')

    const secondRun = await runRunner()
    expect(secondRun.stdout).toContain('Restart Claude Code.')
    expect(secondRun.stdout).toContain('Then run /bury.')

    expect(readFileSync(path.join(commandsDir, 'bury.md'), 'utf8')).toBe(
      readFileSync(path.join(root, 'SKILL', 'commands', 'bury.md'), 'utf8'),
    )
    expect(readFileSync(path.join(workflowDir, 'scripts', 'bury-helper.mjs'), 'utf8')).toBe(
      readFileSync(path.join(root, 'SKILL', 'skills', 'bury-workflow', 'scripts', 'bury-helper.mjs'), 'utf8'),
    )
    expect(existsSync(path.join(workflowDir, 'extra', 'stale.txt'))).toBe(false)
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner normalizes source base URL before production URL comparison', () => {
  const source = readFileSync(runnerPath, 'utf8')

  expect(source).toContain("const normalized = trimmed.replace(/\\/+$/, '')")
  expect(source.indexOf('const normalized = trimmed.replace')).toBeLessThan(source.indexOf('normalized === INSTALLER_CONTRACT.rawBaseUrl'))
})

test('runner keeps the first manifest argument so bootstrap manifest cannot be overridden', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-home-'))
  const manifestPath = path.join(homeDir, 'trusted-manifest.json')
  const evilManifestPath = path.join(homeDir, 'evil-manifest.json')
  const { server, port } = await startFixtureServer()
  const rawBaseUrl = `http://127.0.0.1:${port}`

  try {
    writeFileSync(manifestPath, buildFixtureManifest())
    writeFileSync(evilManifestPath, '{"files":[]}')

    await new Promise<void>((resolve, reject) => {
      const child = spawn('node', [runnerPath, '--home', homeDir, '--raw-base-url', rawBaseUrl, '--manifest', manifestPath, '--manifest', evilManifestPath, '--dry-run'], {
        cwd: root,
        env: {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      let stderr = ''
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr))
      })
    })
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner dry-run prints planned target files and hashes without writing install targets', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-home-'))
  const { server, port } = await startFixtureServer()
  const rawBaseUrl = `http://127.0.0.1:${port}`

  try {
    const result = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      const child = spawn('node', [runnerPath, '--home', homeDir, '--raw-base-url', rawBaseUrl, '--dry-run'], {
        cwd: root,
        env: {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`runner exited with ${code}\n${stdout}\n${stderr}`))
        }
      })
    })

    expect(result.stdout).toContain('Dry run: no files written.')
    expect(result.stdout).toContain(path.join(homeDir, '.claude', 'commands', 'bury.md'))
    expect(result.stdout).toContain(path.join(homeDir, '.claude', 'skills', 'bury-workflow', 'SKILL.md'))
    expect(result.stdout).toContain(hashFixture('SKILL/commands/bury.md'))
    expect(existsSync(path.join(homeDir, '.claude'))).toBe(false)
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner rejects downloaded skill files whose sha256 does not match the manifest before installing', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-home-'))
  const { server, port } = await startFixtureServer({ 'SKILL/commands/bury.md': 'tampered command' })
  const rawBaseUrl = `http://127.0.0.1:${port}`

  try {
    await expect(
      new Promise<void>((resolve, reject) => {
        const child = spawn('node', [runnerPath, '--home', homeDir, '--raw-base-url', rawBaseUrl], {
          cwd: root,
          env: {
            ...process.env,
            HOME: homeDir,
            USERPROFILE: homeDir,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString()
        })
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString()
        })
        child.on('close', (code) => {
          if (code === 0) {
            resolve()
            return
          }

          reject(new Error(`${stdout}\n${stderr}`))
        })
      }),
    ).rejects.toThrow(/sha256|hash|integrity/i)

    expect(existsSync(path.join(homeDir, '.claude', 'commands', 'bury.md'))).toBe(false)
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner restores the previous install if replacement fails', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-home-'))
  const { server, port } = await startFixtureServer()
  const rawBaseUrl = `http://127.0.0.1:${port}`

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('node', [runnerPath, '--home', homeDir, '--raw-base-url', rawBaseUrl], {
        cwd: root,
        env: {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`initial install exited with ${code}`))
      })
    })

    const commandsDir = path.join(homeDir, '.claude', 'commands')
    const workflowDir = path.join(homeDir, '.claude', 'skills', 'bury-workflow')
    writeFileSync(path.join(commandsDir, 'bury.md'), 'mutated command')
    writeFileSync(path.join(workflowDir, 'scripts', 'bury-helper.mjs'), 'mutated helper')

    await expect(
      new Promise<void>((resolve, reject) => {
        const child = spawn('node', [runnerPath, '--home', homeDir, '--raw-base-url', rawBaseUrl], {
          cwd: root,
          env: {
            ...process.env,
            HOME: homeDir,
            USERPROFILE: homeDir,
            VIBECEMETERY_INSTALL_TEST_FAIL_AFTER_COMMAND_COPY: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        child.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`runner failed as expected with ${code}`))
        })
      }),
    ).rejects.toThrow()

    expect(readFileSync(path.join(commandsDir, 'bury.md'), 'utf8')).toBe('mutated command')
    expect(readFileSync(path.join(workflowDir, 'scripts', 'bury-helper.mjs'), 'utf8')).toBe('mutated helper')
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('runner rejects redirected install targets outside the Claude directory', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-home-'))
  const redirectedCommandsDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-redirected-'))
  const claudeDir = path.join(homeDir, '.claude')
  const commandsLinkPath = path.join(claudeDir, 'commands')
  const { server, port } = await startFixtureServer()
  const rawBaseUrl = `http://127.0.0.1:${port}`

  mkdirSync(claudeDir, { recursive: true })
  symlinkSync(redirectedCommandsDir, commandsLinkPath, 'junction')

  try {
    await expect(
      new Promise<void>((resolve, reject) => {
        const child = spawn('node', [runnerPath, '--home', homeDir, '--raw-base-url', rawBaseUrl], {
          cwd: root,
          env: {
            ...process.env,
            HOME: homeDir,
            USERPROFILE: homeDir,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString()
        })
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString()
        })
        child.on('close', (code) => {
          if (code === 0) {
            resolve()
            return
          }

          reject(new Error(`${stdout}\n${stderr}`))
        })
      }),
    ).rejects.toThrow(/redirect|symlink|junction|outside/i)

    expect(existsSync(path.join(redirectedCommandsDir, 'bury.md'))).toBe(false)
  } finally {
    server.close()
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(redirectedCommandsDir, { recursive: true, force: true })
  }
})

test('runner rejects non-local installer source overrides', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'vibecemetery-home-'))

  try {
    await expect(
      new Promise<void>((resolve, reject) => {
        const child = spawn('node', [runnerPath, '--home', homeDir, '--raw-base-url', 'https://example.com/not-allowed'], {
          cwd: root,
          env: {
            ...process.env,
            HOME: homeDir,
            USERPROFILE: homeDir,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString()
        })
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString()
        })
        child.on('close', (code) => {
          if (code === 0) {
            resolve()
            return
          }

          reject(new Error(`${stdout}\n${stderr}`))
        })
      }),
    ).rejects.toThrow(/override|local|localhost|127\.0\.0\.1/i)
  } finally {
    rmSync(homeDir, { recursive: true, force: true })
  }
})
