# Contributing to VibeCemetery

Thanks for your interest in contributing! This project is built by one vibe coder with AI, and any help is welcome.

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [GitHub OAuth App](https://github.com/settings/developers)
- A [GitHub Personal Access Token](https://github.com/settings/tokens) (no special permissions needed)

### Setup

```bash
git clone https://github.com/azkian1/vibecemetery.git
cd vibecemetery
npm install
cp .env.example .env.local
# Fill in your keys in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Assets

The map uses paid tilesets not included in the repo. See [Assets Setup](README.md#assets-setup) in the README for purchase links and placement instructions.

## Development Standards

| Area | Convention |
|------|-----------|
| **Styling** | Inline styles only — no Tailwind, no CSS modules |
| **Colors** | Stone palette (`#1a1918` → `#d4d0c4`), gold accents (`#e8d5a3`) |
| **Font** | Cinzel everywhere (`var(--font-cinzel)`) |
| **Modals** | Always use `StoneFrame` from `src/components/ui/` |
| **Language** | TypeScript strict |
| **UI components** | `src/components/ui/` — reuse before creating new ones |

### Do NOT modify

- `src/game/**` — Phaser scenes, camera, tiles (unless that's your PR's purpose)
- `public/map/az.tmj` — the Tiled map file
- `src/lib/supabase.ts` — Supabase client setup

## Contributing Workflow

1. **Fork** the repository
2. **Create a branch** from `master`: `git checkout -b feat/your-feature`
3. **Read** `Docs/CLAUDE.md` for project structure and conventions
4. **Make your changes** — keep PRs focused and small
5. **Test** that `npm run build` passes with no errors
6. **Commit** with a clear message (see convention below)
7. **Push** and open a Pull Request

## Commit Convention

```
type: short description

Examples:
feat: add resurrection button to GraveModal
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
├── game/             — Phaser 3 (CemeteryScene, config, events)
├── gravedigger/      — NPC character (phrases, templates)
├── lib/              — Supabase, rate limiter, utilities
└── types/            — TypeScript types
```

## Questions?

Open an [issue](https://github.com/azkian1/vibecemetery/issues) — we'll figure it out.
