export const GRAVE_GIDS_V2: Record<string, number[]> = {
  grave_tall: [
    51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
    61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
    71, 72, 73, 74, 75, 76,
  ],
  grave_wide: [
    77, 78, 79, 80, 81, 82, 83, 84, 85,
  ],
  grave_large: [
    86, 87, 88, 89, 90, 91, 92, 93, 94, 95,
    96, 97,
  ],
};

export function pickGraveGidV2(slotType: string, graveId: number): number | null {
  const gids = GRAVE_GIDS_V2[slotType];
  if (!gids || gids.length === 0) return null;
  return gids[graveId % gids.length];
}

/** Server-side: pick a random GID from the pool for a given slot type. */
export function pickRandomGraveGid(slotType: string): number | null {
  const gids = GRAVE_GIDS_V2[slotType];
  if (!gids || gids.length === 0) return null;
  return gids[Math.floor(Math.random() * gids.length)];
}
