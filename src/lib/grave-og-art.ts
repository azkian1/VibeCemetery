import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getGraveSlots } from '@/lib/map-slots'
import { pickGraveGidV2 } from '@/game/utils/tileRegistry-v2'

const FIRST_ART_GID = 51
const LAST_ART_GID = 97
const FALLBACK_ART_GID = 52

export interface GraveOgArtIdentity {
  grave_gid?: number | null
  slot_id?: number | null
  map_version?: 'v1' | 'v2'
}

/** Match the card art to the sprite used by the v2 map, including old graves without a stored GID. */
export function resolveGraveOgArtGid(grave: GraveOgArtIdentity): number {
  if (Number.isInteger(grave.grave_gid) && grave.grave_gid! >= FIRST_ART_GID && grave.grave_gid! <= LAST_ART_GID) {
    return grave.grave_gid!
  }

  if (grave.map_version === 'v2' && Number.isInteger(grave.slot_id)) {
    const slot = getGraveSlots('v2').find(candidate => candidate.id === grave.slot_id)
    if (slot) return pickGraveGidV2(slot.type, slot.id) ?? FALLBACK_ART_GID
  }

  return FALLBACK_ART_GID
}

/** Assets are approved grave-review sprites, trimmed and scaled for a compact server trace. */
export async function loadGraveOgArt(gid: number): Promise<string> {
  const safeGid = Number.isInteger(gid) && gid >= FIRST_ART_GID && gid <= LAST_ART_GID
    ? gid
    : FALLBACK_ART_GID
  const asset = await readFile(join(process.cwd(), 'src', 'assets', 'og-graves', `${safeGid}.png`))
  return `data:image/png;base64,${asset.toString('base64')}`
}
