# Unified burial release

The only project memorial is a grave. Browser GitHub scanning and GitHub-approved local agents share 4 account slots plus 1 earned by sharing a grave, across map versions. Existing graves are preserved. The server owns epitaph generation and slot assignment; local requests use a private stable project_key for retries. This hash is never returned by public grave APIs.

## Additive migrations before deployment

For an existing database apply, in order:

1. Existing map migrations: map-v2-migration.sql, then map-v2-grave-gid.sql (if not already applied).
2. Existing web3-grave-burn-mvp.sql and CLI auth migrations (if not already applied).
3. unified-burials.sql — nullable GitHub identity for local projects, source and project_key columns, account-wide atomic create_grave_once RPC.
4. offering-ledger.sql — exact verified aggregates and a recent transaction ledger.

Fresh databases start with supabase-schema.sql, which already includes unified burial and offering functions. Do not replay historical slot RPC migrations after applying the current migrations.

## Application cutover

Deploy the application after the additive migrations. Check a GitHub-approved local burial, the account allowance, a replay, and a browser GitHub burial against the same allowance. Both should get a normal epitaph and /grave/UUID link opening the correct map. The local helper is src/agent/burial-helper.mjs, publicly served from /agent-instructions/helper.mjs.

Project cremation endpoints return 410 and legacy urn pages return 404. They do not call the database. There is no automatic alternative when grave slots run out.

## Destructive cleanup after cutover

Export public.cremated before running retire-project-cremations.sql and keep the export outside the public assets and repository. Verify the target database and row count. The retirement script drops only the project cremation table, its counter/RPCs and obsolete grave insert RPC overloads. It uses no CASCADE; unexpected dependencies stop the transaction. Grave records and GRAVE burn records are retained.

The application update does not itself execute this destructive migration. Remote schema changes need PostgreSQL/SQL editor access; a Supabase service API key alone is not a SQL connection.

## Offering accounting

Only grave_burns rows with status verified count. Necropolis sums offerings received by each author's graves, including visitors without GitHub, across both maps. This is not an author spending leaderboard.

The Crematory lists the latest 50 verified transactions; its total includes every verified transaction. The supply bar reads totalSupply and balanceOf(the fixed burn address) from the same Base block. It measures the share of current on-chain supply at that address, including transfers outside VibeCemetery. Dead-address transfers do not lower ERC-20 totalSupply. If RPC is unavailable, the bar is unavailable, never 0% by assumption.

The existing WEB3_GRAVE_BURNS_ENABLED, NEXT_PUBLIC_WEB3_GRAVE_BURNS_ENABLED and BASE_RPC_URL configuration still applies. This release supports the verified burn flow on v1, including the existing recovery and minimum-amount protections. All burns remain voluntary wallet-confirmed transfers; no new treasury, reward or token contract is introduced.

## Checks

- npm run test:unit
- npx tsc --noEmit
- npm run lint
- Browser: home, the v1 map, agent instructions, profile, Necropolis, Crematory, grave links and no-slot state.
- SQL: mixed-source account quota, retries at quota, collision rollback, restricted RPC permissions, exact token amounts and cleanup preserving burn records.
