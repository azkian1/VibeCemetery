import { test, expect } from '@playwright/test'
import { validateGitHubRepoEligibility } from '../src/app/api/graves/githubRepoEligibility'

const deadPushedAt = '2026-04-01T00:00:00Z'

function makeRepo(overrides: Partial<{
  id: number
  fork: boolean
  pushed_at: string
  owner: { login: string }
}> = {}) {
  return {
    id: overrides.id ?? 123,
    fork: overrides.fork ?? false,
    pushed_at: overrides.pushed_at ?? deadPushedAt,
    owner: overrides.owner ?? { login: 'octocat' },
  }
}

test.describe('validateGitHubRepoEligibility', () => {
  test('accepts own non-fork repository inactive for at least 14 days', () => {
    const result = validateGitHubRepoEligibility({
      repo: makeRepo(),
      expectedRepoId: 123,
      authenticatedUsername: 'OctoCat',
      now: new Date('2026-05-01T00:00:00Z'),
    })

    expect(result).toEqual({ ok: true })
  })

  test('rejects repository owned by another GitHub user', () => {
    const result = validateGitHubRepoEligibility({
      repo: makeRepo({ owner: { login: 'someone-else' } }),
      expectedRepoId: 123,
      authenticatedUsername: 'octocat',
      now: new Date('2026-05-01T00:00:00Z'),
    })

    expect(result).toEqual({ ok: false, status: 403, error: 'You can only bury your own GitHub repositories' })
  })

  test('rejects active repositories and forks', () => {
    expect(validateGitHubRepoEligibility({
      repo: makeRepo({ pushed_at: '2026-04-25T00:00:00Z' }),
      expectedRepoId: 123,
      authenticatedUsername: 'octocat',
      now: new Date('2026-05-01T00:00:00Z'),
    })).toEqual({ ok: false, status: 400, error: 'Repository is not dead yet' })

    expect(validateGitHubRepoEligibility({
      repo: makeRepo({ fork: true }),
      expectedRepoId: 123,
      authenticatedUsername: 'octocat',
      now: new Date('2026-05-01T00:00:00Z'),
    })).toEqual({ ok: false, status: 400, error: 'Forked repositories cannot be buried' })
  })

  test('rejects malformed fork status from GitHub', () => {
    const result = validateGitHubRepoEligibility({
      repo: { ...makeRepo(), fork: undefined },
      expectedRepoId: 123,
      authenticatedUsername: 'octocat',
      now: new Date('2026-05-01T00:00:00Z'),
    })

    expect(result).toEqual({ ok: false, status: 400, error: 'Repository fork status is invalid' })
  })

  test('rejects mismatched GitHub repository ids', () => {
    const result = validateGitHubRepoEligibility({
      repo: makeRepo({ id: 456 }),
      expectedRepoId: 123,
      authenticatedUsername: 'octocat',
      now: new Date('2026-05-01T00:00:00Z'),
    })

    expect(result).toEqual({ ok: false, status: 400, error: 'github_repo_id does not match repository URL' })
  })
})
