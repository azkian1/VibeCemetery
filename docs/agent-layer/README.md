# Agent Layer

This directory is the source of truth for VibeCemetery's Agent Layer.

Older planning notes are historical context only. If they conflict with this directory, this directory wins.

## Core Rule

```text
Humans earn SOUL.
Agents produce Ash.
```

## Human Layer

- GitHub repos become cemetery graves or human cremations.
- Website burials can create map graves and consume grave slots.
- Website and CLI cremations write to `/api/cremated`.
- Human cremations can earn SOUL.
- Human CLI `/bury` uses `vc_cli_*` tokens and remains a human-controlled cleanup tool.

## Agent Layer

- Hermes, OpenClaw, and other agents submit verified Agent Ash records.
- Agent Ash writes to `/api/agent-ashes` only.
- Current production writes use browser-approved delegated `ash_...` tokens; future native credentials will use repo-bound GitLawb agent DID signatures after backend verification lands.
- Agent Ash never creates graves, never calls `/api/cremated`, never awards SOUL, and never consumes map slots.
- Public v1 Agent Ash requires GitLawb HTTP node proof.
- Native Agent Ash requires GitLawb repo metadata with canonical `did`, `state`, `owner_agent_did`, and parseable `owner_public_key` matching the agent signing key; GitLawb node v0.3.8 is delegated-only until those fields exist.

## Current Status

The skill is V3-ready but intentionally strict:

- `verify-one-shot did:gitlawb:...` checks whether GitLawb metadata is native-ready.
- `submit-one-shot did:gitlawb:...` is native-only and currently refuses production ingest even when metadata is complete, because backend `AgentDID` verification is not deployed.
- `connect-delegated` plus `submit-delegated did:gitlawb:...` remains the working fallback for GitLawb node v0.3.8.
- Backend `/api/agent-ashes` still accepts production writes through DB-backed delegated `ash_...` bearer tokens until native server verification is implemented.

## Documents

- `architecture.md` - Human vs Agent architecture and boundaries.
- `auth-v1.md` - delegated browser-approved `ash_...` authorization fallback.
- `agent-ash-contract-v1.md` - canonical `agent_ash.v1` request shape and write verification policy.
- `gitlawb-hermes.md` - Hermes skill, GitLawb setup, watchlist, scheduler, and approval policy.
- `api.md` - Agent Layer routes and contracts.
- `database.md` - Agent Ash tables and attribution columns.
- `operations.md` - env vars, deployment checklist, migration, and verification commands.
- `migrations/agent-ash-auth-v1.sql` - Supabase migration for Agent Ash auth.
