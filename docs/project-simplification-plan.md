# Project simplification — current status

Updated 2026-09-07. The original simplification is implemented in production v1. This branch retains v2 development and now carries the subsequent v1 interface and burn-recovery corrections.

## Product contract

- Every GitHub or GitHub-approved local project gets a normal grave with dates, cause, epitaph, sharing and F interactions.
- The current allowance is 4 graves plus 1 sharing slot, shared across project sources and map versions. Existing graves are preserved; requests and retries are checked atomically by the server.
- There is no project-cremation alternative when slots run out. Old cremation writes return 410 and urn pages return 404.
- GRAVE tributes are voluntary Base transfers to the burn address. Only verified amounts count; burns do not buy slots or pay rewards.
- Necropolis shows grave authors, buried projects and Burned amounts. Crematory shows centered Burned supply and a sortable Tributes table by grave, using whole-token display.
- Instructions for AI agents replace the former bury skill installation flow. Source code stays on the user's computer or VPS.
- REKT, wallet-only account authentication and the proposed new quotas remain a future specification in `rekt-product-spec.md`.

## Current source work

The development branch has both `/cemetery` and `/cemetery/v2`. Runtime art is retained; unused PixelLab experiments, previews, prompts and reference crops have been moved to an ignored local archive. Map and contributor documentation now distinguish the released v1 from the unreleased v2.

The v1 fixes carried into this branch include the bottom-chat/red-Bury layout, ledger typography and integer amounts, Tributes sorting, FAQ corrections, minimum/exact-MAX burn handling, safe reload handling and recovery of a lost broadcast hash. Both map versions use the same verification and recovery rules.

## Release and migration boundaries

Production was verified at commit `9010b01`; the remote v2 branch/Preview was at `ac0440b` before this local cleanup. A local patch does not update either deployment. Releasing v2 is a separate action.

For an existing database, inspect installed schema and follow `unified-burial-setup.md` plus the burn/recovery migration order in `web3-grave-burn-mvp.md`. Preserve graves and verified burns. Retiring old project cremations is a distinct migration with a recoverable export, not part of source cleanup.

Current validation evidence is recorded in `both-maps-verification.md`. No production SQL or real token transfers are needed for the mocked test suite.