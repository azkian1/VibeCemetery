import { readStrictJsonObject, BurnHttpError } from '@/lib/web3/http'
import type { resolveCliActor as ResolveActor } from '@/lib/cli-auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publicGrave } from '@/lib/public-grave'
import { NextRequest, NextResponse } from 'next/server'
import { isAgentAshEnvelope, isAgentAshIngestToken } from '@/lib/agent-ash-boundary'
import { getClientIp, type checkRateLimit as RateLimit } from '@/lib/rate-limit'
import { getAutoAssignableGraveSlots, pickRandomFreeSlot } from '@/lib/map-slots'
import { sanitizePublicText } from '@/lib/sanitize-public-text'
import { parseMapVersion } from '@/lib/map-version'
import { generateEpitaph } from '@/gravedigger/epitaphs'
import { insertGraveAtomicallyWithSlotRetry, type AtomicInsertRpcResult } from './atomicInsertWithSlotRetry'
import { insertOutcomeResponse } from './insertOutcomeResponse'
import {
  fetchGitHubRepo as defaultFetchRepo,
  fetchGitHubRepoRootContents as defaultFetchContents,
  parseGitHubRepoUrl,
  validateGitHubRepoEligibility,
  validateGitHubRootContentsEligibility,
} from './githubRepoEligibility'
import { isValidGraveDate, hasOrderedGraveDates } from '@/lib/grave-dates'

const GITHUB_REPO_VERIFY_LIMIT = 30
const GITHUB_REPO_VERIFY_WINDOW_MS = 60_000
export function createGravePostHandler({
  resolveCliActor, supabaseAdmin, checkRateLimit,
  fetchGitHubRepo = defaultFetchRepo, fetchGitHubRepoRootContents = defaultFetchContents,
}: {
  resolveCliActor: typeof ResolveActor
  supabaseAdmin: Pick<SupabaseClient, 'from' | 'rpc'>
  checkRateLimit: typeof RateLimit
  fetchGitHubRepo?: typeof defaultFetchRepo
  fetchGitHubRepoRootContents?: typeof defaultFetchContents
}) {
  return async function POST(req: NextRequest) {
    const bearerToken = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    if (isAgentAshIngestToken(bearerToken)) {
      return NextResponse.json(
        { error: 'Agent Ash ingest tokens cannot create graves' },
        { status: 403 },
      )
    }

    // 1. Authenticate
    let actor
    try { actor = await resolveCliActor(req) }
    catch { return NextResponse.json({ error: 'Authentication temporarily unavailable' }, { status: 503 }) }
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const author_github = actor.username.toLowerCase()

    // 2. Parse body
    let body: Record<string, unknown>
    try {
      body = await readStrictJsonObject(req, 16 * 1024)
    } catch (error) {
      return NextResponse.json({ error: error instanceof BurnHttpError ? error.publicMessage : 'Invalid JSON body' }, { status: error instanceof BurnHttpError ? error.status : 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })
    }

    if (isAgentAshEnvelope(body)) {
      return NextResponse.json(
        { error: 'Agent Ash submissions cannot create graves' },
        { status: 403 },
      )
    }

    const isLocal = body.source === 'local'
    if (body.source != null && body.source !== 'github' && !isLocal) {
      return NextResponse.json({ error: 'Invalid project source' }, { status: 400 })
    }
    if (isLocal && actor.source !== 'cli') {
      return NextResponse.json({ error: 'Local burials require GitHub-approved agent access' }, { status: 403 })
    }
    if (isLocal && (typeof body.project_key !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(body.project_key) || body.github_url != null || body.github_repo_id != null)) {
      return NextResponse.json({ error: 'Local burials require project_key and no GitHub repository fields' }, { status: 400 })
    }
    const writeLimit = await checkRateLimit('grave-write:' + author_github + ':' + getClientIp(req), 30, 60_000)
    if (!writeLimit.allowed) return NextResponse.json({ error: 'Too many burial requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(writeLimit.retryAfterMs / 1000)) } })
    const {
      github_url,
      github_repo_id,
      name,
      born_at,
      died_at,
      cause,
      description,
      stack,
      last_commit_message,
      map_version,
    } = body as {
      github_url?: string
      github_repo_id?: number
      name?: string
      born_at?: string
      died_at?: string
      cause?: string
      description?: string
      stack?: string[]
      last_commit_message?: string
      map_version?: string
    }

    const mapVersion = parseMapVersion(map_version)
    if (!mapVersion) {
      return NextResponse.json({ error: 'map_version must be v1' }, { status: 400 })
    }

    // 3. Validate github_url format
    const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
    if (!isLocal && (typeof github_url !== 'string' || !GITHUB_URL_RE.test(github_url))) {
      return NextResponse.json(
        { error: 'Invalid github_url — must be a GitHub repository URL' },
        { status: 400 },
      );
    }

    // 4. Validate types and required fields
    if (typeof name !== 'string' || typeof cause !== 'string') {
      return NextResponse.json({ error: 'name and cause must be strings' }, { status: 400 })
    }
    if (!isLocal && (typeof github_repo_id !== 'number' || !Number.isSafeInteger(github_repo_id) || github_repo_id <= 0)) {
      return NextResponse.json({ error: 'github_repo_id must be a positive integer' }, { status: 400 })
    }
    if (!name.trim() || !cause.trim()) {
      return NextResponse.json(
        { error: 'name and cause must not be empty' },
        { status: 400 },
      )
    }

    // 4.1 Validate field lengths
    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'name must be ≤ 100 characters' }, { status: 400 })
    }
    if (cause.trim().length > 200) {
      return NextResponse.json({ error: 'cause must be ≤ 200 characters' }, { status: 400 })
    }
    if (description != null && (typeof description !== 'string' || description.trim().length > 500)) {
      return NextResponse.json({ error: 'description must be ≤ 500 characters' }, { status: 400 })
    }
    if (last_commit_message != null && (typeof last_commit_message !== 'string' || last_commit_message.trim().length > 500)) {
      return NextResponse.json({ error: 'last_commit_message must be ≤ 500 characters' }, { status: 400 })
    }

    // 4.2 Validate date fields
    if (born_at != null && !isValidGraveDate(born_at)) {
      return NextResponse.json({ error: 'born_at must be a valid ISO 8601 date' }, { status: 400 })
    }
    if (died_at != null && !isValidGraveDate(died_at)) {
      return NextResponse.json({ error: 'died_at must be a valid ISO 8601 date' }, { status: 400 })
    }
    if (!hasOrderedGraveDates(born_at, died_at)) {
      return NextResponse.json({ error: 'died_at must not precede born_at' }, { status: 400 })
    }
    if (stack != null) {
      if (!Array.isArray(stack) || stack.length > 20) {
        return NextResponse.json({ error: 'stack must be an array of ≤ 20 items' }, { status: 400 })
      }
      if (stack.some((item) => typeof item !== 'string' || item.length > 50)) {
        return NextResponse.json({ error: 'each stack item must be a string ≤ 50 characters' }, { status: 400 })
      }
    }

    if (!isLocal) {
      const parsedGithubUrl = parseGitHubRepoUrl(github_url!)
      if (!parsedGithubUrl) {
        return NextResponse.json(
          { error: 'Invalid github_url — must be a GitHub repository URL' },
          { status: 400 },
        )
      }

      const verifyRateLimit = await checkRateLimit(
        `grave-verify:${author_github}:${getClientIp(req)}`,
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

      const eligibility = validateGitHubRepoEligibility({
        repo: githubRepo && typeof githubRepo === 'object' ? githubRepo : {},
        expectedRepoId: github_repo_id!,
        authenticatedUsername: author_github,
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

    // 4.3 Sanitize and normalize whitespace
    const trimmedName = sanitizePublicText(name, 100);
    const trimmedCause = sanitizePublicText(cause, 200);
    const trimmedDescription = typeof description === 'string' ? sanitizePublicText(description, 500) : null;

    if (!trimmedName || !trimmedCause) {
      return NextResponse.json(
        { error: 'name and cause must not be empty' },
        { status: 400 },
      )
    }

    // 5. Generate epitaph + insert grave.
    // Repo uniqueness is enforced by the DB; slot selection is retried on expected slot collisions.
    const epitaph = generateEpitaph({
      name: trimmedName,
      cause: trimmedCause,
      stack: stack ? stack.map(s => sanitizePublicText(s, 50)) : null,
      born_at: born_at ?? null,
      died_at: died_at ?? null,
    })

    const graveRow = {
      name: trimmedName,
      description: trimmedDescription,
      epitaph,
      born_at: born_at ?? null,
      died_at: died_at ?? null,
      cause: trimmedCause,
      stack: stack ? stack.map(s => sanitizePublicText(s, 50)) : null,
      github_url: isLocal ? null : github_url,
      github_repo_id: isLocal ? null : github_repo_id,
      source: isLocal ? 'local' : 'github',
      project_key: isLocal ? body.project_key : null,
      author_github,
      last_commit_message: typeof last_commit_message === 'string' ? sanitizePublicText(last_commit_message, 500) : null,
    }

    const autoSlotIds = getAutoAssignableGraveSlots().map((slot) => slot.id)

    type InsertedGrave = { id: string; slot_id: number } & Record<string, unknown>
    let insertOutcome: Awaited<ReturnType<typeof insertGraveAtomicallyWithSlotRetry<InsertedGrave>>>
    try {
      insertOutcome = await insertGraveAtomicallyWithSlotRetry({
        maxAttempts: 5,
        loadUsedSlotIds: async () => {
          const { data, error } = await supabaseAdmin.from('graves').select('slot_id').eq('map_version', mapVersion)
          if (error) throw error
          return (data ?? []).map(row => row.slot_id)
        },
        pickSlot: (usedIds) => {
          const slot = pickRandomFreeSlot(usedIds)
          return slot ?? { id: 0 }
        },
        insertGrave: async (slotId) => {
          const { data, error } = await supabaseAdmin.rpc('create_grave_once', {
            p_author_github: author_github, p_grave: graveRow, p_auto_slot_ids: autoSlotIds,
            p_slot_id: slotId, p_map_version: mapVersion, p_grave_gid: null,
          })

          if (error) {
            return { status: 'failed', message: error.message }
          }

          if (!data || typeof data !== 'object') {
            return { status: 'failed', message: 'Empty grave insert RPC response' }
          }

          return data as AtomicInsertRpcResult<InsertedGrave>
        },
      })
    } catch (error) {
      console.error('Failed during grave slot selection:', error)
      return NextResponse.json({ error: 'Failed to create grave' }, { status: 500 })
    }

    const handledInsertOutcome = insertOutcomeResponse(insertOutcome)
    if (handledInsertOutcome) {
      return handledInsertOutcome
    }

    if (insertOutcome.status !== 'created' && insertOutcome.status !== 'replayed') {
      console.error('Unhandled grave insert outcome:', insertOutcome)
      return NextResponse.json({ error: 'Failed to create grave' }, { status: 500 })
    }

    const grave = insertOutcome.data

    return NextResponse.json(publicGrave(grave), { status: insertOutcome.status === 'replayed' ? 200 : 201 })
  }

}
