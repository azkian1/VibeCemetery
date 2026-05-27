import { NextRequest, NextResponse } from 'next/server'
import {
  fetchGitHubRepo,
  fetchGitHubRepoRootContents,
  parseGitHubRepoUrl,
  validateGitHubRepoEligibility,
  validateGitHubRootContentsEligibility,
} from '@/app/api/graves/githubRepoEligibility'
import { isAgentAshEnvelope, isAgentAshIngestToken } from '@/lib/agent-ash-boundary'
import { resolveCliActor } from '@/lib/cli-auth'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { sanitizePublicText } from '@/lib/sanitize-public-text'
import { supabaseAdmin } from '@/lib/supabase'

const GITHUB_REPO_VERIFY_LIMIT = 15
const GITHUB_REPO_VERIFY_WINDOW_MS = 60_000

function normalizeGithubRepoUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

export async function POST(request: NextRequest) {
  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (isAgentAshIngestToken(bearerToken)) {
    return NextResponse.json(
      { error: 'Agent Ash ingest tokens cannot access human cremations' },
      { status: 403 },
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid or malformed request body' },
      { status: 400 }
    )
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })
  }

  if (isAgentAshEnvelope(body)) {
    return NextResponse.json(
      { error: 'Agent Ash submissions must use /api/agent-ashes' },
      { status: 403 },
    )
  }

  const actor = await resolveCliActor(request)
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const authorGithub = actor.username

  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(authorGithub)) {
    return NextResponse.json({ error: 'Invalid username format' }, { status: 400 })
  }

  const { name, cause, github_url, last_commit_message } = body as Record<string, unknown>

  if (typeof name !== 'string' || typeof cause !== 'string') {
    return NextResponse.json({ error: 'name and cause must be strings' }, { status: 400 })
  }

  const trimmedName = sanitizePublicText(name)
  const trimmedCause = sanitizePublicText(cause)

  if (!trimmedName || !trimmedCause) {
    return NextResponse.json(
      { error: 'name and cause are required' },
      { status: 400 }
    )
  }
  if (trimmedName.length > 100) {
    return NextResponse.json({ error: 'name must be ≤ 100 characters' }, { status: 400 })
  }
  if (trimmedCause.length > 200) {
    return NextResponse.json({ error: 'cause must be ≤ 200 characters' }, { status: 400 })
  }

  // Rate limit: first 50 cremations unlimited, then 3/day
  const { count: totalCount, error: totalError } = await supabaseAdmin
    .from('cremated')
    .select('id', { count: 'exact', head: true })
    .eq('author_github', authorGithub)

  if (totalError) {
    return NextResponse.json(
      { error: 'Failed to check rate limit' },
      { status: 500 }
    )
  }

  const pastFirstBurn = (totalCount ?? 0) >= 50
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  if (pastFirstBurn) {

    const { count: dailyCount, error: dailyError } = await supabaseAdmin
      .from('cremated')
      .select('id', { count: 'exact', head: true })
      .eq('author_github', authorGithub)
      .gte('created_at', todayStart.toISOString())

    if (dailyError) {
      return NextResponse.json(
        { error: 'Failed to check rate limit' },
        { status: 500 }
      )
    }

    if ((dailyCount ?? 0) >= 3) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 3 cremations per day.' },
        { status: 429 }
      )
    }
  }

  // Validate optional fields
  const trimmedGithubUrl = typeof github_url === 'string' && github_url.trim()
    ? normalizeGithubRepoUrl(github_url.trim())
    : null
  const trimmedLastCommit = typeof last_commit_message === 'string' && last_commit_message.trim()
    ? sanitizePublicText(last_commit_message, 200)
    : null

  if (actor.source === 'session' && !trimmedGithubUrl) {
    return NextResponse.json(
      { error: 'github_url is required for browser cremations' },
      { status: 400 },
    )
  }

  // Grave-first is a product UX preference, not a cremation data invariant.
  // Keep this endpoint independent from slot economy so CLI /bury and explicit
  // direct human cremations remain valid.

  if (trimmedGithubUrl && !/^https:\/\/github\.com\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/?$/.test(trimmedGithubUrl)) {
    return NextResponse.json({ error: 'github_url must be a valid GitHub repo URL' }, { status: 400 })
  }

  if (trimmedGithubUrl) {
    const parsedGithubUrl = parseGitHubRepoUrl(trimmedGithubUrl)
    if (!parsedGithubUrl) {
      return NextResponse.json({ error: 'github_url must be a valid GitHub repo URL' }, { status: 400 })
    }

    const { data: existingGrave, error: existingGraveError } = await supabaseAdmin
      .from('graves')
      .select('id')
      .in('github_url', [trimmedGithubUrl, `${trimmedGithubUrl}/`])
      .limit(1)
      .maybeSingle()

    if (existingGraveError) {
      return NextResponse.json(
        { error: 'Failed to check existing burial' },
        { status: 500 }
      )
    }

    if (existingGrave) {
      return NextResponse.json(
        { error: 'This repository has already been buried' },
        { status: 409 }
      )
    }

    const verifyRateLimit = await checkRateLimit(
      `cremated-verify:${authorGithub}:${getClientIp(request)}`,
      GITHUB_REPO_VERIFY_LIMIT,
      GITHUB_REPO_VERIFY_WINDOW_MS,
    )
    if (!verifyRateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many GitHub repository verification attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(verifyRateLimit.retryAfterMs / 1000)) },
        },
      )
    }

    let githubRepo: unknown
    try {
      const githubResponse = await fetchGitHubRepo(parsedGithubUrl.owner, parsedGithubUrl.repo)
      if (githubResponse.status === 404) {
        return NextResponse.json({ error: 'GitHub repository not found' }, { status: 404 })
      }
      if (githubResponse.status === 403 || githubResponse.status === 429) {
        return NextResponse.json({ error: 'GitHub API rate limit exceeded. Please try again later.' }, { status: 429 })
      }
      if (!githubResponse.ok) {
        return NextResponse.json({ error: 'Failed to verify GitHub repository' }, { status: 502 })
      }

      githubRepo = await githubResponse.json()
    } catch {
      return NextResponse.json({ error: 'Failed to verify GitHub repository' }, { status: 502 })
    }

    const githubRepoId = githubRepo && typeof githubRepo === 'object' && typeof (githubRepo as { id?: unknown }).id === 'number'
      ? (githubRepo as { id: number }).id
      : 0
    const { data: existingGraveByRepoId, error: existingGraveByRepoIdError } = await supabaseAdmin
      .from('graves')
      .select('id')
      .eq('github_repo_id', githubRepoId)
      .limit(1)
      .maybeSingle()

    if (existingGraveByRepoIdError) {
      return NextResponse.json(
        { error: 'Failed to check existing burial' },
        { status: 500 }
      )
    }

    if (existingGraveByRepoId) {
      return NextResponse.json(
        { error: 'This repository has already been buried' },
        { status: 409 }
      )
    }

    const eligibility = validateGitHubRepoEligibility({
      repo: githubRepo && typeof githubRepo === 'object' ? githubRepo : {},
      expectedRepoId: githubRepoId,
      authenticatedUsername: authorGithub,
    })
    if (!eligibility.ok) {
      return NextResponse.json({ error: eligibility.error }, { status: eligibility.status })
    }

    try {
      const contentsResponse = await fetchGitHubRepoRootContents(parsedGithubUrl.owner, parsedGithubUrl.repo)
      if (contentsResponse.status === 403 || contentsResponse.status === 429) {
        return NextResponse.json({ error: 'GitHub API rate limit exceeded. Please try again later.' }, { status: 429 })
      }
      if (contentsResponse.status === 404 || contentsResponse.status === 409) {
        return NextResponse.json({ error: 'Empty or non-project repositories cannot be buried' }, { status: 400 })
      }
      if (!contentsResponse.ok) {
        return NextResponse.json({ error: 'Failed to verify GitHub repository contents' }, { status: 502 })
      }

      const contents = await contentsResponse.json()
      const contentsEligibility = validateGitHubRootContentsEligibility(Array.isArray(contents) ? contents : [])
      if (!contentsEligibility.ok) {
        return NextResponse.json({ error: contentsEligibility.error }, { status: contentsEligibility.status })
      }
    } catch {
      return NextResponse.json({ error: 'Failed to verify GitHub repository contents' }, { status: 502 })
    }

  }

  // Insert record
  const { data, error: insertError } = await supabaseAdmin
    .from('cremated')
    .insert({
      name: trimmedName,
      cause: trimmedCause,
      author_github: authorGithub,
      source: actor.source === 'session' ? 'github' : 'skill',
      ...(trimmedGithubUrl && { github_url: trimmedGithubUrl }),
      ...(trimmedLastCommit && { last_commit_message: trimmedLastCommit }),
    })
    .select('id, name, cause, author_github, github_url, last_commit_message, created_at, source')
    .single()

  if (insertError) {
    return NextResponse.json(
      { error: 'Failed to create record' },
      { status: 500 }
    )
  }

  // Post-insert race-condition check (only after first 50)
  if (pastFirstBurn) {
    const { count: postCount } = await supabaseAdmin
      .from('cremated')
      .select('id', { count: 'exact', head: true })
      .eq('author_github', authorGithub)
      .gte('created_at', todayStart.toISOString())

    if ((postCount ?? 0) > 3) {
      const { error: delErr } = await supabaseAdmin.from('cremated').delete().eq('id', data.id)
      if (delErr) console.error('Rate-limit rollback failed for cremated', data.id)
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 3 cremations per day.' },
        { status: 429 }
      )
    }
  }

  // Increment cremated_count for the user
  const { error: incrementError } = await supabaseAdmin.rpc('increment_cremated_count', {
    username: authorGithub,
  })

  if (incrementError) {
    const { data: userData, error: loadUserError } = await supabaseAdmin
      .from('users')
      .select('cremated_count')
      .eq('github_username', authorGithub)
      .single()

    if (loadUserError) {
      console.error('Failed to load cremated_count fallback user', loadUserError)
    } else {
      const { error: updateUserError } = await supabaseAdmin
        .from('users')
        .update({ cremated_count: (userData?.cremated_count ?? 0) + 1 })
        .eq('github_username', authorGithub)

      if (updateUserError) {
        console.error('Failed to update cremated_count fallback', updateUserError)
      }
    }
  }

  return NextResponse.json(data, { status: 201 })
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('cremated')
    .select('id, name, cause, author_github, github_url, last_commit_message, created_at, source')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch records' },
      { status: 500 }
    )
  }

  return NextResponse.json(data)
}
