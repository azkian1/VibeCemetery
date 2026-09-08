# V2 active-slot audit — 2026-09-07

All **144** currently authored slots are approved across two open zones. The master plan remains **666**; the seven future zones have a combined budget of **522**. Concept-art allocations are provisional and must be reconciled with this total during future design, without changing existing graves.

Input: `public/map/cemetery-v2.tmj`, SHA-256 `ec2798eba212f54d831993c217026743f844b760fa38624a891c374cc97ba0d8`.

| Check | Result |
| --- | --- |
| GraveObj rectangles / unique IDs | 144 / 144 |
| Tall, 32 × 64 | 87 |
| Wide, 64 × 32 | 43 |
| Large, 64 × 64 | 14 |
| Intersecting rectangle pairs | 0 |
| Tile objects, meta or special objects among these slots | 0 |
| Slots with zone_id metadata | 0 |

Coordinates were evaluated with the GraveObj layer offsets (768, 1312). Every rectangle has a supported footprint. These are authored grave places, not duplicate or technical objects.

`ACTIVE_GRAVE_SLOT_IDS_V2` in `src/lib/map-layout-v2.ts` records the approved IDs explicitly. Server allocation, home scanner placement and migration destinations share that list. A new rectangle added to the TMJ remains unavailable for allocation until its ID is explicitly approved and added. The 666-place master capacity is separate from runtime capacity.

No per-slot zone boundary is inferred from coordinates. Future zone work must add stable zone metadata, terrain, fog, camera and minimap support. Burn checkpoint thresholds and automated zone unlocks are not part of the current slot allocator.

Actual availability is determined from occupied slot IDs at the time of allocation; the static capacity is 144, not a promise that all plots remain empty.
