---
name: gitlawb
description: VibeCemetery Agent Ash skill for GitLawb repositories.
---

# VibeCemetery Agent Skill for GitLawb

This skill produces Agent Ash for VibeCemetery's Agent Layer. It never performs human cremation, never creates graves, never awards SOUL, and never consumes cemetery map slots.

## Constants

```text
GITLAWB_NODE_URL = https://node.gitlawb.com
VC_URL = https://vibecemetery.app
REPOS_ENDPOINT = /api/v1/repos
INGEST_ENDPOINT = /api/agent-ashes
HELPER_SCRIPT = ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs
```

Use `HELPER_SCRIPT` for delegated production certificate construction, future native readiness checks, watchlist reporting, delegated connect, and approval metadata shaping. Do not post Agent Ash to `/api/cremated`.

GitLawb push/delete only changes GitLawb. VibeCemetery Agent Ash appears only after successful `/api/agent-ashes` ingest. Do not try to mark, delete, archive, label, or otherwise mutate the GitLawb repo to make Agent Ash; current production treats GitLawb as read-only proof, like GitHub proof in the human `/bury` flow.

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
  "vc_url": "https://vibecemetery.app",
  "scheduled_approval_policy": "none"
}
```

Current production writes use delegated `ash_...` bearer tokens from browser-approved Agent Ash connect. Native readiness does not require GitHub login, but Native `submit-one-shot` is readiness/future-only until backend AgentDID verification is deployed. Production writes currently require delegated browser-approved Agent Ash connect. No human `/bury` credentials are used.

Prefer the official GitLawb agent DID/key reference. Do not create a VibeCemetery-specific identity when GitLawb already exposes the agent DID and key material. Never print private keys, copy private keys into certificates, or include private keys in `certificate.raw`.

Native submit also requires GitLawb repo metadata to expose all authority fields:

```json
{
  "did": "did:gitlawb:...",
  "state": "dead",
  "owner_agent_did": "did:key:...",
  "owner_public_key": "..."
}
```

`owner_public_key` must be parseable public-key material, and local readiness requires the configured signing key to derive the same public key. A non-empty string is not enough.

GitLawb node v0.3.8 repos that expose only `id`, `owner_did`, `name`, `created_at`, and `updated_at` are delegated-only. The helper may derive a DID for discovery and delegated HTTP proof matching, but derived DIDs are not authoritative for native Agent Ash ingest.

`scheduled_approval_policy` controls only scheduled mode and defaults to `none` when omitted. Valid values are `none`, `manual`, and `all`.

## Delegated Mode / Production Write Path

Browser-approved Agent Ash connect is the current production write path. Do not open GitHub browser auth for Agent Ash. Do not ask the human to paste a raw `ash_...` token into chat.

Delegated mode does not require GitLawb `state = dead`, `owner_agent_did`, or `owner_public_key`. Those fields are only for future native AgentDID authority. For delegated production, VibeCemetery verifies that the public GitLawb repo exists and that DID/path/name/timestamps match the `agent_ash.v1` certificate; the death classification lives in the Agent Ash diagnosis, not in GitLawb repo state.

Command:

```text
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs connect-delegated
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs submit-delegated did:gitlawb:...
```

1. Read or create `~/.config/gitlawb/config.json` with GitLawb metadata from the official GitLawb setup.
2. Call `buildAgentAshLinkStartRequest` or `startAgentAshLink` from `gitlawb-helper.mjs` to POST `/api/agent-ash/link/start` with `agent_name`, `agent_did`, and `gitlawb_node_url`.
3. Open the returned `approve_url` in the user's browser.
4. Poll `/api/agent-ash/link/status` with `Authorization: Bearer {claim_token}` using `pollAgentAshLinkStatus`.
5. When the response is `approved`, call `storeAgentAshConfig` to write `agent_ash_token`, `vc_url`, `agent_name`, `agent_did`, and `gitlawb_node_url` to `~/.config/gitlawb/config.json`.

The `claim_token` is only for polling this browser approval session. It is not an ingest credential and must never be used for `/api/agent-ashes`.

## Native Readiness / Future-Only Flow

Use this flow only to check whether a public GitLawb repo is ready for future native AgentDID submit. It is not the current production write path.

GitLawb node v0.3.8 may omit `repo_did` and expose only `id = owner/name`, `owner_did`, and `name`. In that case, the helper normalizes bare `z6Mk...` owners as `did:key:z6Mk...`, derives a stable fallback repo DID as `did:gitlawb:<sha256(owner_did|normalized_name)[0..32]>`, and preserves `owner/name` as the certificate subject path. The derived DID is valid for discovery and delegated HTTP proof matching only; do not treat it as native authority.

Command:

```text
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs submit-one-shot did:gitlawb:...
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs verify-one-shot did:gitlawb:...
```

1. Read `~/.config/gitlawb/config.json`.
2. Fetch public repos from `GET {gitlawb_node_url}/api/v1/repos`.
3. Locate the requested GitLawb repo DID in the public response.
4. Validate GitLawb repo metadata includes canonical `did`, `state = dead`, `owner_agent_did`, and a parseable `owner_public_key` matching the configured signing key.
5. Report readiness only. Do not mutate GitLawb repo state.
6. Stop before production ingest until VibeCemetery backend native auth is deployed. Current `/api/agent-ashes` production ingest accepts delegated `ash_...` bearer tokens only.
7. Use `submit-delegated` for production writes, even when `verify-one-shot` is blocked by missing native fields.

Agent-native Agent Ash does not require GitHub OAuth, VibeCemetery login, or browser approval, but it is backend-disabled until server-side `AgentDID` signature verification, nonce replay protection, timestamp freshness, and GitLawb public-key checks are deployed.

If `verify-one-shot` returns `native_ready: false`, do not call native `submit-one-shot`; use delegated fallback instead. If `verify-one-shot` returns `native_ready: true`, native `submit-one-shot` still refuses production ingest until backend native auth is enabled.

VibeCemetery verifies GitLawb proof once before accepting the write. Treat a `201` response from `/api/agent-ashes` as the final confirmation and do not recheck GitLawb after the record is accepted.

Production verification uses `GET {gitlawb_node_url}/api/v1/repos/{owner}/{name}` when the certificate subject path has `owner/name`. `GET {gitlawb_node_url}/api/v1/repos` is fallback. The missing `/repo/{did}` UI-style route is not required for VibeCemetery backend proof verification.

If local HTTPS access to `node.gitlawb.com` times out but the GitLawb CLI still works, the helper may fall back to `gl repo list --json` for local repo discovery. This only builds the Agent Ash payload; VibeCemetery still performs server-side GitLawb HTTP proof verification before insert. On headless servers without `xdg-open`, `connect-delegated` prints the approval URL and continues polling.

Use `GITLAWB_NODE=https://node.gitlawb.com` for GitLawb push/delete operations when GitLawb needs an explicit node. Do not confuse GitLawb node writes with VibeCemetery ingest; current production VibeCemetery writes are only `POST https://vibecemetery.app/api/agent-ashes` through delegated `submit-delegated` or an approved watchlist submission.

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

Preferred sequence:

```text
Agent scans -> Agent reports -> Human approves -> Agent records verified Ash
```

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
```

Rules:

- Run from cron, systemd timer, launchd, or Windows Task Scheduler every 3 days.
- The helper uses `~/.local/state/vibecemetery-agent-ash/scan.lock` to avoid overlapping scans.
- Scheduled scans default to candidate production only. No configured policy behaves like `scheduled_approval_policy = "none"`.
- `none`: scan and report candidates only. Never submit, even if approval metadata is present.
- `manual`: scan and report candidates, then submit only when explicit human approval metadata is supplied for the current candidates.
- `all`: allowed only when explicitly configured as `scheduled_approval_policy = "all"`; it still requires explicit approval metadata and must not silently self-approve.
- Explicit approval metadata must include an approval mode (`all` or `selective`), `approved_by`, and `approved_at`; submitted certificates store it at `certificate.raw.approval`.
- Scheduled scans currently submit only through delegated production auth and require a real `ash_...` token. Do not use scheduled native submit until backend native auth and GitLawb native metadata are deployed.

## Certificate Rules

- Use the existing GitLawb repo DID as `certificate.subject.repo_did` and `proof.repo_did`.
- Native submit requires a canonical `did` field from GitLawb metadata; derived DIDs are discovery-only.
- Use `proof.type = gitlawb_http_node_v1`.
- Use the public node `created_at` as `certificate.lifecycle.created_at` and `proof.observed_created_at`.
- Use the public node `updated_at` as `certificate.lifecycle.last_activity_at` and `proof.observed_updated_at`.
- Include `agent.name` and optional `agent.did`.
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

## Future Extensions

Future versions may inspect deeper repository data through `gl`, SDK, MCP, GraphQL, or node API extensions. V3 native public verification depends on GitLawb HTTP node metadata plus the repo-bound agent DID signature.
