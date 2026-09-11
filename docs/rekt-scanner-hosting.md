# Running the REKT scanner away from a workstation

The scanner is a finite read-only CLI job, not a web server. It does not need the Next.js application, Supabase, wallet private keys, an LLM or inbound ports. The repository includes a dedicated minimal runtime and Dockerfile. No cloud account, paid resource or deployment is created by this patch.

## Recommended first deployment

Updated decision, September 11: the user selected our calculation + indexed history + Alchemy RPC + caching, with a target of 30 seconds to preliminary results. Use [the fast scanner runbook](rekt-scanner-fast-plan.md). GitHub Actions remains a convenient manual/background test host; the planned interactive backend is Vercel with durable state in Supabase. A VPS is optional. The CLI filesystem cache must be replaced by shared storage/coordination for multiple serverless instances. No hosting deployment has been performed.

The original minimal-change hosting option was one Linux VM/VPS with persistent disk. A container job platform with a persistent volume also works. Start one job at a time and keep private JSON reports and checkpoints on durable storage. Serverless hosting needs durable checkpoints and resumable jobs for scans that exceed a request deadline.

Before choosing a host, measure a representative scan's duration and provider request count; CPU is usually secondary to RPC limits. No workload sizing or provider SLA has been measured for production yet.

Required configuration:

- RPC endpoints for target networks. Shared public RPC is usable for experiments but can timeout, throttle or lack historical state. Robinhood lists Alchemy, QuickNode, Blockdaemon, dRPC and Validation Cloud at https://docs.robinhood.com/chain/connecting/ . Test the actual plan's history/state coverage before purchasing capacity.
- Optional `REKT_RELAY_API_KEY` for Relay v3. Without it, the existing public v2 compatibility path remains; its availability is not guaranteed. An API key is not a signing key.
- For the independent funding scan: `REKT_BASE_RPC_URL`, `REKT_ROBINHOOD_RPC_URL`, `REKT_BNB_RPC_URL`, `REKT_ETHEREUM_RPC_URL`.
- A private mounted directory for reports/checkpoints. Preserve this volume across container replacements. Do not put it in public web storage.

## Build and run (Linux host, repository root)

```sh
docker build -f scripts/rekt-scan/Dockerfile -t rekt-scanner:local .
docker volume create rekt-data
docker run --rm rekt-scanner:local
```

The image uses the non-root `node` user (UID 1000). A fresh named volume at `/data` inherits the image directory ownership; for an existing bind mount, arrange UID 1000 write access explicitly. The Docker-specific ignore file excludes application secrets, archived wallets, Git history and the rest of the website from the build context.

Create a private environment file outside the repository, e.g. `/etc/rekt/scanner.env`, with the API/RPC variables above. Limit its permissions to the operator. Node does not load `.env` files implicitly.

```sh
docker run --rm --init --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  --env-file /etc/rekt/scanner.env -v rekt-data:/data \
  rekt-scanner:local scripts/rekt-scan/cli.mts \
  --wallet 0xYOUR_ADDRESS --chain robinhood --source auto \
  --output /data/scan-001.json --max-requests 1200 --timeout-ms 15000
```

Resume the **same snapshot**, within its 24-hour checkpoint TTL, using the same command plus `--resume`. After switching to an archive-capable RPC, use `--resume --retry-evidence` to retry failed evidence reads in discovery mode. Use `--request-interval-ms 1000` for stricter shared-provider limits and `--chunk-size 100000` to reset a pending history range. For a new snapshot or expired checkpoint choose a new output filename; do not overwrite the old report.

For the next daily scan, pass `--seed-checkpoint /data/scan-001.json.checkpoint.json` with a **new** output filename, or configure `--cache-dir /data/cache`. The old snapshot's hash is revalidated. Discovery now also reuses finalized raw transaction evidence and historical prices/balances while rebuilding derived flows and refreshing Relay data. RPC history fetches the tail; indexed history rechecks a recent overlap. A seed can be older than the resume TTL because it is revalidated historical input, not a resumed job. A detected old-block reorg rejects the seed.

Run the separate first-funding job with the same image/environment/volume and `scripts/rekt-scan/funding.mts --wallet 0xYOUR_ADDRESS --output /data/funding-001.json`. It has its own budget flags; use `--help` before running. The signature/linking server is a later stage.

## Job lifecycle

- Exit 0: collection/analysis complete within that source's documented scope.
- Exit 2: partial coverage or preliminary discovery. This is an expected outcome for `auto`, including successful collection; inspect `collectionComplete`, `preliminaryCandidates`, `exclusions` and `verification`.
- Exit 1: failed configuration/job; 130: cancelled.
- SIGTERM/SIGINT abort requests and retain the last saved checkpoint. Normal cleanup removes the output lock. A hard kill can leave a lock: confirm the original process/container has stopped before removing only that lock. Never run two writers against one output path.
- A failed resume preserves a completed analytical report and writes a sibling `.error.json`.
- Never use an unconditional restart-on-failure loop: exit 2 is not a reason to repeatedly query the chain. An operator/scheduler should inspect results, budget and resume TTL.

## Later website connection

Keep this process boundary: API accepts a wallet/job request → worker runs the scanner → private result store → API returns a filtered DTO. Add a queue, authentication, idempotency, per-user budgets and public/private field separation in that later patch. The current container intentionally exposes no HTTP endpoint.

## Validation status

All 129 scanner tests passed in a separately installed minimal runtime directory with only viem and its dependencies; typecheck and scoped lint also pass. Docker is not installed on the current workstation, so image build/start and Linux execution are explicit deployment-environment checks, not claimed successful container tests.
