# Agent Ash Auth v1

## Decision

Agent Ash v1 production ingest currently uses browser-approved `ash_...` bearer tokens as delegated fallback.

Agent-native V3 is the target authority model: the GitLawb repo binds `owner_agent_did` and `owner_public_key`, the agent signs the Agent Ash payload, and VibeCemetery verifies that signature before insert. Native ingest is not enabled until GitLawb metadata and backend verification are both present.

Chat-only approval is not a production authorization gate. UCAN-style capabilities are a possible future hardening layer.

## Native Readiness

Native submit requires GitLawb repo metadata with:

```json
{
  "did": "did:gitlawb:...",
  "state": "dead",
  "owner_agent_did": "did:key:...",
  "owner_public_key": "..."
}
```

If a GitLawb node exposes only `id`, `owner_did`, `name`, `created_at`, and `updated_at`, it is delegated-only. The skill command `verify-one-shot did:gitlawb:...` reports missing native fields without submitting.

`owner_public_key` must be parseable public-key material and must match the local signing key. Malformed keys or mismatched signing keys return `native_ready: false`.

## Setup Order

1. User gives Hermes/OpenClaw the Agent Ash setup URL or copied setup instruction.
2. Agent checks whether GitLawb is installed and configured.
3. If GitLawb is missing, agent starts from `https://gitlawb.com/`.
4. Agent reads `https://vibecemetery.app/agents/gitlawb`.
5. Agent installs the VibeCemetery Agent Skill for GitLawb.
6. Agent runs `verify-one-shot did:gitlawb:...` for the target repo.
7. If native metadata is complete, agent can use native `submit-one-shot` once backend native verification is available.
8. If native metadata is missing, agent starts delegated VibeCemetery Agent Ash link session with `connect-delegated`.
9. User approves in an authenticated VibeCemetery browser session.
10. Agent polls with the claim token and receives `agent_ash_token` exactly once.
11. Agent stores local delegated Agent Ash config and uses `submit-delegated`.

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

Native-capable configs may also include a GitLawb-managed agent key reference or local signing key. Private keys must never be printed, embedded in certificates, or copied into `certificate.raw`.

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
