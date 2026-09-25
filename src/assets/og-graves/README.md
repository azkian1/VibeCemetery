# Grave share artwork

`51.png` through `97.png` are the 47 models approved in `artifacts/grave-review/approved-final.json` on 2026-09-25. Each number is a **grave sprite GID**, not a plot ID. The PNGs were checked against the approved source SHA-256 values, cropped to visible pixels, and scaled to fit within 430 x 430 pixels for the server-rendered X card.

Keep each filename aligned with `GRAVE_GIDS_V2` in `src/game/utils/tileRegistry-v2.ts`. The source review artifacts are local and are not required at runtime.
