# VibeCemetery implementation reference

Updated 2026-09-07. Root guidance is in `CLAUDE.md`.

## Current product

The public product buries abandoned GitHub repositories and local projects submitted by GitHub-approved coding agents. Every memorial is a grave with an epitaph, public link, F interactions and optional GRAVE tributes. Project cremations and urns are retired. Agent Ash / GitLawb is a separate paused experiment.

This branch serves v2 at `/cemetery` with versioned redirects. Production migration/deployment remain pending; follow `v2-cutover-runbook.md`. A successful local or Preview build does not release the map on the primary domain. Shared quotas, modals and burn verification are preserved. The current allowance remains 4 + 1 sharing slot. REKT and its new quotas are specifications only.

## Runtime structure

| Area | Implementation |
| --- | --- |
| Landing page | `src/components/HomeScannerLanding.tsx` |
| Public shell | `CemeteryAppV2.tsx`, `PhaserCanvasV2.tsx`; shared `ModalLayer.tsx`. V1 source retained only until migration smoke. |
| State / modal ownership | `src/context/GameContext.tsx` |
| Scenes | `src/game/scenes/CemeteryScene.ts`, `CemeterySceneV2.ts` |
| Shared event bus | `src/game/events.ts`; retained minimap and viewport events are map-scoped |
| Placement | `src/lib/map-slots.ts`, map-specific slot managers and tile registries |
| GitHub / local burial | `src/app/api/graves/writeHandler.ts`, `src/agent/burial-helper.mjs` |
| Atomic writes | `create_grave_once` RPC; shared account quota, source identity, map slot and retry protection |
| Authentication | NextAuth GitHub plus browser-approved CLI credentials; wallet connection alone is not account auth |
| Agent discovery | `/agent-instructions`, `/agent-instructions.md`, temporary helper; no installable bury skill |
| Burns | `src/lib/web3/`, `src/web3/useGraveBurn.ts`, grave-specific API routes |
| Records | Crematory `Burned` supply / sortable `Tributes`; Necropolis author burn totals; Crypt grave search |

## Data and privacy

- `graves` contains both map versions. Each grave has a source, public details and assigned slot; v2 also persists its sprite GID.
- GitHub and local-project identity checks are server-side. A local proof can make retries idempotent, but cannot prove authenticity against a malicious client.
- Supabase service credentials stay on the server. Public APIs expose only intended memorial and verified burn fields.
- CLI sessions require browser approval; stored long-lived tokens are hashed. Never log bearer tokens or OAuth secrets.
- The burns ledger includes only independently verified transfers. Supabase uint256-sized numeric fields are selected as text to avoid loss through JSON numbers.
- Burns are not project cremations. Retiring legacy cremation tables must not remove burn records.

## Map behavior

See `map2.md` for v2 coordinates, fog and assets. Preserve the authored terrain and slot placement. Shared UI changes must be checked on the v2 shell at desktop/mobile sizes; the minimap must retain its raster after responsive remounting.

Bury sits to the right of the bottom chat. The red button, ledger borders/typography, whole-token formatting and FAQ vocabulary follow the v1 UI corrections. Do not reintroduce the old Bury panel, project cremation counters or the obsolete Offerings FAQ entry.

## Burn contract

The user selects an amount, signs an exact grave intent and confirms a direct ERC-20 transfer on Base. The backend verifies the transfer before atomically binding it to the intent. A saved wallet operation survives reload. An unknown broadcast result can be recovered from the authorized block interval; ambiguous candidates require review instead of guessing. See `web3-grave-burn-mvp.md`.

## Verification and deployment

Use `test:unit` for hermetic unit/API/SQL-runtime checks and `test:web3-e2e` for mocked UI and wallet scenarios. The general integration suite includes API smoke writes and must not target production. Build and typecheck the current checkout before release. Preserve production v1 until a separate v2 release is requested; do not infer deployment authorization from local development work.