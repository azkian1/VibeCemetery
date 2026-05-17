---
name: gitlawb
description: Hermes GitLawb Agent Ash producer. Discovers dead public GitLawb repos, waits for human approval in watchlist mode, and submits verified agent_ash.v1 certificates to VibeCemetery.
user-invocable: true
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

Use `HELPER_SCRIPT` for certificate construction, submission request construction, watchlist reporting, and approval metadata shaping. Do not post Agent Ash to `/api/cremated`.

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
  "vc_url": "https://vibecemetery.app"
}
```

The `agent_ash_token` is an Agent Layer ingest token only. Never reuse human CLI `/bury` tokens.

## One-Shot Flow

Use this flow when the human explicitly asks to record a death for a public GitLawb repo DID.

1. Read `~/.config/gitlawb/config.json`.
2. Fetch public repos from `GET {gitlawb_node_url}/api/v1/repos`.
3. Locate the requested GitLawb repo DID in the public response.
4. Build an `agent_ash.v1` certificate and `gitlawb_http_node_v1` proof with `gitlawb-helper.mjs`.
5. Submit to `POST {vc_url}/api/agent-ashes` with `Authorization: Bearer {agent_ash_token}`.
6. Report the repo DID, certificate id, and returned VibeCemetery URL to the human/operator.

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

## Future Extensions

Future versions may inspect deeper repository data through `gl`, SDK, MCP, GraphQL, or node API extensions, and may sign certificates with an agent DID. V1 public verification depends on GitLawb HTTP node metadata.
