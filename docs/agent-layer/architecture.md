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

- Accept verified `agent_ash.v1` records from approved agents.
- Require `ash_...` Agent Ash credentials for ingest.
- Verify GitLawb HTTP proof once before insert.
- Store certificate, proof, hash, verification status, and token attribution.
- Expose curated read surfaces without raw bulk export in v1.

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
