# REKT UX/UI patch

Implemented locally on 2026-09-09. This is the UI stage of the REKT plan, not a completed REKT backend or a production release.

## Review

Run the existing development server and visit `/` for the two entry points, `/cemetery` for Bury / Bury REKT, and `/dev/rekt` for the interactive UI preview. The preview route returns 404 in production unless the explicit E2E test flag is set. Its sample data is visibly labelled as fictional; it never signs, scans a real wallet, writes a grave or starts a map ceremony.

The preview includes the burial flow and a wallet-only account view. Scenarios cover complete, partial, empty and failed scans, cancelled signatures, wrong wallets and uncertain writes. The real entry points display unavailable networks and keep scanning/verification/creation disabled.

## Simplification accepted on 2026-09-09

The owner replaced the network-selection UI with a minimal Bury-style entry: Wallet address and Scan wallet only. Both Base and Robinhood are requested automatically. An unavailable network must be reported by the scan as incomplete coverage, never silently treated as scanned. View proof, the progress stepper, introductory copy, Connect Wallet on the entry screen, sorting and network filters were removed. Proof data stays in the underlying candidate contract for server validation. Preview settings are removed from the page. Test states use development-only URL parameters: `?scenario=partial` (or another fixture name), and `?view=account`. Drafts are scoped per fixture so switching test URLs cannot reuse a different scenario’s results.

The remaining steps follow the same compact layout: address + Sign message, three epitaph choices + a custom field, then the memorial + publication notice + Bury REKT. FOMO help is collapsed. The optional reason was removed entirely, including its memorial text and burial payload. Back/Next navigation retains the selected history and its text; returning through review does not request another signature while the same verification remains valid. Choosing another history clears the old story text. A wallet change during a pending verification invalidates that response.

The memorial displays the verified remaining balance as “N REKT slots available” (singular for one). The checkbox is replaced by “This memorial will be public.” above Bury REKT; pressing the button confirms publication. The stone shows only the shortened wallet address, with no full-address tooltip or link. Full wallet addresses remain in the private scan/verification flow. Future public snapshot APIs must expose only the shortened label and omit full wallet addresses and address-revealing proof links.

`RektMemorial` renders both the preparation preview and the completed demo card. The demo keeps the card visible after completion and offers Start again. The exhausted-quota state explains why selection is disabled. The write-error fixture succeeds only when retried with the same request key, testing that UI retry does not silently create a new request.

## Included

- Equal Code / REKT entry cards, the cemetery link and local-project agent instructions.
- Shared REKT modal entry from the landing page, desktop/mobile HUD and profile.
- Address validation and automatic Base / Robinhood scan scope; no manual network selection.
- Queue/history/calculation states; partial coverage, failure, empty and expiry states; retry and cursor-based continuation interfaces.
- Compact result cards before ownership verification. Results are automatically ordered by loss; selection follows verification and distinguishes already-buried histories.
- Three fallback epitaphs and custom text with an 80 UTF-16 code unit limit, enforced before preview and burial. No reason field or list. No LLM prompt or paid generation is added.
- A separate REKT stone preview, publication notice, guarded submit and a retained request key for retries.
- A typed account presentation for separate Code / REKT quotas, bonus category, linked wallets and memorials; the current profile displays an honest unavailable state until real account data is supplied.
- Shared modal keyboard containment, scroll containment and return of focus to the initiating button.
- Decimal-string display and sorting without converting monetary values to floating point.

## Integration boundary

`src/components/rekt/contracts.ts` defines the **UI adapter contract**, not a finalized server or database schema. Research scanner types are unchanged. `RektFlow` accepts a `RektAdapter`; the default adapter supports address connection and the proposed scan-job HTTP paths. Its verification and burial methods deliberately reject until reviewed server adapters exist. A connected wallet never establishes ownership.

`GET /api/rekt/capabilities` returns disabled networks, verification and creation. Do not enable these based on the research CLI, an RPC URL or a frontend flag. The homepage availability copy must be connected to the same capabilities when a network is enabled.

Backend integration still requires:

1. An authenticated, deduplicated scan-job service, stable candidates, cursor continuation, coverage, expiry, access control and validated error DTOs.
2. The wallet-auth adapter: challenge/signature verification and a server-established direct or accepted first-funding connection. Account/network changes invalidate the UI verification. Reopening a saved scan returns to review and requires re-verification.
3. Canonical accounts, migrated 2 Code + 2 REKT quotas, legacy allowance preservation and the one-time category bonus. This patch does not alter current Code quotas, account API, X verification or SQL.
4. Atomic, idempotent creation and recovery by request key. The client submits candidate ID and text, never client money or a chosen plot. Server timeout/reload recovery and final ownership/expiry/quota checks must be completed before writes are enabled.
5. The public REKT snapshot/read whitelist, published GraveModal/OG/share variants and wallet-only ownership in public lists. The stone here is a preparation preview. Existing Code/F/GRAVE rendering is unchanged.

`RektFlowModal.onCreated` is wired to the existing v2 ceremony mechanism, using the server-returned grave/slot/GID. That future success path is unreachable through the disabled default writer and is not evidence of an end-to-end REKT burial.

Drafts and fetched results are kept in this tab's session storage for a 30-minute **UI** resume window. This is not a server scan TTL or retention policy. No signature/session credential is persisted by the UI. Closing aborts the current client request/polling; it does not claim cancellation of a server job. A pending write guards modal close. Full reload reconciliation is a server-integration prerequisite.

## Verification

- `npx tsc --noEmit --incremental false`
- `npm run lint`
- `npm run test:unit` (existing suite plus decimal/address/link/readiness checks)
- `npm run test:web3-e2e` (isolated API/wallet fixtures; includes REKT desktop and 375 px screenshots)

Browser tests do not forward application API calls to production, publish social posts or transfer tokens. No dependency, lockfile, backend quota, scanner research, production database or deployment change is part of this patch.
