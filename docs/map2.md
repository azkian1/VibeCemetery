# Cemetery Map 2.0 — runtime reference

Updated 2026-09-24. Production serves the v2 cemetery at `/cemetery`.

Two of nine planned zones are open. Future zones will be released around announced GRAVE burn checkpoints. The runtime does not yet assign stable zone IDs or automatically unlock terrain from a burn threshold. The [master-plan illustration](images/cemetery-master-plan.png) is concept art; its illustrated allocations are provisional.

## Map contract

| Item | Value |
| --- | --- |
| TMJ | `public/map/cemetery-v2.tmj` |
| Grid | 140 × 104 tiles, 32 px |
| World | 4480 × 3328 px |
| Terrain footprint | x: 800..3328, y: 1312..3328 |
| Open-space authority | Empty cells in `fog_locked_blockout` |
| Scene | `src/game/scenes/CemeterySceneV2.ts` |
| Placement / variants | `slotManager-v2.ts`, `tileRegistry-v2.ts`, `src/lib/map-slots.ts` |
| Approved slots | 144; see `v2-slot-audit.md` |
| Master-plan capacity | 666; 522 slots remain for future zones |

The served TMJ is authoritative. Phaser applies its object and terrain offsets: do not add them again. Terrain has offset (768, 1312); parsed GraveObj and TreeObj coordinates are world coordinates.

New graves receive a uniformly random free approved slot and a compatible persisted `grave_gid`. Placement stays fixed after creation. Account quotas span GitHub and local project sources; the allowance is 4 + 1 sharing slot.

## Buildings and interactions

The tall chapel opens The Crypt. The two distinct service objects on the right form one interactive Crematory: a garage and a technical hall, each with its own painted sprite and authored size. The lodge by the entrance identifies the cemetery caretaker. Gates and adjacent fences are decoration and do not open a modal.

### Building repaint rules

1. The existing building PNG defines the building's identity and silhouette. Keep the Crypt's chapel, tower and cross; keep the Crematory garage's shutter and controls; keep the technical hall's raised central roof, vents and pointed windows. The Gravedigger's Lodge supplies only the visual reference for camera, materials and lighting. Do not copy its facade or roof design into another building.
2. Match the Lodge's nearly frontal, slightly elevated view: the front facade dominates, some roof is visible, vertical walls remain upright and side walls are minimal. Match its subdued gray-blue slate, aged stone, moss, contrast and brightness at the final map zoom.
3. Preserve each Tiled object's authored world footprint and bottom anchor. The Crypt is 160×256, the Lodge 160×160, the garage 64×96 and the technical hall 128×160. `getTiledObjectBounds` applies the Tiled bottom-left tile-object origin after Phaser has applied the layer offset; `renderBuildingPreviews` fits each painted sprite to those bounds. Do not make buildings equal in width or height merely to match the Lodge. Prepare the source silhouette for its own footprint and check the rendered proportions at 1.45 zoom so it does not look compressed or elongated.
4. The garage and technical hall remain separate visible sprites in their separate footprints. Their shared interactive Crematory slot is the union of those footprints. Keep shadows and click areas aligned with the visible base of each building; verify the full silhouette and nearby paths, graves and trees in the running map.

Graves open their memorials and retain stable `/grave/[uuid]` links. The shared modal layer restores map input after closing, including nested grave and ledger views.

## Fog, camera and HUD

The authored fog masks are composited into a blurred quarter-resolution canvas above the map. A distance mask conceals terrain edges. The masks also constrain navigation.

The camera starts on the redesigned gate at (1760, 2990), at 1.45 zoom on desktop and the normal zoom floor on mobile. Navigation respects terrain and clear fog cells; dragging has a small resisted buffer followed by a snap back. Zoom is bounded and resize cancels active movement before applying constraints. A small visual clearing in front of the gate lets the entry path show through the fog; the TMJ fog cells still control navigation and the minimap.

Phaser raw scroll coordinates differ from the visible world's top-left when zoom differs from one. Camera navigation, viewport events, tooltip positions and constraints must use a consistent conversion. Validate normal and close zoom on interior and edge graves.

The circular minimap projects terrain, grave/building markers, fog and the viewport in separate layers. Retained raster and viewport events restore it after responsive remounting. Clicks outside the lens, on empty terrain or in locked fog are ignored.

Desktop HUD includes the bottom chat and red Bury button, plus the minimap and day/night display. Mobile preserves map navigation and grave modals. Ledger amounts display whole tokens while accounting preserves exact raw values.

## Published assets

The TMJ still references its original 74 PNGs: 71 selected PixelLab images, `tilesets/grass_flagstone_spritesheet.png`, and the generated `planning_tiles.png` and `blockout_tiles.png`. They remain available as fallback and for Tiled editing. The last two are generated by `node scripts/generate-blockout-pngs.mjs` from SVG sources.

The open-zone painted art is in `public/map/open-art/`. `terrain-v5.webp` is one ground image for the whole open map, including the entrance. Its grass and stone patches come directly from the cleaned first gate prototype, quilted across the unchanged TMJ road geometry at full-map size without mirrored repeats. There is no separate runtime entrance-ground layer or second grass/road texture set. The gate and two older memorials still come from `public/map/entrance-art/`. The source concept is `artifacts/visual-prototypes/cemetery-gate-redraw-concept-v1.png`.

The 47 grave GIDs (51–97) map to twelve four-frame transparent atlases. The 16 tree GIDs (35–50) map to four four-frame transparent atlases. Six tree frames (35, 36, 39, 42, 45, 46) use cyber-gothic concepts from `artifacts/tree-concepts/`; the other frames retain the original painted art. Tree frames render with uniform horizontal and vertical scale, so Tiled's narrow object rectangles cannot squeeze their crowns. The Crypt, both Crematory wings, lodge and side fence have separate painted images. Crypt and Crematory art retains each original template while following the Lodge's camera angle and palette; `node scripts/build-lodge-angle-buildings.mjs` rebuilds the three WebP assets. The source PNGs are in `artifacts/painted-map-sources/`; run `node scripts/build-unified-prototype-terrain.mjs` to rebuild the active ground image and `node scripts/prepare-open-art.mjs` for the other optimized WebP assets, including the new tree atlases. For tree-only changes, run `node scripts/build-cybergothic-tree-atlases.mjs`. Keep source art outside `public/`.

Every live grave retains its persisted GID and approved slot footprint. The visual is selected by `src/game/utils/paintedArtV2.ts`; placement, input and links stay attached to the original slot. Tree sprites are complete under the fog. Their trunks are checked against approved slots, while crowns can overlap graves. Three tree roots near or on paving were moved onto grass; `node scripts/audit-painted-trees.mjs` verifies the visible roots against the active terrain. The six legacy tree objects with trunks on approved slots are omitted visually. The fog stays above all art.

The approved high-cyber concepts are alternate sprites for dry GID 46 and compact leafy GID 39. For each type, one of every three distinct visible tree positions uses the high-cyber sprite, while the other two keep the existing painted sprite. Coincident Tiled objects share a variant. `scripts/build-high-cyber-tree-variants.mjs` builds their two-frame transparent atlas after the regular tree atlases.

For local composition review only, add `?previewGraves=all` to `/cemetery` on `localhost` or `127.0.0.1`. It draws one sample grave in every approved slot and cycles all 47 models without writing data or taking clicks. Real occupied graves hide the preview in their slots. The plain `/cemetery` route shows normal gameplay without sample graves. The rollout and acceptance criteria are in `visible-map-art-rollout-plan.md`.

All required runtime images are committed and served by the application host. The map data and artwork may be reused under the MIT license, including commercially. See [asset licensing](../ASSETS.md).

Some accepted images have generation IDs or `compare` in their names. Determine whether an image is used from the TMJ and loader, not its filename alone.

## Editing and verification

Edit the TMJ in Tiled. Use `scripts/convert-tmx-to-tmj.mjs` when exporting from TMX, preserving numeric coordinates and offsets. Never compensate for an incorrect export by changing scene placement.

Run TypeScript, unit tests, the mocked browser suite, lint, the production build and `npm run check:v2-bundle`. Check desktop/mobile, zoom, edge dragging, Find on Map, actual sprite clicks and modal dismissal. Browser writes and wallet transfers use fixtures.

For database installation follow `setup.md` and `unified-burial-setup.md`. Preserve existing UUIDs, F and exact GRAVE history during upgrades.
