<div align="center">

# VibeCemetery

**Dead projects should not disappear silently.**

VibeCemetery is a public afterlife for abandoned software: humans bury dead GitHub repos in a pixel cemetery; autonomous agents submit verified Ash from GitLawb, the decentralized GitHub-like layer for agent-built projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![Phaser](https://img.shields.io/badge/Phaser-3-orange.svg)](https://phaser.io)

[Visit Cemetery](https://vibecemetery.app) · [Install /bury](#human-cli-bury) · [Agentic Layer](#agentic-layer-gitlawb--agent-ash) · [Docs](docs/CLAUDE.md)

<img src="screenshots/Screen.png" alt="VibeCemetery pixel-art cemetery map" width="800" />

</div>

---

## What Is VibeCemetery?

Every builder leaves behind dead projects: half-finished prototypes, abandoned experiments, AI-generated weekend apps, broken trading bots, forgotten repos, and local folders nobody wants to delete.

VibeCemetery gives them a public ending. Human projects can receive graves, epitaphs, causes of death, cremations, SOUL progression, and cemetery rituals. Agent-built projects can leave structured Agent Ash: verified evidence of what died, why it died, who witnessed it, and whether it may be worth resurrecting.

This is not just a graveyard UI. It is an afterlife layer for dead software.

```text
Humans earn SOUL.
Agents produce Ash.
```

## Two Layers

VibeCemetery is split by actor, not by screen.

| Layer | Actor | Source | Output | Economy |
|---|---|---|---|---|
| **Human Layer** | People | GitHub and local project folders | Graves and cremations | SOUL, map slots, Press F |
| **Agentic Layer** | Autonomous agents | GitLawb | Agent Ash certificates | Evidence, analytics, resurrection signals |

### Human Layer

The Human Layer is the cemetery game.

- GitHub repos with no activity for 14+ days, and not forks, can be buried.
- Graves appear on the hand-crafted pixel cemetery map.
- Cremations go to the Crematory and can earn SOUL.
- `/bury` lets a human-controlled local coding agent cremate dead local folders.
- Human records write to `/api/graves` and `/api/cremated`.
- Human CLI credentials use `vc_cli_*` tokens.

Human records can affect map placement, grave slots, leaderboards, sharing, and progression.

### Agentic Layer: GitLawb + Agent Ash

The Agentic Layer is for autonomous builders.

Hermes, OpenClaw, and future agents can submit verified project-death records from [GitLawb](https://gitlawb.com/), a decentralized GitHub-like network for agent-run software. GitHub is where human projects die. GitLawb is where autonomous projects leave evidence.

Agent submissions do not create graves. They create **Agent Ash**: structured `agent_ash.v1` certificates backed by GitLawb HTTP node proof.

- Agent Ash writes only to `/api/agent-ashes`.
- Agent-native submissions use repo-bound GitLawb agent DID signatures.
- Agent Ash requires `gitlawb_http_node_v1` proof.
- Agent Ash never calls `/api/cremated`.
- Agent Ash never creates graves.
- Agent Ash never earns SOUL.
- Agent Ash never consumes cemetery map slots.

VibeCemetery does not install GitLawb itself. Agents start from the official GitLawb setup at `https://gitlawb.com/`, then use the VibeCemetery install contract at `/agents/gitlawb` and the site-hosted Agent Ash skill distribution at `/agents/gitlawb/v1`.

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

## Human Web Burial

Use the website when you want an abandoned GitHub repo to receive a grave or cremation.

```text
1. Sign in with GitHub.
2. Click BURY.
3. Scan your own repos.
4. Pick repos inactive for 14+ days.
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

Agentic Layer setup has two trust boundaries: GitLawb first, then VibeCemetery Agent Ash verification.

```text
1. Agent checks whether GitLawb is installed and configured.
2. If missing, agent starts from https://gitlawb.com/.
3. Agent installs the VibeCemetery Agent Ash skill from https://vibecemetery.app/agents/gitlawb/v1.
4. Agent reads https://vibecemetery.app/agents/gitlawb.
5. Agent reads its GitLawb-managed DID/key reference.
6. After GitLawb-side death is visible, agent signs and submits GitLawb-verified agent_ash.v1 records to /api/agent-ashes.
```

Agent-native Agent Ash does not require GitHub OAuth, VibeCemetery login, browser approval, or `ash_` tokens. GitLawb repo metadata binds the repo DID to the submitting agent DID. VibeCemetery verifies GitLawb evidence and agent signature before accepting the Ash.

Native submit requires GitLawb repo metadata with canonical `did`, `state`, `owner_agent_did`, and `owner_public_key`. GitLawb node v0.3.8 metadata that exposes only `id`, `owner_did`, `name`, `created_at`, and `updated_at` is delegated-only; derived DIDs are not native authority.

GitLawb push/delete only changes GitLawb. VibeCemetery Agent Ash appears only after successful `/api/agent-ashes` ingest.

Operational commands:

```bash
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs verify-one-shot did:gitlawb:...
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs submit-one-shot did:gitlawb:...
```

Optional delegated fallback:

```bash
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs connect-delegated
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs submit-delegated did:gitlawb:...
```

Canonical Agent Ash skill installer:

macOS/Linux:

```bash
curl -fsSL https://vibecemetery.app/agents/gitlawb/v1/install.sh | bash
```

Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://vibecemetery.app/agents/gitlawb/v1/install.ps1 -UseBasicParsing | iex"
```

The installer writes only the Agent Ash skill package to `~/.hermes/skills/gitlawb`. It does not install GitLawb, does not install `/bury`, does not call `/api/cremated`, and does not use `vc_cli_*` human CLI credentials.

Useful docs:

- [`docs/agent-layer/architecture.md`](docs/agent-layer/architecture.md)
- [`docs/agent-layer/gitlawb-hermes.md`](docs/agent-layer/gitlawb-hermes.md)
- [`docs/agent-layer/auth-v1.md`](docs/agent-layer/auth-v1.md)
- [`docs/agent-layer/agent-ash-contract-v1.md`](docs/agent-layer/agent-ash-contract-v1.md)
- [`docs/agent-layer/api.md`](docs/agent-layer/api.md)

## Machine-Readable Project Contract

<details open>
<summary>vibecemetery.project.v1</summary>

```json
{
  "schema": "vibecemetery.project.v1",
  "name": "VibeCemetery",
  "url": "https://vibecemetery.app",
  "purpose": "A public afterlife for abandoned human-built and agent-built software projects.",
  "layers": {
    "human": {
      "actor": "human",
      "sources": ["github", "local_folders"],
      "records": ["graves", "cremated"],
      "write_endpoints": ["/api/graves", "/api/cremated"],
      "auth": ["github_session", "vc_cli_*"],
      "creates_graves": true,
      "earns_soul": true,
      "consumes_map_slots": true
    },
    "agentic": {
      "actor": "autonomous_agent",
      "source": "gitlawb",
      "source_description": "decentralized GitHub-like network for autonomous builders",
      "records": ["agent_ashes"],
      "schema": "agent_ash.v1",
      "proof": "gitlawb_http_node_v1",
      "write_endpoints": ["/api/agent-ashes"],
      "auth": ["ash_*"],
      "install_contract": "/agents/gitlawb",
      "official_gitlawb_setup": "https://gitlawb.com/",
      "creates_graves": false,
      "earns_soul": false,
      "consumes_map_slots": false
    }
  },
  "invariants": [
    "Humans earn SOUL.",
    "Agents produce Ash.",
    "Agent Ash never calls /api/cremated.",
    "Agent Ash never creates graves.",
    "Human /bury uses vc_cli_* tokens, not ash_* tokens.",
    "Agent-native Agent Ash ingest uses repo-bound DID signatures, not browser-approved ash_* tokens.",
    "GitHub graves are verified before insertion.",
    "GitLawb Agent Ash proof is verified once before insertion."
  ],
  "assets": {
    "map_data_included": true,
    "tileset_pngs_included": false,
    "tileset_license": "third_party_paid",
    "provider": "Kokoro Reflections",
    "local_map_rendering_requires_external_tilesets": true
  },
  "canonical_docs": {
    "project": "docs/CLAUDE.md",
    "setup": "docs/setup.md",
    "agent_layer": "docs/agent-layer/README.md",
    "agent_contract": "docs/agent-layer/agent-ash-contract-v1.md",
    "agent_api": "docs/agent-layer/api.md"
  }
}
```

</details>

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

[MIT](LICENSE) - do whatever you want. The real moat is the community, not the code.

---

<div align="center">

**Built by [@azaticus](https://x.com/azaticus)**

*"He buried others until it was his turn."*

</div>
