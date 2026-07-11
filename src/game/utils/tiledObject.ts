/**
 * Phaser preserves Tiled object coordinates after applying the object-layer
 * offsets. Tiled uses a bottom-left origin for tile objects (`gid`), while
 * rectangle objects use a top-left origin.
 */
export interface TiledObjectLike {
  gid?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface TiledObjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getTiledObjectBounds(object: TiledObjectLike): TiledObjectBounds {
  const x = object.x ?? 0;
  const y = object.y ?? 0;
  const width = object.width ?? 0;
  const height = object.height ?? 0;

  return {
    x,
    y: object.gid ? y - height : y,
    width,
    height,
  };
}

export function getTiledObjectCenter(object: TiledObjectLike) {
  const bounds = getTiledObjectBounds(object);

  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}
