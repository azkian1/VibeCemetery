export type CameraScrollBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type FogClearAnchor = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type FogCameraConstraintOptions = {
  maxFogDistance?: number;
  freeFogDistance?: number;
  resistance?: number;
};

export type FogCameraConstraintInput = FogCameraConstraintOptions & {
  scrollX: number;
  scrollY: number;
  viewWidth: number;
  viewHeight: number;
  strictBounds: CameraScrollBounds;
  cameraSafeWorldBounds?: CameraScrollBounds;
  fogClearAnchors: FogClearAnchor[];
};

export const CAMERA_FOG_OVERSCROLL_V2 = 64;
export const CAMERA_FOG_REST_BUFFER_V2 = 32;
export const CAMERA_FOG_DRAG_RESISTANCE_V2 = 0.35;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getFogOverscrollBounds(
  strictBounds: CameraScrollBounds,
  overscroll = CAMERA_FOG_OVERSCROLL_V2,
): CameraScrollBounds {
  return {
    minX: strictBounds.minX - overscroll,
    minY: strictBounds.minY - overscroll,
    maxX: strictBounds.maxX + overscroll,
    maxY: strictBounds.maxY + overscroll,
  };
}

export function getPlayableCameraScrollBounds(
  playableBounds: CameraScrollBounds,
  viewWidth: number,
  viewHeight: number,
  worldWidth: number,
  worldHeight: number,
): CameraScrollBounds {
  const getAxisBounds = (min: number, max: number, viewSize: number, worldSize: number) => {
    const playableSize = max - min;
    const worldMaxScroll = Math.max(0, worldSize - viewSize);
    const centeredScroll = (min + max - viewSize) / 2;
    const targetMin = viewSize >= playableSize ? centeredScroll : min;
    const targetMax = viewSize >= playableSize ? centeredScroll : max - viewSize;
    return {
      min: clamp(targetMin, 0, worldMaxScroll),
      max: clamp(targetMax, 0, worldMaxScroll),
    };
  };

  const x = getAxisBounds(playableBounds.minX, playableBounds.maxX, viewWidth, worldWidth);
  const y = getAxisBounds(playableBounds.minY, playableBounds.maxY, viewHeight, worldHeight);
  return { minX: x.min, minY: y.min, maxX: x.max, maxY: y.max };
}

function findNearestFogClearPoint(x: number, y: number, anchors: FogClearAnchor[]) {
  let nearest: { x: number; y: number; distanceSquared: number } | null = null;

  for (const anchor of anchors) {
    const anchorX = clamp(x, anchor.left, anchor.right);
    const anchorY = clamp(y, anchor.top, anchor.bottom);
    const distanceX = x - anchorX;
    const distanceY = y - anchorY;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;

    if (!nearest || distanceSquared < nearest.distanceSquared) {
      nearest = { x: anchorX, y: anchorY, distanceSquared };
      if (distanceSquared === 0) break;
    }
  }

  return nearest;
}

/**
 * Keeps the camera centred on the authored clear area while allowing a small,
 * symmetric rubber-band excursion into locked fog. The constraint is based on
 * the real fog mask rather than its rectangular bounding box.
 */
export function constrainCameraScrollToFog({
  scrollX,
  scrollY,
  viewWidth,
  viewHeight,
  strictBounds,
  cameraSafeWorldBounds,
  fogClearAnchors,
  maxFogDistance = CAMERA_FOG_OVERSCROLL_V2,
  freeFogDistance = CAMERA_FOG_REST_BUFFER_V2,
  resistance = CAMERA_FOG_DRAG_RESISTANCE_V2,
}: FogCameraConstraintInput) {
  const maxDistance = Math.max(0, maxFogDistance);
  const freeDistance = Math.min(Math.max(0, freeFogDistance), maxDistance);
  const dragResistance = clamp(resistance, 0, 1);
  const unconstrainedSoftBounds = getFogOverscrollBounds(strictBounds, maxDistance);
  const softBounds = cameraSafeWorldBounds
    ? {
      minX: clamp(
        unconstrainedSoftBounds.minX,
        cameraSafeWorldBounds.minX,
        Math.max(cameraSafeWorldBounds.minX, cameraSafeWorldBounds.maxX - viewWidth),
      ),
      minY: clamp(
        unconstrainedSoftBounds.minY,
        cameraSafeWorldBounds.minY,
        Math.max(cameraSafeWorldBounds.minY, cameraSafeWorldBounds.maxY - viewHeight),
      ),
      maxX: clamp(
        unconstrainedSoftBounds.maxX,
        cameraSafeWorldBounds.minX,
        Math.max(cameraSafeWorldBounds.minX, cameraSafeWorldBounds.maxX - viewWidth),
      ),
      maxY: clamp(
        unconstrainedSoftBounds.maxY,
        cameraSafeWorldBounds.minY,
        Math.max(cameraSafeWorldBounds.minY, cameraSafeWorldBounds.maxY - viewHeight),
      ),
    }
    : unconstrainedSoftBounds;
  const boundedScrollX = clamp(scrollX, softBounds.minX, softBounds.maxX);
  const boundedScrollY = clamp(scrollY, softBounds.minY, softBounds.maxY);

  const centerX = boundedScrollX + viewWidth / 2;
  const centerY = boundedScrollY + viewHeight / 2;
  const nearest = findNearestFogClearPoint(centerX, centerY, fogClearAnchors);
  if (!nearest) {
    return {
      x: clamp(scrollX, strictBounds.minX, strictBounds.maxX),
      y: clamp(scrollY, strictBounds.minY, strictBounds.maxY),
    };
  }

  const distance = Math.sqrt(nearest.distanceSquared);
  if (distance <= freeDistance || distance === 0) {
    return { x: boundedScrollX, y: boundedScrollY };
  }

  const limitedDistance = Math.min(
    maxDistance,
    freeDistance + (distance - freeDistance) * dragResistance,
  );
  const ratio = limitedDistance / distance;
  const constrainedCenterX = nearest.x + (centerX - nearest.x) * ratio;
  const constrainedCenterY = nearest.y + (centerY - nearest.y) * ratio;

  return {
    x: clamp(constrainedCenterX - viewWidth / 2, softBounds.minX, softBounds.maxX),
    y: clamp(constrainedCenterY - viewHeight / 2, softBounds.minY, softBounds.maxY),
  };
}
