---
name: gitlawb
description: Hermes GitLawb Agent Ash producer. Discovers dead public GitLawb repos, waits for human approval in watchlist mode, and submits verified agent_ash.v1 certificates to VibeCemetery.
---

# Hermes GitLawb Agent Ash Producer

This skill produces Agent Ash for VibeCemetery's Agent Layer. It never performs human cremation, never creates graves, never awards SOUL, and never consumes cemetery map slots.

## Constants

```text
GITLAWB_NODE_URL = https://node.gitlawb.com
VC_URL = https://vibecemetery.app
REPOS_ENDPOINT = /api/v1/repos
INGEST_ENDPOINT = /api/agent-ashes
HELPER_SCRIPT = ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs
```

Use `HELPER_SCRIPT` for browser-approved connect, certificate construction, canonical submission, watchlist reporting, and approval metadata shaping. Do not post Agent Ash to `/api/cremated`.

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
  "agent_ash_token": "ash_xxxxxxxxxxxx",
  "vc_url": "https://vibecemetery.app",
  "scheduled_approval_policy": "none"
}
```

The `agent_ash_token` is an Agent Layer ingest token only. Never reuse human CLI `/bury` tokens.

`scheduled_approval_policy` controls only scheduled mode and defaults to `none` when omitted. Valid values are `none`, `manual`, and `all`.

## Browser-Approved Connect Flow

Use this flow during setup before any submission attempt. Do not ask the human to paste a raw `ash_...` token into chat.

1. Read or create `~/.config/gitlawb/config.json` with GitLawb metadata from the official GitLawb setup.
2. Call `buildAgentAshLinkStartRequest` or `startAgentAshLink` from `gitlawb-helper.mjs` to POST `/api/agent-ash/link/start` with `agent_name`, `agent_did`, and `gitlawb_node_url`.
3. Open the returned `approve_url` in the user's browser.
4. Poll `/api/agent-ash/link/status` with `Authorization: Bearer {claim_token}` using `pollAgentAshLinkStatus`.
5. When the response is `approved`, call `storeAgentAshConfig` to write `agent_ash_token`, `vc_url`, `agent_name`, `agent_did`, and `gitlawb_node_url` to `~/.config/gitlawb/config.json`.

The `claim_token` is only for polling this browser approval session. It is not an ingest credential and must never be used for `/api/agent-ashes`.

## One-Shot Flow

Use this flow when the human explicitly asks to record a death for a public GitLawb repo DID.

1. Read `~/.config/gitlawb/config.json`.
2. Fetch public repos from `GET {gitlawb_node_url}/api/v1/repos`.
3. Locate the requested GitLawb repo DID in the public response.
4. Build an `agent_ash.v1` certificate and `gitlawb_http_node_v1` proof with `buildAgentAshRequest`.
5. Submit exactly once with `submitAgentAshRequest`, which posts to `POST {vc_url}/api/agent-ashes` with `Authorization: Bearer {agent_ash_token}`.
6. Report the repo DID, certificate id, and returned VibeCemetery URL to the human/operator.

VibeCemetery verifies GitLawb proof once before accepting the write. Treat a `201` response from `/api/agent-ashes` as the final confirmation and do not recheck GitLawb after the record is accepted.

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
- Even with approval metadata, scheduled scans do not submit unless `agent_ash_token` is a real `ash_...` token.

## Certificate Rules

- Use the existing GitLawb repo DID as `certificate.subject.repo_did` and `proof.repo_did`.
- Use `proof.type = gitlawb_http_node_v1`.
- Use the public node `created_at` as `certificate.lifecycle.created_at` and `proof.observed_created_at`.
- Use the public node `updated_at` as `certificate.lifecycle.last_activity_at` and `proof.observed_updated_at`.
- Include `agent.name` and optional `agent.did`.
- Include raw GitLawb node metadata only under `certificate.raw`.

## Prohibited Actions

- Do not use human CLI `/bury` tokens.
- Do not call `/api/cremated`.
- Do not award SOUL.
- Do not create graves.
- Do not consume map slots.
- Do not present unverified local cleanup as public Agent Ash.
- Do not submit watchlist candidates without explicit human approval.
- Do not perform post-write GitLawb rechecks after VibeCemetery returns `201` for `/api/agent-ashes`.

## Future Extensions

Future versions may inspect deeper repository data through `gl`, SDK, MCP, GraphQL, or node API extensions, and may sign certificates with an agent DID. V1 public verification depends on GitLawb HTTP node metadata.
