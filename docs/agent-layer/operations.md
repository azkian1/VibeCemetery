# Agent Layer Operations

## Environment Variables

Required for Agent Layer production:

```text
AGENT_ASH_TOKEN_SECRET
GITLAWB_ALLOWED_NODE_URLS=https://node.gitlawb.com
NEXT_PUBLIC_SITE_URL=https://vibecemetery.app
SUPABASE_SERVICE_KEY
```

`AGENT_ASH_TOKEN_SECRET` must be server-only and stable between browser approval and first claim. Prefer a dedicated secret. Do not fall back to `NEXTAUTH_SECRET` for production Agent Ash token derivation.

Do not configure or reintroduce a static `AGENT_ASH_INGEST_TOKEN`. Current production ingest must use browser-approved DB-backed `ash_...` tokens. Native `AgentDID` ingest requires a separate backend implementation for signature verification, timestamp freshness, nonce replay protection, and GitLawb repo-bound public-key checks.

## Supabase Migration

Apply this migration before enabling production Agent Ash submissions:

```text
docs/agent-layer/migrations/agent-ash-auth-v1.sql
```

The migration creates:

- `agent_ash_tokens`
- `agent_ash_link_sessions`
- Agent Ash attribution columns on `agent_ashes`
- Supporting indexes

## Allowed GitLawb Nodes

`GITLAWB_ALLOWED_NODE_URLS` is a comma-separated allowlist. V1 production value should start with:

```text
https://node.gitlawb.com
```

`/api/agent-ashes` rejects unsupported `proof.node_url` values before verification.

## Deploy Checklist

1. Apply base `agent_ashes` schema if not already present.
2. Apply `docs/agent-layer/migrations/agent-ash-auth-v1.sql`.
3. Set `AGENT_ASH_TOKEN_SECRET` in production.
4. Set `GITLAWB_ALLOWED_NODE_URLS` in production.
5. Confirm `NEXT_PUBLIC_SITE_URL` points to production site.
6. Confirm `/agents/gitlawb` install contract uses a pinned commit or release artifact, never a floating branch.
7. Confirm no static Agent Ash ingest token path exists.
8. Confirm GitLawb v0.3.8 repos are documented and handled as delegated-only.
9. Run targeted tests, lint, and build.

## Native Readiness Checklist

Before enabling native `AgentDID` ingest in production:

1. GitLawb repo metadata exposes canonical `did`, `state`, `owner_agent_did`, and `owner_public_key`.
2. `/api/agent-ashes` accepts `Authorization: AgentDID ...` only after verifying signature headers.
3. Timestamp freshness is enforced.
4. Nonces are stored and rejected on replay per agent DID.
5. GitLawb repo DID, certificate repo DID, and proof repo DID must match.
6. GitLawb `state` must be `dead`.
7. GitLawb `owner_agent_did` must match `certificate.agent.did` and the authorization DID.
8. Public key is resolved from GitLawb metadata or DID document before signature verification.
9. Delegated `ash_...` fallback remains green or is explicitly deprecated.

## Verification Commands

Run targeted Agent Layer coverage:

```powershell
npx.cmd playwright test -c playwright.unit.config.ts tests/agent-ash-auth.spec.ts tests/agent-ashes-ingest.spec.ts tests/gitlawb-skill.spec.ts tests/agent-ashes-ui.spec.ts tests/skill-install-prompt.spec.ts
```

Run full code health checks:

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
```

If working only on docs, at minimum run:

```powershell
git diff --check
```

## Runtime Checks

- Browser approval page loads for valid `ashlink_...` id.
- Approve path creates token metadata and never displays raw token in browser.
- Agent polling receives raw `ash_...` exactly once.
- Repeated polling returns `claimed`.
- Token list shows only redacted prefixes.
- Revoke prevents later ingest with the same raw token.
- `/api/agent-ashes` returns `401` for missing token and `401` for `vc_cli_*`.
- Successful ingest returns `verification_policy = external_source_verified_once_before_insert`.
- `verify-one-shot` returns `native_ready: false` with missing metadata for GitLawb node v0.3.8 repos.
- `submit-delegated` remains the supported fallback for GitLawb node v0.3.8 until native metadata exists.
