import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/graves/[id]/f — press F (one per user per grave)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.github_username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const username = session.user.github_username
  const { id: graveId } = await params

  if (!graveId || !UUID_RE.test(graveId)) {
    return NextResponse.json({ error: 'Invalid grave id' }, { status: 400 })
  }

  // Check if already voted
  const { data: existing } = await supabaseAdmin
    .from('f_votes')
    .select('id')
    .eq('grave_id', graveId)
    .eq('username', username)
    .maybeSingle()

  if (!existing) {
    // Record the vote — ignore duplicate constraint errors (race-safe)
    const { error: insertError } = await supabaseAdmin
      .from('f_votes')
      .insert({ grave_id: graveId, username })

    if (insertError && !insertError.code?.startsWith('23')) {
      return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 })
    }
  }

  // Always derive count from f_votes (source of truth)
  const { count, error: countError } = await supabaseAdmin
    .from('f_votes')
    .select('*', { count: 'exact', head: true })
    .eq('grave_id', graveId)

  if (countError) {
    return NextResponse.json({ error: 'Failed to read vote count' }, { status: 500 })
  }

  const newCount = count ?? 0

  const { error: updateErr } = await supabaseAdmin
    .from('graves')
    .update({ f_count: newCount })
    .eq('id', graveId)
  if (updateErr) console.error('f_count denorm update failed:', updateErr.message)

  if (existing) {
    return NextResponse.json({ f_count: newCount }, { status: 409 })
  }

  return NextResponse.json({ f_count: newCount })
}
