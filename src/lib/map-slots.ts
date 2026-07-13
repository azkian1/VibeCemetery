import { readFileSync } from 'fs';
import { join } from 'path';
import { isAutoAssignableGraveSlotType, isAutoAssignableGraveSlotTypeV2 } from './slot-economy';

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

function inferGraveTypeFromDims(w: number, h: number): string {
  if (w === 32 && h === 64) return 'grave_tall';
  if (w === 64 && h === 32) return 'grave_wide';
  if (w === 64 && h === 64) return 'grave_large';
  return 'grave_tall';
}

let cachedSlotsV1: GraveSlot[] | null = null;
let cachedSlotsV2: GraveSlot[] | null = null;

/** Returns all grave slot IDs from the Tiled map, sorted ascending.
 *  @deprecated Use getGraveSlots() for typed slot info. */
export function getGraveSlotIds(): number[] {
  return getGraveSlots().map((s) => s.id);
}

/** Returns all grave slots (id + type) from the Tiled map, sorted by id ascending. */
export function getGraveSlots(mapVersion: string = 'v1'): GraveSlot[] {
  if (mapVersion === 'v2') return getGraveSlotsV2();
  return getGraveSlotsV1();
}

function getGraveSlotsV1(): GraveSlot[] {
  if (cachedSlotsV1) return cachedSlotsV1;

  const mapPath = join(process.cwd(), 'public', 'map', 'az.tmj');
  const map: TmjMap = JSON.parse(readFileSync(mapPath, 'utf8'));
  const slotsLayer = map.layers.find((l) => l.name === 'slots');

  if (!slotsLayer?.objects) return [];

  cachedSlotsV1 = slotsLayer.objects
    .filter((o) => o.type.startsWith('grave'))
    .map((o) => ({ id: o.id, type: o.type }))
    .sort((a, b) => a.id - b.id);

  return cachedSlotsV1;
}

function getGraveSlotsV2(): GraveSlot[] {
  if (cachedSlotsV2) return cachedSlotsV2;

  const mapPath = join(process.cwd(), 'public', 'map', 'Map4.tmj');
  const map: TmjMap = JSON.parse(readFileSync(mapPath, 'utf8'));
  const graveLayer = map.layers.find((l) => l.name === 'GraveObj');

  if (!graveLayer?.objects) return [];

  cachedSlotsV2 = graveLayer.objects
    .filter((o) => !o.gid)
    .map((o) => ({
      id: o.id,
      type: inferGraveTypeFromDims(o.width, o.height),
    }))
    .sort((a, b) => a.id - b.id);

  return cachedSlotsV2;
}

/** Returns only slots that normal users can receive through automatic burial. */
export function getAutoAssignableGraveSlots(mapVersion: string = 'v1'): GraveSlot[] {
  return getGraveSlots(mapVersion).filter((slot) =>
    mapVersion === 'v2'
      ? isAutoAssignableGraveSlotTypeV2(slot.type)
      : isAutoAssignableGraveSlotType(slot.type),
  );
}

export function countAutoAssignableGraveUsage(graves: { slot_id: number }[], mapVersion: string = 'v1'): number {
  const autoSlotIds = new Set(getAutoAssignableGraveSlots(mapVersion).map((slot) => slot.id));
  return graves.reduce((count, grave) => count + (autoSlotIds.has(grave.slot_id) ? 1 : 0), 0);
}

/** Bias multiplier per tier — higher = more likely to be picked. */
const TIER_BIAS_V1: Record<string, number> = { grave: 4, grave_tall: 1 };
const TIER_BIAS_V2: Record<string, number> = {};

/**
 * Pick a random free slot for automatic burial.
 * - v1: T0 (`grave`) and T1 (`grave_tall`) — bias ~80/20.
 * - v2: all authored grave footprints participate with equal per-slot odds.
 */
export function pickRandomFreeSlot(usedIds: Set<number>, mapVersion: string = 'v1'): GraveSlot | null {
  const allSlots = getAutoAssignableGraveSlots(mapVersion);
  const pools = new Map<string, GraveSlot[]>();
  const tierBias = mapVersion === 'v2' ? TIER_BIAS_V2 : TIER_BIAS_V1;

  for (const s of allSlots) {
    if (usedIds.has(s.id)) continue;
    if (!pools.has(s.type)) pools.set(s.type, []);
    pools.get(s.type)!.push(s);
  }

  const tiers: { type: string; slots: GraveSlot[]; weight: number }[] = [];
  let totalWeight = 0;
  for (const [type, slots] of pools) {
    const w = slots.length * (tierBias[type] ?? 1);
    tiers.push({ type, slots, weight: w });
    totalWeight += w;
  }

  if (totalWeight === 0) return null;

  let roll = Math.random() * totalWeight;
  for (const tier of tiers) {
    roll -= tier.weight;
    if (roll <= 0) {
      return tier.slots[Math.floor(Math.random() * tier.slots.length)];
    }
  }

  const last = tiers[tiers.length - 1];
  return last.slots[Math.floor(Math.random() * last.slots.length)];
}
