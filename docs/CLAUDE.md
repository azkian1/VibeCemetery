# VibeCemetery implementation reference

Updated 2026-09-07. Root guidance is in `CLAUDE.md`.

## Current product

The public product buries abandoned GitHub repositories and local projects submitted by GitHub-approved coding agents. Every memorial is a grave with an epitaph, public link, F interactions and optional GRAVE tributes. Project cremations and urns are retired. Agent Ash / GitLawb is a separate paused experiment.

Production serves v2 at `/cemetery`; see `v2-cutover-runbook.md` for current operations. Each subsequent release requires its own local and Preview verification. Quotas, modals and burn verification are preserved. The current allowance remains 4 + 1 sharing slot. Two of nine zones are open; further zones and GRAVE burn thresholds are roadmap items, not automatic runtime unlocks.

## Runtime structure

| Area | Implementation |
| --- | --- |
| Landing page | `src/components/HomeScannerLanding.tsx` |
| Public shell | `CemeteryAppV2.tsx`, `PhaserCanvasV2.tsx`; shared `ModalLayer.tsx`. |
| State / modal ownership | `src/context/GameContext.tsx` |
| Scenes | `src/game/scenes/CemeterySceneV2.ts` |
| Shared event bus | `src/game/events.ts`; retained minimap and viewport events are map-scoped |
| Placement | `src/lib/map-slots.ts`, `slotManager-v2.ts` and `tileRegistry-v2.ts` |
| GitHub / local burial | `src/app/api/graves/writeHandler.ts`, `src/agent/burial-helper.mjs` |
| Atomic writes | `create_grave_once` RPC; shared account quota, source identity, map slot and retry protection |
| Authentication | NextAuth GitHub plus browser-approved CLI credentials; wallet connection alone is not account auth |
| Agent discovery | `/agent-instructions`, `/agent-instructions.md`, temporary helper; no installable bury skill |
| Burns | `src/lib/web3/`, `src/web3/useGraveBurn.ts`, grave-specific API routes |
| Records | Crematory `Burned` supply / sortable `Tributes`; Necropolis author burn totals; Crypt grave search |

## Data and privacy

- `graves` stores v2 memorials. Each grave has a source, public details, an assigned slot and a persisted sprite GID.
- GitHub and local-project identity checks are server-side. A local proof can make retries idempotent, but cannot prove authenticity against a malicious client.
- Supabase service credentials stay on the server. Public APIs expose only intended memorial and verified burn fields.
- CLI sessions require browser approval; stored long-lived tokens are hashed. Never log bearer tokens or OAuth secrets.
- The burns ledger includes only independently verified transfers. Supabase uint256-sized numeric fields are selected as text to avoid loss through JSON numbers.
- Burns are not project cremations. Retiring legacy cremation tables must not remove burn records.

## Map behavior

See `map2.md` for v2 coordinates, fog and assets. Preserve the authored terrain and slot placement. Shared UI changes must be checked on the v2 shell at desktop/mobile sizes; the minimap must retain its raster after responsive remounting.

Bury sits to the right of the bottom chat. Preserve the red button, ledger borders/typography, whole-token formatting and current FAQ vocabulary. Do not reintroduce the old Bury panel, project cremation counters or the obsolete Offerings FAQ entry.

## Burn contract

The user selects an amount, signs an exact grave intent and confirms a direct ERC-20 transfer on Base. The backend verifies the transfer before atomically binding it to the intent. A saved wallet operation survives reload. An unknown broadcast result can be recovered from the authorized block interval; ambiguous candidates require review instead of guessing. See `web3-grave-burn-mvp.md`.

## Verification and deployment

Use `test:unit` for hermetic unit/API/SQL-runtime checks and `test:web3-e2e` for mocked UI and wallet scenarios. Public API smoke checks make no fixture writes; run the general browser suite against an isolated development server. Build and typecheck the current checkout before release. Publish releases only within the owner-authorized scope; a local verification result is not evidence of deployment.
