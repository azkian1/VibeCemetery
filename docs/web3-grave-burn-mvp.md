# Web3 Grave Burn MVP — As-Built Specification

**2026-09-06 update:** the current release extends this verified offering flow to both
maps and adds the Crematory ledger, burn-address supply bar and received offerings
in Necropolis. For these changes and migration order, [unified-burial-setup.md](unified-burial-setup.md)
takes precedence. The Map v1-only boundaries and global-ledger exclusions below
describe the original MVP; its transfer verification and authorization protocol still apply.

**Status:** implemented and locally verified for Map v1 on 2026-08-21; production release
remains gated by the deployment checklist in section 14.

This document is the implementation and operations source of truth. It
supersedes conflicting Web3 suggestions elsewhere in the repository. It does
not authorize the 50/25/25 flywheel, owner claims, treasury, exhumation,
inheritance, or a cemetery smart contract.

The legacy untracked `web3/web3burnplan.md` remains useful product context,
but its old direct payload `{ txHash, walletAddress, amount }` is obsolete.
Implement the intent-bound flow in this document instead.

## 0. Implementation record

The MVP described below is implemented. The current code includes:

- a Map v1-only Wagmi provider and injected-wallet UI;
- server-created, expiring EIP-712 intents;
- atomic authorization, expiry, transaction binding, and duplicate protection;
- independent Base receipt, sender, smart-wallet signature, confirmation, and
  exact ERC-20 `Transfer` verification;
- protected pending/reorg reverification through Vercel Cron;
- IP-before-lookup and normalized-wallet write rate limits;
- abort-aware browser polling and stats refresh;
- database-side verified totals and top-three aggregation;
- forced RLS and server-only access to the new tables and SQL functions;
- dependency-injected API handlers and fake-RPC/in-memory automated tests.

Local verification completed after implementation:

```text
TypeScript                         passed
Web3 regression tests             38 passed
Full unit suite                   480 passed
Injected-wallet Web3 E2E           1 passed
Next.js production build          passed
ESLint                            0 errors, 1 unrelated warning
```

The automated E2E uses a fake `window.ethereum`, intercepted API responses, and
no real token value. Production is not enabled merely because these checks
pass. The SQL migration, secrets, production RPC, scheduler invocation, and one
explicitly approved tiny Base transaction must still be verified in the target
environment.

## 1. Product outcome

On **Cemetery Map v1 only** (`/cemetery`), a visitor can make a public
GRAVE offering to an existing grave:

1. Open a grave modal.
2. Connect an injected EVM wallet and switch to Base Mainnet.
3. Select `100`, `500`, `10,000`, or a positive whole-number custom amount.
4. Sign a short-lived intent that names the exact grave and amount.
5. Transfer the fixed GRAVE ERC-20 amount to the fixed burn address.
6. Submit the transaction hash through VibeCemetery.
7. See only independently verified amounts in the grave total and top-three
   mourners.
8. On verification, briefly highlight the grave slot on the map.

The user-visible copy may call this a “burn offering”. The verified GRAVE
contract exposes `burn(uint256)` only to its owner, so the holder flow uses
ERC-20 `transfer` to the dead address. That transfer does not reduce
`totalSupply()`: the precise claim is **“sent permanently to the burn
address”**, not “total supply destroyed”.

## 2. Explicit non-goals

Do **not** implement any of the following in this release:

- a custom Solidity contract;
- WalletConnect, RainbowKit, QR/mobile deep links, or a token picker;
- arbitrary token or burn-address input;
- 50/25/25 splits, treasury transfers, owner rewards, claims, exhumation, or
  inheritance;
- global burn leaderboards, Chapel metrics, persistent smoke/aura effects, or
  automatic burial-time offerings;
- a Web3 panel on v2 (`/cemetery/v2`) or on the scanner landing page.

The next economic phase requires a dedicated smart contract which emits a
grave identifier on-chain. It is intentionally out of scope here.

## 3. Fixed chain and token configuration

Keep these values in a committed, client-safe `src/web3/config.ts`; do not
take them from form input, URL parameters, or runtime user data.

```ts
export const GRAVE_CHAIN_ID = 8453
export const GRAVE_TOKEN_ADDRESS = '0xb48bc4896D18724F7bF5A3d2817fC35252cD7bA3'
export const GRAVE_TOKEN_SYMBOL = 'GRAVE'
export const GRAVE_TOKEN_DECIMALS = 18
export const GRAVE_BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD'
export const GRAVE_BURN_PRESETS = ['100', '500', '10000'] as const
export const MIN_BURN_CONFIRMATIONS = 2
```

Read-only Base Mainnet calls and the verified explorer source were rechecked
before the Map v1 implementation. The address has contract code, returns
`GRAVE` from `symbol()`, returns `18` from `decimals()`, and restricts its
native `burn(uint256)` to the contract owner. Before enabling production,
reconfirm the address and live transfer behaviour:

- it is the intended GRAVE contract;
- `transfer` is a normal ERC-20 transfer for this flow;
- it has no fee/rebase/blacklist/pause behaviour that changes the exact
  recipient amount;
- the project accepts the dead address as the intended burn destination.

Do not use JavaScript `number` for token amounts. Parse/display with
`bigint`, `parseUnits`, and `formatUnits`.

## 4. Critical security model: signed burn intent

### Why it is required

A normal ERC-20 transfer to one shared dead address contains no `graveId`.
Accepting `{ txHash, walletAddress, amount }` from the browser would let an
observer submit a real transaction before its owner and credit it to an
arbitrary grave. A globally unique transaction hash prevents double-counting,
but does not prove the intended grave.

### Required flow

Use a server-issued, single-use EIP-712 intent before the token transfer.

```text
create intent -> wallet signs typed data -> server authorizes intent
              -> wallet transfers GRAVE -> client submits intentId + txHash
              -> server verifies Base receipt -> verified or pending
```

The signed typed-data message must bind at least:

```text
intentId / nonce
graveId
wallet
expectedRawAmount
chainId (8453)
tokenAddress
burnAddress
expiresAt
```

Use an explicit VibeCemetery EIP-712 domain name and version. Store the
server-generated nonce and expiration; never let the client choose them.
Require the intent to be signed and authorized **before** accepting a
transaction hash. Reject a receipt whose block time predates the intent’s
authorization.

Use Viem `verifyTypedData` through the Base public client. It supports EOAs
and EIP-1271 smart-contract wallet signatures, so do not hard-code an EOA-only
signature recovery path. Treat unsupported signature methods as a friendly
wallet error, never as an authorization bypass.

The browser must submit only:

```ts
{ intentId: string; txHash: `0x${string}` }
```

It must not submit a trusted wallet address, GitHub username, token address,
burn address, raw amount, or verified status.

## 5. Scope and UI placement

- Mount Web3 state around `CemeteryApp`, not global `AppProviders`.
  This avoids loading wallet code on the scanner, v2, and unrelated routes.
- `GraveModal.tsx` is shared by v1 and v2. Render `GraveBurnPanel` only when
  `useCemeteryMapVersion()` returns `'v1'` and a real grave is open.
- Render `WalletButton` inside `GraveBurnPanel`. Wallet connection is scoped
  to the offering action, not to the whole application.
- Do not add Connect Wallet to `ProfileModal`, TopBar, or the scanner in this
  release. A connected wallet is not a VibeCemetery account and does not
  replace the existing GitHub/NextAuth session.
- Keep the existing v2 experience free of Web3 UI for this release.
- Use a native stone/cemetery-styled `WalletButton`; do not introduce
  RainbowKit.
- Support injected EIP-1193 wallets first. The expected desktop wallets are
  MetaMask, Rabby, and compatible Coinbase Wallet extension accounts.
- Show the connected address in shortened form. When a current NextAuth
  GitHub session exists, the **server** may snapshot its username as a public
  display label after the wallet signature is valid. Never accept a username
  from the browser. Without a session, show the shortened wallet address.
- Explain before signing that the wallet/address and, if applicable, GitHub
  display name will be visible in the grave’s public mourners list.

## 6. Wallet UX contract

Required states:

```text
Connect Wallet
0x1234…abcd
Wrong network — Switch to Base
Choose an offering amount
Not enough GRAVE
Sign the grave intent
Confirm the transfer in your wallet
Transaction submitted — verifying on Base
Confirmed — indexing pending
Ritual accepted
Transaction rejected / failed
```

Rules:

- Whole tokens only in this MVP. Validate custom input with `^[1-9][0-9]*$`.
- Display preset amounts as `100`, `500`, and `10,000`; convert to raw units
  only with the fixed 18-decimal config.
- Disable the submit control while signing, waiting for a wallet response,
  submitting a hash, or polling a pending record.
- The wallet must be on chain `8453` before signing or transferring. Offer a
  wallet switch; server verification is always Base-only regardless.
- Never auto-connect, auto-sign, or auto-transfer.
- A local successful wallet response does not increment any public total.
  Only a `verified` server response does.
- Link to the configured Base explorer for a submitted transaction.

## 7. Browser dependencies and provider

Install only:

```bash
npm install wagmi viem @tanstack/react-query
```

Do not add WalletConnect or RainbowKit.

Implemented client modules:

```text
src/web3/config.ts          fixed public chain/token constants
src/web3/abi.ts             minimal ERC-20 ABI: transfer, balanceOf, decimals, Transfer event
src/web3/Web3Provider.tsx   Wagmi + QueryClient provider, route-scoped
src/web3/useGraveBurn.ts    state machine for intent, signature, transfer, submit, polling
src/components/web3/WalletButton.tsx
src/components/modals/grave/GraveBurnPanel.tsx
```

Create the Wagmi config with Base and an injected connector. Keep the
`QueryClient` and Wagmi config stable for the provider lifetime; do not create
them on every render. Use client components only for wallet APIs.

### RPC and CSP boundary

There are two different RPC roles:

1. **Server verification** uses required server-only `BASE_RPC_URL`.
   It must never be exposed through `NEXT_PUBLIC_*`.
2. **Browser reads** (such as `balanceOf`) need either a browser-safe,
   origin-restricted `NEXT_PUBLIC_BASE_READ_RPC_URL`, or a deliberately
   implemented wallet-provider read path. Do not reuse a server secret in the
   browser.

If browser HTTP RPC is used, add only the selected HTTPS origin to
`connect-src` in `next.config.ts`, plus a regression test. Do not add a
wildcard. Base’s public RPC is useful for development but is rate-limited and
not a production dependency.

## 8. Server modules

Implemented server modules:

```text
src/lib/web3/baseClient.ts          Base public client from BASE_RPC_URL
src/lib/web3/burnConfig.ts          server config validation / feature gate
src/lib/web3/burnIntent.ts          typed-data builder, address/hash normalization
src/lib/web3/verifyBurnTx.ts        receipt, confirmation, log verification
src/lib/web3/graveBurnStats.ts      verified totals and top mourners
src/lib/web3/burnStore.ts           Supabase storage and SQL RPC adapter
src/lib/web3/burnService.ts         intent, submission, and reverify services
src/lib/web3/http.ts                origin, body, no-store, and rate-limit controls
src/lib/web3/routeDeps.ts           production dependency wiring
```

The authorize and submit routes expose pure handler factories in
`authorize-handler.ts` and `submit-handler.ts`. Production route modules only
wire Supabase, NextAuth, rate limiting, and the Base client into those
factories. Services accept a store, Base client, and clock. Unit tests use an
in-memory store and fake RPC client rather than real Supabase or Base requests.

Feature flags:

```text
WEB3_GRAVE_BURNS_ENABLED=true|false          authoritative server flag
NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED=true|false  UI visibility only
BASE_RPC_URL=https://...                     server-only production RPC
GRAVE_BURN_REVERIFY_SECRET=...               server-only cron secret
CRON_SECRET=...                              Vercel Cron bearer secret
NEXT_PUBLIC_BASE_READ_RPC_URL=https://...    optional browser-safe read RPC
```

If the authoritative server flag or required server RPC is absent, reject
intent creation with a safe “ritual unavailable” response. Do not silently
fall back to an unauthenticated public RPC in production.

Import `server-only` in every module that reads `BASE_RPC_URL`, the reverify
secret, or constructs the server verification client.

## 9. API contract

All write endpoints require a strict JSON body limit, origin validation,
rate limiting by IP and normalized wallet address, and no-store responses.
Use the project’s existing NextAuth, `getClientIp`, and rate-limit patterns.

### `GET /api/graves/[id]/burns`

Public, read-only grave stats. Validate the UUID before querying.

```ts
type GraveBurnStats = {
  totalBurnedRaw: string
  totalBurnedDisplay: string
  burnCount: number
  topMourners: Array<{
    walletAddress: string
    displayName: string
    githubUsername: string | null
    amountRaw: string
    amountDisplay: string
    source: 'github' | 'wallet'
  }>
}
```

Aggregate only `status = 'verified'`. Never include pending, failed, or
orphaned records in public totals or rankings. Add a short cache policy only
after verifying it cannot keep a newly verified result stale for too long.
Group strictly by normalized `wallet_address`, not by `(wallet, github name)`.
Choose a display-name snapshot deterministically (for example, the latest
verified non-null server-derived GitHub username); use the shortened wallet as
the fallback and deterministic address ordering for ties.

### `POST /api/graves/[id]/burn-intents`

Input:

```ts
{ walletAddress: string; amountWhole: string }
```

The server must:

1. validate UUID and confirm that the grave exists on map version `v1`;
   fail closed if the migration/schema needed to establish that boundary is
   absent;
2. normalize/checksum the wallet address;
3. validate a positive whole-token amount and derive raw `bigint` units;
4. rate-limit the request;
5. create a short-lived intent (for example 10 minutes) with a strong nonce;
6. return `intentId`, `expiresAt`, and exact EIP-712 typed data to sign.

### `POST /api/graves/[id]/burn-intents/[intentId]/authorize`

Input:

```ts
{ signature: `0x${string}` }
```

The server verifies typed data against the stored intent wallet using the
Base client. During authorization it snapshots the current Base block number
and hash, then atomically changes the intent from `created` to `authorized`.
Persist the signature, authorization verification time, and Base block
snapshot for auditability. It may safely attach the current server-derived
GitHub username at this point. Return the immutable transfer config for UI
confirmation.

### `POST /api/graves/[id]/burns`

Input:

```ts
{ intentId: string; txHash: `0x${string}` }
```

The server must use only the stored, authorized intent plus Base chain data.
It must be idempotent: repeated submission of the same intent/hash returns
the existing safe status and never changes totals twice.

Do **not** consume or bind an intent just because a supplied hash is malformed,
unknown, reverted, or mismatched. In those cases return a safe failure and
leave the authorized intent usable until expiry. Bind the transaction hash and
consume the intent atomically only after a successful receipt has exactly one
matching fixed-token Transfer log. A matching receipt with too few
confirmations is bound as `pending`; a receipt that is not yet visible creates
no burn record and consumes nothing.

### Protected re-verification

Provide a server-only cron/internal route, for example:

```text
POST /api/internal/grave-burns/reverify
Authorization: Bearer <GRAVE_BURN_REVERIFY_SECRET>
```

It may examine a bounded batch of `pending` records and recent `verified`
records for reorg detection. It must not be a public RPC proxy or public RPC
amplifier.

Configure an actual deployment scheduler (Vercel Cron or an approved external
scheduler) to invoke this route. A protected route by itself is insufficient:
the release gate must prove that pending records are retried in the deployed
environment.

## 10. Transaction-verification invariants

`verifyBurnTx` returns only a typed safe result:

```text
pending | verified | failed | orphaned
```

For a transaction to become `verified`, all of these must hold:

1. At server configuration/startup, the RPC client explicitly returns
   `getChainId() === 8453`; the hash then exists on that Base Mainnet client.
2. The receipt has `status === 'success'`.
3. The receipt has at least `MIN_BURN_CONFIRMATIONS` confirmations.
4. Its `blockNumber` is strictly greater than the intent’s stored
   `authorized_block_number`, and its block timestamp is not later than the
   intent expiry.
5. A decoded `Transfer` log comes from exactly `GRAVE_TOKEN_ADDRESS`.
6. That log’s `from` equals the signed intent wallet.
7. That log’s `to` equals exactly `GRAVE_BURN_ADDRESS`.
8. That log’s `value` equals exactly the intent’s expected raw amount.
9. Exactly one matching log is selected and its `logIndex` is stored.
10. No record already owns the same normalized transaction hash or intent.

The Transfer event at the fixed token address is the canonical verification
artifact. Do not make a direct top-level `tx.to === TOKEN_ADDRESS` check a
hard requirement: compatible smart-account / EIP-4337 execution can wrap the
top-level transaction while still emitting the valid token Transfer event.

Fetch transaction metadata as well as the receipt. For an EOA intent wallet,
require `tx.from === intent.wallet` in addition to the matching Transfer log.
For a smart-contract wallet, verify the typed-data signature at the relevant
Base block using Viem’s contract-wallet-capable verification path; the fixed
Transfer log’s `from` remains the attribution source. Do not fall back from a
failed smart-wallet verification to `recoverAddress`.

If a receipt cannot yet be found, return a retryable status without creating a
burn record or consuming the intent. Once a successful receipt with one
matching log exists, atomically bind it to the intent; keep it `pending` until
it has enough confirmations. A final receipt that does not match leaves the
intent authorized until expiry and never affects stats. Reverification must
compare stored block hash/log data and mark a reorged verified record
`orphaned`, removing it from stats.

## 11. Database migration

Add an idempotent migration at `docs/web3-grave-burn-mvp.sql` and update both:

```text
docs/supabase-schema.sql
docs/supabase-rls-hardening.sql
```

Do not store `slot_id` as the independent association. Slot IDs overlap across
map versions; associate burns through `grave_id` only.

### `grave_burn_intents`

Required concepts:

```text
id UUID primary key
grave_id UUID references graves(id) on delete cascade
wallet_address normalized lowercase address
github_username nullable, server-derived only
amount_raw numeric(78,0)
chain_id integer
token_address normalized address
burn_address normalized address
nonce unique
status created | authorized | consumed | expired | failed
signature nullable
authorized_block_number numeric(78,0) nullable
authorized_block_hash nullable
authorization_verified_at nullable
expires_at, authorized_at, consumed_at, created_at
```

### `grave_burns`

Required concepts:

```text
id UUID primary key
intent_id UUID unique references grave_burn_intents(id)
grave_id UUID references graves(id) on delete cascade
wallet_address normalized lowercase address
github_username nullable, server-derived only
mourner_source github | wallet
tx_hash normalized lowercase hash, unique
chain_id integer
token_address normalized address
burn_address normalized address
amount_raw numeric(78,0)
status pending | verified | failed | orphaned
block_number numeric(78,0) nullable
block_hash nullable
log_index integer nullable
failure_code nullable, public-safe if exposed
submitted_at, verified_at, last_checked_at, created_at
```

Use indexes for `(grave_id, status)`, `(grave_id, status, wallet_address)`,
pending reverify order, and wallet lookup. Enable and force RLS, then revoke
all access from `anon` and `authenticated`, matching the existing server-only
tables. The Next.js server via `SUPABASE_SERVICE_KEY` remains the sole data
path.

Use constraints for `amount_raw > 0`, fixed `chain_id = 8453`, normalized
lowercase `0x` address/hash formats, and every status enum. Make `intent_id`
and `tx_hash` `NOT NULL UNIQUE` in `grave_burns`.

Do not implement intent transitions as separate `select -> insert -> update`
Supabase calls. Add server-only Postgres RPC/function boundaries that use
`SELECT ... FOR UPDATE` to atomically authorize an intent and to atomically
bind a validated matching receipt, insert/update the burn record, and consume
the intent. Unique constraints remain the final protection against concurrent
submissions; a conflict returns the existing safe status without exposing
another mourner’s details.

## 12. Implementation record by layer

The implementation was completed in this order so the server trust boundary
was testable before the UI:

1. Added dependencies and a client-safe fixed config/ABI module.
2. Added server config validation, Base client, amount/address/hash helpers.
3. Added the SQL migration, base schema updates, RLS hardening updates, and
   schema tests.
4. Implemented and tested typed-data intent creation/authorization.
5. Implemented and tested receipt/log verification with mocked Base RPC data.
6. Implemented database-side stats and dependency-injected API routes with
   idempotency and rate limits.
7. Added protected bounded re-verification and the Vercel schedule.
8. Added the route-scoped Wagmi provider and native wallet controls to Map v1.
9. Added `GraveBurnPanel` and its explicit, abort-aware state machine.
10. The client emits `cemeteryEvents.emit('highlight_slot', { slotId })` only
     after the API returns `verified`.
11. Automated checks and the fake injected-wallet flow pass. Controlled
    staging and mainnet checks remain release operations.

## 13. Required tests

Add focused tests following existing Playwright unit conventions. Do not make
automated tests depend on a live wallet, a real RPC, or token value.

### Server/security tests

- whole-amount parsing; zero, decimal, oversized, malformed amount rejection;
- intent nonce/expiry/single-use behaviour;
- valid and invalid EIP-712 signature, including smart-account verification
  fixture where practical;
- missing receipt => retryable, unbound intent; one matching receipt with too
  few confirmations => atomically bound `pending` burn;
- failed receipt, wrong token, wrong sender, wrong burn address, wrong amount,
  zero/multiple matching logs, or a pre-authorization block => not verified
  and cannot consume the intent;
- valid fixed-token Transfer => verified;
- duplicate transaction and concurrent intent consumption => one counted burn;
- reorged block hash => `orphaned` and removed from stats;
- stats ignore every non-verified status and group top mourners only by
  normalized wallet address;
- no browser-provided username/address/amount can override server/on-chain
  values;
- request body limit, origin check, IP+wallet rate limit, UUID validation, and
  internal reverify authorization/scheduler configuration.

Implemented test files:

```text
tests/grave-burn-config.spec.ts
tests/grave-burn-intent.spec.ts
tests/verify-burn-tx.spec.ts
tests/grave-burn-stats.spec.ts
tests/grave-burn-api.spec.ts
tests/grave-burn-schema.spec.ts
tests/grave-burn-map-boundary.spec.ts
tests/grave-burn-reverify.spec.ts
tests/web3-burn.e2e.spec.ts
```

The browser-only E2E spec must use a fake `window.ethereum` installed before
navigation and stub every burn API response. It must be excluded from the
unit-only configuration. Use accessible stable controls such as `Connect
wallet`, `Switch to Base`, `Offer 100 GRAVE`, `Custom GRAVE amount`, and
`Burn offering` instead of brittle styling selectors.

### UI tests

- burn panel is present for Map v1 and absent on v2;
- disconnected, wrong-chain, signing, wallet-rejection, pending, failed, and
  verified states;
- only whole custom amounts are enabled;
- the exact fixed token/burn address is used in the write request;
- verified response refreshes stats and emits one `highlight_slot` event;
- pending response does not increase visible public totals.

### Regression gates

```bash
npx tsc --noEmit --incremental false
npm run lint
npm run test:unit
npm run test:web3-e2e
npm run build
```

`npm run test:web3-e2e` starts an isolated local server on port `3010`, enables
both Web3 feature flags for that process, installs a fake injected wallet
before navigation, and intercepts the burn APIs. The normal `npm run test:e2e`
suite intentionally excludes this special fixture.

A real Base mainnet transfer requires explicit human approval and must be a
deliberately tiny amount after staging verification.

## 14. Release checklist

Before turning on the public flag:

1. Deploy the current Next.js application and database migration. Do not
   deploy a new Solidity contract: this release calls `transfer` on the
   existing GRAVE token contract.
2. Confirm the deployed GRAVE contract’s identity and transfer semantics.
3. Provision and test `BASE_RPC_URL`; do not use Base’s public RPC as the
   production verifier.
4. Verify no server RPC or reverify secret appears in browser JavaScript,
   logs, documentation screenshots, or `NEXT_PUBLIC_*` variables.
5. Confirm RLS/REVOKE applies to both new tables in a staging Supabase project.
6. Verify all API abuse controls and duplicate paths under concurrency.
7. Verify the selected browser RPC origin is the only CSP expansion, if one
   is used.
8. Exercise MetaMask/Rabby and a compatible smart-account wallet where
   available.
9. Prove the production scheduler invokes bounded pending/reorg reverification
   with the protected secret.
10. Make one explicitly approved tiny Base mainnet offering; inspect its
   explorer receipt, database record, stats, and map highlight.
11. Keep the server feature flag off until every prior item is complete.

## 15. Current handoff summary

The burn-only offering flow for existing Map v1 graves is implemented. Its
trust boundary is the signed server intent plus independently verified
fixed-token Transfer log. Do not weaken it by accepting wallet, amount, grave,
token, or burn-address assertions from the client after the intent is created.
Do not start the later flywheel economics without a separate contract and
design approval.

The deployable unit is the application, Supabase schema, environment, and
reverify schedule. There is no new contract deployment in this phase. Connect
Wallet remains inside the grave offering panel; cabinet-level wallet UX is a
separate future product decision.

Operationally, preserve these rules:

- an RPC timeout or unavailable block is not evidence of a reorg;
- `receipt_not_found` remains retryable and does not consume a new intent;
- only a successfully fetched conflicting block hash may orphan a stored burn;
- write IP limits execute before intent lookup, then wallet limits execute
  against the normalized stored wallet;
- public stats come only from `status = 'verified'`;
- the public flag must be checked before any Wagmi hook renders;
- closing or replacing a grave modal must abort its polling flow.
