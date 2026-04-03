import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { pickRandomFreeSlot } from '@/lib/map-slots'
import { generateEpitaph } from '@/gravedigger/epitaphs'
import { insertGraveWithSlotRetry } from './insertWithSlotRetry'

/** Strip HTML tags and collapse whitespace — defense-in-depth for stored text */
function sanitize(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

async function syncUserGravesCount(authorGithub: string): Promise<void> {
  const { count, error: countError } = await supabaseAdmin
    .from('graves')
    .select('*', { count: 'exact', head: true })
    .eq('author_github', authorGithub)

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

  const limitParam = parseInt(searchParams.get('limit') ?? '500', 10)
  const limit = Math.min(Math.max(1, limitParam || 500), 500)
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0)

  let query = supabaseAdmin
    .from('graves')
    .select('*')
    .order('slot_id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (author) {
    query = query.eq('author_github', author)
  }

  const { data, error } = await query

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
  // 1. Authenticate
  const session = await getServerSession(authOptions)
  if (!session?.user?.github_username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const author_github = session.user.github_username

  // Rate limit: quick pre-check (non-authoritative, just to fail fast)
  const { count: preCheck } = await supabaseAdmin
    .from('graves')
    .select('*', { count: 'exact', head: true })
    .eq('author_github', author_github)
    .gte('created_at', new Date(Date.now() - 86400000).toISOString());

  if ((preCheck ?? 0) >= 20) {
    return NextResponse.json(
      { error: 'Rate limit: max 20 graves per day' },
      { status: 429 },
    );
  }

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

  // 4.3 Sanitize and normalize whitespace
  const trimmedName = sanitize(name);
  const trimmedCause = sanitize(cause);
  const trimmedDescription = typeof description === 'string' ? sanitize(description) : null;

  // 5. Generate epitaph + insert grave.
  // Repo uniqueness is enforced by the DB; slot selection is retried on expected slot collisions.
  const epitaph = generateEpitaph({
    name: trimmedName,
    cause: trimmedCause,
    stack: stack ? stack.map(s => sanitize(s)) : null,
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
    stack: stack ? stack.map(s => sanitize(s)) : null,
    github_url,
    github_repo_id,
    author_github,
    last_commit_message: typeof last_commit_message === 'string' ? sanitize(last_commit_message) : null,
  }

  type InsertedGrave = { id: string; slot_id: number } & Record<string, unknown>
  let insertOutcome: Awaited<ReturnType<typeof insertGraveWithSlotRetry<InsertedGrave>>>
  try {
    insertOutcome = await insertGraveWithSlotRetry({
      maxAttempts: 5,
      loadUsedSlotIds: async () => {
        const { data: usedSlots, error } = await supabaseAdmin
          .from('graves')
          .select('slot_id')

        if (error) {
          throw error
        }

        return (usedSlots ?? []).map((row) => row.slot_id)
      },
      pickSlot: pickRandomFreeSlot,
      insertGrave: async (slotId) => await supabaseAdmin
        .from('graves')
        .insert({ ...graveRow, slot_id: slotId })
        .select()
        .single(),
    })
  } catch (error) {
    console.error('Failed during grave slot selection:', error)
    return NextResponse.json({ error: 'Failed to create grave' }, { status: 500 })
  }

  if (insertOutcome.status === 'duplicate') {
    return NextResponse.json(
      { error: 'This repository has already been buried' },
      { status: 409 },
    )
  }

  if (insertOutcome.status === 'no_slots') {
    return NextResponse.json(
      { error: 'No free grave slots available on the map' },
      { status: 507 },
    )
  }

  if (insertOutcome.status === 'retry_exhausted') {
    console.error('Failed to create grave after repeated slot collisions')
    return NextResponse.json(
      { error: 'Failed to reserve a grave slot. Please try again.' },
      { status: 503 },
    )
  }

  if (insertOutcome.status === 'failed') {
    console.error('Failed to create grave:', insertOutcome.error)
    return NextResponse.json({ error: 'Failed to create grave' }, { status: 500 })
  }

  const grave = insertOutcome.data

  // 8. Post-insert rate limit check (race-condition-safe)
  // Count AFTER insert — if limit exceeded, rollback the insert.
  const { count: postCount } = await supabaseAdmin
    .from('graves')
    .select('*', { count: 'exact', head: true })
    .eq('author_github', author_github)
    .gte('created_at', new Date(Date.now() - 86400000).toISOString());

  if ((postCount ?? 0) > 20) {
    const { error: delErr } = await supabaseAdmin.from('graves').delete().eq('id', grave.id)
    if (delErr) {
      console.error('Rate-limit rollback failed for grave', grave.id, delErr)
      await syncUserGravesCount(author_github)
      return NextResponse.json(
        { error: 'Failed to finalize grave creation after rate-limit conflict' },
        { status: 500 },
      )
    }

    await syncUserGravesCount(author_github)
    return NextResponse.json(
      { error: 'Rate limit: max 20 graves per day' },
      { status: 429 },
    )
  }

  // 9. Increment graves_count for the author
  const { error: rpcError } = await supabaseAdmin.rpc('increment_graves_count', {
    username: author_github,
  })

  if (rpcError) {
    console.error('increment_graves_count RPC failed, syncing exact count instead:', rpcError)
    await syncUserGravesCount(author_github)
  }

  return NextResponse.json(grave, { status: 201 })
}
