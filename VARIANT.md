# Patch 3 — Grave NFT on Robinhood Chain beta

Status: local technical draft. Do not deploy or merge by default.

Git branch: `codex/patch3-nft-robinhood`.
Base: exact Vercel production commit `9c48c5445aa68b0ff50b2d9ffa23c734e59055a2`.

## Included

- The production project-grave cemetery code, with no REKT beta code and no flywheel token distribution.
- A draft ERC-721 contract in [`contracts/GravePlotNFT.sol`](contracts/GravePlotNFT.sol): first-stage cap of 144 approved plots, overall cap of 666, signed claim for a real grave, owner-only exhumation, plot reservation and 5% ERC-2981 royalty signal.
- The launch audit and trust-boundary design in [`docs/grave-nft-launch-readiness.md`](docs/grave-nft-launch-readiness.md) and [`docs/grave-nft-contract-spec.md`](docs/grave-nft-contract-spec.md).
- The contract specification records the 2026-09-25 target product rules; it is ahead of the Solidity draft and current site. Its gap table is the implementation checklist, not a claim that the code already enforces those rules.
- The local 500-to-666 grave-list cap fix and gravedigger-copy edits from the NFT audit.

## Current limits

The contract is a compiled draft, not an audited or deployed artifact. The site has no NFT claim UI, signed-voucher issuer, chain-event indexer, exhumation database migration or royalty buyback service. An administrator must verify Base GRAVE burn checkpoints before increasing the open plot cap; the current contract does not prove the crosschain burn itself.

On 2026-09-24, `npm run check:grave-nft`, lint, 24 targeted application tests and `npm run build` passed. The build used placeholder environment values; no production secrets were copied. Contract behavior still needs transaction tests and independent review. This branch has not been deployed.
