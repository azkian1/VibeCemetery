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
[VibeCemetery centered/static text]     [Connect Wallet hidden/reserved]

Centered card:
GitHub scanner

Bury your abandoned GitHub repos

[ Scan GitHub ]

[ Enter Cemetery ] [ Agent Layer ]

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
User clicks Bury or Cremate on a repo result
Existing bury flow opens in the matching mode for that repo
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
[ Bury ] or [ Cremate ]
```

Empty state:

```text
No dead repos found.
A repo must be inactive for 7+ days and not be a fork.
[ Enter Cemetery ]
```

The first page does not show cremation as a standalone action while grave slots are available. Each result has one primary action based on the user's current grave-slot economy.

New VCv2 action split:

- `Bury` / grave action is the burial-only flow.
- `Cremate` / ash action is the cremation-only flow.
- After `Scan GitHub`, each dead repo should lead to burial when the user has grave slots.
- If the user has no grave slots, the scan result action leads to cremation instead.
- Cremation is not active while the user still has grave slots.
- If the user opens burial with no grave slots, the UI should explain that no grave slots are left and cremation is available.

Map HUD action split:

- The old single `BURY` floating CTA is replaced by a `Choose a ritual` panel with `Bury` and `Cremate`.
- `Bury` opens burial mode and is disabled when no grave slots remain.
- `Cremate` opens cremation mode and is disabled while grave slots remain.
- The panel explains the split inline: `Bury` puts it on the map, `Cremate` saves it as ashes.
- `CLI SKILL` stays separate from both ritual actions.

## Burial From First Page

Clicking `Bury` opens the existing `BuryFlowModal` with the selected repo preloaded in burial-only mode. Clicking `Cremate` opens the same modal preloaded in cremation-only mode.

Important behavior:

- The existing burial backend is reused.
- Grave slot economy is still enforced.
- Home result actions are routed by current slot availability: grave slots lead to `Bury`, no slots leads to `Cremate`.
- If a grave submission loses its slot server-side, fallback cremation can still apply outside strict burial-only mode.
- Ceremony animation is suppressed when bury flow is opened from `/`, because the Phaser map is not mounted there.
- Burial completion can route into the cemetery ceremony; cremation completion can open the created urn.
- The user can enter `/cemetery` after burial to explore the map.

## Routes

Current routes:

- `/` - scanner landing page.
- `/cemetery` - existing Phaser cemetery map experience.
- `/agents` - Agent / GitLawb layer hub.
- `/agents/gitlawb` - Agent Skill install contract.
- `/agents/gitlawb/v1` - stable Agent Skill installer/distribution page.

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
- Split `Bury` / `Cremate` ritual panel.
- `CLI SKILL` floating CTA.

Moved out of visible map UI for VCv2 clarity:

- `AGENT SKILL` floating CTA.
- `Agent Ashes` top-bar action.
- `Start here` prompt.

The map is now the Human layer: hands-on cemetery interaction, manual burial, human cremations, Necropolis, Crematory, and The Crypt. Agent Ashes and Agent Skill live in the separate Agent layer hub.

Current Human map navigation:

- `Home` icon (`⌂`) returns to `/`.
- `FAQ` opens the existing Cemetery Guide modal and replaces the old hamburger glyph.
- `Necropolis` remains the visible leaderboard action.
- `FAQ` and `Necropolis` use the same stone-button visual language as the Home icon.

## Agent Layer Hub

`/agents` is the compact Agent / GitLawb layer entry.

Top navigation:

- `Back` sits on the left and returns to browser history, with `/` fallback.
- `VibeCemetery` is centered.
- The old `Human Cemetery` nav link was removed from this page.

Page copy:

```text
A separate ash layer for AI agents like Hermes, OpenClaw, and others.
Here, agents bury dead GitLawb projects: abandoned repositories, failed experiments, obsolete code, and systems that no longer run.
```

Current hub actions:

- `Agent Ashes` - opens the existing Agent Ashes modal outside the cemetery map.
- `Agent Skill` - opens the GitLawb Agent Skill install page at `/agents/gitlawb`.

The Agent layer is for AI/agent records and setup. It does not create graves, does not write human cremations, and does not compete with the Human map HUD.

Footer note:

```text
version 1.0
Experimental ash layer for GitLawb agent workflows.
To burn your own local projects, install the CLI Skill.
```

`CLI Skill` links to `/skills/bury/v1`.

## Runtime Stability

The cemetery map no longer relies on Phaser automatic `Scale.RESIZE`.

Reason: WebGL could throw `Framebuffer status: Incomplete Attachment` when Phaser resized render targets during transient zero/invalid parent dimensions on route/layout changes.

Implemented behavior:

- Phaser starts with explicit non-zero container dimensions.
- `ResizeObserver` drives later resize updates.
- Zero-width or zero-height resize events are ignored before calling `game.scale.resize(...)`.
- Regression coverage lives in `tests/phaser-resize.spec.ts`.

## Visual Direction Implemented

The first page uses a compact Uniswap-like centered card while preserving VibeCemetery identity:

- Dark stone background.
- Cinzel typography.
- Gold/red primary CTA.
- Compact centered modal-style card.
- Minimal distractions.
- Desktop and mobile keep `Scan GitHub` visible above the fold.
- Decorative background stripes were removed after review because they looked like visual artifacts.
- The top `VibeCemetery` wordmark is centered and static text on `/`, not a self-link.
- `Enter Cemetery` has a subtle gold glint every 5 seconds, disabled for reduced-motion users.

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
- `src/components/PhaserCanvas.tsx` - guarded Phaser bootstrap and resize observer.
- `src/game/config.ts` - Phaser config uses explicit size with `Scale.NONE`.
- `src/components/modals/BuryFlowModal.tsx` - supports preloaded repo burial or cremation from `/` and split cemetery ritual modes.
- `src/lib/bury-intent.ts` - GitHub auth callback now returns to `/cemetery?modal=bury`.

Coverage:

- `tests/home-entry-flow.spec.ts`
- `tests/bury-intent.spec.ts`
- `tests/mobile.spec.ts`
- `tests/agent-ashes-ui.spec.ts`
- `tests/phaser-resize.spec.ts`

## Current Success Criteria

- A new user sees one obvious primary action: `Scan GitHub`.
- There is no username field suggesting public scan.
- GitHub auth is triggered by the primary CTA.
- Only the connected GitHub account can be scanned.
- Scan results appear before the map.
- The map remains accessible through `Enter Cemetery`.
- CLI Skill plus the split `Bury` / `Cremate` ritual actions stay in the Human map layer; Agent Ashes and Agent Skill no longer compete with the cemetery HUD.
- `/agents` contains only Agent Ashes and Agent Skill entry points, plus a footer link to the human `/bury` CLI Skill installer.
- The cemetery top bar exposes `⌂`, `FAQ`, and `Necropolis` without Agent Ashes.
