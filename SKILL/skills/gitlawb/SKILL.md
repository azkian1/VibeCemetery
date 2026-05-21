---
name: gitlawb
description: VibeCemetery Agent Ash skill for GitLawb repositories.
---

# VibeCemetery Agent Skill for GitLawb

This skill produces Agent Ash for VibeCemetery's Agent Layer. It never performs human cremation, never creates graves, never awards SOUL, and never consumes cemetery map slots.

## Golden Rules

1. Never mutate GitLawb repos. GitLawb is read-only proof, like GitHub in the human `/bury` flow. Do not create Agent Ash by deleting, archiving, labeling, or writing marker files into the repo.
2. Never use human `/bury` tokens or credentials. Do not use GitHub OAuth, `vc_cli_*` tokens, or VibeCemetery human CLI credentials for Agent Ash ingest.
3. Never call `/api/cremated`. Agent Ash production writes use only `POST /api/agent-ashes`.
4. Never recheck GitLawb after a `201` response from `/api/agent-ashes`. VibeCemetery verifies public proof once before insert; that response is final.
5. Never submit watchlist candidates without explicit human approval metadata.
6. Never present unverified local cleanup as public Agent Ash.
7. Never award SOUL, create graves, or consume map slots.

## Fail-Fast Checks

Before any Agent Ash operation, verify these preconditions. Abort early if any check fails.

1. Config file exists. `~/.config/gitlawb/config.json` must be present and parseable, except when a test harness injects config directly.
2. Agent identity exists. `config.json` must contain non-empty `agent_name` and `agent_did`.
3. Helper script is reachable. `HELPER_SCRIPT = ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs` must exist.
4. GitLawb node is reachable through `GET {gitlawb_node_url}/api/v1/repos`; on local transport timeout, the helper may fall back to `gl repo list --json` for local discovery only.
5. No duplicate repo collisions. If the repos list contains the same normalized `owner_did/name` with different repo identifiers or DIDs, abort and report the collision.
6. Mode guard is explicit. For `connect-delegated`, `agent_ash_token` may be absent because the command creates it through browser approval. For `submit-delegated` and approved scheduled submissions, `agent_ash_token` must match `ash_...`. Native submit remains backend-disabled and future-only.

Do not add `references/manual-submit-guide.md` unless that file exists in this skill package.

## Constants

```text
GITLAWB_NODE_URL = https://node.gitlawb.com
VC_URL = https://vibecemetery.app
REPOS_ENDPOINT = /api/v1/repos
INGEST_ENDPOINT = /api/agent-ashes
HELPER_SCRIPT = ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs
```

Use `HELPER_SCRIPT` for delegated production certificate construction, future native readiness checks, watchlist reporting, delegated connect, and approval metadata shaping. Do not post Agent Ash to `/api/cremated`.

GitLawb push/delete only changes GitLawb. VibeCemetery Agent Ash appears only after successful `/api/agent-ashes` ingest. Do not try to mark, delete, archive, label, or otherwise mutate the GitLawb repo to make Agent Ash; current production treats GitLawb as read-only proof.

## Local Config

Read config from:

```text
~/.config/gitlawb/config.json
```

Expected shape:

```json
{
  "gitlawb_node_url": "https://node.gitlawb.com",
  "agent_name": "hermes",
  "agent_did": "did:key:z6MkAgentHermes",
  "agent_private_key": "<GitLawb-managed key reference or local test PEM>",
  "agent_ash_token": "ash_...",
  "vc_url": "https://vibecemetery.app",
  "scheduled_approval_policy": "none"
}
```

Current production writes use delegated `ash_...` bearer tokens from browser-approved Agent Ash connect. Native readiness does not require GitHub login, but Native `submit-one-shot` is readiness/future-only until backend AgentDID verification is deployed. Production writes currently require delegated browser-approved Agent Ash connect. No human `/bury` credentials are used.

Native submit also requires GitLawb repo metadata to expose all authority fields: `did`, `state = dead`, `owner_agent_did`, and parseable `owner_public_key` matching the configured signing key. GitLawb node v0.3.8 repos that expose only `id`, `owner_did`, `name`, `created_at`, and `updated_at` are delegated-only. Derived DIDs are discovery-only, not native authority.

## Delegated Mode / Production Write Path

Browser-approved Agent Ash connect is the current production write path. Do not open GitHub browser auth for Agent Ash. Do not ask the human to paste a raw `ash_...` token into chat.

Delegated mode does not require GitLawb `state = dead`, `owner_agent_did`, or `owner_public_key`. VibeCemetery verifies that the public GitLawb repo exists and that DID/path/name/timestamps match the `agent_ash.v1` certificate; the death classification lives in the Agent Ash diagnosis, not in GitLawb repo state.

Command:

```text
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs connect-delegated
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs submit-delegated did:gitlawb:...
```

Delegated connect steps:

1. Read or create `~/.config/gitlawb/config.json` with GitLawb metadata from the official GitLawb setup.
2. Call `buildAgentAshLinkStartRequest` or `startAgentAshLink` from `gitlawb-helper.mjs` to POST `/api/agent-ash/link/start` with `agent_name`, `agent_did`, and `gitlawb_node_url`.
3. Open the returned `approve_url` in the user's browser. If a system browser cannot be opened, print the approval URL and continue polling.
4. Poll `/api/agent-ash/link/status` with `Authorization: Bearer {claim_token}` using `pollAgentAshLinkStatus`.
5. When the response is `approved`, call `storeAgentAshConfig` to write `agent_ash_token`, `vc_url`, `agent_name`, `agent_did`, and `gitlawb_node_url` to `~/.config/gitlawb/config.json`.

The `claim_token` is only for polling this browser approval session. It is not an Agent Ash ingest credential and must never be used for `/api/agent-ashes`.

Response handling:

- `201` means accepted and final. Do not recheck GitLawb after accepted write.
- `409` means already cremated / already recorded. Do not retry.
- `422` means verification failed. Run the 422 Diagnostic Protocol below.
- Local GitLawb transport timeout may use `gl repo list --json` only to build local payloads; VibeCemetery still performs server-side HTTP proof verification before insert.

## Native Readiness / Future-Only Flow

Use this flow only to check whether a public GitLawb repo is ready for future native AgentDID submit. It is not the current production write path.

Command:

```text
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs submit-one-shot did:gitlawb:...
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs verify-one-shot did:gitlawb:...
```

If `verify-one-shot` returns `native_ready: false`, do not call native `submit-one-shot`; use delegated fallback instead. If `verify-one-shot` returns `native_ready: true`, native `submit-one-shot` still refuses production ingest until backend native auth is enabled.

## Watchlist Flow

Read watchlist from:

```text
~/.config/gitlawb/watchlist.json
```

Expected shape:

```json
{
  "repos": [
    "did:gitlawb:z6MkRepoA",
    "did:gitlawb:z6MkRepoB"
  ]
}
```

Rules:

- If no candidates are found, stay silent.
- If candidates are found, notify the human/operator.
- Wait for explicit approval before public submission.
- Accept `all`, `none`, or selective approval by repo DID.
- Accept custom cause overrides per repo DID.
- Store notification and approval metadata in `certificate.raw.approval`.

## Scheduled Scan Flow

Use the helper as a bounded local scheduler target. It performs one watchlist scan, writes local state/logs, produces candidates, and exits. It is not a daemon.

Command:

```text
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs scheduled-scan
```

Local state:

```text
~/.local/state/vibecemetery-agent-ash/state.json
~/.local/state/vibecemetery-agent-ash/logs.jsonl
~/.local/state/vibecemetery-agent-ash/scan.lock
```

Policies:

- `none` scans and reports candidates only. Never submit, even if approval metadata is present.
- `manual` scans and reports candidates, then submits only when explicit human approval metadata is supplied for current candidates.
- `all` is allowed only when explicitly configured as `scheduled_approval_policy = "all"`; it still requires explicit approval metadata and must not silently self-approve.

## Post-Success Automation Offer

Do not create schedulers during install.

After one successful manual run, the agent may ask the operator whether to enable weekly automation.

Suggested prompt:

```text
Enable a weekly scheduled scan so I can check for burnable candidates automatically?
```

If the operator says no, do nothing.

If the operator says yes, create an OS-local scheduler that runs only:

```text
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs scheduled-scan
```

Do not embed tokens in the scheduler command. Scheduled runs must still respect `scheduled_approval_policy`, explicit approval metadata, and all Agent Ash safety rules.

## 422 Diagnostic Protocol

Use this only when `/api/agent-ashes` returns HTTP `422`.

1. Inspect `proof.verification_url`. It should target `GET /api/v1/repos/{owner}/{name}` when the certificate subject path has `owner/name`.
2. Confirm bare `z6Mk...` owners were normalized with the `did:key:` prefix.
3. Compare `proof.observed_created_at` against the GitLawb node response `created_at`.
4. Compare `proof.observed_updated_at` against the GitLawb node response `updated_at`.
5. If timestamps mismatch, rebuild from per-repo metadata instead of stale list metadata.
6. Check for Duplicate Repos / DID Collision: list returned repos and abort if the same normalized `owner_did/name` appears with different repo identifiers or DIDs.
7. If all checks pass, escalate to VibeCemetery backend verification.

## Certificate Rules

- Use the existing GitLawb repo DID as `certificate.subject.repo_did` and `proof.repo_did`.
- Native submit requires a canonical `did` field from GitLawb metadata; derived DIDs are discovery-only.
- Use `proof.type = gitlawb_http_node_v1`.
- Use the public node `created_at` as `certificate.lifecycle.created_at` and `proof.observed_created_at`.
- Use the public node `updated_at` as `certificate.lifecycle.last_activity_at` and `proof.observed_updated_at`.
- Require `state = dead`, `owner_agent_did`, and parseable `owner_public_key` matching the configured signing key for native one-shot submit.
- Do not require `state = dead` for delegated `submit-delegated`; GitLawb is read-only evidence in delegated mode.
- Include raw GitLawb node metadata only under `certificate.raw`.

## Prohibited Actions

- Do not use human CLI `/bury` tokens.
- Do not require GitHub OAuth, VibeCemetery login, browser approval, or `ash_` tokens for native one-shot Agent Ash.
- Do not call `/api/cremated`.
- Do not award SOUL.
- Do not create graves.
- Do not consume map slots.
- Do not present unverified local cleanup as public Agent Ash.
- Do not submit watchlist candidates without explicit human approval.
- Do not perform post-write GitLawb rechecks after VibeCemetery returns `201` for `/api/agent-ashes`.
- Do not try to create Agent Ash by deleting, archiving, labeling, or writing marker files into the GitLawb repo.
