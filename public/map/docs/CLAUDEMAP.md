# Map Reference — az.tmj

## Overview
- **Map size:** 40x40 tiles, 48px per tile (1920x1920 px)
- **Format:** Tiled JSON (.tmj), Tiled v1.11.2
- **Object layer:** `slots` (id: 15)
- **Total objects:** 318 (2 buildings + 1 meta_grave + 315 grave slots)

---

## Tile Layers

| ID | Name | Type | Description |
|----|------|------|-------------|
| 1 | Ground | tilelayer | Base terrain tiles |
| 3 | Roads | tilelayer | Paths and walkways |
| 6 | Borders | tilelayer | Fences, walls |
| 11 | Grass | tilelayer | Vegetation overlay |
| 9 | Forest2 | tilelayer | Trees and foliage (back layer) |
| 5 | Tail3 | tilelayer | Buildings, large decorations |
| 10 | Mid | tilelayer | Mid-layer decorations |
| 16 | **graves_dynamic** | tilelayer | **Empty — Phaser dynamically places grave tiles here at runtime** |
| 7 | Forest1 | tilelayer | Trees and foliage (front layer) |
| 15 | slots | objectgroup | Interactive objects (buildings, graves) |

---

## Object Layer: `slots`

All interactive objects. Used by Phaser for click detection and grave placement coordinates.

### Buildings

| Type | Name | Count | Description |
|------|------|-------|-------------|
| `Building` | `Crematory` | 1 | Crematorium — click opens cremated list modal |
| `Building` | `Mausoleum` | 1 | Mausoleum — click opens necrology modal |

### Special

| Type | Count | Description |
|------|-------|-------------|
| `meta_grave` | 1 | Easter egg — VibeCemetery's own grave. Bottom-right, fenced. Reserved, never assigned to users. |

### Grave Slots

| Type | Size (tiles) | Size (px) | Count |Description |
|------|-------------|-----------|-------|-------------|
| `grave` | 1x1 | 48x48 | 143 | Small cross / basic gravestone |
| `grave_special` | 1x1 | 48x48 | 15 | Dirt mound — pit gets covered with earth pile on burial |
| `grave_tall` | 1x2 | 48x96 | 120 | Vertical tombstone |
| `grave_wide` | 2x1 | 96x48 | 13 | Horizontal tombstone |
| `grave_large` | 2x2 | 96x96 | 14 | Large monument |
| `grave_largetop` | 2x3 | 96x144 | 7 | Tall monument |
| `grave_largeX` | 3x3 | 144x144 | 3 | XL monument |

**Total grave slots: 315**

### Tier Hierarchy

| Slot Type | Tier | Count | Status |
|-----------|------|-------|--------|
| `grave` (1x1) | Tier 0 — free | 143 | Active |
| `grave_special` (1x1) | Tier 0 — free | 15 | Active |
| `grave_tall` (1x2) | Tier 1 — free | 120 | Active |
| `grave_wide` (2x1) | Tier 2 | 13 | Locked |
| `grave_large` (2x2) | Tier 2 | 14 | Locked |
| `grave_largetop` (2x3) | Tier 3 / VIP | 7 | Locked |
| `grave_largeX` (3x3) | Tier 3 / VIP | 3 | Locked |

Free: 278 slots (Tier 0 + 1). Locked: 37 slots (Tier 2 + 3).

---

## Dynamic Grave Rendering

Grave visuals are NOT baked into the map. Phaser renders them dynamically at runtime:

1. Load occupied slots from API (`GET /api/graves`)
2. For each occupied slot, pick a **random tile** from the catalog below
3. Place tile(s) on layer `graves_dynamic` at slot coordinates

### Tile Catalog (random visual per burial)

#### grave_special (1x1) — 1 variant
Source: Graveyard_C

| GID | Tileset | Note |
|-----|---------|------|
| 4073 | Graveyard_C | Dirt mound — covers the pit already on map |

#### grave (1x1) — 11 variants
Source: Graveyard_B, Graveyard_D

| GID | Tileset |
|-----|---------|
| 3617 | Graveyard_B |
| 3627 | Graveyard_B |
| 3628 | Graveyard_B |
| 3629 | Graveyard_B |
| 3630 | Graveyard_B |
| 3644 | Graveyard_B |
| 3645 | Graveyard_B |
| 5263 | Graveyard_D |
| 5264 | Graveyard_D |
| 5265 | Graveyard_D |
| 5279 | Graveyard_D |

#### grave_tall (1x2) — 15 variants (top + bottom GIDs)
Source: Graveyard_B, Graveyard_D

| Top GID | Bottom GID | Tileset |
|---------|------------|---------|
| 3582 | 3598 | Graveyard_B |
| 3585 | 3601 | Graveyard_B |
| 3610 | 3626 | Graveyard_B |
| 3642 | 3658 | Graveyard_B |
| 3643 | 3659 | Graveyard_B |
| 3660 | 3676 | Graveyard_B |
| 3661 | 3677 | Graveyard_B |
| 3662 | 3678 | Graveyard_B |
| 3690 | 3706 | Graveyard_B |
| 3691 | 3707 | Graveyard_B |
| 3692 | 3708 | Graveyard_B |
| 3693 | 3709 | Graveyard_B |
| 5217 | 5233 | Graveyard_D |
| 5296 | 5312 | Graveyard_D |
| 5325 | 5341 | Graveyard_D |

#### grave_wide (2x1) — 4 variants (left + right GIDs)

| Left GID | Right GID | Tileset |
|----------|-----------|---------|
| 3614 | 3615 | Graveyard_B |
| 3645 | 3646 | Graveyard_B |
| 3674 | 3675 | Graveyard_B |
| 5280 | 5281 | Graveyard_D |

#### grave_large (2x2) — 4 variants (TL, TR, BL, BR)

| TL | TR | BL | BR | Tileset |
|----|----|----|-----|---------|
| 3583 | 3584 | 3599 | 3600 | Graveyard_B |
| 3725 | 3726 | 3741 | 3742 | Graveyard_B |
| 3757 | 3758 | 3773 | 3774 | Graveyard_B |
| 5360 | 5361 | 5376 | 5377 | Graveyard_D |

#### grave_largetop (2x3) — 2 variants (top-to-bottom, left-to-right)

| Row 0 | Row 1 | Row 2 | Tileset |
|-------|-------|-------|---------|
| 3722, 3723 | 3738, 3739 | 3754, 3755 | Graveyard_B |
| 3789, 3790 | 3805, 3806 | 3821, 3822 | Graveyard_B |

#### grave_largeX (3x3) — 1 variant (top-to-bottom, left-to-right)

| Row 0 | Row 1 | Row 2 | Tileset |
|-------|-------|-------|---------|
| 3647, 3648, 3649 | 3663, 3664, 3665 | 3679, 3680, 3681 | Graveyard_B |

---

## Tilesets (10)

| FirstGID | Name | Description |
|----------|------|-------------|
| 1 | graveyard_ground | Ground tiles |
| 3578 | Graveyard_B | Grave markers, tombstones, monuments |
| 3834 | Graveyard_A2 | Graveyard decorations A2 |
| 4026 | Graveyard_C | Nature, trees, dirt mounds |
| 4282 | non-rm-a1-square | Non-RM A1 square tiles |
| 5213 | Graveyard_D | Gothic grave markers D |
| 5469 | Graveyard_A1 | Graveyard decorations A1 |
| 5661 | Crypt_D | Crypt torches, candles, trees |
| 5917 | Crypt_B | Crypt arches, columns, grates |
| 6173 | Fire_Animation | Fire animation sprites (24 tiles) |

---

## Notes for Phaser Integration

- Objects have `x`, `y` in pixels (not tile coords). To get tile coords: `tileX = x / 48`, `tileY = y / 48`
- Each object has unique `id` (Tiled-assigned). Use as `slot_id` in database
- Filter objects by `type` field to distinguish buildings from graves
- `name` field on grave objects is empty — available for displaying project name after burial
- Layer `graves_dynamic` (id: 16) is empty in Tiled — Phaser fills it at runtime with random tiles from the catalog
- For multi-tile graves (1x2, 2x1, etc.), place tiles starting from top-left corner of the slot
- Visual tile variant should be stored with the grave record (or seeded from grave ID) for consistency across page loads
