# Grave NFT contract specification — target design, 2026-09-25

Status: product decisions for a future implementation. [`GravePlotNFT.sol`](../contracts/GravePlotNFT.sol) is an earlier, undeployed draft. The differences that require code changes are listed below. Compilation of that draft is not a behavior test or an audit.

## Fixed product rules

- One active ERC-721 represents one current memorial and control of one specific cemetery plot.
- There are **666 plots maximum, forever**. The first stage opens 144. Future zones add plots within the same 666-plot namespace and the same NFT contract; zones and map art do not need to exist at deployment.
- At most 666 NFTs can be active simultaneously. This is **not** a lifetime limit on mint transactions or token ID numbers: replacing a memorial burns its NFT and mints a new token with a new ID on the same plot.
- Each eligible account gets one primary GitHub-project burial and one primary agent-assisted local-project burial. Sharing on X grants no plot. These are primary-claim allowances, not a maximum number of NFTs a wallet may own. A purchase can give someone a third or later grave.
- Selling, burning or replacing an NFT does not restore either primary allowance. A buyer can hold and resell without a GitHub account; replacing the memorial still requires an eligible, server-approved new grave.
- Only the current NFT owner can exhume it. Exhumation removes the old memorial from the active map, archives it, burns the NFT and **reserves that exact plot for the burner wallet indefinitely**, even when no replacement is ready. It does not grant a claim to another plot.
- The reservation is onchain, is not a saleable NFT, and belongs only to that wallet. A replacement claim consumes it and creates a new NFT for the same plot. The former owner cannot use the reservation after selling the NFT.

## Three different identifiers

| Identifier | Meaning | Lifetime |
| --- | --- | --- |
| `plotId` | Stable cemetery place, proposed integer `1..666` | Never changes when a grave is sold, exhumed or replaced |
| `graveId` / `graveIdHash` | One burial record and its onchain hash | New for each replacement; old record is archived |
| `tokenId` | One ERC-721 NFT | New for each mint; IDs may eventually exceed 666 |

Reserve the abstract `plotId` namespace `1..666` before launch, without pre-minting tokens or drawing all zones. Publish a stable manifest mapping the existing 144 physical map slots to `plotId` `1..144`. Allocate the next contiguous IDs to a future zone only when its actual map slots are authored. Map-editor object IDs and coordinates are implementation details; editing the map must not renumber an existing `plotId`. The contract must reject IDs outside `1..666`, unregistered IDs, closed-stage IDs and already controlled plots.

## Zone opening

The first expansion after 144 plots is triggered by **either**:

1. At least **1,000,000,000 new GRAVE** sent to the defined sink on Base after a published starting checkpoint; or
2. Every plot in the current open stage being unavailable for a new primary burial.

For condition 2, a confirmed grave occupies its plot even if its NFT has not yet been claimed. A plot reserved after exhumation is also unavailable. Do not use `activeSupply == openPlotCap` alone as the fill test: unclaimed graves and reservations make that comparison false even when no primary plot is free. Later zone sizes and GRAVE thresholds are not yet fixed. The total registered plot count must never exceed 666.

A zone must be fully authored, mapped and deployed behind its gate before its unlock is announced. When either condition is verified:

1. Record the evidence: Base transaction range and burn total, or a consistent full-occupancy snapshot. The existing GRAVE flow sends tokens to `0x000000000000000000000000000000000000dEaD`; this does not decrement the ERC-20 `totalSupply`.
2. The admin multisig raises the contract's open plot cap and registers the exact new `plotId` values. The contract must reject duplicate or premature registration.
3. After onchain confirmation, the server enables allocation of those same plot IDs and the site's separate map function reveals the prepared zone.

The contract does not render or unlock map terrain. The website/database and Robinhood Chain cannot update atomically, so the site must reconcile interrupted steps and never assign a newly visible plot before its contract registration is confirmed.

**Trust boundary:** the current `raisePlotCap` accepts an admin-supplied checkpoint hash; it does not prove a Base transfer or database occupancy. The first version may use a multisig-controlled, publicly auditable checkpoint. Do not describe that as automatic or trustless crosschain enforcement. Direct Base transfers outside the grave-tribute UI need an indexing rule if all community burns are meant to count.

## Roles, keys and signed mint permission

| Actor | Authority |
| --- | --- |
| Admin multisig | Register plots, raise stage cap, grant/revoke issuer, set emergency pauses and royalty receiver |
| Vercel issuer | Sign short-lived EIP-712 claim vouchers for approved graves; no admin role, plot registration, exhumation or user-wallet custody |
| NFT owner | Transfer their live NFT or call owner-only `exhume` |
| Visitor | View, buy and hold NFTs; no contract mint right from submitting arbitrary parameters |

The issuer's public address holds `ISSUER_ROLE`. Its signing key is kept only in a production server-side secret or external signing service; never in browser code, `NEXT_PUBLIC_*`, the repository or the admin wallet. Use a separate testnet key. Revoking `ISSUER_ROLE` or pausing claims must stop future use of that signer's outstanding vouchers. An optional onchain issuer mint allowance can reduce the number of plots exposed to a compromised signer; that allowance is not implemented in the draft.

The user's wallet signs a site challenge to link it to the authenticated account. The server first verifies project identity, source-specific primary allowance or ownership of an existing reservation, the grave record, metadata and the intended plot. It issues one short-lived voucher for that specific wallet and plot. The voucher binds the EIP-712 chain ID and contract, `wallet`, `graveIdHash`, `plotId`, `plotEpoch`, `metadataHash`, `tokenURI`, `nonce` and `deadline`. A malicious caller cannot choose new metadata or a different plot while reusing the signature.

The contract checks the issuer signature, `msg.sender == wallet`, stage/plot validity, unoccupied plot, epoch, deadline, unused voucher and unused grave ID. A replacement additionally checks `reservationHolder[plotId] == msg.sender`. Offchain GitHub and agent eligibility remains a trusted server decision: the contract cannot verify a repository or local project by itself. Do not impose a simple "two NFTs per wallet" onchain cap, because it would block a buyer with two primary graves from replacing a purchased third grave. Primary claims and same-plot replacement must be accounted for separately.

### Minimum contract state and methods

Keep `MAX_PLOTS = 666`, the currently open cap, registered plot IDs, `activeTokenForPlot`, `plotIdForToken`, `graveIdForToken`, `reservationHolder`, `plotEpoch`, used grave IDs, used voucher nonces and `activeSupply` onchain. An initial `claim` needs a registered, open plot with neither an active token nor a reservation; a replacement `claim` needs the caller's reservation on that same plot. Both require an issuer-authorized grave. The offchain database separately tracks authored map slots and confirmed graves awaiting NFT claim; those graves are unavailable for new allocation even before a token exists.

The necessary entry points are `registerPlots(plotIds)` and `raisePlotCap(newCap, evidenceHash)` for admin, `claim(voucher, signature)` for the named wallet, and `exhume(tokenId)` for the current owner. Standard ERC-721 transfer changes NFT ownership without changing the plot or memorial. Emit explicit stage, registration, claim and exhumation events carrying enough IDs to reconstruct the map; log `plotId`, `graveIdHash`, `tokenId`, wallet and new epoch where relevant. `evidenceHash` is an audit reference to the verified GRAVE or occupancy trigger, not proof that the trigger happened.

## Plot lifecycle

| Before | Action | After |
| --- | --- | --- |
| Registered and free | Verified initial burial and primary claim | Live NFT on the plot |
| Live NFT | Standard ERC-721 transfer or marketplace sale | Same grave and plot; new NFT owner controls exhumation |
| Live NFT | Current owner calls `exhume(tokenId)` | NFT burned, old grave archived, same plot reserved for `msg.sender` |
| Reserved plot | Reservation holder submits an eligible new grave and valid issuer voucher | New `graveId` and `tokenId` on the **same** `plotId`; reservation cleared |

`exhume` must check `ownerOf(tokenId) == msg.sender`, rather than letting an approved marketplace operator burn it. In one transaction it burns the NFT, clears `activeTokenForPlot[plotId]`, records `reservationHolder[plotId] = msg.sender`, increments `plotEpoch[plotId]`, decrements `activeSupply` and emits an event. The epoch invalidates an old claim voucher. A normal NFT transfer to a burn address is **not** exhumation and must not create a reservation.

The reservation does not expire merely because the owner never remints. Other wallets cannot claim that plot. If it is the only visibly empty plot, the open zone is still fully allocated for the sellout trigger. While reserved, there is no NFT to list or sell; the holder must mint a replacement before trading a token again. A wallet-loss recovery or reservation-transfer policy has not been agreed and must not be silently added.

Example: a wallet already has its GitHub and agent graves, then buys the NFT for open plot 42. It now controls three graves. If it calls `exhume` on the purchased NFT, plot 42 becomes reserved for that wallet, even if it never displays a new grave. A later eligible replacement on plot 42 restores its third grave without granting or spending another primary claim.

## Metadata, website and database

For each mint, generate the public memorial image and content-addressed JSON before signing the voucher. `tokenURI` returns the JSON URI; it should include `name`, `description`, `image`, the stable plot ID, grave identity, zone when known, and a memorial/archive URL. The issuer signs both URI and metadata hash. Never expose a private local `project_key`. The contract attests to the signed URI/hash but cannot read the remote JSON to prove its bytes match; pin and verify the content offchain.

A transfer keeps the current grave and token metadata. Exhumation archives the old grave, image and URI; replacement creates a new immutable metadata document and token ID. The X link-preview card is a separate asset and may show the current mint/reservation state.

Record chain ID, contract, token ID, grave UUID, plot ID, owner or reservation holder, epoch, transaction hash and log index. Process `Claimed`, `Transfer` and `Exhumed` idempotently after confirmation; handle reorgs and reconcile against onchain ownership and reservation. On confirmed exhumation remove the memorial from the active map but leave a visible reserved-plot state. Existing unclaimed graves remain assigned offchain to their verified authors until claimed or migrated.

The previous database RPC counted **all** grave rows toward a shared 4 + 1 allowance. The branch now prepares separate GitHub and agent quotas in [`source-specific-grave-slots.sql`](source-specific-grave-slots.sql); this migration still must be applied to the deployed database before the new UI is released. NFT replacements after a purchase need a separate path: they must use the caller's same-plot reservation without spending a primary claim. When exhumation and archival are implemented, persist consumed primary claims independently of active grave rows so a burn cannot restore an allowance.

## Royalties and GRAVE

The draft contract signals 5% ERC-2981 creator earnings to a receiver. Whether to keep that rate and direct receipts to GRAVE buyback/burn is **undecided**. Do not treat OpenSea's platform fee as project revenue or promise that every resale pays creator earnings. ERC-2981 alone does not force payment. If a buyback policy is selected, publish only the amounts actually received, purchased and sent to the sink, with transaction links. Zone unlock accounting is independent of the eventual royalty policy.

## Gaps between this design and the Solidity draft

| Target decision | Current draft or site |
| --- | --- |
| Stable numeric `plotId` values `1..666`, assigned to map slots as zones are authored | `bytes32` plot IDs derived from exact map slot IDs |
| One GitHub + one agent-assisted local primary claim; no social slot | Branch has the 1 + 1 UI/API rules and a pending database migration; the deployed database is not changed by this branch |
| First zone unlock on 1B new GRAVE **or** all open plots allocated | `raisePlotCap` accepts only a burn-checkpoint reference, with no verified OR trigger |
| Full-stage count includes unclaimed graves and reserved plots | No authoritative combined trigger is implemented |
| Marketplace-buyer replacement bypasses primary quota, uses same reserved plot | Onchain same-plot reservation exists; the burial RPC still has no separate NFT replacement path |
| Revenue use and royalty rate remain a decision | Contract hardcodes 5%; old spec promised GRAVE buyback of receipts |
| Onchain registration and separate map reveal are coordinated | No release coordinator, issuer, indexer or claim UI exists |

Do not deploy the present draft as though it already implements this target design.

## Required tests before mainnet

- Plot 145 cannot be claimed in the 144 stage; unregistered, duplicate and greater-than-666 plot IDs fail. Future stage registration and map IDs agree.
- Fake grave, wrong source allowance, wrong plot, changed metadata/URI, expired or reused voucher, wrong chain/contract/wallet, invalid issuer and repeated grave ID all fail.
- Two concurrent claims for the same plot yield one NFT. A compromised issuer cannot perform admin operations; pause, revocation and signer rotation work.
- A marketplace operator cannot exhume. After sale the seller cannot exhume; the buyer can, even with both primary allowances used.
- Exhumation burns one token, archives the grave, reserves **the same plot** for the burner, invalidates old vouchers and leaves other wallets unable to claim it indefinitely. A later replacement on that plot mints a new token ID without consuming a primary allowance.
- A reserved empty plot and an unclaimed occupied grave both count as unavailable for the 100%-allocated unlock condition.
- Active NFT supply never exceeds registered plots or 666. Repeated burn/remint may make lifetime token IDs exceed 666 without creating a 667th plot.
- Checkpoint and full-occupancy evidence, interrupted zone cutover, event replay, reorgs and database reconciliation do not expose a plot to two holders.
