# Grave NFT contract specification — draft v1

The first Solidity implementation is [`../contracts/GravePlotNFT.sol`](../contracts/GravePlotNFT.sol). Run `npm run check:grave-nft` to compile it with the development dependencies. OpenZeppelin 5.6 uses Cancun opcodes; confirm Robinhood Chain testnet executes the compiled bytecode before any mainnet deployment. This is a draft for testnet and review, not an audited deployment artifact.

## Meaning and supply

- One active ERC-721 NFT represents the current memorial and the right to control one approved cemetery plot.
- The contract starts with `openPlotCap = 144`, so even the administrator cannot register a 145th plot without first calling the explicit unlock function. The initial registration must use the 144 authored v2 plot IDs. No more than 666 distinct plots can ever be approved.
- At most one live NFT or one post-exhumation reservation may control a plot at any time.
- **666 is a cap on simultaneously active NFTs and distinct plots, not on lifetime mint events.** Burning and reminting can create more than 666 mint events over the lifetime of the cemetery. An absolute lifetime mint cap of 666 would eventually make reburial impossible.
- Free claims are optional, so the live minted supply begins below 144; 144 is the initial plot ceiling. Keeping exactly 144 minted tokens at all times would require a different custody or replacement model.
- A grave UUID can be minted only once. A replacement project receives a new grave UUID and token ID; its NFT retains the same plot ID as the burned NFT. Historical NFTs and graves remain in the archive journal.

## Chain authority and trust boundary

The cemetery database verifies GitHub ownership, project eligibility, account quota and physical plot assignment. A Robinhood Chain contract cannot read Supabase or GitHub directly. For v1, the site attests to a confirmed burial with a short-lived EIP-712 claim voucher signed by a dedicated issuer key. This signer is a trust boundary; the contract alone cannot prove the offchain grave is real. Keep the issuer separate from the plot-registration administrator, rotate it through a controlled role, and monitor every mint event against the database.

The voucher binds:

```text
chainId, contract address, wallet, graveIdHash, plotId,
plotEpoch, metadataHash, tokenURI, nonce, deadline
```

The user's wallet signs a site challenge to link to the authenticated GitHub account. The server issues a voucher only for an existing confirmed, eligible grave whose author or current plot reservation is linked to that wallet. The voucher does not contain the private local `project_key`.

## Contract state and actions

```text
MAX_PLOTS = 666
INITIAL_PLOT_CAP = 144
openPlotCap = 144
approvedPlot[plotId]
activeTokenForPlot[plotId]
reservationHolder[plotId]
plotEpoch[plotId]
usedGraveId[graveIdHash]
usedVoucher[nonce or voucherHash]
graveIdForToken[tokenId]
plotIdForToken[tokenId]
```

1. `registerPlots(plotIds)` is administrator-only, rejects duplicate IDs and cannot register past the current `openPlotCap` or 666. Initial registration uses the exact 144 approved map IDs, not a numeric range.
2. `raisePlotCap(newCap, burnCheckpoint)` is administrator-only and emits a public checkpoint. A multisig must verify that cumulative Base GRAVE burns have passed the release threshold and the new map zone exists before submitting this transaction. The checkpoint hash is an audit reference, **not cryptographic proof**; a privileged administrator could still unlock early. Trustless enforcement would require verified crosschain messaging or a trusted proof system from Base to Robinhood Chain.
3. `claim(voucher, signature)` is free apart from network gas. It checks the issuer signature, chain/contract domain, `msg.sender == voucher.wallet`, deadline, unused grave and voucher, approved plot, correct plot epoch, and that the plot is vacant. For an initial claim, the backend confirms that the grave occupies this plot. For a replacement claim, the caller must hold the plot reservation. Minting writes the grave-to-token and plot-to-token mappings and clears the reservation.
4. ERC-721 transfer moves the right to decide whether to keep or exhumate the current memorial. The site must read onchain `ownerOf`; a cached database owner is never an authorization source.
5. `exhume(tokenId)` may be called only by the token owner, not an approved operator. It burns the NFT, clears the active token, increments the plot epoch and reserves that exact plot for `msg.sender` before emitting `Exhumed(plotId, graveIdHash, burner, epoch)`. Other wallets cannot claim the vacant plot. The reservation persists until the holder presents an eligible replacement grave; burning without a prepared grave is a deliberate, clearly warned action.
6. `claim` for a replacement mints a **new token ID** with a new immutable project metadata URI. The former grave URL redirects to its archive-journal entry; its burn tributes and history remain attached to the archived grave.
7. Pause mint and exhumation independently for incident response. A pause must not prevent holders from viewing or transferring existing NFTs unless a separately disclosed transfer policy requires it.

An optional later `exhumeAndClaim` can burn the old NFT and mint a prepared replacement in one transaction. Its voucher must name the current token, owner, plot epoch and replacement grave. This avoids an empty period but is not necessary for the owner-only reservation guarantee.

## NFT metadata

`tokenURI` points to a content-addressed JSON document with the public project name, description, cause, epitaph, author, original source URL when public, grave UUID, plot ID, image and archive URL. Store its content hash onchain or bind it in the voucher. Do not put long descriptions directly in contract storage or publish private CLI project keys. Preserve the metadata and image after burn so the archive journal can still show the former memorial.

## Website and database synchronization

- Record chain ID, contract, token ID, grave UUID, plot ID, owner/reservation holder, plot epoch, transaction hash and log index. Give chain events a unique `(chain_id, tx_hash, log_index)` key.
- Treat mint and exhumation as pending until the chosen confirmation depth. Process events idempotently, handle reorgs and reconcile the database against `ownerOf`, active plot and reservation state.
- An exhumation archives the old grave and frees its active map occupancy only after the onchain event is confirmed. The plot remains reserved onchain for the burner while the archive transition runs.
- Existing grave authors get a claim path before any exhumation feature is enabled. Unclaimed existing graves remain assigned to their authors; no other wallet can claim them.
- Define how the present 4 + 1 account burial allowance applies to archived graves and replacement burials before launch. The current SQL counts all rows in `graves`, so replacement cannot simply reuse the existing insert RPC.

## Royalties and GRAVE

Set the collection's desired creator earnings to 5%, paid to a public receipt wallet. Send **100% of royalties actually received**, after unavoidable bridge/swap/network costs are reported, toward GRAVE purchases on Base and transfers to the existing burn address. Publish every batch's sale proceeds, conversion and Base burn transaction. ERC-2981 alone reports a royalty preference; test whether the chosen marketplace and contract enforce the desired fee on Robinhood Chain before making stronger marketing claims.

## Required adversarial tests before mainnet

- Fake grave, wrong plot, closed zone, expired voucher, wrong chain, wrong wallet, repeated voucher and repeated grave UUID all fail.
- Before an explicit cap raise, registration of plot 145 fails even for the administrator; repeated checkpoints and caps above 666 revert. The contract does not authenticate Base burn evidence, so a premature checkpoint remains a multisig governance risk until crosschain verification is added.
- Parallel claims for one plot produce exactly one NFT.
- A buyer can transfer, burn and retain the plot; the seller cannot exhumate after transfer.
- An approved marketplace operator cannot burn on the holder's behalf.
- A different wallet cannot mint into a reserved plot; the holder can still mint after a delayed database/indexer update.
- Total active NFTs never exceeds approved plots or 666; repeated burn/remint does not exhaust the allowed plot supply.
- Signer rotation, pause/unpause, out-of-order events and reorg reconciliation retain a single authoritative plot holder.
