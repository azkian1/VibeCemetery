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
[VibeCemetery]                                      [Connect Wallet]

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

The first page does not show cremation as a standalone action.

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
- `/agents/gitlawb` - Agent / GitLawb layer entry.

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
- Necropolis / leaderboard.
- Profile/auth UI.
- Deep links to graves and urns.

Hidden from visible map UI for VCv2 clarity:

- `BURY` floating CTA.
- `CLI SKILL` floating CTA.
- `AGENT SKILL` floating CTA.
- `Start here` prompt.

The map is now an exploration/result layer, not the first onboarding screen.

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
- CLI/skill/agent-skill CTAs no longer compete with the first-page scan action.
