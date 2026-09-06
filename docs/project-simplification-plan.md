# Project simplification: graves and GRAVE offerings

Approved direction, 2026-09-06. The user has now authorized committing and pushing the v1 release.

Current release scope: production `/cemetery` only, based on `origin/master` at `6b042f2`. V2 remains on its separate development branch. This release includes no v2 route, assets or map switch. Agent instructions and the helper target v1; the public grave API rejects unpublished map versions. Preserve the production burn amount and transaction recovery protections. See [v1-release.md](v1-release.md) for release verification. Earlier implementation notes below also describe work retained on the development branch.

## Product decisions

- One project memorial: a grave, with the existing epitaph, dates, cause, description, share page and F interactions.
- GitHub scanning and a local coding agent are two entry points. The human approves agent access through GitHub; the agent is not a separate quota owner.
- Keep the current allowance: 4 graves, plus 1 for sharing the first grave. Enforce one account allowance across sources and map versions, transactionally. Existing graves are preserved even if an account already exceeds this allowance.
- A local project needs no public repository or source upload. Its generated project identity prevents retries from creating another grave; local proof cannot establish authenticity against a malicious client.
- No project cremations, urns or automatic fallback when slots run out. The Crematory building becomes the GRAVE offering ledger.
- Necropolis: author, graves, offerings received by that author's graves. Remove Cremated and Total. Only verified burns count, including offerings from wallet-only visitors.
- Remove project cremation actions, totals and references from HUD, chat, profile, homepage, FAQ and current agent instructions.
- Crematory: verified offering total, recent transactions with grave links, and a supply percentage with an explicit denominator. Read on-chain supply; never invent a supply value. Transfers to the burn address do not reduce ERC-20 totalSupply, so distinguish cemetery offerings from network-wide burned balance.

## Stages

1. [x] Shared burial API and schema: allow local sources, GitHub-approved agent auth, server-generated epitaph, atomic account quota, idempotent local requests, valid map slot/GID, exact counter updates. Preserve repository ownership checks for linked GitHub projects.
2. [x] Agent workflow: temporary helper and instructions create graves and return actual grave URLs; use the shared account allowance and preserve privacy rules.
3. [x] Remove project cremation UI and state: one burial flow, no overflow fallback, no urn modal, HUD/profile/chat/sitemap cleanup. Old write endpoint returns 410.
4. [x] Offerings: enable the existing verified burn flow on both maps, add aggregated ledger and received-offering totals, rebuild Crematory and Necropolis.
5. [ ] Database cleanup and documentation: retire cremation RPCs, table and counter; update fresh-install schema, setup and FAQ. Apply database changes only against a verified target after a recoverable export; do not drop unrelated tables or token burn records.
6. [ ] Verification: SQL runtime tests for shared quota and retries, API authentication/eligibility tests, exact burn aggregation and failure states, typecheck/lint, local browser checks. Record completed stages and any deployment prerequisites here.

## Migration order

1. Add the new burial schema/RPC and offering aggregation RPCs.
2. Deploy the application that exclusively uses graves and offerings.
3. Export existing project cremations and apply the isolated retirement migration. The retirement script removes project cremations, not GRAVE offering records.

## Progress

- Baseline: `b28a7f6`; previous suite 499 passed. Actual slot allowance is 4 + 1 social slot, not 5 unconditional.
- Stages 1–4 implemented in the working tree. Both maps now use the same verified offering flow; v2 service building slot 5003 opens the Crematory ledger.
- Stage 5: migrations, fresh schema, current guides and FAQ are ready. The retirement migration was executed twice on a temporary PostgreSQL-compatible database, retaining graves and verified offering totals. RLS hardening also succeeds after retirement, with absent legacy Agent Ash tables.
- Verification after the requested full recheck: 463 unit tests and 7 browser E2E tests passed; TypeScript and production build passed; ESLint has zero errors and one existing warning in scripts/test_v2_final.mjs. Findings, fixes and limits are recorded in [simplification-review.md](simplification-review.md). No real tokens were transferred.
- Browser checks include populated Necropolis with retry recovery, local grave deep links, shared quota, one pending burial, v2 Crematory building interaction and mobile layout, plus simulated wallet offerings on both maps. Live database RPC and populated ledger checks passed after migration; the complete real GitHub approval and agent/API flow remains for application cutover.
- After user authorization, additive migrations were applied through Supabase SQL Editor. The live schema lacked grave_gid and users.updated_at; compatibility was added and tested. Transactional live probes passed and rolled back all fixtures. Grave lists and the offering ledger now return 200 against the connected database. See [supabase-simplification-rollout.md](supabase-simplification-rollout.md).
- Before the requested commit/push, the full 463-test unit suite, 7 browser scenarios, production build and TypeScript passed again. Read-only Supabase checks confirmed the same 9 graves, 9 users, 8 legacy cremations and 4 verified offerings. No local credential values or private environment files were found in the changes selected for publication.
- Remaining: deploy the new application when authorized, smoke-test the complete real GitHub approval and agent/API flow, then export and retire legacy project cremations. The public site is still the old version, so all 8 legacy cremations remain intact. Configure local Base RPC/feature flags if live wallet and supply UI are needed. Keep stages 5 and 6 open until cutover checks and cleanup are complete.
