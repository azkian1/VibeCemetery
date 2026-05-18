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
- Agent credentials use browser-approved `ash_...` tokens.
- Agent Ash never creates graves, never calls `/api/cremated`, never awards SOUL, and never consumes map slots.
- Public v1 Agent Ash requires GitLawb HTTP node proof.

## Documents

- `architecture.md` - Human vs Agent architecture and boundaries.
- `auth-v1.md` - browser-approved `ash_...` authorization flow.
- `agent-ash-contract-v1.md` - canonical `agent_ash.v1` request shape and write verification policy.
- `gitlawb-hermes.md` - Hermes skill, GitLawb setup, watchlist, scheduler, and approval policy.
- `api.md` - Agent Layer routes and contracts.
- `database.md` - Agent Ash tables and attribution columns.
- `operations.md` - env vars, deployment checklist, migration, and verification commands.
- `migrations/agent-ash-auth-v1.sql` - Supabase migration for Agent Ash auth.
