# Visible cemetery art rollout

## Scope and visual contract

- Upgrade the two currently open zones of the existing 140 × 104 TMJ map. Keep the
  map geometry, 144 approved grave slot IDs, persisted grave GIDs, fog/camera
  authority, building interactions, minimap and burial flow unchanged.
- Continue the entrance concept's painterly, top-down cemetery style. Ground,
  paving, leaves, grass and small litter belong to the terrain layer. A newly
  placed grave covers this ground naturally; terrain never contains a baked
  headstone or a permanent empty-slot marker.
- Trees, memorials, gates, buildings and other tall silhouettes are separate
  world objects. Their sprites are complete, including parts under fog. Tree
  trunks avoid grave footprints; crowns may overlap graves for depth. Fog
  remains above every world object.
- The seven future zones have a provisional 522-slot capacity, but no approved
  coordinates or stable zone metadata. Do not invent those placements or
  visually commit their layout in this pass.

## Stage 1 — placement and overlap preview

1. Add an opt-in local preview that renders a deterministic sample grave in
   every approved slot without writing records, changing placement odds or
   stealing clicks from existing graves.
2. Use the same 32 × 64, 64 × 32 and 64 × 64 footprints and the same GID pools
   as real burials. Cycle the 26 tall, 9 wide and 12 large models so all 47
   available variants appear in the preview.
3. Review at overview and close zoom, including occupied slots, grave click
   targets, trees, paths, buildings, fog boundaries and mobile framing.

## Stage 2 — asset system

1. Produce a catalog keyed by the existing 47 GIDs. Every GID gets a distinct
   authored silhouette or surface detail, preserving its current identity and
   footprint. Real graves keep their persisted GID and use this catalog.
2. Build coherent terrain/path art for the open map. Tile or compose reusable
   ground treatments so roads connect and future grave positions remain clear.
3. Render complete trees as separate sprites, rooted at their TMJ positions.
   Remove clipped tree fragments from painted ground. Keep their crowns able
   to cover the upper part of nearby memorials, while keeping grave input usable.
4. Treat buildings, fences and secondary gates as distinct foreground objects
   where they are visible in open zones; preserve their existing hitboxes.

## Stage 3 — integration and review

1. Apply the art at gameplay scale, using the approved slot rectangles and
   existing object coordinates as placement constraints. Never change the
   database or TMJ solely to make a generated image fit.
2. Run static checks for missing GID assets and object/slot intersections, plus
   the existing runtime, mobile, desktop, bundle and production-build checks.
3. Capture local screenshots of the whole open area and representative close
   views. Fix edge seams, tree clipping, fog layering and unreadable graves.
4. Leave the local preview available through an explicit opt-in flag for
   review. Remove its flag from normal play; no test graves appear by default.

## Acceptance

- Every one of the 144 approved slots can display a preview memorial and every
  one of the 47 available GIDs is represented at least once.
- Newly created graves select and display the matching authored GID variant.
- The visible open map has coherent terrain and paths. No cropped tree pixels
  appear at art boundaries; fog hides complete objects. Grass and leaf detail
  remains under unoccupied plots.
- Existing burial, grave navigation, building interactions and minimap behave
  as before. The local review build passes the checks above.

## Progress

- Implemented for the two open zones on 2026-09-24. The 144-slot local preview
  cycles all 47 grave GIDs; live graves use the same authored sprites. Ground,
  road, leaves, buildings, trees and the entrance blend are integrated.
- Visual inspection covered the entrance, interior paths and upper chapel area
  at gameplay zoom. Six legacy tree objects whose trunks intersect approved
  slots are omitted; remaining complete crowns may overlap memorials.
- Ground revision after user review: the open-zone grass and road material are
  sampled directly from the first gate prototype and built into one terrain
  image, including the entrance. The TMJ road geometry stays fixed. There is
  no second runtime ground layer or independently generated texture set.
- Tree revision: all 16 tree frames keep their natural aspect ratio at runtime.
  Six existing dry and leafy models now carry visible cable, forged-metal
  and cold-light details. Three roots touching paving moved onto nearby grass;
  the tree audit checks the final map against the active terrain image.
- High-cyber alternatives for the dry diagonal and compact leafy models are
  mixed into one third of distinct visible positions per type; the remaining
  trees keep their current painted sprites.
- The Crypt keeps its tall chapel, spire and cross at the original 160×256
  size. Crematory keeps its distinct garage (64×96) and technical hall
  (128×160) as separate sprites. Their new art follows the Lodge's near-frontal
  camera angle and muted slate/stone palette without borrowing its architecture.
- Verified with TypeScript, ESLint, the 539-test unit suite, nine v2 runtime
  browser tests, mobile and desktop canvas smoke tests, production build and
  bundle audit. The production build is available locally at `/cemetery` and
  `/cemetery?previewGraves=all` for user review.
- The updated trees are ready for local visual review.
