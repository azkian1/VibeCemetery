# Workflow Contract

Current contract notes:

- `API_BASE_URL` must remain `http://localhost:3000` until the site domain is finalized.
- `/bury` is the only official user-facing entrypoint. This workflow exists only to execute the command pipeline behind it.
- `/bury` only handles local cremations. GitHub account scanning and grave placement belong to the browser site flow, not this workflow.
- If the provided scan path itself looks like a project, `/bury` should treat it as a single project candidate. Otherwise it should scan only immediate child directories.
- Runtime candidate detection must use `scripts/bury-helper.mjs detect-candidates <scanPath>` as the source of truth for root-vs-child classification and local registry duplicate visibility.
- Browser approval requires proof-of-possession of the live `claim_token`. The approval page reads it from the `approve_url` hash fragment and sends it to `/api/cli/link/approve`.
- Safety-critical helper logic lives in `scripts/bury-helper.mjs`. Keep the workflow text aligned with that script instead of duplicating different rules.
- Treat any approval link missing the fragment proof as stale or invalid. Do not fall back to approving by `link_id` alone.

Request payload for cremation API:

```json
{
  "name": "PROJECT_NAME",
  "cause": "CAUSE",
  "github_url": "OPTIONAL_GITHUB_URL",
  "last_commit_message": "OPTIONAL_LAST_COMMIT_SUBJECT"
}
```

Expected helper stdout contract:

```json
{"status":201,"ok":true,"error":null}
```

Parse only the single JSON line emitted by the helper-backed Node process.
