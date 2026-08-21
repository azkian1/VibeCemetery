# Local Setup

This document is the contributor-facing setup source of truth. Use it together
with `.env.example`, `docs/supabase-schema.sql`, `docs/grave-slot-rpc.sql`,
`docs/cli-auth-v1.sql`, and `docs/web3-grave-burn-mvp.md`.

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

Required for CLI flows:

- `CLI_TOKEN_SECRET`

Recommended:

- Use a dedicated `CLI_TOKEN_SECRET` instead of relying on `NEXTAUTH_SECRET` for long-lived CLI tokens.
- The paused Agent Layer has archived env notes in `docs/agent-layer-archive/operations.md`; those variables are not required for normal local setup.

Optional production-only rate limiting:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `TRUST_PROXY_HEADERS` for non-Vercel deployments only when the trusted proxy strips spoofed forwarding headers

Required only when enabling Map v1 Web3 grave offerings:

- `WEB3_GRAVE_BURNS_ENABLED=true` — authoritative server write flag
- `NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED=true` — Map v1 UI flag
- `BASE_RPC_URL` — private or authenticated HTTPS Base Mainnet RPC
- `GRAVE_BURN_REVERIFY_SECRET` — bearer secret for manual/external reverify
- `CRON_SECRET` — bearer secret sent by Vercel Cron; it may use the same value
  as `GRAVE_BURN_REVERIFY_SECRET`

Optional Web3 browser read transport:

- `NEXT_PUBLIC_BASE_READ_RPC_URL` — browser-safe HTTPS RPC whose origin is
  added to CSP; when omitted, contract reads use the injected wallet provider

Keep both Web3 flags `false` until the release checklist in
`docs/web3-grave-burn-mvp.md` passes. Never put `BASE_RPC_URL`,
`GRAVE_BURN_REVERIFY_SECRET`, or `CRON_SECRET` in a `NEXT_PUBLIC_*` variable.

The Map v1 burn release deploys the Next.js application, Supabase migration,
environment variables, and the existing `vercel.json` reverify schedule. It
does **not** deploy a new smart contract: the grave modal calls `transfer` on
the existing GRAVE ERC-20 only after a signed server intent is authorized.
Connect Wallet is shown inside that grave offering panel; no wallet connection
is added to the profile/cabinet or global navigation in this release.

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

For an existing database that predates Web3 grave offerings, apply the
idempotent Web3 migration:

```sql
-- run after the map-version migration
docs/web3-grave-burn-mvp.sql
```

A fresh database created from the current `docs/supabase-schema.sql` already
contains the Web3 tables and functions. Re-running the standalone Web3
migration is safe and is recommended when upgrading an existing environment.

Finally, apply the mandatory RLS hardening migration to the external Supabase
project. It is idempotent and also protects tables created by earlier schema
versions:

```sql
-- run after every base/optional application schema migration
docs/supabase-rls-hardening.sql
```

The app reads and writes these records only through its server-side API using
`SUPABASE_SERVICE_KEY`. Do not create browser `anon` or `authenticated` table
policies unless a new client-side data path has received a separate security
review.

The app expects these tables and functions to exist:

- `users`
- `graves`
- `cremated`
- `f_votes`
- `cli_link_sessions`
- `cli_tokens`
- `increment_graves_count(username text)`
- `increment_cremated_count(username text)`
- `insert_grave_if_user_slot_available(...)`

When Web3 grave offerings are enabled, the app additionally expects:

- `grave_burn_intents`
- `grave_burns`
- `expire_grave_burn_intent(...)`
- `authorize_grave_burn_intent(...)`
- `bind_grave_burn(...)`
- `reverify_grave_burn(...)`
- `get_grave_burn_stats(uuid)`

The paused Agent Layer tables may still exist in production or local schemas for legacy compatibility, but they are not needed for the main cemetery flow.

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

Open `http://localhost:3000`. The root route is the scanner landing page. The
classic Phaser map and its optional grave-offering UI live at
`http://localhost:3000/cemetery`; Cemetery Map 2.0 lives at
`http://localhost:3000/cemetery/v2`.

## 7. Verification Commands

Minimum checks before opening a PR:

```bash
npx tsc --noEmit --incremental false
npm run lint
npm run test:unit
npm run build
```

Additional targeted suites:

```bash
npm run test:bury-skill
npm run test:web3-e2e
```

Notes:

- `npm run test:unit` is hermetic and excludes browser/integration specs.
- `npm run test:web3-e2e` uses a fake injected wallet and intercepted burn APIs;
  it starts its own server on port `3010` and transfers no real token value.
- `npm run test:e2e` runs the broader browser/integration suite and intentionally
  excludes the special Web3 fixture.
- Additional Playwright specs exist in `tests/`; some require valid Supabase
  credentials, seeded data, or authenticated flows.
- `tests/api-smoke.spec.ts` writes to Supabase and should be treated as integration coverage, not a safe offline smoke test.

## Troubleshooting

### Blank or broken map

Check that your Supabase project exposes the tileset PNG files expected by `src/game/scenes/CemeteryScene.ts`.

### Auth fails immediately on boot

Check `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET`.

### CLI token flows fail

Make sure the base schema, grave-slot RPC, and CLI auth migration were applied,
then set `CLI_TOKEN_SECRET`.

### Web3 panel is absent

Confirm that the page is `/cemetery`, the selected grave belongs to map
version `v1`, and `NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED=true` was present when
the Next.js process started.

### Web3 writes return 503

The server fails closed unless `WEB3_GRAVE_BURNS_ENABLED=true` and
`BASE_RPC_URL` is a valid HTTPS URL (localhost HTTP is accepted only for local
testing). Confirm that the RPC reports Base Mainnet chain ID `8453`.

### Pending burns do not advance

Verify `CRON_SECRET`/`GRAVE_BURN_REVERIFY_SECRET`, the Vercel Cron deployment,
and the protected `/api/internal/grave-burns/reverify` invocation. An RPC
timeout is intentionally retained as retryable state; only a confirmed block
hash mismatch marks a burn `orphaned`.
