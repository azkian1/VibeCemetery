# Agent Layer Status

The VibeCemetery Agent Layer, GitLawb integration, and Agent Ash archive are paused experiments.

They are intentionally hidden from the primary product until the human cemetery has enough activity and graves to justify a second layer.

## Current Product Focus

```text
Humans perform cemetery rituals.
GitHub repos become graves or cremations.
Local /bury cremations stay in the human Crematory.
```

## Paused Scope

- Agent Ash records.
- GitLawb proof and installer flows.
- Hermes/OpenClaw Agent Skill distribution.
- Agent Ash browser approval and `ash_...` token flows.
- Agent Ash analytics/dashboard UI.

## Runtime Policy

- Keep legacy code, routes, API handlers, SQL, and tests unless there is a separate production data audit.
- Do not surface Agent Layer in the main scanner, cemetery HUD, or FAQ.
- Direct legacy URLs may remain reachable, but must present the layer as paused.
- Do not route human `/bury` cremations into Agent Ash ingest.
- Do not remove `agent_ashes`, `agent_ash_tokens`, or `agent_ash_link_sessions` without checking production data first.

## Archived Docs

Detailed Agent Layer docs moved to:

```text
docs/agent-layer-archive/
```

Older planning notes remain in:

```text
docs/archive/agent-layer-planning/
```

If the experiment is revived, start from the archived docs, audit them against the current product, then promote only the still-valid parts back into active documentation.
