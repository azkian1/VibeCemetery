# v1 UI polish — 2026-09-06

- Retain the latest minimap raster and camera position so late HUD mounts and mobile-to-desktop resizing cannot lose the scene snapshot. Action events are never replayed.
- Move desktop chat to the bottom and restore the red BURY button beside it, without the ritual panel. Preserve the shared account quota and pending-state guard.
- Use the Crypt stone frame, Cinzel font, gold/stone palette and framed tables for Necropolis and Crematory.
- Display whole token amounts with bigint arithmetic; sort by exact raw values.
- Replace recent transactions with one row per grave, ordered by total burned tokens. Read every verified page through the existing service-only database client; no SQL migration or data changes. Keep current ledger caching.
- Remove the duplicate cemetery total/transaction count. Keep the burn-address supply bar; its total includes transfers outside the cemetery.
- Track the existing Tailwind PostCSS configuration so CSS compiles in production as well as locally.

Validation: 443 unit tests, 10 browser tests, ESLint and production build passed. Browser coverage includes delayed minimap mounting, resizing, HUD alignment, both ledger layouts on mobile, amount sorting, burial quota, and existing wallet recovery flows. The production API returned two grave totals matching all four existing verified transfers exactly.

Only the released v1 worktree is changed; v2 remains unpublished.
