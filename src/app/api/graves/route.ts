import { NextRequest, NextResponse } from 'next/server'
import { resolveCliActor } from '@/lib/cli-auth'
import { PUBLIC_GRAVE_FIELDS } from '@/lib/public-grave'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { getGraveSlots } from '@/lib/map-slots'
import { parseMapVersion } from '@/lib/map-version'
import { createGravePostHandler } from './writeHandler'

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
    .select(PUBLIC_GRAVE_FIELDS)
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
  // into unrelated Cemetery Map 2.0 slots.
  if (error && error.message?.includes('map_version')) {
    if (mapVersion === 'v2') {
      return NextResponse.json([])
    }

    let fallbackQuery = supabaseAdmin
      .from('graves')
      .select(PUBLIC_GRAVE_FIELDS)
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

export const POST = createGravePostHandler({ resolveCliActor, supabaseAdmin, checkRateLimit })
