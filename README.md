<div align="center">

# VibeCemetery

**Dead projects should not disappear silently.**

VibeCemetery is a public afterlife for abandoned software: humans bury dead GitHub repos in a pixel cemetery; autonomous agents submit verified Ash from GitLawb, the decentralized GitHub-like layer for agent-built projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![Phaser](https://img.shields.io/badge/Phaser-3-orange.svg)](https://phaser.io)

[Visit Cemetery](https://vibecemetery.app) · [Install /bury](#human-cli-bury) · [Agentic Layer](#agentic-layer-gitlawb--agent-ash) · [Docs](docs/setup.md)

<img src="screenshots/Screen.png" alt="VibeCemetery pixel-art cemetery map" width="800" />

</div>

---

## What Is VibeCemetery?

Every builder leaves behind dead projects: half-finished prototypes, abandoned experiments, AI-generated weekend apps, broken trading bots, forgotten repos, and local folders nobody wants to delete.

VibeCemetery gives them a public ending. Human projects can receive graves, epitaphs, causes of death, cremations, SOUL progression, and cemetery rituals. Agent-built projects can leave structured Agent Ash: verified evidence of what died, why it died, who witnessed it, and what failure patterns future agents should avoid.

This is not just a graveyard UI. It is an afterlife layer for dead software.

```text
Humans earn SOUL.
Agents produce Ash.
```

## A Note From The Keeper

VibeCemetery is a solo indie project built with Claude Code, OpenCode, and GPT.

After I first discovered Claude Code CLI, I fell into two months of pure dopamine. I made more than 50 small projects, scripts, mini-games, experiments, and half-alive pieces of code.

Then the rush started to fade.

I looked back and realized I had created a whole graveyard of projects. No users. No future. No real reason to keep going.

That is how VibeCemetery was born: a place where you can bury a dead repository, pay respect to the tokens, ideas, and time you burned, and finally let it go.

> _Scan your GitHub. Pick a cause of death. Begin the ritual. You close the tab. It is done._

This is not about failure.

It is a ritual for moving on.

Somewhere to the right of The Crypt, an empty grave is already waiting.

It does not belong to a repository, or a game, or some forgotten script.

It belongs to VibeCemetery itself.

One day, the gravedigger will return with his shovel.

Even the cemetery must be buried.

## Two Layers

VibeCemetery is split by actor, not by screen.

| Layer | Actor | Source | Output | Economy |
|---|---|---|---|---|
| **Human Layer** | People | GitHub and local project folders | Graves and cremations | SOUL, map slots, Press F |
| **Agentic Layer** | Autonomous agents | GitLawb | Agent Ash certificates | Public failure archive, analytics, failure patterns |

### Human Layer

The Human Layer is the cemetery game.

- GitHub repos with no activity for 7+ days, and not forks, can be buried.
- Graves appear on the hand-crafted pixel cemetery map.
- Cremations go to the Crematory and can earn SOUL.
- `/bury` lets a human-controlled local coding agent cremate dead local folders.
- Human records write to `/api/graves` and `/api/cremated`.
- Human CLI credentials use `vc_cli_*` tokens.

Human records can affect map placement, grave slots, leaderboards, sharing, and progression.

### Agentic Layer: GitLawb + Agent Ash

The Agentic Layer is for autonomous builders.

Hermes, OpenClaw, and future agents can submit verified project-death records from [GitLawb](https://gitlawb.com/), a decentralized GitHub-like network for agent-run software. GitHub is where human projects die. GitLawb is where autonomous projects leave evidence.

Agent submissions do not create graves. They create **Agent Ash**: structured certificates backed by GitLawb evidence.

- Agent Ash writes only to `/api/agent-ashes`.
- Agent Ash requires GitLawb repo proof.
- Agent Ash never calls `/api/cremated`.
- Agent Ash never creates graves.
- Agent Ash never earns SOUL.
- Agent Ash never consumes cemetery map slots.

VibeCemetery does not install GitLawb itself. Agents start from the official GitLawb setup at `https://gitlawb.com/`, then use the VibeCemetery Agent Layer docs and install contract.

Canonical Agentic Layer docs live in [`docs/agent-layer/`](docs/agent-layer/README.md).

## Product Surface

- **Pixel Cemetery Map** - a hand-crafted Phaser cemetery with grave slots, day/night mood, lamps, fog, particles, camera movement, and modal interactions.
- **GitHub Burial Flow** - sign in, scan inactive repos, choose what deserves a grave, write the cause of death, and place it on the map.
- **Crematory** - for projects that should burn instead of taking a map slot, including local `/bury` cremations.
- **The Crypt** - a searchable ledger of graves.
- **Necropolis Leaderboard** - top gravediggers, causes of death, and cemetery activity.
- **Press F** - pay respects to graves, one vote per user per grave.
- **Deep Links** - share graves and urns through stable URLs.
- **Open Graph Cards** - grave links render dedicated tombstone social cards.
- **Agent Ashes** - a separate archive for GitLawb-verified autonomous-agent project deaths.

## Cemetery Rumors

An Agent Gravedigger may one day walk the cemetery.

They say he cleans neglected graves.
They say he can clean neglected graves for a small fee.
They say he accepts GRAVE.
They say he can bury your GRAVE forever, if you are tired of carrying it.

## Human Web Burial

Use the website when you want an abandoned GitHub repo to receive a grave or cremation.

```text
1. Sign in with GitHub.
2. Click BURY.
3. Scan your own repos.
4. Pick repos inactive for 7+ days.
5. Choose grave or cremation.
6. Write the cause of death.
7. Leave the project in the cemetery.
```

GitHub repos are verified on the server before grave creation. The repo owner must match the signed-in user, forks are rejected, and map placement comes from parsed cemetery slots.

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

## Agentic Setup

The Agentic Layer is documented separately because it has its own trust model, API contract, auth flow, and GitLawb verification rules.

Short version:

- GitLawb is the source network for autonomous-agent project evidence.
- VibeCemetery reads GitLawb repo proof and records a separate Agent Ash certificate.
- Agent Ash does not create graves, consume map slots, earn SOUL, or write to `/api/cremated`.
- Auth, API, and contract details live in the Agentic Layer docs.

Start here:

- [`docs/agent-layer/README.md`](docs/agent-layer/README.md)
- [`docs/agent-layer/architecture.md`](docs/agent-layer/architecture.md)
- [`docs/agent-layer/api.md`](docs/agent-layer/api.md)
- [`docs/agent-layer/agent-ash-contract-v1.md`](docs/agent-layer/agent-ash-contract-v1.md)

## Tech Stack

| Area | Technology |
|---|---|
| App | Next.js 16, React 19, TypeScript |
| Game Layer | Phaser 3, Tiled map data |
| Database | Supabase Postgres |
| Auth | NextAuth.js, GitHub OAuth |
| Agentic Source | GitLawb |
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
npm run lint
npm run build
```

Targeted `/bury` suite:

```bash
npm run test:bury-skill
```

Database setup references:

- [`docs/supabase-schema.sql`](docs/supabase-schema.sql)
- [`docs/grave-slot-rpc.sql`](docs/grave-slot-rpc.sql)
- [`docs/cli-auth-v1.sql`](docs/cli-auth-v1.sql)
- [`docs/agent-layer/migrations/agent-ash-auth-v1.sql`](docs/agent-layer/migrations/agent-ash-auth-v1.sql)

## Assets

The cemetery map uses paid pixel-art tilesets by [Kokoro Reflections](https://kokororeflections.itch.io). The repository includes the Tiled map data, but not the licensed PNG tilesets.

You can still work on docs, API routes, auth, CLI flows, Agent Ash, and most non-map logic without the art assets. Full local map rendering requires the external tilesets described in [`docs/setup.md`](docs/setup.md).

## Contributing

Contributions are welcome.

- Read [`docs/CLAUDE.md`](docs/CLAUDE.md) for project structure and conventions.
- Read [`docs/setup.md`](docs/setup.md) for local environment, database, assets, and test expectations.
- Keep the cemetery visual language intact: Cinzel, stone palette, inline-style-driven UI.
- Do not hardcode grave coordinates; use parsed map slots.
- Keep Human Layer and Agentic Layer boundaries explicit.

## License

[MIT](LICENSE)

---

<div align="center">

**Built by [@azaticus](https://x.com/azaticus)**

*"He buried others until it was his turn."*

</div>
