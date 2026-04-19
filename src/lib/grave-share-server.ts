import { supabaseAdmin } from '@/lib/supabase'
import type { GraveShareData } from '@/lib/grave-share'

export type GraveShareLookupResult =
  | { kind: 'ok'; grave: GraveShareData }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }

export async function getGraveShareData(id: string): Promise<GraveShareLookupResult> {
  const { data, error } = await supabaseAdmin
    .from('graves')
    .select('id, name, cause, epitaph, born_at, died_at, stack, author_github')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('Failed to fetch grave share data:', error)
    return { kind: 'error', message: error.message }
  }

  if (!data) {
    return { kind: 'not_found' }
  }

  return { kind: 'ok', grave: data }
}
