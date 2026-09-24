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

export function paintedGraveSizeV2(type: string): { width: number; height: number } {
  if (type === 'grave_tall') return { width: 40, height: 74 };
  if (type === 'grave_wide') return { width: 74, height: 44 };
  return { width: 76, height: 76 };
}
