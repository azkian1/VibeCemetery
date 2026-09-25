import graveBounds from './paintedGraveBoundsV2.json';
import graveRedrawIds from './paintedGraveRedrawIdsV2.json';

export const PAINTED_ART_BASE_URL_V2 = '/map/open-art';
export const PAINTED_GRAVE_ATLAS_COUNT_V2 = 12;
export const PAINTED_TREE_ATLAS_COUNT_V2 = 4;
const graveRedrawSet = new Set<number>(graveRedrawIds);
export const PAINTED_GRAVE_REDRAW_ATLAS_NUMBERS_V2 = [...new Set(
  graveRedrawIds.map((gid) => Math.floor((gid - 51) / 4) + 1),
)];

export interface PaintedFrameV2 {
  key: string;
  frame: number;
}

export function paintedGraveFrameV2(gid: number): PaintedFrameV2 | null {
  if (!Number.isInteger(gid) || gid < 51 || gid > 97) return null;
  const index = gid - 51;
  return {
    key: `painted-graves-${graveRedrawSet.has(gid) ? 'redraw-' : ''}${String(Math.floor(index / 4) + 1).padStart(2, '0')}`,
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
  if (type === 'grave_tall') return { width: 44, height: 72 };
  if (type === 'grave_wide') return { width: 72, height: 64 };
  return { width: 76, height: 76 };
}

interface GraveSlotGeometryV2 { x: number; y: number; width: number; height: number }

export function paintedGravePlacementV2(gid: number, type: string, slot: GraveSlotGeometryV2) {
  const bounds = graveBounds[gid - 51];
  if (!bounds) return null;
  const limits = paintedGraveSizeV2(type);
  // A single uniform scale keeps each stone's geometry and perspective intact.
  const scale = Math.min(limits.width / bounds.width, limits.height / bounds.height);
  const centerX = bounds.x + bounds.width / 2;
  const baseY = bounds.y + bounds.height;
  return {
    x: slot.x + slot.width / 2 + (627 / 2 - centerX) * scale,
    y: slot.y + slot.height + 2 + (627 / 2 - baseY) * scale,
    displaySize: 627 * scale,
    visibleWidth: bounds.width * scale,
    visibleHeight: bounds.height * scale,
  };
}
