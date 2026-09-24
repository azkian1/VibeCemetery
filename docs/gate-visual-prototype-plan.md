# Gate visual prototype plan

## Goal

The first playable view at the main gate should approach the quality, palette,
and readability of `artifacts/visual-prototypes/cemetery-gate-redraw-concept-v1.png`.
This is a production art vertical slice on the existing v2 map, not a new map.

## Constraints

- Preserve the TMJ world geometry, grave slot IDs, fog authority, camera
  navigation, grave interactions, and existing persisted grave GIDs.
- Keep authored art components separate from the interactive grave layer.
- Keep the current PixelLab assets available for a safe fallback while the
  entrance art is evaluated.
- New art must be legible at the actual desktop and mobile camera zoom levels.

## Implementation

1. Create a ground and path treatment for the gate surroundings using the
   approved concept as the style reference. Keep the live grave positions clear.
2. Create a separate gate and matching foreground details with transparent
   backgrounds. Align them to the existing main gate object in world space.
3. Integrate the entrance art into the Phaser v2 scene with explicit depth,
   camera scale, fog coverage, and texture loading. Preserve underlying map
   data for minimap and navigation.
4. Verify in the running game at the gate, including desktop, mobile, zoom,
   fog, existing graves, and modal clicks. Adjust scale and contrast against
   screenshots rather than judging source PNGs alone.
5. Document the new art sources and any limitations before expanding the same
   style to other zones.

## Acceptance

- Opening `/cemetery` shows the redesigned gate, readable pale stone path,
  textured green ground, and cemetery details at gameplay scale.
- The scene feels coherent with the concept image while remaining an actual
  navigable map, not a full-screen illustration.
- Existing grave records, hit targets, slot placement, fog and minimap remain
  functional; the game still builds and the relevant tests pass.

## Current result

- The entrance ground, gate, cross and slab have been generated as separate
  transparent PNGs and added to the live Phaser scene.
- The desktop first view has been checked in the browser at 1280 × 720. The
  gate fits the frame and the road remains visible in front of it. A screenshot
  of the production build is saved at
  `artifacts/visual-prototypes/cemetery-gate-live-v1.png`.
- The existing map and slot geometry were left in place. The visual entrance
  clearing does not change fog navigation or minimap data.
- The production build, v2 bundle audit, 17 focused scene/unit checks, the
  server-picked gravestone runtime check, and mobile/desktop canvas checks pass.
- The gate area is the completed visual slice. At wider zoom the surrounding
  zones still show the existing PixelLab style; expanding the art system to
  the rest of the cemetery is a separate stage.
