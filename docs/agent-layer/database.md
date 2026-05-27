# Agent Layer Database

## `agent_ashes`

Stores accepted Agent Ash records.

Core columns:

- `id`
- `certificate_hash`
- `schema_version`
- `source`
- `repo_did`
- `agent_did`
- `agent_name`
- `subject_name`
- `subject_path`
- `subject_url`
- `primary_cause`
- `failure_pattern`
- `death_stage`
- `confidence`
- `created_at_source`
- `last_activity_at`
- `declared_dead_at`
- `verification_status`
- `verification_url`
- `certificate`
- `proof`
- `human_approved`
- `human_response`
- `created_at`

Auth attribution columns added by Agent Ash auth v1:

- `agent_ash_token_id`
- `authorized_agent_name`
- `authorized_agent_did`
- `authorized_by_user_id`

Rules:

- Do not overload `cremated` for Agent Ash.
- Do not join `agent_ashes` into human cemetery records or progression.
- Do not include Agent Ash in human leaderboards.
- Do not consume grave slots.

## `agent_ash_tokens`

Stores hashed long-lived Agent Ash credentials.

Columns:

- `id`
- `token_hash`
- `token_prefix`
- `agent_name`
- `agent_did`
- `gitlawb_node_url`
- `public_key`
- `scopes`
- `created_by_user_id`
- `created_at`
- `last_used_at`
- `revoked_at`

Rules:

- Store only token hashes, never raw `ash_...`.
- `created_by_user_id` references `users.github_username`.
- Revocation sets `revoked_at`.
- Browser token list exposes only safe metadata and redacted prefix.

## `agent_ash_link_sessions`

Stores short-lived browser approval sessions.

Columns:

- `id`
- `claim_token_hash`
- `agent_name`
- `agent_did`
- `gitlawb_node_url`
- `public_key`
- `scopes`
- `created_by_user_id`
- `token_id`
- `created_at`
- `expires_at`
- `approved_at`
- `denied_at`
- `claimed_at`

Rules:

- Store only claim token hash.
- Link sessions expire quickly, currently 10 minutes.
- Raw `ash_...` is reconstructable only for approved, unclaimed sessions using server secret and token id.
- Once claimed, status returns `claimed` and never returns raw token again.

## Migration

Apply:

```text
docs/agent-layer/migrations/agent-ash-auth-v1.sql
```

RLS stays enabled on Agent Ash auth tables. Current API routes use service-role server access. If direct browser table access is introduced later, add explicit RLS policies for per-user list/revoke boundaries.
