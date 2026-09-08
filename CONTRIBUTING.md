# Contributing to VibeCemetery

Thanks for your interest in contributing! This project is built by one vibe coder with AI, and any help is welcome.

## Getting Started

### Prerequisites

- Node.js 22.18+ (including the map tooling's TypeScript support)
- A [Supabase](https://supabase.com) project
- A [GitHub OAuth App](https://github.com/settings/developers)
- A [GitHub Personal Access Token](https://github.com/settings/tokens) (no special permissions needed)

### Setup

```bash
git clone https://github.com/azkian1/vibecemetery.git
cd vibecemetery
npm ci
cp .env.example .env.local
# Fill in your keys in .env.local, then apply docs/supabase-schema.sql
# and docs/cli-auth-v1.sql in Supabase.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Canonical setup reference: [docs/setup.md](docs/setup.md)

### Assets

The map uses the committed `public/map/cemetery-v2.tmj` and PNG assets served by the application. No Storage setup is required for map images. See [Published assets](docs/map2.md#published-assets) for runtime details.

## Development Standards

| Area | Convention |
|------|-----------|
| **Styling** | Inline styles for component UI; `src/app/globals.css` for app-wide base styles |
| **Colors** | Stone palette (`#1a1918` → `#d4d0c4`), gold accents (`#e8d5a3`) |
| **Font** | Cinzel everywhere (`var(--font-cinzel)`) |
| **Modals** | Always use `StoneFrame` from `src/components/ui/` |
| **Language** | TypeScript strict |
| **UI components** | `src/components/ui/` — reuse before creating new ones |

### Do NOT modify

- `src/game/**` — Phaser scenes, camera, tiles (unless that's your PR's purpose)
- `public/map/cemetery-v2.tmj` — the Tiled map file
- `src/lib/supabase.ts` — Supabase client setup

## Contributing Workflow

1. **Fork** the repository
2. **Create a branch** from the default branch: `git checkout -b feat/your-feature`
3. **Read** `docs/CLAUDE.md` for project structure and conventions
4. **Read** `docs/setup.md` for database, asset, and test expectations
5. **Make your changes** — keep PRs focused and small
6. **Test** `npm run lint` and `npm run build`
7. **Run** `npm run test:bury-skill` when your changes touch `/agent-instructions`, the burial helper or CLI auth; use `test:v2-runtime` and `test:web3-e2e` for map/UI changes
8. **Avoid** integration specs that write to Supabase unless you intentionally configured a safe test project
9. **Commit** with a clear message (see convention below)
10. **Push** and open a Pull Request

## Commit Convention

```
type: short description

Examples:
feat: add share button to GraveModal
fix: tooltip position on mobile
docs: update README with new env vars
style: align ChatLog colors to stone palette
refactor: extract ProgressBar from ProfileModal
```

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `style` | Visual/CSS changes only |
| `refactor` | Code restructure, no behavior change |
| `docs` | Documentation only |
| `chore` | Config, dependencies, tooling |

## Project Structure

```
src/
├── app/              — pages + API routes (Next.js App Router)
├── components/
│   ├── hud/          — HUD overlay (TopBar, ChatLog, CTAButtons, Minimap)
│   ├── modals/       — all modal dialogs (GraveModal, BuryFlowModal, etc.)
│   └── ui/           — shared stone-styled components (StoneFrame, StoneButton)
├── context/          — GameContext (global state)
├── game/             — Phaser 3 (CemeterySceneV2, config-v2, events)
├── gravedigger/      — NPC character (phrases, templates)
├── lib/              — Supabase, rate limiter, utilities
└── types/            — TypeScript types
```

## Questions?

Open an [issue](https://github.com/azkian1/vibecemetery/issues) — we'll figure it out.
