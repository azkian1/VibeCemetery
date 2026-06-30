# PixelLab Workflow for VibeCemetery Map Assets

This is the best PixelLab workflow found so far for VibeCemetery map asset replacement.

The winning pattern is not full-map generation and not generic terrain generation. The best result came from a style-referenced object pack:

```text
production VibeCemetery tile crops
-> PixelLab create_1_direction_object review pack
-> manual candidate selection
-> selected 32x32 props
-> planned target footprint, such as 1x1, 2x2, 3x3, 3x6 on a 32px grid
-> Tiled/mockup review
-> accepted asset folder
```

## What Worked

- `create_1_direction_object` with a production tombstone style reference.
- 32x32 transparent object review pack.
- Manual selection from 64 candidates.
- Saving all review candidates locally before accepting/rejecting.
- Treating 32x32 as a base source grid and planning larger objects as multi-cell assets before generation.

## What Did Not Work Well

- Generic `16x16` terrain generation as production terrain.
- Direct `16x16 -> 48x48` terrain upscale as a visual replacement for the current map.
- Unreferenced props as final assets. Some were usable, but style drift was obvious.
- Direct `32x32 -> 48x48` scaling. It is a non-integer `1.5x` upscale and damages pixel-grid consistency.

## Current Best Experiment

Reference experiment:

```text
public/map/pixellab/experiments/2026-05-28-grave-pack-style-32x32-v1/
```

Key files:

```text
style-refs/                                  Production tile crops used as style anchors.
review-candidates/                           All 64 PixelLab review candidates.
source/selected/                             28 selected candidates copied locally.
previews/review-candidates-2x-contact-sheet.png
previews/selected-2x-contact-sheet.png
manifest.json
notes.md
```

## Directory Rules

Use this structure for every new experiment:

```text
public/map/pixellab/experiments/YYYY-MM-DD-short-name/
  source/          Original accepted downloads or copied review frames.
  source/selected/ Selected review frames copied from review-candidates.
  style-refs/      Crops from current production tilesets.
  review-candidates/
  processed/       Target-grid canvases, palette edits, downscaled/upscaled tests.
  previews/        Contact sheets and real-map mockups.
  manifest.json
  notes.md
```

Never write experimental outputs directly to:

```text
public/map/*.png
public/map/az.tmj
src/game/utils/tileRegistry.ts
```

Only promote reviewed assets into:

```text
public/map/pixellab/accepted/graves/
public/map/pixellab/accepted/props/
public/map/pixellab/accepted/decor/
public/map/pixellab/accepted/terrain/
```

## Size Strategy

Before every PixelLab generation, decide what object class and footprint you are making. Do not generate a vague pack and decide the size later.

If the new art direction moves to a 32x32 base grid, use 32px as the atomic cell and describe larger objects in grid cells:

```text
1x1 = 32x32      small grave, candle, skull, urn, tiny bush
2x2 = 64x64      standard monument, skull pile, large tombstone, small shrine
3x3 = 96x96      large grave, angel statue, crypt prop, ritual pile
4x4 = 128x128    hero monument, small building detail, large memorial
6x6 = 192x192    landmark structure, crypt chunk, special set piece
3x6 = 96x192     tall vertical monument, gate, tower-like memorial
6x3 = 192x96     wide fence/gate, wall segment, long grave platform
```

The generation prompt must include the intended footprint:

```text
Generate a 2x2 asset on a 32px grid, final canvas 64x64.
Generate a 3x6 tall cemetery gate on a 32px grid, final canvas 96x192.
```

Use this manifest data for every experiment:

```json
{
  "base_grid_px": 32,
  "source_size_px": { "width": 64, "height": 64 },
  "target_footprint_cells": { "width": 2, "height": 2 },
  "target_canvas_px": { "width": 64, "height": 64 },
  "asset_class": "large_grave",
  "alignment": "bottom-center"
}
```

For the existing production map, the runtime/Tiled grid is still 48x48. Do not change production map dimensions accidentally. Treat the 32px grid as a new art-direction experiment until a deliberate map migration decision is made.

If staying on the current 48px map, convert accepted 32px-grid assets into compatibility canvases only after review. If moving to a new 32px map, keep native 32px-grid canvases and build a new Tiled map/tileset around that grid.

## Step 1: Prepare Style References

Use existing VibeCemetery production assets as style anchors. Good references include:

- Existing small tombstone from `Graveyard_B.png`.
- Existing tall tombstone top from `Graveyard_B.png`.
- Gothic marker from `Graveyard_D.png`.
- Dirt mound from `Graveyard_C.png`.
- Lamp/candle detail from `Crypt_D.png`.
- Ground palette crop from `graveyard_ground.png`.

Reference crops should be small, readable, and representative. For the current PixelLab flow, 32x32 references worked well enough.

Important: use actual image files or verified base64. A manual multi-reference call failed once with:

```text
Could not decode image: Incorrect padding
```

If this happens, retry with fewer references or encode references programmatically from files.

## Step 2: Generate a Review Pack

Use PixelLab MCP directly. Do not call REST or curl for generation.

Preferred tool:

```text
create_1_direction_object
```

Recommended settings:

```json
{
  "description": "A pack of transparent high top-down gothic cemetery grave markers and decor objects matching the provided VibeCemetery tombstone pixel art style reference. Muted grey stone, ash-brown dirt, desaturated moss, readable RPG cemetery props, no bright grass, no purple stone, no cartoon colors, no UI icon look.",
  "size": null,
  "view": "top-down",
  "style_images": ["production tombstone/style refs as base64 images"],
  "item_descriptions": [
    "small broken gothic tombstone",
    "tilted stone cross grave marker",
    "cracked stone slab grave",
    "dark dirt grave mound with sparse grey moss",
    "candle grave marker with weak dim flame",
    "skull-topped grave marker",
    "small gothic obelisk",
    "ruined stone tablet",
    "ash-covered urn grave",
    "sunken old grave marker",
    "short rusted iron fence segment",
    "small bone pile on dark soil"
  ]
}
```

Expected result:

```text
status: processing
mode: 1-direction review pack
size: 32x32
candidates: usually 64
```

Record the returned `object_id`, base grid, source size, target footprint, and intended slot class immediately in `manifest.json`.

## Step 3: Poll Until Review

Use:

```text
get_object(object_id="...")
```

When it reaches review, PixelLab returns candidate frame URLs and frame indices.

Save all candidates locally before selecting. This matters because even rejected frames can be useful for later comparison.

Recommended local path:

```text
review-candidates/frame_00.png
review-candidates/frame_01.png
...
review-candidates/frame_63.png
```

## Step 4: Make Contact Sheets

Create at least two previews:

```text
previews/review-candidates-2x-contact-sheet.png
previews/selected-2x-contact-sheet.png
```

Preview rules:

- Show candidate index numbers clearly.
- Use a dark green/brown cemetery-like background, not a white background.
- Display at 2x for human review.
- Keep original 32x32 files unchanged.

## Step 5: Select Candidates

Choose only candidates that meet most of these criteria:

- Reads clearly at 32x32.
- Matches muted VibeCemetery stone/moss/dirt palette.
- Has a strong silhouette.
- Does not look like a UI icon.
- Does not use bright grass or saturated colors.
- Does not lean purple unless intentionally accepted.
- Fits the intended target footprint, such as 1x1, 2x2, 3x3, 3x6, or 6x3 on the chosen base grid.

Use PixelLab MCP:

```text
select_object_frames(object_id="...", indices=[...], common_tag="vibecemetery-grave-pack-style-v1")
```

Then copy selected source frames locally:

```text
source/selected/selected_00.png
source/selected/selected_01.png
...
```

Record:

- selected indices
- new object IDs returned by PixelLab
- local selected paths
- rejected/weak classes

## Step 6: Convert to Target Canvas

Convert only after the candidate has been selected and its target footprint is known.

If the experiment is using a 32px base grid, target canvases are exact multiples of 32:

```text
1x1 -> 32x32
2x2 -> 64x64
3x3 -> 96x96
4x4 -> 128x128
3x6 -> 96x192
6x3 -> 192x96
```

If the asset is being tested inside the current 48px production map, use compatibility canvases deliberately:

```text
32x32 source -> 48x48 compatibility canvas, no stretching
64x64 source -> 96x96 compatibility canvas or 2x2 grave slot
96x96 source -> 96x96 or 144x144 depending on slot class and visual scale
```

Bad:

```text
32x32 -> stretch to 48x48
64x64 -> squeeze into 48x48
generate first, decide footprint later
```

Good:

```text
1x1 small prop -> native 32x32 source or 48x48 compatibility canvas
2x2 monument -> 64x64 source or 96x96 compatibility canvas
3x6 gate -> 96x192 source/canvas
```

Alignment recommendations:

- Tombstones: bottom-center.
- Crosses: bottom-center.
- Candles/skulls/small decor: center or bottom-center depending on shadow/ground contact.
- Gates/fence: align to the side or bottom based on how it will tile.
- Large/hero assets: choose a multi-cell footprint before generation instead of forcing them into a 1x1 cell.

Processed outputs belong in:

```text
processed/32-grid/1x1/
processed/32-grid/2x2/
processed/32-grid/3x3/
processed/compat-48-grid/1x1/
processed/compat-48-grid/2x2/
```

## Step 7: Review in Context

Do not accept assets based only on transparent preview.

Review them on:

- A real crop of current VibeCemetery ground.
- A grid preview matching the intended footprint, such as 32px native grid or 48px compatibility grid.
- Tiled, placed manually near existing graves and paths.

Acceptance questions:

- Does it look like part of the map rather than pasted-on art?
- Is it readable at normal game zoom?
- Does it overpower existing trees/buildings?
- Does it fit grave slot scale?
- Does it work near current ground and path tiles?

## Step 8: Promote or Reject

Accepted assets go to:

```text
public/map/pixellab/accepted/graves/
public/map/pixellab/accepted/props/
public/map/pixellab/accepted/decor/
```

Rejected experiments or weak outputs go to:

```text
public/map/pixellab/rejected/
```

Do not replace production tilesets until an accepted set is large enough and tested in Tiled.

## Notes on Terrain

Terrain is not the best first target. The initial 16x16 terrain test was technically valid but visually weaker than the current map.

If testing terrain again, use a chained tileset workflow inspired by PixelLab's high top-down map tutorial:

```text
ash soil -> dead moss
dead moss -> cracked stone path
ash soil -> grave dirt
cracked stone path -> stone plaza
```

Use base tile IDs from previous tilesets to keep style consistent. Still treat terrain as a separate experiment, not a replacement plan.

## Notes on Upscaling

Use two different categories:

```text
Common assets:
  32x32 PixelLab object -> native 32x32 on the 32px grid, or 48x48 compatibility canvas if testing on the current map.

Hero assets:
  PixelLab concept -> external upscale/refine -> downscale or pixelize to an explicit multi-cell footprint, such as 3x3 or 3x6.
```

The skull pile upscale test looked promising as a hero asset direction, but not as a common 1x1 grave tile.

## When to Create a Skill

This workflow is a good candidate for a future OpenCode skill once these steps are repeated at least one more time successfully:

- create experiment folder
- crop style refs
- run PixelLab review pack
- download candidates
- create contact sheets
- select frames
- create target-footprint processed canvases
- produce a Tiled review mockup

The skill should automate file structure, manifest creation, candidate downloading, contact sheets, and target-canvas conversion. Human review should remain manual.
