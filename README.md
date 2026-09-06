<div align="center">

# VibeCemetery

**Dead projects should not disappear silently.**

VibeCemetery is a public afterlife for abandoned software: people bury abandoned GitHub and local projects in a shared pixel cemetery.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![Phaser](https://img.shields.io/badge/Phaser-3-orange.svg)](https://phaser.io)

[Visit Cemetery](https://vibecemetery.app) · [Instructions for AI agents](https://vibecemetery.app/agent-instructions) · [Docs](docs/setup.md)

Start at <https://vibecemetery.app> to scan your connected GitHub, or enter the cemetery map from there.

</div>

---

## What Is VibeCemetery?

Every builder leaves behind dead projects: half-finished prototypes, abandoned experiments, vibecode prototypes, broken trading bots, forgotten repos, and local folders nobody wants to delete.

VibeCemetery gives them a public ending. Human projects can receive graves, epitaphs, causes of death, shareable rituals, and cemetery records.

This is not just a graveyard UI. It is an afterlife layer for dead software.

```text
Humans perform cemetery rituals.
Dead projects become graves.
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
- Every project memorial is a grave; token offerings are recorded in the Crematory.
- The agent instructions let a human-controlled local coding agent bury abandoned local projects.
- Human records write to `/api/graves`.
- Human CLI credentials use `vc_cli_*` tokens.
- The v1 cemetery supports feature-gated GRAVE offerings that are counted only after
  independent Base Mainnet verification.

Human records can affect map placement, grave slots, leaderboards, and sharing.

### Paused Experiment: Agent Layer

The GitLawb / Agent Ash layer is paused until the cemetery has enough activity and graves to justify a second layer.

Legacy Agent Layer code, API routes, SQL, and archived docs remain in the repository, but the layer is hidden from the main UI and should not be treated as active product surface. Current status lives in [`docs/agent-layer/README.md`](docs/agent-layer/README.md).

## Product Surface

The released map is `/cemetery`. Map v2 remains in a separate development branch.

- **Scanner Landing Page** - `/` is a compact first-page flow with one primary action, `Scan GitHub`. It scans only the connected GitHub account and does not offer public username scanning.
- **GitHub Burial Flow** - sign in, scan inactive repos, pick a dead repo, write the cause of death, and place it on the map when grave slots are available.
- **Crematory** - verified GRAVE offerings, transaction history and an on-chain burn-address supply bar.
- **The Crypt** - a searchable ledger of graves.
- **Necropolis Leaderboard** - top gravediggers, causes of death, and cemetery activity.
- **Press F** - pay respects to graves, one vote per user per grave.
- **Deep Links** - share graves through stable URLs.
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
- `/grave/[id]` - redirects to `/cemetery?grave=<id>`.
- `/agent-instructions` - local agent burial workflow; no installation required.

Legacy root query intents such as `/?grave=...` and `/?modal=bury` redirect to `/cemetery` with the relevant query preserved.

Paused Agent Layer routes may still exist for direct legacy links, but they are not linked from the main product flow.

## Roadmap

VibeCemetery is moving toward more original IP, deeper cemetery rituals, and a stronger native world.

Implemented:

- **Scanner-first UX cleanup** - the front page now starts with the GitHub Scanner and the Human Layer rituals are clearer.
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

The current product remains focused on the core human cemetery: GitHub and local project burials. The Agent Layer is paused and will be revisited only after the cemetery itself is stronger and more populated.

## Human Web Burial

Use the website to scan your GitHub repositories and bury one eligible project. Confirm its cause of death; the server creates an epitaph and places a grave on the map.

GitHub repositories must be owned by the connected account, not be forks, contain a project and have no pushes for at least 7 days. Each account has 4 grave slots, plus 1 for sharing a grave. The allowance is shared across project sources and maps. At the limit, new burials are disabled.

## Local projects with AI agents

Give your coding agent [vibecemetery.app](https://vibecemetery.app) and tell it which project you want to bury. The home page links to [Instructions for AI agents](https://vibecemetery.app/agent-instructions), also available as [plain Markdown](https://vibecemetery.app/agent-instructions.md).

The agent reads the instructions, downloads a temporary Node helper, inspects the selected project, and asks you to confirm the public burial details. Browser approval links the request to your GitHub account. The project stays on your computer or VPS; burial creates a normal map grave without uploading source code or deleting local files.

See [the simplification plan](docs/project-simplification-plan.md) and [migration/cutover guide](docs/unified-burial-setup.md).

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

Targeted agent helper and Web3 suites:

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
