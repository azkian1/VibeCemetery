# Agent Layer Architecture

## North Star

VibeCemetery has two layers split by actor, not by UI surface.

```text
Human Layer = GitHub + cemetery game + SOUL
Agent Layer = GitLawb + verified Ash certificates + analytics archive
```

## Boundary

Humans bury and cremate. Agents witness and produce Ash.

Human Layer records are part of the cemetery economy. They can affect map placement, social mechanics, and SOUL progression.

Agent Layer records are forensic records. They are stored as `agent_ashes`, surfaced in Agent Ashes UI, and later feed analytics, resurrection candidates, prevention guardrails, and agent reputation.

## Human Layer Responsibilities

- Scan GitHub repos for inactivity and fork status.
- Create graves through `/api/graves` after GitHub verification.
- Create human cremations through `/api/cremated` from browser or CLI.
- Enforce grave slot economy.
- Award SOUL for eligible human cremations.
- Keep burial ceremony behavior tied to graves only.

## Agent Layer Responsibilities

- Accept verified `agent_ash.v1` records from GitLawb-capable agents.
- Prefer repo-bound agent DID signatures when GitLawb exposes native authority metadata.
- Keep browser-approved `ash_...` Agent Ash credentials as delegated fallback while GitLawb node v0.3.8 lacks native authority fields.
- Verify GitLawb HTTP proof once before insert.
- Store certificate, proof, hash, verification status, and token attribution.
- Expose curated read surfaces without raw bulk export in v1.

## Authority Model

Native Agent Ash authority comes from GitLawb repo metadata, not from a VibeCemetery human account.

Required native metadata:

```json
{
  "did": "did:gitlawb:...",
  "state": "dead",
  "owner_agent_did": "did:key:...",
  "owner_public_key": "..."
}
```

VibeCemetery can verify native writes only when it can fetch this metadata from the allowed GitLawb node, match it to the certificate, and verify the request signature against the bound key. GitLawb node v0.3.8 metadata that contains only `id`, `owner_did`, `name`, `created_at`, and `updated_at` is not enough for native authority. Derived DIDs are discovery/readiness helpers only.

Readiness must parse `owner_public_key` and confirm that the configured signing key derives the same public key. Presence-only checks are not sufficient.

## Hard Boundaries

- Agents must not call `/api/cremated`.
- Agents must not create graves.
- Agents must not use `vc_cli_*` tokens.
- Agents must not earn SOUL.
- Agents must not consume cemetery map slots.
- VibeCemetery does not install GitLawb. Agents use official GitLawb setup first.

## Write Verification Policy

```text
External source verification happens once on the write path, before insert.
```

For Agent Ash v1, `/api/agent-ashes` validates the request, checks the submitted GitLawb proof against an allowed GitLawb HTTP node, then inserts the record. A successful `201` response with `verification_policy = external_source_verified_once_before_insert` is the final acceptance contract. Hermes must not perform a second GitLawb recheck after VibeCemetery accepts the write.

Current production ingest uses delegated `ash_...` bearer tokens. Native `AgentDID` ingest must add server-side signature verification, timestamp freshness, nonce replay protection, GitLawb `owner_agent_did` matching, public-key resolution, and dead-state validation before it is enabled on `/api/agent-ashes`.
