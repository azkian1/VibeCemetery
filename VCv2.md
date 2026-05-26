# VC v2: Current Entry Flow

## Status

VCv2 is implemented as the current first-page entry flow.

The product now separates onboarding from exploration:

- `/` answers: what should I do now?
- `/cemetery` answers: what exists in the cemetery?

## Current Home Page

The home page is a compact scanner landing page.

Current first screen:

```text
Top nav:
[VibeCemetery]                         [Connect Wallet hidden/reserved]

Centered card:
GitHub scanner

Bury your abandoned GitHub repos

[ Scan GitHub ]

[ Enter Cemetery ] [ Agent / GitLawb Layer ]

Dead repos = non-forks inactive for 7+ days.
Only your connected GitHub can be scanned.
```

There is no GitHub username input on the first page.

Reason: public username scan is intentionally not part of this MVP. The previous input created a false expectation that users could scan any GitHub account.

## Primary Flow

```text
User lands on /
User clicks Scan GitHub
If not authenticated, GitHub auth opens
After auth, Scan GitHub scans the connected GitHub account
Dead repo results render on /
User clicks Bury on a repo result
Existing bury flow opens for that repo
User can enter /cemetery to explore the map
```

## Authentication Behavior

`Scan GitHub` is the only GitHub auth entry point on the landing page.

Behavior:

- If unauthenticated, `Scan GitHub` starts GitHub login.
- If authenticated, the button label becomes `Scan @username`.
- Scan uses `session.user.github_username` only.
- The backend still enforces own-account-only scan in `/api/github/scan`.
- If a user connects GitHub on `/`, the same NextAuth session is available on `/cemetery`.

The top nav no longer includes `Connect GitHub`, because it duplicated the primary CTA and created unnecessary choice.

## Scan Rules

Dead repos are currently:

- Non-forks.
- Inactive for 7+ days.
- Passing existing repository content eligibility checks.
- Not already buried.
- Not already cremated by the same GitHub user.

The first page does not support scanning other users' GitHub accounts.

## Scan Results

Results are shown on `/`, before the user enters the cemetery map.

Result card shape:

```text
Found 6 dead repos

[ repo-name ]
Last push: 43 days ago
Language: TypeScript
Status: Dead
[ Bury ]
```

Empty state:

```text
No dead repos found.
A repo must be inactive for 7+ days and not be a fork.
[ Enter Cemetery ]
```

The first page does not show cremation as a standalone action while grave slots are available.

New VCv2 action split:

- `Shovel` / grave action is the burial-only flow.
- `Fire` / cremation action is the cremation-only flow.
- After `Scan GitHub`, each dead repo should lead to burial when the user has grave slots.
- If the user has no grave slots, the scan result action leads to cremation instead.
- Cremation is not active while the user still has grave slots.
- If the user opens burial with no grave slots, the UI should explain that no grave slots are left and cremation is available.

Map HUD action split:

- The old `BURY` floating CTA is replaced by `SHOVEL` and `FIRE`.
- `SHOVEL` opens burial mode and is disabled when no grave slots remain.
- `FIRE` opens cremation mode and is disabled while grave slots remain.
- `CLI SKILL` stays separate from both ritual actions.

## Burial From First Page

Clicking `Bury` opens the existing `BuryFlowModal` with the selected repo preloaded.

Important behavior:

- The existing burial backend is reused.
- Grave slot economy is still enforced.
- If no grave slot is available, existing fallback behavior applies.
- Ceremony animation is suppressed when bury flow is opened from `/`, because the Phaser map is not mounted there.
- The user can enter `/cemetery` after burial to explore the map.

## Routes

Current routes:

- `/` - scanner landing page.
- `/cemetery` - existing Phaser cemetery map experience.
- `/agents` - Agent / GitLawb layer hub.
- `/agents/gitlawb` - Agent Skill install contract.

Deep link behavior:

- `/grave/[id]` redirects to `/cemetery?grave=<id>`.
- `/urn/[id]` redirects to `/cemetery?urn=<id>`.
- Legacy root query intents like `/?grave=...`, `/?urn=...`, and `/?modal=bury` redirect to `/cemetery` with the same relevant query.

## Map Behavior

The map remains intact behind `/cemetery`.

Kept on the map:

- Phaser cemetery map.
- Graves.
- Grave details.
- Crematory.
- The Crypt.
- Necropolis / leaderboard.
- Profile/auth UI.
- Deep links to graves and urns.
- `BURY` floating CTA.
- `CLI SKILL` floating CTA.

Moved out of visible map UI for VCv2 clarity:

- `AGENT SKILL` floating CTA.
- `Agent Ashes` top-bar action.
- `Start here` prompt.

The map is now the Human layer: hands-on cemetery interaction, manual burial, human cremations, Necropolis, Crematory, and The Crypt. Agent Ashes and Agent Skill live in the separate Agent layer hub.

## Agent Layer Hub

`/agents` is the compact Agent / GitLawb layer entry.

Current hub actions:

- `Agent Ashes` - opens the existing Agent Ashes modal outside the cemetery map.
- `Agent Skill` - opens the GitLawb Agent Skill install page at `/agents/gitlawb`.

The Agent layer is for AI/agent records and setup. It does not create graves, does not write human cremations, and does not compete with the Human map HUD.

## Visual Direction Implemented

The first page uses a compact Uniswap-like centered card while preserving VibeCemetery identity:

- Dark stone background.
- Cinzel typography.
- Gold/red primary CTA.
- Compact centered modal-style card.
- Minimal distractions.
- Desktop and mobile keep `Scan GitHub` visible above the fold.
- Decorative background stripes were removed after review because they looked like visual artifacts.

## Non-Goals Still In Force

- Do not implement public username scan.
- Do not redesign the cemetery map.
- Do not remove or migrate Soul.
- Do not change grave slot economics.
- Do not implement exhume/rebury.
- Do not implement GRAVE token mechanics.
- Do not create a new base slot model.
- Do not rebuild the burial ceremony.

## Implementation Notes

Key files:

- `src/app/page.tsx` - root route and legacy query redirect handling.
- `src/components/HomeScannerLanding.tsx` - scanner landing page.
- `src/components/CemeteryApp.tsx` - extracted map app shell.
- `src/app/cemetery/page.tsx` - map route.
- `src/app/agents/page.tsx` - Agent / GitLawb layer hub.
- `src/components/modals/BuryFlowModal.tsx` - supports preloaded repo burial from `/`.
- `src/lib/bury-intent.ts` - GitHub auth callback now returns to `/cemetery?modal=bury`.

Coverage:

- `tests/home-entry-flow.spec.ts`
- `tests/bury-intent.spec.ts`
- `tests/mobile.spec.ts`

## Current Success Criteria

- A new user sees one obvious primary action: `Scan GitHub`.
- There is no username field suggesting public scan.
- GitHub auth is triggered by the primary CTA.
- Only the connected GitHub account can be scanned.
- Scan results appear before the map.
- The map remains accessible through `Enter Cemetery`.
- CLI Skill and BURY stay in the Human map layer; Agent Ashes and Agent Skill no longer compete with the cemetery HUD.
