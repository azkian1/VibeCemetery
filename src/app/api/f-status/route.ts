import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/f-status — current user's voted grave IDs
// Counts come from graves.f_count (enriched in GET /api/graves), not recomputed here.
export async function GET() {
  const session = await getServerSession(authOptions)
  const username = session?.user?.github_username

  let myVotes: string[] = []
  if (username) {
    const { data: userVotes } = await supabaseAdmin
      .from('f_votes')
      .select('grave_id')
      .eq('username', username)

    if (userVotes) {
      myVotes = userVotes.map((v) => v.grave_id)
    }
  }

  return NextResponse.json({ myVotes })
}
