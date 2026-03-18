import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

/** Strip HTML tags and collapse whitespace — defense-in-depth for stored text */
function sanitize(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

async function getUsername(request: Request, body: Record<string, unknown>): Promise<{ username: string | null, source: 'session' | 'body' | null }> {
  // 1. Try NextAuth session (browser)
  const session = await getServerSession(authOptions)
  if (session?.user?.github_username) {
    return { username: session.user.github_username, source: 'session' }
  }

  // 2. Try author_github from body (CLI / Skill)
  if (typeof body.author_github === 'string' && body.author_github.trim()) {
    return { username: body.author_github.trim(), source: 'body' }
  }

  return { username: null, source: null }
}

export async function POST(request: Request) {
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

  const { username: authorGithub, source } = await getUsername(request, body as Record<string, unknown>)
  if (!authorGithub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(authorGithub)) {
    return NextResponse.json({ error: 'Invalid username format' }, { status: 400 })
  }

  // If username came from body (CLI), verify user exists on VibeCemetery
  if (source === 'body') {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('github_username')
      .eq('github_username', authorGithub)
      .single()

    if (!user) {
      return NextResponse.json(
        { error: 'User not found. Sign in on VibeCemetery first.' },
        { status: 403 }
      )
    }
  }

  const { name, cause, github_url, last_commit_message } = body as Record<string, unknown>

  if (typeof name !== 'string' || typeof cause !== 'string') {
    return NextResponse.json({ error: 'name and cause must be strings' }, { status: 400 })
  }
  if (!name.trim() || !cause.trim()) {
    return NextResponse.json(
      { error: 'name and cause are required' },
      { status: 400 }
    )
  }
  if (name.trim().length > 100) {
    return NextResponse.json({ error: 'name must be ≤ 100 characters' }, { status: 400 })
  }
  if (cause.trim().length > 200) {
    return NextResponse.json({ error: 'cause must be ≤ 200 characters' }, { status: 400 })
  }

  const trimmedName = sanitize(name);
  const trimmedCause = sanitize(cause);

  // Rate limit: first 50 cremations unlimited, then 3/day
  const { count: totalCount, error: totalError } = await supabaseAdmin
    .from('cremated')
    .select('*', { count: 'exact', head: true })
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
      .select('*', { count: 'exact', head: true })
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
    ? github_url.trim()
    : null;
  const trimmedLastCommit = typeof last_commit_message === 'string' && last_commit_message.trim()
    ? sanitize(last_commit_message).slice(0, 200)
    : null;

  if (trimmedGithubUrl && !/^https:\/\/github\.com\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/?$/.test(trimmedGithubUrl)) {
    return NextResponse.json({ error: 'github_url must be a valid GitHub repo URL' }, { status: 400 })
  }

  // Insert record
  const { data, error: insertError } = await supabaseAdmin
    .from('cremated')
    .insert({
      name: trimmedName,
      cause: trimmedCause,
      author_github: authorGithub,
      source: source === 'session' ? 'github' : 'skill',
      ...(trimmedGithubUrl && { github_url: trimmedGithubUrl }),
      ...(trimmedLastCommit && { last_commit_message: trimmedLastCommit }),
    })
    .select()
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
      .select('*', { count: 'exact', head: true })
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
  await supabaseAdmin.rpc('increment_cremated_count', {
    username: authorGithub,
  }).then(async ({ error }) => {
    // Fallback: if RPC doesn't exist, do a manual update
    if (error) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('cremated_count')
        .eq('github_username', authorGithub)
        .single()

      await supabaseAdmin
        .from('users')
        .update({ cremated_count: (userData?.cremated_count ?? 0) + 1 })
        .eq('github_username', authorGithub)
    }
  })

  return NextResponse.json(data, { status: 201 })
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('cremated')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch records' },
      { status: 500 }
    )
  }

  return NextResponse.json(data)
}
