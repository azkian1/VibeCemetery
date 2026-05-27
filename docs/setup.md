# Local Setup

This document is the contributor-facing setup source of truth. Use it together with `.env.example`, `docs/supabase-schema.sql`, `docs/grave-slot-rpc.sql`, `docs/cli-auth-v1.sql`, and `docs/agent-layer/migrations/agent-ash-auth-v1.sql`.

## What You Need

- Node.js 20+
- npm
- A Supabase project
- A GitHub OAuth App
- A GitHub personal access token for repo scan requests

## 1. Install Dependencies

```bash
git clone https://github.com/azkian1/vibecemetery.git
cd vibecemetery
npm install
```

## 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in every required value.

```bash
cp .env.example .env.local
```

Required local values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_KEY`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_TOKEN`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

Required for CLI and Agent Layer flows:

- `CLI_TOKEN_SECRET`
- `AGENT_ASH_TOKEN_SECRET`
- `GITLAWB_ALLOWED_NODE_URLS`

Recommended:

- Use a dedicated `CLI_TOKEN_SECRET` instead of relying on `NEXTAUTH_SECRET` for long-lived CLI tokens.
- Use a dedicated server-only `AGENT_ASH_TOKEN_SECRET`; Agent Ash auth must not fall back to `NEXTAUTH_SECRET` in production.

Optional production-only rate limiting:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `TRUST_PROXY_HEADERS` for non-Vercel deployments only when the trusted proxy strips spoofed forwarding headers

## 3. Bootstrap Supabase

Apply the schema file first:

```sql
-- run in Supabase SQL editor
docs/supabase-schema.sql
```

Then apply the atomic grave slot RPC:

```sql
-- run after the base schema
docs/grave-slot-rpc.sql
```

Then apply the CLI auth hardening migration:

```sql
-- run after the grave slot RPC
docs/cli-auth-v1.sql
```

If enabling Agent Layer submissions, also apply the Agent Ash auth migration:

```sql
-- run after the base Agent Layer schema exists
docs/agent-layer/migrations/agent-ash-auth-v1.sql
```

The app expects these tables and functions to exist:

- `users`
- `graves`
- `cremated`
- `f_votes`
- `cli_link_sessions`
- `cli_tokens`
- `agent_ashes`
- `agent_ash_link_sessions`
- `agent_ash_tokens`
- `increment_graves_count(username text)`
- `increment_cremated_count(username text)`
- `insert_grave_if_user_slot_available(...)`

## 4. Configure GitHub OAuth

Create a GitHub OAuth App and add these callback URLs:

- Local: `http://localhost:3000/api/auth/callback/github`
- Production: `https://your-domain/api/auth/callback/github`

The scan endpoint only allows a signed-in user to scan their own GitHub username.

## 5. Understand Asset Requirements

The repository includes the Tiled map JSON, but it does not include the paid Kokoro Reflections PNG tilesets.

Local behavior:

- If `NEXT_PUBLIC_SUPABASE_URL` is set, Phaser loads tilesets from Supabase Storage.
- If the storage bucket or files are missing, the map will fail to render and the UI will show the load error state.
- There is currently no bundled placeholder art mode in the repo.

If you only need to work on API routes, auth, CLI flows, or documentation, the missing tilesets are not a blocker.

## 6. Run The App

```bash
npm run dev
```

Open `http://localhost:3000`. The root route is the scanner landing page; the Phaser map lives at `http://localhost:3000/cemetery`.

## 7. Verification Commands

Minimum checks before opening a PR:

```bash
npm run lint
npm run build
```

Additional targeted suite:

```bash
npm run test:bury-skill
```

Notes:

- `npm run test:bury-skill` is the only dedicated test script exposed in `package.json` right now.
- Additional Playwright specs exist in `tests/`, but some require a running local app, valid Supabase credentials, seeded data, or authenticated flows.
- `tests/api-smoke.spec.ts` writes to Supabase and should be treated as integration coverage, not a safe offline smoke test.

## Troubleshooting

### Blank or broken map

Check that your Supabase project exposes the tileset PNG files expected by `src/game/scenes/CemeteryScene.ts`.

### Auth fails immediately on boot

Check `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET`.

### CLI token flows fail

Make sure both SQL files were applied and set `CLI_TOKEN_SECRET`.

### Agent Ash token flows fail

Make sure `docs/agent-layer/migrations/agent-ash-auth-v1.sql` was applied and set `AGENT_ASH_TOKEN_SECRET` plus `GITLAWB_ALLOWED_NODE_URLS`.
