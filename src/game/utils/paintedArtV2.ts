export const PAINTED_ART_BASE_URL_V2 = '/map/open-art';
export const PAINTED_GRAVE_ATLAS_COUNT_V2 = 12;
export const PAINTED_TREE_ATLAS_COUNT_V2 = 4;

export interface PaintedFrameV2 {
  key: string;
  frame: number;
}

export function paintedGraveFrameV2(gid: number): PaintedFrameV2 | null {
  if (!Number.isInteger(gid) || gid < 51 || gid > 97) return null;
  const index = gid - 51;
  return {
    key: `painted-graves-${String(Math.floor(index / 4) + 1).padStart(2, '0')}`,
    frame: index % 4,
  };
}

export function paintedTreeFrameV2(gid: number): PaintedFrameV2 | null {
  if (!Number.isInteger(gid) || gid < 35 || gid > 50) return null;
  const index = gid - 35;
  return {
    key: `painted-trees-${String(Math.floor(index / 4) + 1).padStart(2, '0')}`,
    frame: index % 4,
  };
}

export function paintedHighCyberTreeFrameV2(gid: number): PaintedFrameV2 | null {
  if (gid === 39) return { key: 'painted-trees-high-cyber', frame: 0 };
  if (gid === 46) return { key: 'painted-trees-high-cyber', frame: 1 };
  return null;
}

interface TreeArtPlacementV2 {
  id: number;
  gid: number;
  x: number;
  y: number;
}

// Choose one of every three distinct visible positions for each approved
// species. Some Tiled objects share a position; they must use the same art.
export function selectHighCyberTreeIdsV2(placements: TreeArtPlacementV2[]): Set<number> {
  const selected = new Set<number>();
  for (const gid of [39, 46]) {
    const byPosition = new Map<string, TreeArtPlacementV2[]>();
    for (const placement of placements) {
      if (placement.gid !== gid) continue;
      const key = `${placement.x}:${placement.y}`;
      const group = byPosition.get(key) ?? [];
      group.push(placement);
      byPosition.set(key, group);
    }
    const groups = [...byPosition.values()].sort(
      (a, b) => a[0].y - b[0].y || a[0].x - b[0].x,
    );
    for (let index = 1; index < groups.length; index += 3) {
      for (const placement of groups[index]) selected.add(placement.id);
    }
  }
  return selected;
}

export function paintedGraveSizeV2(type: string): { width: number; height: number } {
  if (type === 'grave_tall') return { width: 40, height: 74 };
  if (type === 'grave_wide') return { width: 74, height: 44 };
  return { width: 76, height: 76 };
}
