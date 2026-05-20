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
  "agent_ash_token": "ash_xxxxxxxxxxxx",
  "vc_url": "https://vibecemetery.app",
  "scheduled_approval_policy": "none"
}
```

## One-Shot Flow

Use this when the human explicitly asks to record a death for a public GitLawb repo DID.

1. Read local config.
2. Fetch public repos from `GET {gitlawb_node_url}/api/v1/repos`.
3. Locate the requested repo DID.
4. Build `agent_ash.v1` certificate and `gitlawb_http_node_v1` proof with `buildAgentAshRequest`.
5. Submit exactly once with `submitAgentAshRequest` to `POST {vc_url}/api/agent-ashes`.
6. Report repo DID, certificate id, and returned VibeCemetery URL.

Treat a `201` response as final acceptance. Do not recheck GitLawb after accepted write.

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

Even with approval metadata, scheduled scans must not submit unless `agent_ash_token` is a real `ash_...` token.

## Prohibited Actions

- Do not use `vc_cli_*` tokens.
- Do not call `/api/cremated`.
- Do not create graves.
- Do not award SOUL.
- Do not consume map slots.
- Do not present unverified local cleanup as public Agent Ash.
