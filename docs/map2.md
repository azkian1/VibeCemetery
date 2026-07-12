# Cemetery Map v2 — Current Runtime Reference

> Updated: 2026-07-12. This top section is the source of truth for the live
> `/cemetery/v2` experience. The original integration plan remains below as
> historical implementation material.

## Current Status

Map v2 is live at `/cemetery/v2` alongside the view-only v1 map at
`/cemetery`. The runtime uses `public/map/Map4.tmj`; an alternative TMX source
is not served until it is converted into that file.

The v2 implementation currently includes:

- Phaser rendering of Map4 terrain, buildings, trees, dynamic graves, labels,
  day/night treatment, ambient particles, and fog of war.
- Versioned grave data (`map_version = 'v2'`) with a server-persisted
  `grave_gid`, so a grave keeps its chosen sprite across reloads.
- A circular minimap with terrain, markers, fog, and viewport rendered as
  separate layers.
- Camera movement that respects the authored playable shape inside the fog,
  rather than treating the entire terrain envelope as open.

## Live Map Contract

| Item | Runtime value |
|---|---|
| Served map | `public/map/Map4.tmj` |
| Route | `/cemetery/v2` |
| Grid | 140 × 104 tiles at 32 px |
| Tilemap world | 4480 × 3328 px |
| Authored terrain footprint | `x: 800..3328`, `y: 1312..3328` |
| Open-space authority | Empty cells in `fog_locked_blockout` |
| Main scene | `src/game/scenes/CemeterySceneV2.ts` |
| Camera fog helper | `src/game/utils/fogCameraBounds.ts` |

### Coordinates and Layers

`Map4.tmj` offsets are already applied by Phaser. Runtime code must use parsed
object coordinates and the `createLayer()` defaults directly:

- Terrain `pixellab_dualgrid_reconstructed`: TMJ offset `768, 1312`.
- `GraveObj`: its Phaser-parsed `x/y` values are already in world space.
- `TreeObj`: its Phaser-parsed `x/y` values are already in world space.
- Fog layers have no terrain offset and remain at authored world coordinates.
- Never add the terrain or object offsets a second time; this causes visual
  and interactive objects to diverge from their TMJ positions.

Fog is a world-state overlay and must conceal every game object. Its depth
order is `fog_soft_inner` 2000, `fog_soft_outer` 2001,
`fog_locked_blockout` 2002, then the vignette/overscroll safety layer at 2003.

## Camera, Fog, and Zoom

The camera begins around the main gate (`1760, 3100`). At an ordinary viewport,
its strict scroll bounds are `min = (800, 1312)` and
`max = (3328 - viewWidth, 3328 - viewHeight)`. If a viewport is larger than
the playable footprint, that axis is centred on the footprint and then clamped
to the full 4480 × 3328 tilemap so no canvas is exposed. Direct dragging is
constrained against the actual clear cells of `fog_locked_blockout`.

- A drag can enter locked fog freely for 32 world pixels, measured from the
  nearest unlocked fog cell to the camera centre.
- Beyond that it is resisted; the maximum excursion is 64 world pixels on all
  four sides.
- On release, a 220 ms `Sine.easeOut` returns the camera to the 32 px resting
  buffer. This preserves the feeling of a nearby closed location without
  allowing a long trip through opaque fog.
- A fog safety skirt extends 64 px around Map4. It prevents a short permitted
  overscroll, or a centred wide viewport, from exposing an empty canvas.
- Wheel, pinch, zoom controls, and minimap travel use the strict terrain
  bounds. `fitZoom` is calculated from the full 4480 × 3328 tilemap;
  zoom-out stops at `max(fitZoom, 0.9)` and zoom-in is capped at `2.0`.
- A Phaser scale-resize event stops any active camera tween and reapplies the
  strict bounds, so a desktop resize or mobile orientation change cannot leave
  the camera outside the covered world.

The fog mask is cached once when the scene is created. The camera helper finds
the nearest unlocked fog tile for each drag candidate, so irregular map edges
receive the same treatment instead of a rectangular one-sided clamp.

## Minimap and HUD

`src/components/hud/Minimap.tsx` uses a circular cover projection for v2. It
draws terrain, fog, markers, and the camera viewport independently; camera
movement repaints only the viewport. Clicks in clipped lens corners, empty
terrain, or fully locked fog are ignored. Accepted minimap clicks move the
camera only within its strict playable bounds.

The v2 HUD retains the chat ledger in the lower-left corner. It can collapse to
its counters, and its control remains within the chat frame.

## Editing and Verification

Edit `public/map/Map4.tmj` directly in Tiled. If a TMX source is used, convert
it back into that file with `scripts/convert-tmx-to-tmj.mjs`; keep tile-layer
`x/y` numeric and preserve numeric object offsets.

Before handing off a Map v2 change, run:

```bash
npx tsc --noEmit --incremental false
npm run test:unit -- tests/map-v2-camera-bounds.spec.ts
npm run lint
```

For a broader regression pass, run `npm run test:unit`. The camera tests cover
the terrain footprint, equal four-edge fog resistance, the real Map4 fog mask,
the bottom fog safety skirt, strict minimap/zoom behavior, and snap-back.
Finally inspect `/cemetery/v2` at both the normal zoom floor and a close zoom:
drag each edge into fog, release, and confirm that the view returns smoothly
without exposing an empty map.

## Historical Integration Material

The sections below record the original v2 integration work and asset mapping.
They are useful for provenance, but the runtime contract above takes precedence
when an older snippet conflicts with current code.

## Historical Integration Goal

Run Map4 (140×104 tiles, 32px, PixelLab custom art) as `/cemetery/v2` alongside
the current `az.tmj` (40×40 tiles, 48px, asset-pack art) at `/cemetery`.

v1 remains view-only (no wallet connect). v2 gets full functionality.

---

## Map Differences at a Glance

| Property | v1 (az.tmj) | v2 (Map4.tmj) |
|----------|------------|---------------|
| Map size | 40×40 tiles | 140×104 tiles |
| Tile size | 48×48 px | 32×32 px |
| World size | 1920×1920 px | 4480×3328 px |
| Format | Tiled JSON (.tmj) | Tiled XML (.tmx) → convert to .tmj |
| Tilesets | 10 (Kenney/asset-pack) | 74 (PixelLab custom) |
| Object layer | `slots` (318 objs) | `GraveObj` (144 graves) + `TreeObj` (161 trees) |
| Grave types | 7 (w/special, tall, wide, large, largetop, largeX) | 3 (1x2=grave_tall, 2x1=grave_wide, 2x2=grave_large) |
| Auto-assignable | grave, grave_tall (263 slots) | grave_tall (87 slots) |
| Grave rendering | Multi-tile composition via putTileAt | Single-PNG sprite via add.sprite |
| Sprite selection | `slot_id % variants.length` (deterministic) | Server-side `Math.random()` → `grave_gid` column (random) |
| Buildings | `slots` layer with `type: Building` | Hardcoded in slotManager-v2.ts + preview object layers |
| Terrain | Standard splat | Custom `grass_flagstone_spritesheet` (16 tiles) |
| Fog | Programmatic vignette | 3 tile layers + vignette |
| Fire/lamp effects | Fire torches, blue lamps | None (deferred to decor pass) |
| Map version | `slot_id` unique | `(slot_id, map_version)` composite unique |

---

## Step 0 — Asset Preparation

### 0.1 Edit / Convert TMX → TMJ

The live v2 map file is:

```text
C:\Users\az\Desktop\March\02\vibecemetery\public\map\Map4.tmj
```

Open this file directly in Tiled when editing the project map. Saving it updates
the file served by `/cemetery/v2` at `/map/Map4.tmj`; refresh the browser after
save.

If editing from a `.tmx` source instead, convert back into the live TMJ file:

```bash
node scripts/convert-tmx-to-tmj.mjs path/to/Map4.tmx public/map/Map4.tmj
```

The converter normalizes numeric attributes, including negative offsets, and
adds explicit `x: 0`, `y: 0` to tile layers because Phaser's Tiled parser expects
numeric layer positions when `createLayer()` uses TMJ offsets.

### 0.2 Copy PixelLab Assets

Source root: `C:\Users\az\Desktop\March\May\Xmap\`
Target root: `C:\Users\az\Desktop\March\02\vibecemetery\public\map\`

```
Xmap/tilesets/grass_flagstone_spritesheet.png
Xmap/planning_tiles.svg
Xmap/blockout_tiles.svg

Xmap/pixellab/chapel_8d_160x256_lowdetail_palette.png
Xmap/pixellab/chapel_8d_160x256_preserve_aspect.png

Xmap/pixellab/gravedigger_lodge_mcp_20260604/
Xmap/pixellab/service_buildings_mcp_20260604/
Xmap/pixellab/main_gate_1ds_20260605/
Xmap/pixellab/side_wicket_chek_20260605/
Xmap/pixellab/inner_wicket_gate_mcp_20260604/
Xmap/pixellab/fence_tilepacks_mcp_20260605/
Xmap/pixellab/fence_v3_crypt_reference/

Xmap/pixellab/tree_batch_mcp_20260605/
Xmap/pixellab/shrubs_2x2_mcp_20260620/

Xmap/pixellab/graves_1x2_mcp_20260620/   (all 26 source PNGs)
Xmap/pixellab/graves_2x1_mcp_20260620/   (all 9 source PNGs)
Xmap/pixellab/graves_2x2_mcp_20260620/   (all 12 source PNGs)
```

Output structure:

```
public/map/
├── az.tmj                          # v1 (untouched)
├── Map4.tmj                        # v2 (new)
├── planning_tiles.svg              # v2
├── blockout_tiles.svg              # v2
├── tilesets/
│   └── grass_flagstone_spritesheet.png  # v2 terrain
├── pixellab/
│   ├── accepted/                   # v1 (untouched)
│   ├── experiments/                # v1 (untouched)
│   ├── rejected/                   # v1 (untouched)
│   ├── chapel_8d_*.png
│   ├── gravedigger_lodge_mcp_20260604/
│   ├── service_buildings_mcp_20260604/
│   ├── main_gate_1ds_20260605/
│   ├── side_wicket_chek_20260605/
│   ├── inner_wicket_gate_mcp_20260604/
│   ├── fence_tilepacks_mcp_20260605/
│   ├── fence_v3_crypt_reference/
│   ├── tree_batch_mcp_20260605/
│   ├── shrubs_2x2_mcp_20260620/
│   ├── graves_1x2_mcp_20260620/
│   ├── graves_2x1_mcp_20260620/
│   └── graves_2x2_mcp_20260620/
└── (existing v1 .png/.tsx files — untouched)
```

### 0.3 Verify Asset Paths in TMJ

After conversion, open `Map4.tmj` and verify all `image` paths are relative
to `public/map/`:

```json
"tilesets": [
  { "image": "tilesets/grass_flagstone_spritesheet.png", ... },
  { "image": "pixellab/chapel_8d_160x256_lowdetail_palette.png", ... },
  ...
]
```

Remove any absolute paths that may have been embedded by Tiled.

### 0.4 Coordinate Contract

`Map4.tmj` contains layer offsets authored in Tiled. Phaser applies them during
map parsing / layer creation, so runtime code must not add these offsets again.

Current coordinate model:

| Layer | TMJ position model | Runtime rule |
|-------|--------------------|--------------|
| `pixellab_dualgrid_reconstructed` | tile layer `x:0`, `y:0`, `offsetx:768`, `offsety:1312` | `createLayer()` uses the offset; do not call `setPosition(768, 1312)` |
| `fog_soft_inner`, `fog_soft_outer`, `fog_locked_blockout` | tile layers at `x:0`, `y:0`, no offset | render at authored world coordinates; do not shift to terrain offset |
| `Buildings` | hidden planning tile layer at `x:0`, `y:0`, no offset | not the visual building sprites; do not force-visible for production visuals |
| `GraveObj` | object layer `offsetx:768`, `offsety:1312` | Phaser returns `obj.x/y` already in world space |
| `TreeObj` | object layer `offsetx:800`, `offsety:1344` | Phaser returns `obj.x/y` already in world space |
| Building preview object layers | object layer-specific offsets, including negative offsets | Phaser returns `obj.x/y` already in world space |

Important rules:
- Object layers from `map.getObjectLayer()` are already offset by Phaser. Use `obj.x` / `obj.y` directly.
- Tile layers created with `map.createLayer(layerName, tilesets)` default to the `LayerData.x/y` parsed from `x/y + offsetx/offsety`. Use the default position unless the TMJ data itself is wrong.
- `Map4.tmj` tile layers must keep numeric `x` and `y` fields. Missing `x/y` can produce `NaN` in Phaser 3.90's Tiled parser.
- Negative object-layer offsets must be JSON numbers, not strings. String offsets can break object placement by causing string concatenation.

Regression coverage for this lives in `tests/map-v2-coordinates.spec.ts`.

---

## Step 1 — Game Layer (src/game/)

### 1.1 `src/game/config-v2.ts`

Clone of `config.ts`. Imports `CemeterySceneV2` instead of `CemeteryScene`.

```typescript
import * as Phaser from 'phaser';
import { CemeterySceneV2 } from './scenes/CemeterySceneV2';

export function createGameConfigV2(parent: HTMLElement, size: { width: number; height: number }): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    scale: { mode: Phaser.Scale.NONE, width: size.width, height: size.height },
    backgroundColor: '#1a1918',
    scene: [CemeterySceneV2],
    input: { windowEvents: false, activePointers: 3 },
    audio: { noAudio: true },
    pixelArt: true,
    antialias: false,
  };
}
```

### 1.2 `src/game/utils/slotManager-v2.ts`

Parse `GraveObj` object layer.

Key difference from v1: objects have no `type` field — infer grave type from dimensions.

```typescript
export interface SlotData {
  id: number;
  type: string;    // inferred: 'grave_tall' | 'grave_wide' | 'grave_large' | 'Building'
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
}

export function parseSlotsV2(map: Phaser.Tilemaps.Tilemap): Map<number, SlotData> {
  const slots = new Map<number, SlotData>();

  // 1. Parse grave objects from GraveObj layer
  const graveLayer = map.getObjectLayer('GraveObj');
  if (graveLayer) {
    for (const obj of graveLayer.objects) {
      const type = inferGraveType(obj.width ?? 0, obj.height ?? 0);
      slots.set(obj.id, {
        // Phaser has already applied GraveObj offsetx/offsety.
        id: obj.id, type, x: obj.x ?? 0, y: obj.y ?? 0,
        width: obj.width ?? 0, height: obj.height ?? 0, name: '',
      });
    }
  }

  // 2. Add buildings from hardcoded map (no building object layer in Map4)
  for (const b of BUILDINGS) {
    slots.set(b.id, { ...b, type: 'Building' });
  }

  return slots;
}

function inferGraveType(w: number, h: number): string {
  if (w === 32 && h === 64) return 'grave_tall';   // 1x2 vertical
  if (w === 64 && h === 32) return 'grave_wide';   // 2x1 horizontal
  if (w === 64 && h === 64) return 'grave_large';  // 2x2 square
  return 'grave'; // fallback
}
```

Building hardcoded map (world coordinates after preview layer offsets):

```typescript
const BUILDINGS = [
  { id: 5000, name: 'Chapel',        x: 1680, y: 1824, width: 160, height: 256 },
  { id: 5001, name: 'Gravedigger Lodge', x: 2208, y: 3072, width: 160, height: 160 },
  { id: 5002, name: 'Service Garage',    x: 2880, y: 2880, width: 64,  height: 96  },
  { id: 5003, name: 'Service Building',  x: 2944, y: 2880, width: 128, height: 160 },
  { id: 5004, name: 'Main Gate',         x: 1600, y: 3136, width: 320, height: 160 },
  { id: 5005, name: 'Side Wicket',       x: 1504, y: 3136, width: 512, height: 96  },
];
```

Building IDs start at 5000 to avoid collision with GraveObj IDs (1–508).

### 1.3 `src/game/utils/tileRegistry-v2.ts`

Catalog of PixelLab grave sprites with their GIDs from Map4 tilesets.

Graves are single sprites (not tile compositions like v1). Each sprite is rendered
as an object (via `gid` reference on the object layer), not as individual tiles.

However since Phaser's dynamic rendering uses `putTileAt()`, and Map4 graves are
single-image tilesets (1 tile each), we map each grave sprite to a GID.

**1x2 graves (26 variants, gid 51–76):**

| GID | Asset name | Source |
|-----|-----------|--------|
| 51 | del_key_cross_style_v2 | grave_1x2_batch08_del_key_cross_style_v2_586efee3 |
| 52 | microchip_cross | grave_1x2_microchip_cross_090b565c |
| 53 | broken_keyboard_slab | grave_1x2_broken_keyboard_slab_63b07f55 |
| 54 | dead_disk_slab | grave_1x2_dead_disk_slab_ce37aadc |
| 55 | server_panel_slab | grave_1x2_server_panel_slab_c1262087 |
| 56 | cracked_crt_slab | grave_1x2_cracked_crt_slab_f4e23bcb |
| 57 | hourglass_inlay_slab | grave_1x2_hourglass_inlay_slab_b9b476ad |
| 58 | concrete_capacitor_slab | grave_1x2_concrete_capacitor_slab_44577a41 |
| 59 | marble_iron_heatsink_slab | grave_1x2_marble_iron_heatsink_slab_52a98cb4 |
| 60 | iron_pci_slot_slab | grave_1x2_iron_pci_slot_slab_99bbf84d |
| 61 | numpad_plus_key_cross_style | grave_1x2_batch08_numpad_plus_key_cross_style_9a47775a |
| 62 | gpu_memory_slab | grave_1x2_gpu_memory_slab_3d5b1ba6 |
| 63 | atx_power_connector_slab | grave_1x2_atx_power_connector_slab_1d45172d |
| 64 | laptop | batch06_01_laptop_4c95c269 |
| 65 | mvp_monolith | batch06_03_mvp_monolith_0351632b |
| 66 | spinner | batch06_05_spinner_d80d6e79 |
| 67 | merge_conflict | batch06_10_merge_conflict_7e179831 |
| 68 | zip_archive | batch06_15_zip_archive_df472bd8 |
| 69 | kanban | batch06_16_kanban_740c7863 |
| 70 | chatbot | batch06_17_chatbot_08238e46 |
| 71 | api_endpoint | batch06_18_api_endpoint_f7cdbd63 |
| 72 | deploy_badge | batch06_19_deploy_badge_b34e2468 |
| 73 | almost_product | batch06_24_almost_product_bca46cb2 |
| 74 | winrar_cracked_stack | batch07_winrar_02_cracked_stack_5be922bb |
| 75 | winrar_dark_archive | batch07_winrar_03_dark_archive_83e7003d |
| 76 | flat_cross_slab | batch03_b_flat_cross_slab_a4654327 |

**2x1 graves (9 variants, gid 77–85):**

| GID | Asset name |
|-----|-----------|
| 77 | broken_keyboard |
| 78 | concrete_gpu |
| 79 | router_slab |
| 80 | 404_slab |
| 81 | shift_key |
| 82 | caps_key |
| 83 | tab_key |
| 84 | enter_key_caps_style |
| 85 | stone_keyboard |

**2x2 graves (12 variants, gid 86–97):**

| GID | Asset name |
|-----|-----------|
| 86 | xl_concrete_gpu |
| 87 | concrete_blue_screen_monitor |
| 88 | pc_case_tomb |
| 89 | deploy_rocket_crater |
| 90 | router_monument |
| 91 | database_collapse |
| 92 | docker_whale_rubble |
| 93 | eternal_loading_spinner |
| 94 | broken_qr_slab |
| 95 | neural_lattice_ossuary |
| 96 | product_hunt_clone |
| 97 | file_manager |

```typescript
export const GRAVE_TILES_V2 = {
  grave_tall:  [51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76],
  grave_wide:  [77,78,79,80,81,82,83,84,85],
  grave_large: [86,87,88,89,90,91,92,93,94,95,96,97],
};

export function pickTileGidV2(slotType: string, graveId: number): number | null {
  const type = slotType as keyof typeof GRAVE_TILES_V2;
  const gids = GRAVE_TILES_V2[type];
  if (!gids || gids.length === 0) return null;
  return gids[graveId % gids.length];
}

export function renderGraveV2(
  layer: Phaser.Tilemaps.TilemapLayer,
  tileX: number, tileY: number,
  slotType: string, gid: number,
) {
  if (!layer.layer || !gid) return;

  if (slotType === 'grave_tall') {
    // 1x2: single sprite covers both cells, only need top-left tile
    layer.putTileAt(gid, tileX, tileY);
  } else if (slotType === 'grave_wide') {
    // 2x1: single sprite covers both cells
    layer.putTileAt(gid, tileX, tileY);
  } else if (slotType === 'grave_large') {
    // 2x2: single sprite covers all 4 cells
    layer.putTileAt(gid, tileX, tileY);
  }
}
```

Note: Map4 graves are single-png sprites (not composited tiles like v1).
A 2x2 grave is one 64×64 image placed via a single gid.
Phaser's `putTileAt` on a tile layer with 32×32 cells will show only the
top-left 32×32 of the sprite. For proper rendering we render graves as
Phaser game objects (sprites) rather than tiles, using the GID to look up
the texture, and place them at the exact pixel coordinates from GraveObj.

**Revised approach — render graves as sprites (not tiles):**

```typescript
import { GRAVE_TILES_V2 } from './tileRegistry-v2';

// In CemeterySceneV2:
private renderGraveOnMap(grave: RenderGraveData) {
  const slot = this.slots.get(grave.slot_id);
  if (!slot) return;

  const gid = pickTileGidV2(slot.type, grave.slot_id);
  if (!gid) return;

  // Find which tileset owns this GID
  const tileset = this.map.tilesets.find(ts => gid >= ts.firstgid && gid < ts.firstgid + ts.tileCount);
  if (!tileset) return;

  // Create sprite at exact pixel coords (not tile coords)
  const sprite = this.add.sprite(
    slot.x + slot.width / 2,
    slot.y + slot.height / 2,
    tileset.name,
    gid - tileset.firstgid
  );
  sprite.setDepth(800);
  this.renderedSlots.add(grave.slot_id);
}
```

This avoids the tile-layer limitation and renders full grave sprites correctly.

### 1.4 `src/game/scenes/CemeterySceneV2.ts`

New scene class adapting all systems from CemeteryScene.ts to Map4 dimensions.

Key differences documented inline below. Full implementation in the actual file.

**Constants:**
```typescript
const MAP_TILES_X = 140;
const MAP_TILES_Y = 104;
const TILE_SIZE = 32;
const WORLD_W = MAP_TILES_X * TILE_SIZE;  // 4480
const WORLD_H = MAP_TILES_Y * TILE_SIZE;  // 3328
const TILESET_BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tilesets`
  : '/map';
```

**Tilesets to load** (all 74 from Map4.tmx, extracted after TMJ conversion):
List constructed from TMJ tilesets array. Key ones:
- `grass_flagstone_spritesheet` (gid 11, 16 tiles)
- Building sprites (gid 27–34)
- Tree sprites (gid 35–47)
- Shrub sprites (gid 48–50)
- Grave sprites (gid 51–97)

**Tile layers to create** (draw order bottom→top):
```typescript
const TILE_LAYER_NAMES = [
  'pixellab_dualgrid_reconstructed',  // terrain base
  'Buildings',                         // building footprints
  'fog_soft_inner',                    // opacity 0.22
  'fog_soft_outer',                    // opacity 0.45
  'fog_locked_blockout',               // opacity 0.85
];
```

Create these layers with `map.createLayer(layerName, tilesets)` and no manual
`setPosition()`. Phaser reads `LayerData.x/y` from the TMJ layer `x/y` and
`offsetx/offsety` values.

Hidden reference layers (not rendered, used for data):
- `Map` — planning grid (hidden)
- `Phase1` — playable boundary mask (hidden)
- `GraveX` — grave tile placement guide (hidden)
- `TreeX` — tree tile placement guide (hidden)

Object layers (data only):
- `GraveObj` — slot positions
- `TreeObj` — tree sprites with gid
- Preview layers — building placement

`getObjectLayer()` returns Phaser-parsed object coordinates with object-layer
offsets already applied. Do not add `768/1312`, `800/1344`, or preview offsets
in scene code.

**Camera:**
```typescript
// Start centered on the main gate area
cam.centerOn(1760, 3100);
const fitZoom = Math.max(
  this.scale.width / WORLD_W,
  this.scale.height / WORLD_H
);
this.minZoom = fitZoom;
cam.setZoom(0.8);
cam.zoomTo(0.9, 2000, 'Sine.easeInOut');
```

**Elastic bounds:**
```typescript
const getBounds = () => {
  const vw = cam.width / cam.zoom;
  const vh = cam.height / cam.zoom;
  return {
    minX: 0, minY: 0,
    maxX: Math.max(0, WORLD_W - vw),
    maxY: Math.max(0, WORLD_H - vh),
  };
};
```

**Interactive zones:**
- Grave slots from `GraveObj` layer (via `parseSlotsV2`)
- Building zones from hardcoded `BUILDINGS` array
- No fire torches, no blue lamps on initial version

**Effects to adapt:**
- Day/night overlay: 4480×3328, centered at (2240, 1664)
- Fog vignette: scale depth and steps proportionally
- Ambient particles: expand spawn area to WORLD_W × WORLD_H
- Building labels: render from BUILDINGS array

**Effects to disable initially:**
- Fire animation (no Fire_Animation tileset)
- Lamp glow (no lamp objects in Map4 yet)
- Blue lamps (none defined)

---

## Step 2 — Route and Components

### 2.1 `src/app/cemetery/v2/page.tsx`

```tsx
import CemeteryAppV2 from '@/components/CemeteryAppV2';

export const dynamic = 'force-dynamic';

export default function CemeteryV2Page() {
  return <CemeteryAppV2 />;
}
```

### 2.2 `src/components/CemeteryAppV2.tsx`

Clone of `CemeteryApp.tsx` with:
- Imports `PhaserCanvasV2` instead of `PhaserCanvas`
- All modals, HUD components shared (no change)
- `useGraves({ mapVersion: 'v2' })` when API supports it
- `DeepLinkOpener` adapted for v2 slot positions

### 2.3 `src/components/PhaserCanvasV2.tsx`

Clone of `PhaserCanvas.tsx` with:
- Imports `createGameConfigV2` from `../game/config-v2`
- Same event bridge (grave_click, building_click, etc.)
- Same React↔Phaser sync logic (graves, modals, burial ceremony)

### 2.4 `src/components/hud/Minimap.tsx` — make version-aware

Instead of a separate MinimapV2, modify the existing Minimap to detect which
map version is active:

```typescript
interface MinimapProps {
  mapVersion?: 'v1' | 'v2';
}

// v1: WORLD_W=1920, WORLD_H=1920, TILES_X=40, TILES_Y=40, TILE_SIZE=48
// v2: WORLD_W=4480, WORLD_H=3328, TILES_X=140, TILES_Y=104, TILE_SIZE=32
```

The minimap canvas SIZE stays 140px. For v2, each world pixel = 140/4480 ≈ 0.031,
so 32px tile ≈ 1px on minimap. Pass `mapVersion` from app shell.

---

## Step 3 — API and Database

### 3.1 Database migration

Add `map_version` column to separate v1 and v2 graves:

```sql
ALTER TABLE graves ADD COLUMN map_version TEXT NOT NULL DEFAULT 'v1';
CREATE INDEX idx_graves_map_version ON graves(map_version);

-- RPC functions updated to accept map_version parameter:
-- insert_grave_if_user_slot_available(map_version TEXT, ...)
-- increment_graves_count(map_version TEXT, ...)
```

### 3.2 Update `GET /api/graves`

Add optional query param:
```
GET /api/graves?map_version=v2
```

Default behavior when no param: return only `map_version = 'v1'` for backward compat.

### 3.3 Update `POST /api/graves`

Accept `map_version` in request body (default: `'v1'`).

Slot selection uses the correct map:
- `map_version = 'v1'` → `public/map/az.tmj` → slot types: `grave`, `grave_tall`
- `map_version = 'v2'` → `public/map/Map4.tmj` → slot types: `grave_tall`, `grave_wide`

### 3.4 Update `src/lib/map-slots.ts`

```typescript
export function getGraveSlotsV2(): GraveSlot[] {
  const mapPath = join(process.cwd(), 'public', 'map', 'Map4.tmj');
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  const graveLayer = map.layers.find((l: any) => l.name === 'GraveObj');
  if (!graveLayer?.objects) return [];

  return graveLayer.objects
    .filter((o: any) => !o.gid) // no gid = empty slot, available for burial
    .map((o: any) => ({
      id: o.id,
      type: inferGraveTypeFromDims(o.width, o.height),
    }))
    .sort((a: GraveSlot, b: GraveSlot) => a.id - b.id);
}

function inferGraveTypeFromDims(w: number, h: number): string {
  if (w === 32 && h === 64) return 'grave_tall';
  if (w === 64 && h === 32) return 'grave_wide';
  if (w === 64 && h === 64) return 'grave_large';
  return 'grave_tall'; // fallback
}
```

### 3.5 Update `src/lib/slot-economy.ts`

For v2, auto-assignable slot types:
```typescript
export const AUTO_ASSIGNABLE_GRAVE_SLOT_TYPES_V2 = ['grave_tall'] as const;
// 88 slots available for automatic burial (most common size in Map4)
```

### 3.6 Update `src/context/GameContext.tsx`

`useGraves` hook takes optional `mapVersion`:
```typescript
export function useGraves(options?: { auto?: boolean; mapVersion?: 'v1' | 'v2' }) {
  const mapVersion = options?.mapVersion ?? 'v1';
  // fetch `/api/graves?map_version=${mapVersion}`
}
```

---

## Step 4 — Effects Adaptation

### 4.1 Day/Night Cycle

- Overlay rectangle: `WORLD_W × WORLD_H` (4480 × 3328)
- Center: `(2240, 1664)`

### 4.2 Fog Vignette

- Scale `DEPTH` from 144px (3 tiles of 48) to 96px (3 tiles of 32)
- Edge rendering adapted for non-square map (4480 vs 3328)
- Keep software vignette as supplement to the 3 tile-based fog layers

### 4.3 Ambient Particles

- Spawn area: WORLD_W × WORLD_H instead of 1920×1920
- Reduce frequency proportionally on mobile

### 4.4 Building Labels

- Render from BUILDINGS hardcoded array
- Font: Cinzel, same style as v1

### 4.5 Disabled in v2 (for now)

- Fire torch animation
- Lamp glow (blue/mausoleum)
- Crematory light zone in fog

---

## Step 5 — Navigation Between Versions

### 5.1 Version Switcher

In TopBar or BurgerMenu, add a link/button:
- On v1: "Cemetery v2" → navigates to `/cemetery/v2`
- On v2: "Cemetery v1" → navigates to `/cemetery`

### 5.2 v1 Banner

On `/cemetery`, show a subtle banner: "Viewing v1 — wallet connect disabled.
[Try the new map]" linking to `/cemetery/v2`.

---

## Step 6 — Verification Checklist

### v2 smoke tests
- [ ] Map loads without asset errors
- [ ] Camera pan + zoom within 4480×3328 bounds
- [ ] Elastic bounds work (drag past edge → snap back)
- [ ] Pinch-to-zoom works on mobile
- [ ] GraveObj slots have interactive zones
- [ ] Hover highlights grave slots
- [ ] Building interactive zones work (Chapel, Lodge, etc.)
- [ ] Fog layers render (3 tile layers)
- [ ] Day/night cycle transitions
- [ ] Ambient particles (leaves, dust) spawn correctly
- [ ] Building labels visible
- [ ] Minimap reflects v2 world (140×104 grid)
- [ ] Minimap click teleports camera
- [ ] Burial ceremony animation (when API connected)
- [ ] Modal open/close disables/re-enables map input

### v1 regression tests
- [ ] `/cemetery` loads as before
- [ ] All tilesets load (no path changes)
- [ ] Graves render
- [ ] Building clicks work
- [ ] Minimap works
- [ ] Wallet connect disabled (if already applied)

---

## Implementation Order

| Step | Task | Depends on |
|------|------|------------|
| 0.1 | Edit live TMJ or convert TMX → TMJ | Tiled app / converter |
| 0.2 | Copy assets to public/map/ | 0.1 |
| 0.3 | Verify TMJ paths | 0.2 |
| 1.1 | `config-v2.ts` | 0.3 |
| 1.2 | `slotManager-v2.ts` | 0.3 |
| 1.3 | `tileRegistry-v2.ts` | 0.3 |
| 1.4 | `CemeterySceneV2.ts` | 1.1, 1.2, 1.3 |
| 2.1 | Route `/cemetery/v2` | — |
| 2.2 | `CemeteryAppV2.tsx` | 2.1 |
| 2.3 | `PhaserCanvasV2.tsx` | 1.1, 2.2 |
| 2.4 | Minimap version-awareness | 1.4 |
| 4.x | Effects adaptation | 1.4 |
| 3.x | API + DB | 1.2 |
| 5.x | Navigation | 2.x |
| 6.x | Verification | All |

---

## Open Decisions

1. **TMX→TMJ**: Use `public/map/Map4.tmj` as the live editable project map.
   If editing from TMX, run `scripts/convert-tmx-to-tmj.mjs` so numeric offsets
   and tile-layer `x/y` defaults are normalized.

2. **Building interactions in v2**: What does clicking Chapel do? What does clicking
   Main Gate do? We can reuse v1 modals (Mausoleum for Chapel, Crematory for Lodge)
   or add new ones.

3. **Grave rendering**: Sprites vs tiles for graves. Recommendation: sprites
   (as described in 1.3 revised approach) since Map4 graves are single-PNG assets.

4. **API separation**: The `map_version` column approach keeps one table. Alternative:
   separate `graves_v2` table. Column approach is simpler — adds one field.

5. **Minimap size**: Keep 140px for consistency or enlarge? At 140px, v2 tiles are
   ~1px each — still readable as a minimap with dots for graves/buildings.

6. **TreeObj rendering**: Tree sprites with GIDs in TreeObj layer are rendered as
   Phaser sprites from their parsed world coordinates.

---

## Historical Implementation Status (2026-07-10)

### Completed
- [x] Phase 0: TMX→TMJ conversion, 74 tileset assets copied to `public/map/pixellab/`
- [x] Phase 1: `config-v2.ts`, `CemeterySceneV2.ts`, `slotManager-v2.ts`, `tileRegistry-v2.ts`
- [x] Phase 2: `/cemetery/v2` route, `CemeteryAppV2.tsx`, `PhaserCanvasV2.tsx`, Minimap version-awareness
- [x] Phase 3: `map_version` column (DB migration SQL), `grave_gid` column (DB migration SQL), API GET/POST updates, `GameContext` mapVersion parameter
- [x] Phase 5: TopBar version switcher (v1↔v2)
- [x] TypeScript: 0 errors via `npm run build`
- [x] ESLint: 0 errors (`npm run lint`; one warning remains in an untracked debug script)
- [x] Build: successful
- [x] Map v2 coordinate regression tests passing: `tests/map-v2-coordinates.spec.ts`
- [x] Browser smoke: `/cemetery/v2` loads all `/map/*` assets with 200 responses

### Pending
- [ ] Resolve local API read rate-limit (`429`) before checking live grave API rendering
- [ ] Run SQL migrations on Supabase if the target environment has not applied them: `docs/map-v2-migration.sql` then `docs/map-v2-grave-gid.sql`

### Key Architecture Decisions
1. **Single `graves` table** — partitioned by `map_version` column, composite unique on `(slot_id, map_version)`
2. **Server-side random sprite** — `pickRandomGraveGid()` runs on POST, `grave_gid` stored in DB, client renders deterministically
3. **Graves as sprites not tiles** — Map4 graves are single-PNG assets, rendered via `add.sprite()` at exact pixel coordinates
4. **Buildings hardcoded** — Map4 has no building object layer; 6 buildings defined in `slotManager-v2.ts`
5. **Tileset path map** — 74 tilesets use a `TILESET_IMAGE` dictionary because names don't match file paths (subdirectories)
6. **Shared GameContext** — v1 and v2 reuse the same context, modals, and HUD; only game layer differs

---

## Coordinate Repair Log (2026-07-10)

### Root cause

The v2 scene manually re-applied Tiled offsets that Phaser had already parsed:
- `parseSlotsV2()` added `768/1312` to `GraveObj` objects even though Phaser had already applied `GraveObj.offsetx/offsety`.
- `renderTreeSprites()` added `800/1344` to `TreeObj` objects even though Phaser had already applied the object-layer offset.
- `renderBuildingPreviews()` added preview-layer offsets manually even though Phaser had already applied them.
- All rendered tile layers were forced through `setPosition(768,1312)`, which shifted fog and planning layers out of their authored coordinate space.

### Fix

- Trust Phaser's parsed object coordinates from `getObjectLayer()`.
- Trust Phaser's parsed tile-layer positions from `createLayer()` defaults.
- Keep `Map4.tmj` tile-layer `x/y` numeric to avoid Phaser parser `NaN` positions.
- Keep negative preview offsets as JSON numbers, not strings.
- Add `tests/map-v2-coordinates.spec.ts` to lock this behavior.

### Verified coordinates

Runtime-equivalent Phaser parser output:

| Element | Parsed world coordinates |
|---------|--------------------------|
| Terrain layer | `x=768`, `y=1312` |
| Fog layers | `x=0`, `y=0` |
| `GraveObj` id `10` | `x=1568`, `y=2656`, size `32×64` |
| Chapel preview | `x=1680`, `y=1824`, size `160×256` |
| Gravedigger Lodge preview | `x=2208`, `y=3072`, size `160×160` |

Static/render checks:
- 91 rendered object references (tree/shrub/building/gate previews) resolve to loaded tilesets.
- All `/map/*` assets returned 200 in browser smoke.
- One authored tree (`TreeObj` id `376`, hero dead witness tree) extends below the 3328px world by sprite height. Its origin is near the lower edge; this is map data, not a double-offset runtime bug.
