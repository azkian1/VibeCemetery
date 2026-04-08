import { NextResponse } from 'next/server'
import { resolveCliActor } from '@/lib/cli-auth'
import { supabaseAdmin } from '@/lib/supabase'

/** Strip HTML tags and collapse whitespace — defense-in-depth for stored text */
function sanitize(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
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

  const trimmedName = sanitize(name)
  const trimmedCause = sanitize(cause)

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
    ? github_url.trim()
    : null
  const trimmedLastCommit = typeof last_commit_message === 'string' && last_commit_message.trim()
    ? sanitize(last_commit_message).slice(0, 200)
    : null

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
