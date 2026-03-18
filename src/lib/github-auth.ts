/**
 * Validate a GitHub PAT and return the associated username.
 * Used by API routes to support Bearer token auth from CLI tools.
 */
export async function resolveGithubUsername(
  pat: string
): Promise<string | null> {
  if (!pat || pat.length < 10 || !/^(ghp_|github_pat_)/.test(pat)) {
    return null
  }

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.login ?? null
  } catch {
    return null
  }
}
