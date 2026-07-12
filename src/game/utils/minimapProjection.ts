export interface MinimapProjection {
  worldW: number;
  worldH: number;
  size: number;
  scale: number;
  contentW: number;
  contentH: number;
  offsetX: number;
  offsetY: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * A circular minimap uses a uniform cover transform. It preserves map
 * geometry and lets the lens crop only the outer, least useful map margins.
 */
export function createMinimapProjection(
  worldW: number,
  worldH: number,
  size: number,
): MinimapProjection {
  const scale = Math.max(size / worldW, size / worldH);
  const contentW = worldW * scale;
  const contentH = worldH * scale;

  return {
    worldW,
    worldH,
    size,
    scale,
    contentW,
    contentH,
    offsetX: (size - contentW) / 2,
    offsetY: (size - contentH) / 2,
  };
}

export function isInsideMinimapLens(x: number, y: number, size: number) {
  const radius = size / 2;
  const dx = x - radius;
  const dy = y - radius;
  return dx * dx + dy * dy <= radius * radius;
}

export function projectWorldPoint(
  projection: MinimapProjection,
  worldX: number,
  worldY: number,
) {
  return {
    x: projection.offsetX + worldX * projection.scale,
    y: projection.offsetY + worldY * projection.scale,
  };
}

export function unprojectMinimapPoint(
  projection: MinimapProjection,
  x: number,
  y: number,
) {
  return {
    worldX: clamp((x - projection.offsetX) / projection.scale, 0, projection.worldW),
    worldY: clamp((y - projection.offsetY) / projection.scale, 0, projection.worldH),
  };
}
