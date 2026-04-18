---
description: Cremate dead local projects via VibeCemetery
argument-hint: [scan-path]
disable-model-invocation: true
---

`/bury` is the only official user-facing entrypoint for CLI cremation.

Load the internal skill `bury-workflow` first, then execute its workflow exactly.

Use `$ARGUMENTS` as the scan path when provided. If `$ARGUMENTS` is empty, use the current working directory.

Stay within the workflow's scope boundary:
- local project scanning only
- no GitHub account scan
- no grave creation on the map
- API base must remain `https://vibecemetery.app`

Do not bypass the workflow's path safety checks, token flow checks, config/registry protections, or helper-backed API execution.
