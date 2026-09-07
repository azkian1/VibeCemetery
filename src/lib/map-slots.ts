import { readFileSync } from 'fs';
import { join } from 'path';
import { isAutoAssignableGraveSlotTypeV2 } from './slot-economy';
import { CEMETERY_MAP_V2_FILE } from './map-version';
import { inferGraveSlotTypeV2, isActiveGraveSlotV2 } from './map-layout-v2';

interface TmjObject {
  id: number;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  gid?: number;
}

interface TmjLayer {
  name: string;
  type: string;
  objects?: TmjObject[];
}

interface TmjMap {
  layers: TmjLayer[];
}

export interface GraveSlot {
  id: number;
  type: string;
}

let cachedSlotsV2: GraveSlot[] | null = null;

/** Returns all grave slot IDs from the Tiled map, sorted ascending.
 *  @deprecated Use getGraveSlots() for typed slot info. */
export function getGraveSlotIds(): number[] {
  return getGraveSlots().map((s) => s.id);
}

/** Returns all grave slots (id + type) from the Tiled map, sorted by id ascending. */
export function getGraveSlots(mapVersion: string = 'v2'): GraveSlot[] {
  return mapVersion === 'v2' ? getGraveSlotsV2() : [];
}

function getGraveSlotsV2(): GraveSlot[] {
  if (cachedSlotsV2) return cachedSlotsV2;

  const mapPath = join(process.cwd(), 'public', 'map', CEMETERY_MAP_V2_FILE);
  const map: TmjMap = JSON.parse(readFileSync(mapPath, 'utf8'));
  const graveLayer = map.layers.find((l) => l.name === 'GraveObj');

  if (!graveLayer?.objects) return [];

  cachedSlotsV2 = graveLayer.objects
    .filter((o) => !o.gid && o.type !== 'grave_special' && o.type !== 'meta_grave'
      && inferGraveSlotTypeV2(o.width, o.height))
    .map((o) => ({
      id: o.id,
      type: inferGraveSlotTypeV2(o.width, o.height)!,
    }))
    .sort((a, b) => a.id - b.id);

  return cachedSlotsV2;
}

/** Returns only slots that normal users can receive through automatic burial. */
export function getAutoAssignableGraveSlots(mapVersion: string = 'v2'): GraveSlot[] {
  return getGraveSlots(mapVersion).filter((slot) =>
    isActiveGraveSlotV2(slot.id) && isAutoAssignableGraveSlotTypeV2(slot.type),
  );
}

export function countAutoAssignableGraveUsage(graves: { slot_id: number }[], mapVersion: string = 'v2'): number {
  const autoSlotIds = new Set(getAutoAssignableGraveSlots(mapVersion).map((slot) => slot.id));
  return graves.reduce((count, grave) => count + (autoSlotIds.has(grave.slot_id) ? 1 : 0), 0);
}

export function filterGravesToKnownMapSlots<T extends { slot_id: number }>(graves: T[], mapVersion: string = 'v2'): T[] {
  const slotIds = new Set(getGraveSlots(mapVersion).map((slot) => slot.id));
  return graves.filter((grave) => slotIds.has(grave.slot_id));
}

/** Pick a free approved v2 slot with equal per-slot odds. Retired maps have no slots. */
export function pickRandomFreeSlot(usedIds: Set<number>, mapVersion: string = 'v2'): GraveSlot | null {
  const freeSlots = getAutoAssignableGraveSlots(mapVersion).filter((slot) => !usedIds.has(slot.id));
  return freeSlots.length ? freeSlots[Math.floor(Math.random() * freeSlots.length)] : null;
}
