# Security

Please report suspected vulnerabilities privately to the maintainer through [their profile](https://github.com/azkian1), or use GitHub's private vulnerability reporting when available. Do not publish credentials, exploit payloads containing real user data, or database exports in an issue.

Include the affected route or component, reproduction steps using synthetic data, the expected impact and the commit tested. Do not test destructive actions against production.

## Private data

- Keep environment files, service credentials, OAuth secrets, CLI tokens and authenticated RPC URLs outside Git and public assets.
- Only intentionally public configuration may use `NEXT_PUBLIC_*`. Public Supabase identifiers and an anon key are not server credentials; access must still be protected by database permissions.
- Database backups, migration receipts and operational logs belong in private storage.
- If a credential is exposed, revoke or rotate it first. Removing a file does not remove its Git history or cached copies.

## Project safeguards

Server-side identity checks, shared account quotas, idempotent burial RPCs, rate limits and restricted database access protect writes. Public memorial text is untrusted and rendered as text. GRAVE tributes count only after signature, transaction and canonical-block verification.

Tests cover these boundaries but do not prove the absence of every vulnerability. See the [security engineering notes](docs/secur.md) for constraints and residual risks.
