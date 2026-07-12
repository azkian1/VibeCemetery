export interface MinimapRasterTile {
  index: number;
}

export interface MinimapRasterLayer {
  x: number;
  y: number;
  tileWidth: number;
  tileHeight: number;
  width: number;
  height: number;
  data: Array<Array<MinimapRasterTile | null | undefined>>;
}

export type MinimapRasterValue = number | ((tile: MinimapRasterTile) => number);

/**
 * Paint a Phaser-parsed tile layer into a map-sized minimap raster.
 *
 * Tiled layer offsets are stored by Phaser as pixel coordinates in
 * LayerData.x/y, while minimap rasters use map tile coordinates.
 */
export function paintMinimapLayer(
  raster: Uint8Array,
  rasterWidth: number,
  rasterHeight: number,
  layer: MinimapRasterLayer | null | undefined,
  value: MinimapRasterValue,
) {
  if (!layer || layer.tileWidth <= 0 || layer.tileHeight <= 0) return;

  const offsetX = Math.round(layer.x / layer.tileWidth);
  const offsetY = Math.round(layer.y / layer.tileHeight);

  for (let sourceY = 0; sourceY < layer.height; sourceY++) {
    const targetY = sourceY + offsetY;
    if (targetY < 0 || targetY >= rasterHeight) continue;

    for (let sourceX = 0; sourceX < layer.width; sourceX++) {
      const targetX = sourceX + offsetX;
      if (targetX < 0 || targetX >= rasterWidth) continue;

      const tile = layer.data[sourceY]?.[sourceX];
      if (!tile || tile.index < 0) continue;

      raster[targetY * rasterWidth + targetX] = typeof value === 'function'
        ? value(tile)
        : value;
    }
  }
}
