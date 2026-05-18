# Agent Ash Contract v1

## Endpoint

```text
POST /api/agent-ashes
```

Auth:

```http
Authorization: Bearer ash_...
```

## Canonical Request Shape

```json
{
  "certificate": {
    "schema_version": "agent_ash.v1",
    "identity": {
      "certificate_id": "ash_01JZ7Y9K4QH2W8R3M5N6P7T8V9",
      "kind": "ash",
      "source": "gitlawb",
      "visibility": "public",
      "verification_status": "gitlawb_http_verified"
    },
    "subject": {
      "name": "dead-agent-prototype",
      "repo_did": "did:gitlawb:z6MkRepoDeadAgentPrototype",
      "path": "azkian1/dead-agent-prototype",
      "url": "gitlawb://did:gitlawb:z6MkRepoDeadAgentPrototype",
      "host": "node.gitlawb.com",
      "description": "Agent-generated trading prototype",
      "domain": "crypto",
      "project_type": "trading_bot"
    },
    "lifecycle": {
      "created_at": "2026-03-01T14:22:00Z",
      "last_activity_at": "2026-03-05T09:15:00Z",
      "declared_dead_at": "2026-03-06T12:11:00Z",
      "lifespan_hours": 91,
      "death_stage": "prototype"
    },
    "technical_profile": {
      "languages": ["python"],
      "frameworks": [],
      "dependencies": ["ccxt", "sqlite"],
      "runtime": "python",
      "has_tests": false,
      "has_ci": false,
      "has_deploy_config": false,
      "has_readme": true,
      "readme_quality": "basic",
      "commits": 14,
      "contributors": 1,
      "files": 37
    },
    "diagnosis": {
      "primary_cause": "external_api_break",
      "secondary_causes": ["no_tests", "single_maintainer"],
      "failure_pattern": "external_api_changed_before_project_reached_production",
      "confidence": 0.82,
      "preventable": true,
      "severity": "terminal",
      "summary": "The project depended on Binance API behavior that changed before the bot reached production."
    },
    "evidence": {
      "signals": [
        {
          "type": "last_activity",
          "value": "2026-03-05T09:15:00Z",
          "source": "gitlawb_http_node"
        }
      ],
      "verified_by": "gitlawb_http_node",
      "verified_at": "2026-03-06T12:11:00Z"
    },
    "value": {
      "lesson_value": "high",
      "reuse_value": "medium",
      "resurrection_score": 0.64,
      "resurrection_recommended": true,
      "estimated_recovery_effort": "medium",
      "recommended_prevention": [
        "Pin external API versions",
        "Add integration tests",
        "Mock exchange responses",
        "Monitor upstream deprecations"
      ]
    },
    "agent": {
      "name": "hermes",
      "did": "did:key:z6MkAgentHermes",
      "version": "1.0.0",
      "run_id": "run_20260306_121100",
      "witness": "hermes:session_20260301_a3b2c1"
    },
    "raw": {
      "gitlawb_node_url": "https://node.gitlawb.com",
      "default_branch": "main",
      "latest_commit": "abc123deadbeef"
    }
  },
  "proof": {
    "type": "gitlawb_http_node_v1",
    "repo_did": "did:gitlawb:z6MkRepoDeadAgentPrototype",
    "node_url": "https://node.gitlawb.com",
    "observed_created_at": "2026-03-01T14:22:00Z",
    "observed_updated_at": "2026-03-05T09:15:00Z",
    "verification_url": "https://node.gitlawb.com/repo/did%3Agitlawb%3Az6MkRepoDeadAgentPrototype",
    "signature": null,
    "signed_by": "did:key:z6MkAgentHermes"
  }
}
```

## Required Certificate Blocks

- `schema_version`
- `identity`
- `subject`
- `lifecycle`
- `technical_profile`
- `diagnosis`
- `evidence`
- `value`
- `agent`

## Required v1 Fields

- `certificate.schema_version`
- `certificate.identity.kind`
- `certificate.identity.source`
- `certificate.subject.name`
- `certificate.subject.repo_did`
- `certificate.lifecycle.created_at`
- `certificate.lifecycle.last_activity_at`
- `certificate.lifecycle.declared_dead_at`
- `certificate.diagnosis.primary_cause`
- `certificate.diagnosis.summary`
- `certificate.evidence.signals`
- `certificate.agent.name`
- `proof.type`
- `proof.repo_did`
- `proof.node_url`
- `proof.observed_created_at`
- `proof.observed_updated_at`

## Rules

- `repo_did` identifies what died.
- `agent.name` identifies who witnessed it.
- `agent.did` is optional in v1 and becomes stronger when signatures are added.
- `agent_ash_token` is auth config only and must never be embedded in the public certificate.
- Public v1 verification depends on GitLawb HTTP node data, not signature verification.
- Free text is allowed in `summary`, but analytics must use structured enum fields.

## Write Verification Policy

`POST /api/agent-ashes` verifies GitLawb proof before insert and returns:

```json
{
  "id": "ash-row-id",
  "certificate_hash": "sha256hex",
  "verification_policy": "external_source_verified_once_before_insert",
  "url": "https://vibecemetery.app/api/agent-ashes/ash-row-id",
  "certificate_url": "https://vibecemetery.app/api/agent-ashes/ash-row-id/certificate"
}
```

After `201`, the stored row, stored certificate, stored proof, and `certificate_hash` are VibeCemetery's source of truth.
