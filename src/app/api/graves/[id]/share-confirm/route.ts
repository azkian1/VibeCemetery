import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { confirmFirstGraveShare } from './confirmShare'

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

  try {
    const result = await confirmFirstGraveShare({
      graveId,
      username,
      db: {
        loadGraveOwner: async (graveId) => {
          const { data, error } = await supabaseAdmin
            .from('graves')
            .select('author_github')
            .eq('id', graveId)
            .maybeSingle()

          if (error) throw error
          return data?.author_github ?? null
        },
        loadUserShareTimestamp: async (username) => {
          const { data, error } = await supabaseAdmin
            .from('users')
            .select('x_first_grave_shared_at')
            .eq('github_username', username)
            .maybeSingle()

          if (error) throw error
          return data?.x_first_grave_shared_at ?? null
        },
        markUserSharedFirstGrave: async (username, sharedAt) => {
          const { data, error } = await supabaseAdmin
            .from('users')
            .update({ x_first_grave_shared_at: sharedAt })
            .eq('github_username', username)
            .is('x_first_grave_shared_at', null)
            .select('x_first_grave_shared_at')
            .maybeSingle()

          if (error) throw error
          if (data?.x_first_grave_shared_at) return data.x_first_grave_shared_at

          const { data: existing, error: existingError } = await supabaseAdmin
            .from('users')
            .select('x_first_grave_shared_at')
            .eq('github_username', username)
            .maybeSingle()

          if (existingError) throw existingError
          if (!existing?.x_first_grave_shared_at) throw new Error('Failed to mark first grave as shared')

          return existing.x_first_grave_shared_at
        },
      },
    })

    if (result.status === 'invalid_grave_id') {
      return NextResponse.json({ error: 'Invalid grave id' }, { status: 400 })
    }

    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Grave not found' }, { status: 404 })
    }

    if (result.status === 'forbidden') {
      return NextResponse.json({ error: 'Only the grave owner can unlock this slot' }, { status: 403 })
    }

    return NextResponse.json({
      unlocked: true,
      already_unlocked: result.status === 'already_unlocked',
      x_first_grave_shared_at: result.x_first_grave_shared_at,
    })
  } catch (error) {
    console.error('Failed to confirm grave share:', error)
    return NextResponse.json({ error: 'Failed to confirm grave share' }, { status: 500 })
  }
}
