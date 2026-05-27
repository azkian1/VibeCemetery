// Tile catalog for dynamic grave rendering
// GIDs from CLAUDEMAP.md

interface TileVariant1x1 {
  gid: number;
}

interface TileVariant1x2 {
  top: number;
  bottom: number;
}

interface TileVariant2x1 {
  left: number;
  right: number;
}

interface TileVariant2x2 {
  tl: number;
  tr: number;
  bl: number;
  br: number;
}

interface TileVariant2x3 {
  rows: [number, number][]; // 3 rows, each [left, right]
}

interface TileVariant3x3 {
  rows: [number, number, number][]; // 3 rows, each [l, m, r]
}

export const GRAVE_TILES = {
  grave_special: [{ gid: 4073 }] as TileVariant1x1[],

  grave: [
    { gid: 3617 },
    { gid: 3627 },
    { gid: 3628 },
    { gid: 3629 },
    { gid: 3630 },
    { gid: 3644 },
    { gid: 3645 },
    { gid: 5263 },
    { gid: 5264 },
    { gid: 5265 },
    { gid: 5279 },
  ] as TileVariant1x1[],

  grave_tall: [
    { top: 3582, bottom: 3598 },
    { top: 3585, bottom: 3601 },
    { top: 3610, bottom: 3626 },
    { top: 3642, bottom: 3658 },
    { top: 3643, bottom: 3659 },
    { top: 3660, bottom: 3676 },
    { top: 3661, bottom: 3677 },
    { top: 3662, bottom: 3678 },
    { top: 3690, bottom: 3706 },
    { top: 3691, bottom: 3707 },
    { top: 3692, bottom: 3708 },
    { top: 3693, bottom: 3709 },
    { top: 5217, bottom: 5233 },
    { top: 5296, bottom: 5312 },
    { top: 5325, bottom: 5341 },
  ] as TileVariant1x2[],

  grave_wide: [
    { left: 3614, right: 3615 },
    { left: 3645, right: 3646 },
    { left: 3674, right: 3675 },
    { left: 5280, right: 5281 },
  ] as TileVariant2x1[],

  grave_large: [
    { tl: 3583, tr: 3584, bl: 3599, br: 3600 },
    { tl: 3725, tr: 3726, bl: 3741, br: 3742 },
    { tl: 3757, tr: 3758, bl: 3773, br: 3774 },
    { tl: 5360, tr: 5361, bl: 5376, br: 5377 },
  ] as TileVariant2x2[],

  grave_largetop: [
    { rows: [[3722, 3723], [3738, 3739], [3754, 3755]] },
    { rows: [[3789, 3790], [3805, 3806], [3821, 3822]] },
  ] as TileVariant2x3[],

  grave_largeX: [
    { rows: [[3647, 3648, 3649], [3663, 3664, 3665], [3679, 3680, 3681]] },
  ] as TileVariant3x3[],
};

type GraveType = keyof typeof GRAVE_TILES;

export function pickTileVariant(slotType: string, graveId: number) {
  const type = slotType as GraveType;
  const variants = GRAVE_TILES[type];
  if (!variants || variants.length === 0) return null;
  return variants[graveId % variants.length];
}

export function renderGrave(
  layer: Phaser.Tilemaps.TilemapLayer,
  tileX: number,
  tileY: number,
  slotType: string,
  variant: ReturnType<typeof pickTileVariant>,
) {
  if (!variant) return;
  if (!layer.layer) return;

  if ('gid' in variant) {
    // 1x1
    layer.putTileAt(variant.gid, tileX, tileY);
  } else if ('top' in variant) {
    // 1x2
    layer.putTileAt(variant.top, tileX, tileY);
    layer.putTileAt(variant.bottom, tileX, tileY + 1);
  } else if ('left' in variant) {
    // 2x1
    layer.putTileAt(variant.left, tileX, tileY);
    layer.putTileAt(variant.right, tileX + 1, tileY);
  } else if ('tl' in variant) {
    // 2x2
    layer.putTileAt(variant.tl, tileX, tileY);
    layer.putTileAt(variant.tr, tileX + 1, tileY);
    layer.putTileAt(variant.bl, tileX, tileY + 1);
    layer.putTileAt(variant.br, tileX + 1, tileY + 1);
  } else if ('rows' in variant) {
    const rows = variant.rows;
    for (let row = 0; row < rows.length; row++) {
      const cols = rows[row];
      for (let col = 0; col < cols.length; col++) {
        layer.putTileAt(cols[col], tileX + col, tileY + row);
      }
    }
  }
}
