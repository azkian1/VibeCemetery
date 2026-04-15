import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

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

  test('validates localhost approval urls against claim proof and link id', async () => {
    const { validateApproveUrl } = await loadHelper()
    const valid = validateApproveUrl({
      approveUrl: 'http://localhost:3000/cli/connect?link_id=11111111-1111-4111-8111-111111111111#claim_token=claim-proof-token-1234567890',
      apiBaseUrl: 'http://localhost:3000',
      linkId: '11111111-1111-4111-8111-111111111111',
      claimToken: 'claim-proof-token-1234567890',
    })

    expect(valid.ok).toBe(true)

    const invalid = validateApproveUrl({
      approveUrl: 'https://vibecemetery.com/cli/connect?link_id=11111111-1111-4111-8111-111111111111#claim_token=claim-proof-token-1234567890',
      apiBaseUrl: 'http://localhost:3000',
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
