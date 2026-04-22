import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
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
        git_remote: 'https://user:token@github.com/example-owner/LegacyApp.git',
        first_commit: '5a380e438ab0887c70b37908fd1ccc7ea690872e',
        cremated_at: '2026-03-16',
        cause: 'Lost interest',
      },
    ])

    expect(entries).toEqual([
      {
        name: 'LegacyApp',
        path_fingerprint: `sha256:${createHash('sha256').update(canonicalLegacyPath).digest('hex')}`,
        git_remote: 'github.com/example-owner/LegacyApp',
        first_commit: '5a380e438ab0887c70b37908fd1ccc7ea690872e',
        cremated_at: '2026-03-16',
        cause: 'Lost interest',
      },
    ])
  })

  test('sanitizes github_url before building cremation payloads', async () => {
    const { buildCremationBody } = await loadHelper()

    expect(buildCremationBody({
      name: 'LegacyApp',
      cause: 'Lost interest',
      github_url: 'https://user:token@github.com/example-owner/LegacyApp.git',
      last_commit_message: 'final commit',
    })).toEqual({
      name: 'LegacyApp',
      cause: 'Lost interest',
      github_url: 'https://github.com/example-owner/LegacyApp',
      last_commit_message: 'final commit',
    })

    expect(buildCremationBody({
      name: 'LegacyApp',
      cause: 'Lost interest',
      github_url: 'https://github.com/example-owner/LegacyApp/issues/1',
    })).toEqual({
      name: 'LegacyApp',
      cause: 'Lost interest',
    })
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
})
