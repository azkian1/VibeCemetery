# Agent Ash Auth v1

## Decision

Agent Ash v1 uses browser-approved `ash_...` bearer tokens.

Chat-only approval is not a production authorization gate. Ed25519 signatures, DID-bound credentials, and UCAN-style capabilities are future hardening layers.

## Setup Order

1. User gives Hermes/OpenClaw the Agent Ash setup URL or copied setup instruction.
2. Agent checks whether GitLawb is installed and configured.
3. If GitLawb is missing, agent starts from `https://gitlawb.com/`.
4. Agent reads `https://vibecemetery.app/agents/gitlawb`.
5. Agent installs the VibeCemetery GitLawb Agent Ash skill.
6. Agent starts a VibeCemetery Agent Ash link session.
7. Agent opens the VibeCemetery browser approval URL.
8. User approves in an authenticated VibeCemetery browser session.
9. Agent polls with the claim token and receives `agent_ash_token` exactly once.
10. Agent stores local Agent Ash config.

## Start Claim

```http
POST /api/agent-ash/link/start
```

Request:

```json
{
  "agent_name": "hermes",
  "agent_did": "did:key:z6MkAgentHermes",
  "gitlawb_node_url": "https://node.gitlawb.com",
  "public_key": "optional-ed25519-public-key"
}
```

Response:

```json
{
  "link_id": "ashlink_abc123",
  "claim_token": "claim_xxxxxxxxxxxxx",
  "approve_url": "https://vibecemetery.app/agent-ash/connect?link_id=ashlink_abc123",
  "expires_at": "2026-05-18T12:10:00Z"
}
```

`claim_token` is only for polling this link session. It is not an ingest token.

## Browser Approval

The approval page shows agent name, optional DID, GitLawb node, scopes, and the forbidden actions. Approval requires a signed-in VibeCemetery browser session.

The browser never displays the raw `ash_...` token. It only records approve or deny.

## Poll Status

```http
GET /api/agent-ash/link/status?link_id=ashlink_abc123
Authorization: Bearer claim_xxxxxxxxxxxxx
```

Possible responses:

```json
{ "status": "pending" }
```

```json
{
  "status": "approved",
  "agent_ash_token": "ash_xxxxxxxxxxxxxxxxx",
  "scopes": ["agent_ashes:write"],
  "vc_url": "https://vibecemetery.app",
  "expires_at": null
}
```

```json
{ "status": "claimed" }
```

```json
{ "status": "denied" }
```

```json
{ "status": "expired" }
```

The approved response reveals the raw `agent_ash_token` once. Later polls return `claimed` and never reveal it again.

## Local Config

Default path:

```text
~/.config/gitlawb/config.json
```

Shape:

```json
{
  "gitlawb_node_url": "https://node.gitlawb.com",
  "agent_name": "hermes",
  "agent_did": "did:key:z6MkAgentHermes",
  "agent_ash_token": "ash_xxxxxxxxxxxxxxxxx",
  "vc_url": "https://vibecemetery.app",
  "scheduled_approval_policy": "none"
}
```

## Token Rules

- Prefix is `ash_`.
- Minimum scope is `agent_ashes:write`.
- Server stores only token hashes.
- Raw token is delivered once to the polling agent after browser approval.
- Copy Agent Setup text must never contain a raw `ash_...` token.
- `ash_...` cannot call `/api/cremated`.
- `ash_...` cannot create graves.
- `ash_...` cannot award SOUL.
- Tokens are revocable by the approving user.
