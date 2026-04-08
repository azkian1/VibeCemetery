import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

const helperPath = `${process.cwd().replace(/\\/g, '/')}/.claude/skills/bury-workflow/bury-helper.mjs`

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
})
