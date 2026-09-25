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
    const graves = await supabaseAdmin.from('graves').select(PUBLIC_GRAVE_FIELDS).ilike('author_github', username)
    if (graves.error) return NextResponse.json({ error: 'Account graves unavailable' }, { status: 503, headers })
    const allowance = calculateUserSlotEconomy({
      githubSlotsUsed: graves.data.filter(grave => grave.source !== 'local').length,
      localSlotsUsed: graves.data.filter(grave => grave.source === 'local').length,
    })
    return NextResponse.json({ graves: graves.data, ...allowance }, { headers })
  } catch {
    return NextResponse.json({ error: 'Account graves unavailable' }, { status: 503, headers })
  }
}
