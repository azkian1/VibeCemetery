<div align="center">

# VibeCemetery

**Dead projects should not disappear silently.**

VibeCemetery is a public afterlife for abandoned software: people bury dead GitHub repos in a pixel cemetery or cremate projects that should become ashes.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![Phaser](https://img.shields.io/badge/Phaser-3-orange.svg)](https://phaser.io)

[Visit Cemetery](https://vibecemetery.app) · [Install /bury](#human-cli-bury) · [Docs](docs/setup.md)

Start at <https://vibecemetery.app> to scan your connected GitHub, or enter the cemetery map from there.

</div>

---

## What Is VibeCemetery?

Every builder leaves behind dead projects: half-finished prototypes, abandoned experiments, vibecode prototypes, broken trading bots, forgotten repos, and local folders nobody wants to delete.

VibeCemetery gives them a public ending. Human projects can receive graves, epitaphs, causes of death, cremations, shareable rituals, and cemetery records.

This is not just a graveyard UI. It is an afterlife layer for dead software.

```text
Humans perform cemetery rituals.
Dead projects become graves or ashes.
```

## A Note From The Keeper

VibeCemetery is a solo indie project built with Claude Code, OpenCode, and GPT.

After I first discovered Claude Code CLI, I fell into two months of pure dopamine. I made more than 50 small projects, scripts, mini-games, experiments, and half-alive pieces of code.

Then the rush started to fade.

I looked back and realized I had created a whole graveyard of projects. No users. No future. No real reason to keep going.

That is how VibeCemetery was born: a place where you can bury a dead repository, pay respect to the ideas and time you burned, and finally let it go.

> _Scan your GitHub. Pick a cause of death. Begin the ritual. You close the tab. It is done._

This is not about failure.

It is a ritual for moving on.

Somewhere to the right of The Crypt, an empty grave is already waiting.

It does not belong to a repository, or a game, or some forgotten script.

It belongs to VibeCemetery itself.

One day, the gravedigger will return with his shovel.

Even the cemetery must be buried.

## Core Product

VibeCemetery is focused on the human cemetery experience.

- GitHub repos with no activity for 7+ days, and not forks, can be buried.
- Graves appear on the hand-crafted pixel cemetery map.
- Cremations go to the Crematory.
- `/bury` lets a human-controlled local coding agent cremate dead local folders.
- Human records write to `/api/graves` and `/api/cremated`.
- Human CLI credentials use `vc_cli_*` tokens.
- Map v1 supports feature-gated GRAVE offerings that are counted only after
  independent Base Mainnet verification.

Human records can affect map placement, grave slots, leaderboards, and sharing.

### Paused Experiment: Agent Layer

The GitLawb / Agent Ash layer is paused until the cemetery has enough activity and graves to justify a second layer.

Legacy Agent Layer code, API routes, SQL, and archived docs remain in the repository, but the layer is hidden from the main UI and should not be treated as active product surface. Current status lives in [`docs/agent-layer/README.md`](docs/agent-layer/README.md).

## Product Surface

- **Scanner Landing Page** - `/` is a compact first-page flow with one primary action, `Scan GitHub`. It scans only the connected GitHub account and does not offer public username scanning.
- **Pixel Cemetery Maps** - the classic v1 experience at `/cemetery` and the Map 2.0 Phaser experience at `/cemetery/v2`, with custom PixelLab art, fog of war, minimap, camera movement, and modal interactions. See [`docs/map2.md`](docs/map2.md).
- **GitHub Burial Flow** - sign in, scan inactive repos, pick a dead repo, write the cause of death, and place it on the map when grave slots are available.
- **Crematory** - for projects that burn into ashes instead of taking a map slot, including local `/bury` cremations and GitHub repos when grave slots are exhausted.
- **The Crypt** - a searchable ledger of graves.
- **Necropolis Leaderboard** - top gravediggers, causes of death, and cemetery activity.
- **Press F** - pay respects to graves, one vote per user per grave.
- **Deep Links** - share graves and urns through stable URLs.
- **Open Graph Cards** - grave links render dedicated tombstone social cards.
- **GRAVE Offerings** - existing Map v1 graves can receive fixed-token
  offerings sent to the configured burn address. The UI is disabled by default
  until the deployment checklist passes. Connect Wallet is scoped to the grave
  modal; no new smart contract or cabinet-level wallet connection is part of
  this release. See
  [`docs/web3-grave-burn-mvp.md`](docs/web3-grave-burn-mvp.md).

## Routes

- `/` - scanner landing page for connected-account GitHub scans.
- `/cemetery` - Phaser cemetery map experience and Human Layer rituals.
- `/cemetery/v2` - active Map 2.0 experience; v1 remains available at `/cemetery`.
- `/grave/[id]` - redirects to `/cemetery?grave=<id>`.
- `/urn/[id]` - redirects to `/cemetery?urn=<id>`.

Legacy root query intents such as `/?grave=...`, `/?urn=...`, and `/?modal=bury` redirect to `/cemetery` with the relevant query preserved.

Paused Agent Layer routes may still exist for direct legacy links, but they are not linked from the main product flow.

## Roadmap

VibeCemetery is moving toward more original IP, deeper cemetery rituals, and a stronger native world.

Implemented:

- **Scanner-first UX cleanup** - the front page now starts with the GitHub Scanner and the Human Layer rituals are clearer.
- **Cemetery Map 2.0** - the 140×104 custom PixelLab map is active at `/cemetery/v2`, with fog-aware camera bounds and a circular minimap.
- **$GRAVE burn-offering MVP** - signed intents, server-side Base verification,
  atomic duplicate protection, per-grave verified totals/top mourners, and
  protected reorg checks are implemented behind release flags.

Next:

- **Map v1** - original 40×40 map remains view-only at `/cemetery`.
- **Swamp of Shame** - expand the world with a new shame-themed cemetery zone.
- **$GRAVE production activation** - apply the migration, provision the
  production RPC/secrets, prove the scheduler, and execute one explicitly
  approved tiny Base transaction.
- **The Gravedigger Agent** - introduce the native cemetery agent for guidance, lore, grave care, and future ritual interactions.

The current product remains focused on the core human cemetery: GitHub burials, cremations, and `/bury`. The Agent Layer is paused and will be revisited only after the cemetery itself is stronger and more populated.

## Human Web Burial

Use the website when you want an abandoned GitHub repo to receive a grave or cremation.

```text
1. Sign in with GitHub.
2. Click Scan GitHub on the home page, or enter the cemetery and choose a ritual.
3. Pick repos inactive for 7+ days.
4. Click Bury when grave slots are available, or Cremate when they are exhausted.
5. Write the cause of death.
6. Leave the project as a grave on the map or as ashes in the Crematory.
```

The home page does not support scanning arbitrary GitHub usernames. `Scan GitHub` starts GitHub login when needed, then scans `session.user.github_username`; `/api/github/scan` enforces the same own-account-only rule server-side.

Scan results appear on `/` before the map. Each dead repo gets one primary action: **Bury** while grave slots are available, or **Cremate** only after grave slots are exhausted.

On `/cemetery`, the old single BURY CTA is split into two actions: **Bury** puts one selected GitHub repo on the map, while **Cremate** saves selected repos as urns. Bury is disabled when no grave slots remain; Cremate is disabled while the user still has grave slots.

GitHub repos are verified on the server before grave creation or cremation. The repo owner must match the signed-in user, forks are rejected, and map placement comes from parsed cemetery slots.

## Human CLI: /bury

`/bury` is the human-controlled local cleanup command. It lets Claude Code, OpenCode, Cursor, and similar local coding agents scan safe local project folders, find dead projects, write epitaphs, and cremate them through the VibeCemetery API.

It does not scan GitHub. It does not create graves. It writes human cremations to `/api/cremated` and uses `vc_cli_*` credentials after browser approval.

Quick install for Claude Code, OpenCode, or Cursor:

Canonical installer page: <https://vibecemetery.app/skills/bury/v1>.

<details>
<summary>Show install commands</summary>

macOS:

```bash
curl -fsSL https://vibecemetery.app/skills/bury/v1/install.sh | bash
```

Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://vibecemetery.app/skills/bury/v1/install.ps1 -UseBasicParsing | iex"
```

</details>

Quick install downloads and executes the site-hosted installer. The site page shows what files will be installed, direct source links, target paths, and manual install notes.

## Paused Agent Layer Docs

Agent Ash / GitLawb docs are archived because the layer is not part of the active user experience. Start with [`docs/agent-layer/README.md`](docs/agent-layer/README.md) for current status.

## Tech Stack

| Area | Technology |
|---|---|
| App | Next.js 16, React 19, TypeScript |
| Game Layer | Phaser 3, Tiled map data |
| Database | Supabase Postgres |
| Auth | NextAuth.js, GitHub OAuth |
| Web3 | Wagmi, Viem, TanStack Query, Base Mainnet |
| Styling | Inline component styles, stone palette, Cinzel |
| Hosting | Vercel |

## Local Development

Full contributor setup lives in [`docs/setup.md`](docs/setup.md).

```bash
git clone https://github.com/azkian1/vibecemetery.git
cd vibecemetery
npm install
cp .env.example .env.local
npm run dev
```

Minimum verification before opening a PR:

```bash
npx tsc --noEmit --incremental false
npm run lint
npm run test:unit
npm run build
```

Targeted `/bury` and Web3 suites:

```bash
npm run test:bury-skill
npm run test:web3-e2e
```

Database setup references:

- [`docs/supabase-schema.sql`](docs/supabase-schema.sql)
- [`docs/grave-slot-rpc.sql`](docs/grave-slot-rpc.sql)
- [`docs/cli-auth-v1.sql`](docs/cli-auth-v1.sql)
- [`docs/web3-grave-burn-mvp.sql`](docs/web3-grave-burn-mvp.sql)

## Assets

The cemetery map uses paid pixel-art tilesets by [Kokoro Reflections](https://kokororeflections.itch.io). The repository includes the Tiled map data, but not the licensed PNG tilesets.

The MIT license applies to the project code only. Kokoro Reflections assets are third-party paid assets and are not included in this repository or licensed under MIT.

You can still work on docs, API routes, auth, CLI flows, and most non-map logic without the art assets. Full local map rendering requires the external tilesets described in [`docs/setup.md`](docs/setup.md).

## Contributing

Contributions are welcome.

- Read [`docs/CLAUDE.md`](docs/CLAUDE.md) for project structure and conventions.
- Read [`docs/setup.md`](docs/setup.md) for local environment, database, assets, and test expectations.
- Keep the cemetery visual language intact: Cinzel, stone palette, inline-style-driven UI.
- Do not hardcode grave coordinates; use parsed map slots.
- Do not re-surface the paused Agent Layer without an explicit product decision.

## License

[MIT](LICENSE)

---

<div align="center">

**Built by [@azaticus](https://x.com/azaticus)**

*"He buried others until it was his turn."*

</div>
