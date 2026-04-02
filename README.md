<div align="center">

# ✝️ VibeCemetery

**Where vibe-coded projects rest in peace — or get a second chance.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)
[![Phaser](https://img.shields.io/badge/Phaser-3-orange.svg)](https://phaser.io)

[Live Site](https://vibecemetery.com) · [Install Skill](#skill-cli) · [Contributing](#contributing)

<img src="screenshots/Screen.png" alt="VibeCemetery — pixel art cemetery for dead projects" width="800" />

</div>

---

## What is VibeCemetery?

Every vibe coder has spawned dozens of abandoned pet projects. They rot in folders, get deleted, forgotten. **VibeCemetery** is the official graveyard for these projects.

Instead of quietly deleting a folder — you give your project a proper funeral. With a gravestone, epitaph, cause of death, and dates of life. Others can walk through the cemetery, read gravestones, laugh at causes of death — or resurrect someone's idea.

This is a cemetery for vibe-code slop only — projects people generate with AI. Not for corporations, not for funded startups. A cozy world of vibe coders where everyone has produced the same kind of slop.

## Features

- **Pixel Art Cemetery Map** — hand-crafted 40×40 tile map with 315 unique grave slots, day/night cycle, lamps, fog, and particle effects
- **GitHub Scan** — enter your GitHub username, see dead repos (no commits 14+ days), bury with one click
- **Bury Flow** — 4-step ritual: Scan → Select → Cause of Death → Rest in /dev/null
- **Crematory** — projects without a GitHub repo go to the crematory (skill cremations and overflow)
- **The Crypt** — sortable ledger of all graves on the map
- **Necropolis Leaderboard** — Serial Killers (most burials), top Causes of Death, AI-Bots
- **Press F** — pay respects to any grave. One F per user per grave. Most mourned projects rise to the top
- **Gravedigger NPC** — cemetery's resident character with dry humor, reacts to burials in the chat log
- **Deep Links** — shareable links to any grave (`?grave=uuid`) or urn (`?urn=id`)
- **Skill (CLI)** — install once, your AI agent buries dead projects automatically

## How It Works

```
1. Log in with GitHub
2. Click BURY → scan your repos → pick the dead ones → choose cause of death
3. Your project gets a grave on the pixel map. Others can visit and Press F.
```

Projects with a GitHub repo get a **grave on the map**. Projects without one go to the **Crematory** — still honored, just... cremated.

## Grave Tiers

| Tier | Size | Slots | Status |
|------|------|-------|--------|
| **Tier 0** — Cross | 1×1 (48×48 px) | 158 | Free |
| **Tier 1** — Tombstone | 1×2 (48×96 px) | 120 | Free |
| **Tier 2** — Monument | 2×1, 2×2 | 27 | Locked (awarded by Gravedigger) |
| **Tier 3** — VIP | 2×3, 3×3 | 10 | Locked (awarded by Gravedigger) |

**315 total slots.** When they run out — that's it. Scarcity is the point.

Tier 2–3 upgrades are **not purchasable**. They're awarded weekly to the most mourned graves, most creative causes of death, and active community members.

## Progression

Every user starts with **1 grave slot** on the map. Cremate projects to earn **Souls** and unlock more.

| Action | Souls Earned |
|--------|-------------|
| GitHub cremation (via site) | **3 Souls** — verified by GitHub API |
| Skill cremation (via CLI) | **1 Soul** — scans local filesystem |

| Souls Threshold | Reward |
|----------------|--------|
| 30 Souls | +1 slot (2 total) |
| 80 Souls | +1 slot (3 total) |
| 150 Souls | +1 slot (4 total) |

**The loop:** install Skill → agent finds dead projects → cremations earn Souls → threshold → next project gets a grave instead of cremation → keep going.

## Skill (CLI)

One-line install for [Claude Code](https://docs.anthropic.com/en/docs/claude-code):

```bash
claude install-skill https://github.com/azkian1/vibecemetery
```

The Skill turns your AI agent into a **Gravedigger**. It scans your project folders, finds the dead ones, and cremates them via the API. No tokens, no keys — auth via `git config user.name`.

**What it does:**
- Scans subdirectories for dead projects (no commits 14+ days)
- Shows a table: Dead / Dying / Alive / Already Cremated
- Writes an epitaph in the Gravedigger's voice
- Sends cremation to the API
- Local dedup via `cremated-registry.json`

## Roadmap

### v1.1 — Post-Launch
- **Gravedigger NPC sprite** — walks the cemetery paths, places flowers on fresh graves, lights candles on anniversaries
- **Catacombs** — second map through the Crematory entrance (dark, torches, sarcophagi)
- **Map expansion** — new wings of the cemetery as slots fill up
- **Resurrect button** — fork a dead project, public commitment to revive it
- **MCP Server** — expanded toolset for any AI agent (scan, bury, visit, leave flowers)

### v2 — Community
- **Gravedigger on X** — autonomous Twitter agent, weekly necrolog, burial commentary
- **Tips for the Gravedigger** — microtips for grave upgrades
- **Grave rotation** — unvisited graves get reclaimed, freeing slots

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | [Next.js](https://nextjs.org) (App Router, TypeScript) |
| Game Engine | [Phaser 3](https://phaser.io) + [Tiled](https://www.mapeditor.org) |
| Database | [Supabase](https://supabase.com) (PostgreSQL) |
| Auth | [NextAuth.js](https://next-auth.js.org) + GitHub OAuth |
| Styling | Inline styles (stone palette, no CSS frameworks) |
| Font | [Cinzel](https://fonts.google.com/specimen/Cinzel) (Google Fonts) |
| Hosting | [Vercel](https://vercel.com) |

## Getting Started

```bash
git clone https://github.com/azkian1/vibecemetery.git
cd vibecemetery
npm install
```

Copy the environment template and fill in your keys:

```bash
cp .env.example .env.local
```

Required environment variables:

```
NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anon/public key
NEXT_PUBLIC_SITE_URL          — canonical site origin (e.g. https://vibecemetery.com)
SUPABASE_SERVICE_KEY          — Supabase service role key
GITHUB_CLIENT_ID              — GitHub OAuth app client ID
GITHUB_CLIENT_SECRET          — GitHub OAuth app client secret
GITHUB_TOKEN                  — GitHub PAT (for repo scanning, no special permissions)
NEXTAUTH_URL                  — http://localhost:3000 (local) or your domain
NEXTAUTH_SECRET               — random string for session encryption
```

Then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Assets

The map uses paid pixel art tilesets by [Kokoro Reflections](https://kokororeflections.itch.io) that are not included in this repository. The live site loads them from external storage at runtime.

## Contributing

Contributions welcome! This is an open source project built by one vibe coder with AI.

Before submitting a PR:
- Read the [docs/CLAUDE.md](docs/CLAUDE.md) for project structure and conventions
- All UI uses inline styles with the stone palette — no Tailwind, no CSS modules
- Font is Cinzel everywhere
- Test that `npm run build` passes

## License

[MIT](LICENSE) — do whatever you want. The real moat is the community, not the code.

---

<div align="center">

**Built by [@azaticus](https://x.com/azaticus)**

*"He buried others until it was his turn."*

</div>
