# GitLawb Hermes Skill

## Purpose

The `gitlawb` skill lets Hermes/OpenClaw produce verified Agent Ash for public GitLawb repositories.

It is not the human `/bury` command.

## Official GitLawb Setup

VibeCemetery does not install GitLawb.

If GitLawb is missing, agents must start from:

```text
https://gitlawb.com/
```

VibeCemetery only provides the Agent Ash skill contract and site-hosted skill distribution at:

```text
https://vibecemetery.app/agents/gitlawb
https://vibecemetery.app/agents/gitlawb/v1
```

## Install Agent Ash Skill

Install only after GitLawb itself is installed and configured through the official GitLawb setup.

macOS/Linux:

```bash
curl -fsSL https://vibecemetery.app/agents/gitlawb/v1/install.sh | bash
```

Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://vibecemetery.app/agents/gitlawb/v1/install.ps1 -UseBasicParsing | iex"
```

The installer writes the drop-in Hermes/OpenClaw skill package to:

```text
~/.hermes/skills/gitlawb
```

Auditable distribution files:

```text
https://vibecemetery.app/agents/gitlawb/v1/manifest.json
https://vibecemetery.app/agents/gitlawb/v1/files/skills/gitlawb/SKILL.md
https://vibecemetery.app/agents/gitlawb/v1/files/skills/gitlawb/scripts/gitlawb-helper.mjs
```

Security properties:

- Manifest SHA-256s are verified before writes.
- The installer runner is hash-verified before execution.
- Production install pins the manifest payload hash.
- Source override is test-only and limited to localhost origins.
- Target writes are limited to `~/.hermes/skills/gitlawb`.
- Symlink, junction, and traversal targets are rejected.
- `--dry-run` prints target files and hashes without writing.

## Skill Files

- `SKILL/skills/gitlawb/SKILL.md`
- `SKILL/skills/gitlawb/scripts/gitlawb-helper.mjs`
- Installer: `SKILL/agent-install/install-gitlawb.sh`, `SKILL/agent-install/install-gitlawb.ps1`, `SKILL/agent-install/install-gitlawb-runner.mjs`
- Tests: `tests/gitlawb-skill.spec.ts`

## Local Config

Path:

```text
~/.config/gitlawb/config.json
```

Shape:

```json
{
  "gitlawb_node_url": "https://node.gitlawb.com",
  "agent_name": "hermes",
  "agent_did": "did:key:z6MkAgentHermes",
  "agent_private_key": "<GitLawb-managed key reference or local key>",
  "vc_url": "https://vibecemetery.app",
  "scheduled_approval_policy": "none"
}
```

Native submit requires GitLawb repo metadata to expose canonical authority fields: `did`, `state`, `owner_agent_did`, and `owner_public_key`. GitLawb node v0.3.8 responses that expose only `id`, `owner_did`, `name`, `created_at`, and `updated_at` are delegated-only; derived DIDs are for discovery/readiness checks, not native authority.

## One-Shot Flow

Use this when the human explicitly asks to record a death for a public GitLawb repo DID.

GitLawb push/delete only changes GitLawb. VibeCemetery Agent Ash appears only after successful `/api/agent-ashes` ingest.

Agent-native Agent Ash does not require GitHub OAuth, VibeCemetery login, browser approval, or an `ash_` token. Browser-approved connect is optional delegated legacy fallback only.

Submit command:

```text
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs submit-one-shot did:gitlawb:...
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs verify-one-shot did:gitlawb:...
```

1. Read local config.
2. Fetch public repos from `GET {gitlawb_node_url}/api/v1/repos`.
3. Locate the requested repo DID.
4. Validate GitLawb repo metadata includes canonical `did`, `state = dead`, `owner_agent_did`, and `owner_public_key`.
5. Build `agent_ash.v1` certificate and `gitlawb_http_node_v1` proof with `buildAgentAshRequest`.
6. Sign canonical `{ certificate, proof, timestamp, nonce }` and submit exactly once to `POST {vc_url}/api/agent-ashes` with `Authorization: AgentDID ...`.
7. Report repo DID, certificate id, and returned VibeCemetery URL.

GitLawb repo metadata binds the repo DID to the submitting agent DID. VibeCemetery verifies GitLawb evidence and agent signature before accepting the Ash.

If `verify-one-shot` returns `native_ready: false`, use delegated fallback instead of native submit.

Delegated fallback commands:

```text
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs connect-delegated
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs submit-delegated did:gitlawb:...
```

Treat a `201` response as final acceptance. Do not recheck GitLawb after accepted write.

Use `GITLAWB_NODE=https://node.gitlawb.com` for GitLawb push/delete operations when GitLawb needs an explicit node. Do not treat that as VibeCemetery ingest.

## Watchlist Flow

Path:

```text
~/.config/gitlawb/watchlist.json
```

Shape:

```json
{
  "repos": [
    "did:gitlawb:z6MkRepoA",
    "did:gitlawb:z6MkRepoB"
  ]
}
```

Rules:

- If no candidates are found, stay silent.
- If candidates are found, notify the human/operator.
- Wait for explicit approval before public submission.
- Accept `all`, `none`, or selective approval by repo DID.
- Accept custom cause overrides per repo DID.
- Store notification and approval metadata in `certificate.raw.approval`.

## Scheduled Scan

Command:

```text
node ${CLAUDE_SKILL_DIR}/scripts/gitlawb-helper.mjs scheduled-scan
```

The helper performs one bounded watchlist scan, writes state/logs, produces candidates, and exits. It is not a daemon.

State paths:

```text
~/.local/state/vibecemetery-agent-ash/state.json
~/.local/state/vibecemetery-agent-ash/logs.jsonl
~/.local/state/vibecemetery-agent-ash/scan.lock
```

Scheduler target: cron, systemd timer, launchd, or Windows Task Scheduler every 3 days.

## Approval Policy

`scheduled_approval_policy` defaults to `none`.

Allowed values:

- `none` - scan and report candidates only. Never submit, even if approval metadata exists.
- `manual` - scan and report candidates, then submit only when explicit human approval metadata is supplied for current candidates.
- `all` - allowed only when explicitly configured. Still requires explicit approval metadata and must not silently self-approve.

Explicit approval metadata must include:

- `mode` as `all` or `selective`
- `approved_by`
- `approved_at`

Scheduled scans currently submit only through delegated legacy fallback and require a real `ash_...` token. Do not use scheduled native submit until backend native auth and GitLawb native metadata are deployed.

## Prohibited Actions

- Do not use `vc_cli_*` tokens.
- Do not call `/api/cremated`.
- Do not create graves.
- Do not award SOUL.
- Do not consume map slots.
- Do not present unverified local cleanup as public Agent Ash.
