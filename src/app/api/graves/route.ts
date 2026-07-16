import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isAgentAshEnvelope, isAgentAshIngestToken } from '@/lib/agent-ash-boundary'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getAutoAssignableGraveSlots, getGraveSlots, pickRandomFreeSlot } from '@/lib/map-slots'
import { sanitizePublicText } from '@/lib/sanitize-public-text'
import { parseMapVersion } from '@/lib/map-version'
import { generateEpitaph } from '@/gravedigger/epitaphs'
import { insertGraveAtomicallyWithSlotRetry, type AtomicInsertRpcResult } from './atomicInsertWithSlotRetry'
import { insertOutcomeResponse } from './insertOutcomeResponse'
import {
  fetchGitHubRepo,
  fetchGitHubRepoRootContents,
  parseGitHubRepoUrl,
  validateGitHubRepoEligibility,
  validateGitHubRootContentsEligibility,
} from './githubRepoEligibility'
import { pickRandomGraveGid } from '@/game/utils/tileRegistry-v2'

const GITHUB_REPO_VERIFY_LIMIT = 30
const GITHUB_REPO_VERIFY_WINDOW_MS = 60_000

async function syncUserGravesCount(authorGithub: string, mapVersion: string = 'v1'): Promise<void> {
  const { count, error: countError } = await supabaseAdmin
    .from('graves')
    .select('*', { count: 'exact', head: true })
    .eq('author_github', authorGithub)
    .eq('map_version', mapVersion)

  if (countError) {
    console.error('Failed to recount graves for user:', authorGithub, countError)
    return
  }

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ graves_count: count ?? 0 })
    .eq('github_username', authorGithub)

  if (updateError) {
    console.error('Failed to sync graves_count for user:', authorGithub, updateError)
  }
}

// ---------------------------------------------------------------------------
// GET /api/graves — list all graves, optionally filtered by author
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const author = searchParams.get('author')
  const mapVersion = parseMapVersion(
    searchParams.has('map_version') ? searchParams.get('map_version') : undefined,
  )
  if (!mapVersion) {
    return NextResponse.json({ error: 'map_version must be one of: v1, v2' }, { status: 400 })
  }

  const limitParam = parseInt(searchParams.get('limit') ?? '500', 10)
  const limit = Math.min(Math.max(1, limitParam || 500), 500)
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0)
  const knownSlotIds = getGraveSlots(mapVersion).map((slot) => slot.id)

  if (knownSlotIds.length === 0) {
    return NextResponse.json([])
  }

  let query = supabaseAdmin
    .from('graves')
    .select('*')
    .in('slot_id', knownSlotIds)
    .order('slot_id', { ascending: true })
    .range(offset, offset + limit - 1)

  // Filter by map_version when column exists; gracefully skip if migration not applied
  query = query.eq('map_version', mapVersion)

  if (author) {
    query = query.eq('author_github', author)
  }

  let { data, error } = await query

  // Legacy databases predate map_version. Their records belong to map1;
  // map2 must start empty rather than accidentally rendering those graves
  // into unrelated Map4 slots.
  if (error && error.message?.includes('map_version')) {
    if (mapVersion === 'v2') {
      return NextResponse.json([])
    }

    let fallbackQuery = supabaseAdmin
      .from('graves')
      .select('*')
      .in('slot_id', knownSlotIds)
      .order('slot_id', { ascending: true })
      .range(offset, offset + limit - 1)

    if (author) {
      fallbackQuery = fallbackQuery.eq('author_github', author)
    }

    const fallback = await fallbackQuery
    data = fallback.data
    error = fallback.error
  }

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch graves' }, { status: 500 })
  }

  // Enrich with real f_count from f_votes (source of truth)
  if (data && data.length > 0) {
    const ids = data.map((g: { id: string }) => g.id)
    const { data: votes, error: votesError } = await supabaseAdmin
      .from('f_votes')
      .select('grave_id')
      .in('grave_id', ids)

    if (votesError) {
      console.error('f_votes enrichment failed, returning cached counts:', votesError.message)
    }
    if (votes) {
      const counts = new Map<string, number>()
      for (const v of votes) {
        counts.set(v.grave_id, (counts.get(v.grave_id) ?? 0) + 1)
      }
      for (const g of data as { id: string; f_count?: number }[]) {
        g.f_count = counts.get(g.id) ?? 0
      }
    }
  }

  return NextResponse.json(data)
}

// ---------------------------------------------------------------------------
// POST /api/graves — create a new grave (authenticated)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const bearerToken = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (isAgentAshIngestToken(bearerToken)) {
    return NextResponse.json(
      { error: 'Agent Ash ingest tokens cannot create graves' },
      { status: 403 },
    )
  }

  // 1. Authenticate
  const session = await getServerSession(authOptions)
  if (!session?.user?.github_username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const author_github = session.user.github_username

  // 2. Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
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
    return NextResponse.json({ error: 'map_version must be one of: v1, v2' }, { status: 400 })
  }

  // Rate limit: quick pre-check (non-authoritative, just to fail fast)
  let preCheck = 0
  try {
    const { count } = await supabaseAdmin
      .from('graves')
      .select('*', { count: 'exact', head: true })
      .eq('author_github', author_github)
      .eq('map_version', mapVersion)
      .gte('created_at', new Date(Date.now() - 86400000).toISOString());
    preCheck = count ?? 0
  } catch {
    // map_version column may not exist yet — skip rate-limit check
  }

  if ((preCheck ?? 0) >= 20) {
    return NextResponse.json(
      { error: 'Rate limit: max 20 graves per day' },
      { status: 429 },
    );
  }

  // 3. Validate github_url format
  const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
  if (!github_url || !GITHUB_URL_RE.test(github_url)) {
    return NextResponse.json(
      { error: 'Invalid github_url — must be a GitHub repository URL' },
      { status: 400 },
    );
  }

  // 4. Validate types and required fields
  if (typeof name !== 'string' || typeof cause !== 'string') {
    return NextResponse.json({ error: 'name and cause must be strings' }, { status: 400 })
  }
  if (github_repo_id == null || typeof github_repo_id !== 'number' || !Number.isInteger(github_repo_id) || github_repo_id <= 0) {
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
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;
  if (born_at != null && (typeof born_at !== 'string' || !ISO_DATE_RE.test(born_at) || isNaN(Date.parse(born_at)))) {
    return NextResponse.json({ error: 'born_at must be a valid ISO 8601 date' }, { status: 400 })
  }
  if (died_at != null && (typeof died_at !== 'string' || !ISO_DATE_RE.test(died_at) || isNaN(Date.parse(died_at)))) {
    return NextResponse.json({ error: 'died_at must be a valid ISO 8601 date' }, { status: 400 })
  }
  if (stack != null) {
    if (!Array.isArray(stack) || stack.length > 20) {
      return NextResponse.json({ error: 'stack must be an array of ≤ 20 items' }, { status: 400 })
    }
    if (stack.some((item) => typeof item !== 'string' || item.length > 50)) {
      return NextResponse.json({ error: 'each stack item must be a string ≤ 50 characters' }, { status: 400 })
    }
  }

  const parsedGithubUrl = parseGitHubRepoUrl(github_url)
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
    expectedRepoId: github_repo_id,
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
    github_url,
    github_repo_id,
    author_github,
    last_commit_message: typeof last_commit_message === 'string' ? sanitizePublicText(last_commit_message, 500) : null,
  }

  const autoSlotIds = getAutoAssignableGraveSlots(mapVersion).map((slot) => slot.id)
  // For v2: the slot type is needed to pick a random GID; capture it during slot-pick
  let pickedSlotType = ''

  type InsertedGrave = { id: string; slot_id: number } & Record<string, unknown>
  let insertOutcome: Awaited<ReturnType<typeof insertGraveAtomicallyWithSlotRetry<InsertedGrave>>>
  try {
    insertOutcome = await insertGraveAtomicallyWithSlotRetry({
      maxAttempts: 5,
      loadUsedSlotIds: async () => {
        const usedQuery = supabaseAdmin
          .from('graves')
          .select('slot_id')

        // Filter by map_version when column exists; gracefully skip if migration not applied
        try {
          const { data: usedSlots, error } = await usedQuery.eq('map_version', mapVersion)
          if (error && error.message?.includes('map_version')) {
            const { data: allSlots } = await supabaseAdmin
              .from('graves')
              .select('slot_id')
            return (allSlots ?? []).map((row) => row.slot_id)
          }
          if (error) throw error
          return (usedSlots ?? []).map((row) => row.slot_id)
        } catch {
          const { data: allSlots } = await supabaseAdmin
            .from('graves')
            .select('slot_id')
          return (allSlots ?? []).map((row) => row.slot_id)
        }

      },
      pickSlot: (usedIds) => {
        const slot = pickRandomFreeSlot(usedIds, mapVersion)
        if (slot) pickedSlotType = slot.type
        return slot
      },
      insertGrave: async (slotId) => {
        const graveGid = mapVersion === 'v2' ? pickRandomGraveGid(pickedSlotType) : null
        const rpcParams: Record<string, unknown> = {
          p_author_github: author_github,
          p_auto_slot_ids: autoSlotIds,
          p_slot_id: slotId,
          p_name: graveRow.name,
          p_description: graveRow.description,
          p_epitaph: graveRow.epitaph,
          p_born_at: graveRow.born_at,
          p_died_at: graveRow.died_at,
          p_cause: graveRow.cause,
          p_stack: graveRow.stack,
          p_github_url: graveRow.github_url,
          p_github_repo_id: graveRow.github_repo_id,
          p_last_commit_message: graveRow.last_commit_message,
          p_map_version: mapVersion,
        }
        if (graveGid !== null) {
          rpcParams.p_grave_gid = graveGid
        }
        const { data, error } = await supabaseAdmin.rpc('insert_grave_if_user_slot_available', rpcParams)

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

  if (insertOutcome.status !== 'created') {
    console.error('Unhandled grave insert outcome:', insertOutcome)
    return NextResponse.json({ error: 'Failed to create grave' }, { status: 500 })
  }

  const grave = insertOutcome.data

  // 9. Increment graves_count for the author
  const { error: rpcError } = await supabaseAdmin.rpc('increment_graves_count', {
    username: author_github,
  })

  if (rpcError) {
    console.error('increment_graves_count RPC failed, syncing exact count instead:', rpcError)
    await syncUserGravesCount(author_github, mapVersion)
  }

  return NextResponse.json(grave, { status: 201 })
}
