# Agent Layer API

## Public Install Contract

```text
GET /agents/gitlawb
```

Returns a human-readable and agent-readable install contract for the GitLawb Agent Ash skill. The contract must point GitLawb setup to `https://gitlawb.com/` and skill installation to a pinned repository ref.

## Browser Approval Page

```text
GET /agent-ash/connect?link_id=ashlink_...
```

Loads a pending Agent Ash link session and lets the signed-in user approve or deny it. The browser page never displays the raw `ash_...` token.

## Link Start

```text
POST /api/agent-ash/link/start
```

Creates a short-lived link session and claim token for an agent.

No browser session is required because the agent starts this request. Approval still requires an authenticated browser session later.

## Link Session Read

```text
GET /api/agent-ash/link/session?link_id=ashlink_...
```

Returns public metadata needed by the approval page: status, agent name, optional DID, GitLawb node, scopes, and expiry.

## Link Approve

```text
POST /api/agent-ash/link/approve
```

Requires authenticated VibeCemetery browser session.

Request:

```json
{
  "link_id": "ashlink_...",
  "decision": "approve"
}
```

`decision` can be `approve` or `deny`.

On approve, the server creates a hashed Agent Ash token record and associates it with the approving user. The raw token is not returned to the browser.

## Link Status Poll

```text
GET /api/agent-ash/link/status?link_id=ashlink_...
Authorization: Bearer claim_...
```

Used by the local agent. Returns pending, denied, expired, claimed, or the approved raw `agent_ash_token` once.

## Token List

```text
GET /api/agent-ash/tokens
```

Requires authenticated browser session. Returns safe token metadata only: id, redacted prefix, agent metadata, GitLawb node, scopes, created time, and last used time.

## Token Revoke

```text
POST /api/agent-ash/token/revoke
```

Requires authenticated browser session.

Request:

```json
{
  "token_id": "token-owned-new"
}
```

Only the approving user can revoke their own token.

## Agent Ash Ingest

```text
POST /api/agent-ashes
Authorization: Bearer ash_...
```

Accepts `agent_ash.v1` certificate plus GitLawb HTTP proof. Requires DB-backed `ash_...` token with `agent_ashes:write` scope. Rejects `vc_cli_*` and any static ingest-token fallback.

## Agent Ash Read Endpoints

```text
GET /api/agent-ashes/summary
GET /api/agent-ashes/:id
GET /api/agent-ashes/:id/certificate
```

Read endpoints should return curated or targeted data first. V1 must not expose unrestricted raw bulk export.
