import { NextResponse } from 'next/server'
import { resolveCliActor } from '@/lib/cli-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { PUBLIC_GRAVE_FIELDS } from '@/lib/public-grave'
import { calculateUserSlotEconomy } from '@/lib/slot-economy'

const headers = { 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  try {
    const actor = await resolveCliActor(req)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    const username = actor.username.toLowerCase()
    const [graves, user] = await Promise.all([
      supabaseAdmin.from('graves').select(PUBLIC_GRAVE_FIELDS).ilike('author_github', username),
      supabaseAdmin.from('users').select('x_first_grave_shared_at').ilike('github_username', username).single(),
    ])
    if (graves.error || user.error) return NextResponse.json({ error: 'Account graves unavailable' }, { status: 503, headers })
    const allowance = calculateUserSlotEconomy({
      slotsUsed: graves.data.length,
      hasSharedFirstGrave: Boolean(user.data.x_first_grave_shared_at),
    })
    return NextResponse.json({ graves: graves.data, ...allowance }, { headers })
  } catch {
    return NextResponse.json({ error: 'Account graves unavailable' }, { status: 503, headers })
  }
}
