# Workflow Contract

Current contract notes:

- `API_BASE_URL` must remain `https://vibecemetery.app` because the production site domain is finalized and live.
- `/bury` is the only official user-facing entrypoint. This workflow exists only to execute the command pipeline behind it.
- `/bury` only handles local cremations. GitHub account scanning and grave placement belong to the browser site flow, not this workflow.
- If the provided scan path itself looks like a project, `/bury` should treat it as a single project candidate. Otherwise it should scan only immediate child directories.
- Runtime candidate detection must use `scripts/bury-helper.mjs detect-candidates <scanPath>` as the source of truth for root-vs-child classification and local registry duplicate visibility.
- Browser approval requires proof-of-possession of the live `claim_token`. The approval page reads it from the `approve_url` hash fragment and sends it to `/api/cli/link/approve`.
- Safety-critical helper logic lives in `scripts/bury-helper.mjs`. Keep the workflow text aligned with that script instead of duplicating different rules.
- Treat any approval link missing the fragment proof as stale or invalid. Do not fall back to approving by `link_id` alone.
- Candidate scan-path refusal rules are code-enforced in `scripts/bury-helper.mjs`, including refusal of filesystem roots, home, Desktop, Documents, Downloads, non-directories, and symlinked or redirected paths.

Request payload for cremation API:

```json
{
  "name": "PROJECT_NAME",
  "cause": "CAUSE",
  "project_key": "sha256:HASH_FROM_INSPECT_PROJECT",
  "github_url": "OPTIONAL_GITHUB_URL",
  "last_commit_message": "OPTIONAL_LAST_COMMIT_SUBJECT"
}
```

Expected helper stdout contract:

```json
{"status":201,"ok":true,"error":null,"code":null,"retry_after_seconds":null,"record_id":123,"replayed":false}
```

Parse only the single JSON line emitted by the helper-backed Node process.

- Names are limited to 100 characters; causes and commit subjects to 200.
- Helper input accepts `include_github_url: true` only after the user chooses a verified public link. Default local cremations omit the remote URL. The helper-only include flag is not part of the API body.
- Local HTTP requests require the stable `project_key` from inspection. Reuse it across retries; never send raw local paths. GitHub-linked requests additionally undergo server eligibility checks.
- `201` creates a record, `200` recovers an existing record. Require `ok` and `record_id` before updating the local registry. Replays neither consume the daily allowance nor increment the counter.
- Only `401` warrants relinking. `403` preserves the token. Only `429` with `code: DAILY_LIMIT` means the daily quota; other rate limits are temporary. Respect `retry_after_seconds`.
- The server serializes duplicate checks, the first-50 / 3-per-UTC-day allowance, inserts and user counters in `create_cremation_once`. Apply `docs/cremation-write-v2.sql` before deploying this API. Without that migration, writes fail closed.
- Neither the project key nor local scanning proves project authenticity to the server. Moving an untracked project to another path can change its identity. Do not claim these checks prevent determined Sybil / fabricated-project abuse.
