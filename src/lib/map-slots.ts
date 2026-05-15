import { readFileSync } from 'fs';
import { join } from 'path';
import { isAutoAssignableGraveSlotType } from './slot-economy';

interface TmjObject {
  id: number;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

let cachedSlots: GraveSlot[] | null = null;

/** Returns all grave slot IDs from the Tiled map, sorted ascending.
 *  @deprecated Use getGraveSlots() for typed slot info. */
export function getGraveSlotIds(): number[] {
  return getGraveSlots().map((s) => s.id);
}

/** Returns all grave slots (id + type) from the Tiled map, sorted by id ascending. */
export function getGraveSlots(): GraveSlot[] {
  if (cachedSlots) return cachedSlots;

  const mapPath = join(process.cwd(), 'public', 'map', 'az.tmj');
  const map: TmjMap = JSON.parse(readFileSync(mapPath, 'utf8'));
  const slotsLayer = map.layers.find((l) => l.name === 'slots');

  if (!slotsLayer?.objects) return [];

  cachedSlots = slotsLayer.objects
    .filter((o) => o.type.startsWith('grave'))
    .map((o) => ({ id: o.id, type: o.type }))
    .sort((a, b) => a.id - b.id);

  return cachedSlots;
}

/** Returns only slots that normal users can receive through automatic burial. */
export function getAutoAssignableGraveSlots(): GraveSlot[] {
  return getGraveSlots().filter((slot) => isAutoAssignableGraveSlotType(slot.type));
}

export function countAutoAssignableGraveUsage(graves: { slot_id: number }[]): number {
  const autoSlotIds = new Set(getAutoAssignableGraveSlots().map((slot) => slot.id));
  return graves.reduce((count, grave) => count + (autoSlotIds.has(grave.slot_id) ? 1 : 0), 0);
}

/** Bias multiplier per tier — higher = more likely to be picked. */
const TIER_BIAS: Record<string, number> = { grave: 4, grave_tall: 1 };

/**
 * Pick a random free slot for automatic burial.
 * - Only T0 (`grave`) and T1 (`grave_tall`) are eligible.
 * - Probability proportional to (free slots × bias): starts ~80/20, self-balances as slots fill.
 * - Random slot within the chosen tier for even map distribution.
 */
export function pickRandomFreeSlot(usedIds: Set<number>): GraveSlot | null {
  const allSlots = getAutoAssignableGraveSlots();
  const pools = new Map<string, GraveSlot[]>();

  for (const s of allSlots) {
    if (usedIds.has(s.id)) continue;
    if (!pools.has(s.type)) pools.set(s.type, []);
    pools.get(s.type)!.push(s);
  }

  // Weighted tier selection: weight = freeCount × bias
  const tiers: { type: string; slots: GraveSlot[]; weight: number }[] = [];
  let totalWeight = 0;
  for (const [type, slots] of pools) {
    const w = slots.length * (TIER_BIAS[type] ?? 1);
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

  // Fallback (shouldn't reach here)
  const last = tiers[tiers.length - 1];
  return last.slots[Math.floor(Math.random() * last.slots.length)];
}
