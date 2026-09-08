# Project documentation

The live product is the v2 cemetery at [/cemetery](https://vibecemetery.app/cemetery): GitHub and local project burials, grave links, F, verified GRAVE tributes, The Crypt, Necropolis and the Crematory.

| Guide | Purpose |
| --- | --- |
| [Setup](setup.md) | Dependencies, environment, database installation and tests |
| [Map](map2.md) | Current map, zones, slots, camera, buildings and committed assets |
| [Implementation](CLAUDE.md) | Application boundaries and development conventions |
| [Burial schema](unified-burial-setup.md) | Shared quota, GitHub/local flows and upgrade order |
| [GRAVE burns](web3-grave-burn-mvp.md) | Verification, accounting and recovery |
| [Burn release checks](web3-grave-burn-v1-finish-runbook.md) | Safe configuration, preflight and acceptance |
| [Release operations](v2-cutover-runbook.md) | Deployment verification, observation and recovery |
| [Slot audit](v2-slot-audit.md) | The approved 144-slot map contract |
| [Security](../SECURITY.md) | Reporting issues and handling private data |

## Current and planned

Two of nine zones are open. The current map contains 144 approved plots; the full-world target is 666. Further zones are planned around published GRAVE burn checkpoints. Thresholds, release dates and automated unlock behavior are not implemented contracts yet.

The [master-plan illustration](images/cemetery-master-plan.png) shows the intended world, not a screenshot or an authoritative slot allocation. Use the shipped TMJ and slot audit for current behavior.

The [Agent Ash / GitLawb experiment](agent-layer/README.md) is paused. Its archived contracts are maintained separately for compatibility; the active local-project workflow uses the site's agent instructions.

## Repository boundaries

Keep source, required runtime art, migrations and meaningful automated tests in Git. Keep database exports, credentials, deployment receipts, temporary screenshots and retired planning documents in private operator storage. Historical SQL filenames are stable migration identifiers; follow the setup guide rather than executing every SQL file alphabetically.
