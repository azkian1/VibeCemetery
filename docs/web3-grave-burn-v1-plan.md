# GRAVE burn v1 — reference index

The original pre-release plan is superseded by the implemented burn and recovery flow. Current behavior, flags, API boundaries and tests are documented in [web3-grave-burn-mvp.md](web3-grave-burn-mvp.md).

The original release targeted map v1. Its fixes are now carried into the development branch for both maps; this does not release map v2 on the primary domain.

Retained operational references:

- [Initial burn schema](web3-grave-burn-mvp.sql).
- [Hardening migration](web3-grave-burn-v1-finish.sql) and [preflight runbook](web3-grave-burn-v1-finish-runbook.md).
- [Unknown-hash recovery migration](web3-grave-burn-hash-recovery.sql).
- [Current burial migration order](unified-burial-setup.md).

Do not treat old rollout dates, disabled-feature snapshots or proposed amount presets as current configuration. Read `src/web3/config.ts` and the target deployment's actual settings.