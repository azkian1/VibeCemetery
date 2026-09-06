import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const helperPath = `${process.cwd().replace(/\\/g, '/')}/SKILL/skills/bury-workflow/scripts/bury-helper.mjs`
const detectionFixtures = JSON.parse(
  readFileSync(`${process.cwd()}/tests/fixtures/bury-detection-fixtures.json`, 'utf8'),
)

async function loadHelper() {
  return await import(`file:///${helperPath}`)
}

test.describe('bury skill helpers', () => {
  test('computes external config and registry paths on Windows', async () => {
    const { computeStoragePaths } = await loadHelper()
    const paths = computeStoragePaths({
      platform: 'win32',
      env: {
        APPDATA: 'C:\\Users\\example\\AppData\\Roaming',
        USERPROFILE: 'C:\\Users\\example',
      },
      homedir: 'C:\\Users\\example',
    })

    expect(paths.configPath).toBe('C:\\Users\\example\\AppData\\Roaming\\Claude\\vibecemetery\\bury.json')
    expect(paths.registryPath).toBe('C:\\Users\\example\\AppData\\Roaming\\Claude\\vibecemetery\\cremated-registry.json')
  })

  test('keeps only sanitized github remotes', async () => {
    const { sanitizeGitHubRemote } = await loadHelper()
    expect(sanitizeGitHubRemote('git@github.com:owner/repo.git')).toEqual({
      registryValue: 'github.com/owner/repo',
      githubUrl: 'https://github.com/owner/repo',
    })
    expect(sanitizeGitHubRemote('https://user:token@github.com/owner/repo.git')).toEqual({
      registryValue: 'github.com/owner/repo',
      githubUrl: 'https://github.com/owner/repo',
    })
    expect(sanitizeGitHubRemote('https://gitlab.com/owner/repo')).toEqual({
      registryValue: '',
      githubUrl: '',
    })
    expect(sanitizeGitHubRemote('https://github.com/owner/repo/issues/123')).toEqual({
      registryValue: '',
      githubUrl: '',
    })
  })

  test('validates production approval urls against claim proof and link id', async () => {
    const { validateApproveUrl } = await loadHelper()
    const valid = validateApproveUrl({
      approveUrl: 'https://vibecemetery.app/cli/connect?link_id=11111111-1111-4111-8111-111111111111#claim_token=claim-proof-token-1234567890',
      apiBaseUrl: 'https://vibecemetery.app',
      linkId: '11111111-1111-4111-8111-111111111111',
      claimToken: 'claim-proof-token-1234567890',
    })

    expect(valid.ok).toBe(true)

    const invalid = validateApproveUrl({
      approveUrl: 'http://localhost:3000/cli/connect?link_id=11111111-1111-4111-8111-111111111111#claim_token=claim-proof-token-1234567890',
      apiBaseUrl: 'https://vibecemetery.app',
      linkId: '11111111-1111-4111-8111-111111111111',
      claimToken: 'claim-proof-token-1234567890',
    })

    expect(invalid).toEqual({
      ok: false,
      error: 'Approval URL origin must match API_BASE_URL origin',
    })
  })

  test('migrates old registry entries without leaking raw paths or full remotes', async () => {
    const { normalizeRegistryEntries } = await loadHelper()
    const canonicalLegacyPath = 'C:/Users/example/Desktop/Projects/_ARCHIVE/LegacyApp'
    const entries = normalizeRegistryEntries([
      {
        name: 'LegacyApp',
        path: 'C:/Users/example/Desktop/Projects/_ARCHIVE/../_ARCHIVE/LegacyApp',
        git_remote: 'https://user:token@github.com/example-owner/legacy-app.git',
        first_commit: '5a380e438ab0887c70b37908fd1ccc7ea690872e',
        cremated_at: '2026-03-16',
        cause: 'Lost interest',
      },
    ])

    expect(entries).toEqual([
      {
        name: 'LegacyApp',
        path_fingerprint: `sha256:${createHash('sha256').update(canonicalLegacyPath).digest('hex')}`,
        git_remote: 'github.com/example-owner/legacy-app',
        first_commit: '5a380e438ab0887c70b37908fd1ccc7ea690872e',
        cremated_at: '2026-03-16',
        cause: 'Lost interest',
      },
    ])
    expect(normalizeRegistryEntries(entries)).toEqual(entries)
  })

  test('only publishes a sanitized GitHub link when explicitly selected', async () => {
    const { buildCremationBody } = await loadHelper()
    const payload = { name: 'LegacyApp', cause: 'Lost interest', project_key: `sha256:${'a'.repeat(64)}`,
      github_url: 'https://user:token@github.com/example-owner/legacy-app.git', last_commit_message: 'final commit' }
    expect(buildCremationBody(payload)).toEqual({ name: payload.name, cause: payload.cause,
      project_key: payload.project_key, last_commit_message: 'final commit' })
    expect(buildCremationBody({ ...payload, include_github_url: true })).toEqual({
      name: payload.name, cause: payload.cause, project_key: payload.project_key,
      github_url: 'https://github.com/example-owner/legacy-app', last_commit_message: 'final commit',
    })
    expect(() => buildCremationBody({ ...payload, include_github_url: true,
      github_url: 'https://github.com/example-owner/legacy-app/issues/1' })).toThrow('Invalid GitHub URL')
  })

  test('limits API fields and rejects missing identity before any network request', async () => {
    const { buildCremationBody, sendCremation } = await loadHelper()
    const body = buildCremationBody({ name: 'x'.repeat(110), cause: 'c'.repeat(220),
      project_key: `sha256:${'b'.repeat(64)}`, last_commit_message: 'm'.repeat(220) })
    expect(body.name).toHaveLength(100)
    expect(body.cause).toHaveLength(200)
    expect(body.last_commit_message).toHaveLength(200)
    let fetched = false
    await expect(sendCremation({ name: 'Project', cause: 'Retired' }, 'test-token', () => { fetched = true }))
      .rejects.toThrow('project_key')
    expect(fetched).toBe(false)
  })

  test('identity survives clone moves with the same remote and separates shared templates', async () => {
    const { computeProjectKey } = await loadHelper()
    const original = { git_remote: 'https://github.com/Owner/Repo.git', path_fingerprint: `sha256:${'a'.repeat(64)}` }
    expect(computeProjectKey(original)).toBe(computeProjectKey({ ...original,
      git_remote: 'git@github.com:owner/repo.git', path_fingerprint: `sha256:${'b'.repeat(64)}` }))
    expect(computeProjectKey(original)).toBe(computeProjectKey({
      git_remote: 'github.com/owner/repo', path_fingerprint: `sha256:${'c'.repeat(64)}` }))
    expect(computeProjectKey({ ...original, git_remote: '', first_commit: 'same-template' }))
      .not.toBe(computeProjectKey({ git_remote: '', first_commit: 'same-template', path_fingerprint: `sha256:${'b'.repeat(64)}` }))
  })

  test('preserves 403 and temporary 429 details, retry time and successful record identity', async () => {
    const { sendCremation } = await loadHelper()
    const payload = { name: 'Project', cause: 'Retired', project_key: `sha256:${'a'.repeat(64)}` }
    const responses = [
      Response.json({ error: 'You can only bury your own GitHub repositories', code: 'REPO_NOT_ELIGIBLE' }, { status: 403 }),
      Response.json({ error: 'Too many verification attempts' }, { status: 429, headers: { 'Retry-After': '30' } }),
      Response.json({ id: 123, name: 'Project' }, { status: 201 }),
      Response.json({ id: 123, name: 'Project' }, { status: 200 }),
    ]
    const bodies: string[] = []
    const fetchMock = async (url: string, options: RequestInit) => {
      expect(url).toBe('https://vibecemetery.app/api/cremated')
      expect(options.signal).toBeInstanceOf(AbortSignal)
      expect(options.redirect).toBe('error')
      bodies.push(String(options.body))
      return responses.shift()!
    }
    expect(await sendCremation(payload, 'test-token', fetchMock)).toMatchObject({ status: 403, ok: false, code: 'REPO_NOT_ELIGIBLE', error: 'You can only bury your own GitHub repositories' })
    expect(await sendCremation(payload, 'test-token', fetchMock)).toMatchObject({ status: 429, ok: false, code: null, retry_after_seconds: 30 })
    expect(await sendCremation(payload, 'test-token', fetchMock)).toMatchObject({ status: 201, ok: true, record_id: 123, replayed: false })
    expect(await sendCremation(payload, 'test-token', fetchMock)).toMatchObject({ status: 200, ok: true, record_id: 123, replayed: true })
    expect(new Set(bodies).size).toBe(1)
  })

  test('does not report malformed success or an uncertain network outcome as cremated', async () => {
    const { sendCremation } = await loadHelper()
    const payload = { name: 'Project', cause: 'Retired', project_key: `sha256:${'a'.repeat(64)}` }
    expect(await sendCremation(payload, 'test-token', async () => new Response('<html>gateway</html>', { status: 201 })))
      .toMatchObject({ status: 201, ok: false, record_id: null })
    expect(await sendCremation(payload, 'test-token', async () => { throw new Error('network failed') }))
      .toMatchObject({ status: 0, ok: false, code: 'NETWORK_ERROR' })
  })

  test('strips UTF-8 BOM before parsing JSON config text', async () => {
    const { stripUtf8Bom } = await loadHelper()

    expect(JSON.parse(stripUtf8Bom('\uFEFF{"cli_token":"vc_cli_123"}'))).toEqual({
      cli_token: 'vc_cli_123',
    })
  })

  test('computes stable path fingerprints after normalizing separators', async () => {
    const { computePathFingerprint } = await loadHelper()

    expect(computePathFingerprint('C:\\Users\\example\\Desktop\\Projects\\_COMPLETED\\DemoBot')).toBe(
      computePathFingerprint('C:/Users/example/Desktop/Projects/_COMPLETED/DemoBot'),
    )
  })

  test('computes stable path fingerprints for equivalent relative paths', async () => {
    const { computePathFingerprint } = await loadHelper()

    expect(computePathFingerprint('tests/fixtures/../fixtures')).toBe(
      computePathFingerprint('tests/fixtures'),
    )
  })

  test('matches detection fixtures for fallback and non-project folders', async () => {
    const { classifyProjectRootEntries } = await loadHelper()

    for (const fixture of detectionFixtures.slice(0, 3)) {
      expect(classifyProjectRootEntries(fixture.entries), fixture.name).toMatchObject(fixture.expected)
    }
  })

  test('detects strong markers before fallback signals', async () => {
    const { classifyProjectRootEntries } = await loadHelper()

    expect(classifyProjectRootEntries(detectionFixtures[3].entries)).toMatchObject(detectionFixtures[3].expected)
    expect(classifyProjectRootEntries([{ name: '.git', type: 'file' }])).toMatchObject({ isCandidate: true, strongMatches: ['.git'] })
  })

  test('prefers the scan path itself when it already looks like a project', async () => {
    const { selectProjectCandidates } = await loadHelper()

    expect(selectProjectCandidates({
      scanPath: 'C:/Users/example/Desktop/March/DemoGame',
      scanPathEntries: detectionFixtures[1].entries,
      childDirectories: [
        {
          path: 'C:/Users/example/Desktop/March/DemoGame/child-one',
          entries: detectionFixtures[0].entries,
        },
      ],
    })).toEqual([
      {
        path: 'C:/Users/example/Desktop/March/DemoGame',
        classification: expect.objectContaining({
          isCandidate: true,
          source: 'fallback',
        }),
      },
    ])
  })

  test('falls back to immediate child directories when the scan path is not a project', async () => {
    const { selectProjectCandidates } = await loadHelper()

    expect(selectProjectCandidates({
      scanPath: 'C:/Users/example/Desktop/March',
      scanPathEntries: detectionFixtures[2].entries,
      childDirectories: [
        {
          path: 'C:/Users/example/Desktop/March/DemoGame',
          entries: detectionFixtures[1].entries,
        },
        {
          path: 'C:/Users/example/Desktop/March/Notes',
          entries: detectionFixtures[2].entries,
        },
      ],
    })).toEqual([
      {
        path: 'C:/Users/example/Desktop/March/DemoGame',
        classification: expect.objectContaining({
          isCandidate: true,
          source: 'fallback',
        }),
      },
    ])
  })

  test('detects a direct-path project from the filesystem and marks it cremated by path fingerprint', async () => {
    const { computePathFingerprint, detectProjectCandidates } = await loadHelper()
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'bury-direct-root-'))

    try {
      writeFileSync(path.join(fixtureRoot, 'index.html'), '<html></html>')
      mkdirSync(path.join(fixtureRoot, 'ignored-child'))
      writeFileSync(path.join(fixtureRoot, 'ignored-child', 'package.json'), '{"name":"ignored-child"}')

      expect(detectProjectCandidates(fixtureRoot, {
        registryEntries: [{
          name: path.basename(fixtureRoot),
          path_fingerprint: computePathFingerprint(fixtureRoot),
          git_remote: '',
          first_commit: '',
          cremated_at: '2026-04-15',
          cause: 'Already cremated',
        }],
      })).toEqual([
        expect.objectContaining({
          path: fixtureRoot,
          name: path.basename(fixtureRoot),
          status: 'Cremated',
          path_fingerprint: computePathFingerprint(fixtureRoot),
          classification: expect.objectContaining({
            isCandidate: true,
            source: 'fallback',
          }),
        }),
      ])
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('detects immediate child projects from the filesystem when the scan path root is not a project', async () => {
    const { detectProjectCandidates } = await loadHelper()
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'bury-child-scan-'))

    try {
      writeFileSync(path.join(fixtureRoot, 'README.md'), 'notes only')
      writeFileSync(path.join(fixtureRoot, 'notes.txt'), 'still not a project')
      mkdirSync(path.join(fixtureRoot, 'DemoGame'))
      writeFileSync(path.join(fixtureRoot, 'DemoGame', 'index.html'), '<html></html>')

      expect(detectProjectCandidates(fixtureRoot)).toEqual([
        expect.objectContaining({
          path: path.join(fixtureRoot, 'DemoGame'),
          name: 'DemoGame',
          status: 'Untracked',
          classification: expect.objectContaining({
            isCandidate: true,
            source: 'fallback',
          }),
        }),
      ])
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('rejects unsafe scan paths before reading directory contents', async () => {
    const { detectProjectCandidates } = await loadHelper()
    const homeDir = mkdtempSync(path.join(tmpdir(), 'bury-home-'))
    const desktopDir = path.join(homeDir, 'Desktop')
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'bury-projects-'))
    const safeProjectDir = path.join(projectsRoot, 'March', 'SafeProject')
    const redirectedDir = mkdtempSync(path.join(tmpdir(), 'bury-redirected-'))
    const symlinkPath = path.join(projectsRoot, 'March', 'LinkedProject')
    const standaloneFile = path.join(projectsRoot, 'March', 'notes.txt')

    mkdirSync(desktopDir, { recursive: true })
    mkdirSync(safeProjectDir, { recursive: true })
    mkdirSync(path.dirname(symlinkPath), { recursive: true })
    writeFileSync(path.join(safeProjectDir, 'package.json'), '{"name":"safe-project"}')
    writeFileSync(standaloneFile, 'not a directory')
    symlinkSync(redirectedDir, symlinkPath, 'junction')

    try {
      expect(() => detectProjectCandidates(homeDir, { homedir: homeDir })).toThrow(/unsafe|home|scan path/i)
      expect(() => detectProjectCandidates(desktopDir, { homedir: homeDir })).toThrow(/unsafe|desktop|scan path/i)
      expect(() => detectProjectCandidates(path.parse(projectsRoot).root)).toThrow(/unsafe|root|scan path/i)
      expect(() => detectProjectCandidates(standaloneFile)).toThrow(/directory|scan path/i)
      expect(() => detectProjectCandidates(symlinkPath)).toThrow(/unsafe|symlink|junction|scan path/i)

      expect(detectProjectCandidates(safeProjectDir)).toEqual([
        expect.objectContaining({
          path: safeProjectDir,
          name: 'SafeProject',
        }),
      ])
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(projectsRoot, { recursive: true, force: true })
      rmSync(redirectedDir, { recursive: true, force: true })
    }
  })

  test('rejects scan paths when a parent segment is redirected', async () => {
    const { detectProjectCandidates } = await loadHelper()
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'bury-parent-redirect-'))
    const redirectedParent = mkdtempSync(path.join(tmpdir(), 'bury-redirected-parent-'))
    const linkedParent = path.join(projectsRoot, 'workspace')
    const nestedProject = path.join(linkedParent, 'SafeProject')

    mkdirSync(projectsRoot, { recursive: true })
    symlinkSync(redirectedParent, linkedParent, 'junction')
    mkdirSync(path.join(redirectedParent, 'SafeProject'), { recursive: true })
    writeFileSync(path.join(redirectedParent, 'SafeProject', 'package.json'), '{"name":"safe-project"}')

    try {
      expect(() => detectProjectCandidates(nestedProject)).toThrow(/unsafe|symlink|junction|redirect/i)
    } finally {
      rmSync(projectsRoot, { recursive: true, force: true })
      rmSync(redirectedParent, { recursive: true, force: true })
    }
  })

  test('matches markers and boosters case-insensitively on local filesystems', async () => {
    const { classifyProjectRootEntries } = await loadHelper()

    expect(classifyProjectRootEntries([
      { name: 'Package.json', type: 'file' },
      { name: 'Readme.md', type: 'file' },
    ])).toMatchObject({
      isCandidate: true,
      source: 'strong',
    })

    expect(classifyProjectRootEntries([
      { name: 'script.PY', type: 'file' },
      { name: 'Dockerfile', type: 'file' },
    ])).toMatchObject({
      isCandidate: true,
      source: 'fallback',
      codeLikeCount: 1,
      confidenceBoosterCount: 1,
    })
  })

  test('builds selection prompt with selectable rows only and no all shortcut', async () => {
    const { buildSelectionPromptModel } = await loadHelper()

    const model = buildSelectionPromptModel([
      { name: '18scenario_generator', status: 'Untracked' },
      { name: 'DemoMini', status: 'Cremated' },
      { name: 'Puzzle', status: 'Dead' },
      { name: 'DemoBot', status: 'Cremated' },
      { name: 'Transcript', status: 'Untracked' },
    ])

    expect(model.selectableRows.map((row: { index: number; name: string }) => ({ index: row.index, name: row.name }))).toEqual([
      { index: 1, name: '18scenario_generator' },
      { index: 2, name: 'Puzzle' },
      { index: 3, name: 'Transcript' },
    ])
    expect(model.crematedRows.map((row: { name: string }) => row.name)).toEqual(['DemoMini', 'DemoBot'])
    expect(model.acceptedReplies).toEqual(['1,2,3', 'all dead'])
  })

  test('omits all dead reply when there are no selectable dead projects', async () => {
    const { buildSelectionPromptModel } = await loadHelper()

    const model = buildSelectionPromptModel([
      { name: '18scenario_generator', status: 'Untracked' },
      { name: 'Gam333r', status: 'Untracked' },
    ])

    expect(model.acceptedReplies).toEqual(['1,2'])
  })

  test('inspectProject safely collects git metadata without shell interpolation', async () => {
    const { inspectProject } = await loadHelper()
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'bury-inspect-'))
    const projectDir = path.join(fixtureRoot, 'repo;touch-pwned')
    const pwnedPath = path.join(fixtureRoot, 'pwned')

    try {
      mkdirSync(projectDir)
      writeFileSync(path.join(projectDir, 'package.json'), '{"name":"repo"}')
      execFileSync('git', ['init'], { cwd: projectDir, stdio: 'ignore' })
      execFileSync('git', ['remote', 'add', 'origin', 'https://user:token@github.com/owner/repo.git'], { cwd: projectDir, stdio: 'ignore' })
      execFileSync('git', ['add', 'package.json'], { cwd: projectDir, stdio: 'ignore' })
      execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Tester', 'commit', '-m', 'initial commit'], {
        cwd: projectDir,
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
          GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
        },
        stdio: 'ignore',
      })

      const inspected = inspectProject(projectDir)

      expect(inspected).toMatchObject({
        name: 'repo;touch-pwned',
        status: 'Dead',
        main_language: 'JavaScript/TypeScript',
        git_remote: 'github.com/owner/repo',
        github_url: 'https://github.com/owner/repo',
        last_commit_subject: 'initial commit',
      })
      expect(inspected.path_fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(inspected.last_commit_timestamp).toBeGreaterThan(0)
      expect(inspected.first_commit).toMatch(/^[a-f0-9]{40}$/)
      expect(inspected).not.toHaveProperty('path')
      expect(readFileSync(path.join(projectDir, 'package.json'), 'utf8')).toContain('repo')
      expect(() => readFileSync(pwnedPath, 'utf8')).toThrow()
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('inspectProject returns untracked metadata for non-git project directories', async () => {
    const { inspectProject } = await loadHelper()
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'bury-inspect-plain-'))
    const projectDir = path.join(fixtureRoot, 'PlainProject')

    try {
      mkdirSync(projectDir)
      writeFileSync(path.join(projectDir, 'index.html'), '<html></html>')

      expect(inspectProject(projectDir)).toMatchObject({
        name: 'PlainProject',
        status: 'Untracked',
        git_remote: '',
        github_url: '',
        first_commit: '',
        last_commit_subject: '',
        last_commit_timestamp: null,
      })
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('inspectProject marks git projects dead after 7 days of inactivity', async () => {
    const { inspectProject } = await loadHelper()
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'bury-seven-day-'))
    const deadCommitDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()

    try {
      writeFileSync(path.join(fixtureRoot, 'package.json'), '{"name":"seven-day-project"}')
      execFileSync('git', ['init'], { cwd: fixtureRoot, stdio: 'ignore' })
      execFileSync('git', ['add', 'package.json'], { cwd: fixtureRoot, stdio: 'ignore' })
      execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Tester', 'commit', '-m', 'initial commit'], {
        cwd: fixtureRoot,
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: deadCommitDate,
          GIT_COMMITTER_DATE: deadCommitDate,
        },
        stdio: 'ignore',
      })

      expect(inspectProject(fixtureRoot)).toMatchObject({
        name: path.basename(fixtureRoot),
        status: 'Dead',
      })
      writeFileSync(path.join(fixtureRoot, 'package.json'), '{"name":"still-working"}')
      expect(inspectProject(fixtureRoot)).toMatchObject({ status: 'Alive', has_local_changes: true })
      execFileSync('git', ['checkout', '--', 'package.json'], { cwd: fixtureRoot, stdio: 'ignore' })
      writeFileSync(path.join(fixtureRoot, 'new-file.ts'), 'export const active = true')
      expect(inspectProject(fixtureRoot)).toMatchObject({ status: 'Alive', has_local_changes: true })

    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('inspectProject does not inherit git metadata from an ancestor repository', async () => {
    const { inspectProject } = await loadHelper()
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'bury-parent-git-'))
    const childProject = path.join(fixtureRoot, 'ChildProject')

    try {
      execFileSync('git', ['init'], { cwd: fixtureRoot, stdio: 'ignore' })
      execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/parent/repo.git'], { cwd: fixtureRoot, stdio: 'ignore' })
      writeFileSync(path.join(fixtureRoot, 'README.md'), 'parent repo')
      execFileSync('git', ['add', 'README.md'], { cwd: fixtureRoot, stdio: 'ignore' })
      execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Tester', 'commit', '-m', 'parent commit'], {
        cwd: fixtureRoot,
        stdio: 'ignore',
      })

      mkdirSync(childProject)
      writeFileSync(path.join(childProject, 'index.html'), '<html></html>')

      expect(inspectProject(childProject)).toMatchObject({
        name: 'ChildProject',
        status: 'Untracked',
        git_remote: '',
        github_url: '',
        first_commit: '',
        last_commit_subject: '',
        last_commit_timestamp: null,
      })
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('inspectProject ignores ambient GIT_DIR and GIT_WORK_TREE environment overrides', async () => {
    const { inspectProject } = await loadHelper()
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'bury-git-env-'))
    const childProject = path.join(fixtureRoot, 'ChildProject')
    const previousGitDir = process.env.GIT_DIR
    const previousGitWorkTree = process.env.GIT_WORK_TREE

    try {
      execFileSync('git', ['init'], { cwd: fixtureRoot, stdio: 'ignore' })
      writeFileSync(path.join(fixtureRoot, 'README.md'), 'parent repo')
      execFileSync('git', ['add', 'README.md'], { cwd: fixtureRoot, stdio: 'ignore' })
      execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Tester', 'commit', '-m', 'parent commit'], {
        cwd: fixtureRoot,
        stdio: 'ignore',
      })

      mkdirSync(childProject)
      writeFileSync(path.join(childProject, 'index.html'), '<html></html>')
      process.env.GIT_DIR = path.join(fixtureRoot, '.git')
      process.env.GIT_WORK_TREE = childProject

      expect(inspectProject(childProject)).toMatchObject({
        name: 'ChildProject',
        status: 'Untracked',
        git_remote: '',
        github_url: '',
        first_commit: '',
        last_commit_subject: '',
        last_commit_timestamp: null,
      })
    } finally {
      if (previousGitDir === undefined) delete process.env.GIT_DIR
      else process.env.GIT_DIR = previousGitDir
      if (previousGitWorkTree === undefined) delete process.env.GIT_WORK_TREE
      else process.env.GIT_WORK_TREE = previousGitWorkTree
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('workflow requires inspect-project helper instead of direct git -C commands', () => {
    const workflow = readFileSync(`${process.cwd()}/SKILL/skills/bury-workflow/SKILL.md`, 'utf8')
    const helper = readFileSync(`${process.cwd()}/SKILL/skills/bury-workflow/scripts/bury-helper.mjs`, 'utf8')

    expect(workflow).toContain('inspect-project')
    expect(workflow).toContain('Never run `git -C` directly')
    expect(workflow).not.toContain('git -C "<path>"')
    expect(helper).toContain('resolveTrustedGitBinary')
    expect(helper).not.toContain("execFileSync('git'")
  })
})
