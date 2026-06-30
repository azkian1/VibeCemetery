# PixelLab Experiments

This directory stores PixelLab-generated map asset experiments for VibeCemetery.

Do not place experimental files directly in `public/map/*.png` or replace production tilesets until an experiment has been reviewed and accepted.

Current best workflow: see `WORKFLOW.md`.

## Layout

```text
experiments/
  YYYY-MM-DD-short-name/
    source/      Original downloads from PixelLab, unchanged.
    processed/   Local conversions prepared for VibeCemetery, such as 32x32 props on 48x48 canvases.
    previews/    Contact sheets and comparison mockups.
    manifest.json
    notes.md
accepted/
  props/
  terrain/
  graves/
  decor/
rejected/
```

## Rules

- Keep original PixelLab downloads in `source/`.
- Put edited or resized outputs in `processed/`.
- Put comparison images in `previews/`.
- Record object IDs, prompts, download URLs, and review notes in the experiment manifest or notes.
- PixelLab `create_map_object` download links can expire quickly; download promising outputs immediately.
- For the current 48px map, prefer placing 32x32 props inside a 48x48 transparent canvas instead of scaling them to 48x48.
- Do not change `az.tmj`, `tileRegistry.ts`, or production tileset PNGs from an experiment folder.
