#!/usr/bin/env bash
set -euo pipefail

EXPECTED_MANIFEST_PAYLOAD_SHA256="456f4bbdbb4ba7729d1eaf023d5aa352679842988e8a68265636f7e4a0de0326"
raw_base="${VIBECEMETERY_AGENT_SKILL_INSTALL_BASE_URL:-https://vibecemetery.app/agents/gitlawb/v1}"
raw_base="${raw_base%/}"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

if [ -n "${VIBECEMETERY_AGENT_SKILL_INSTALL_BASE_URL:-}" ]; then
  expected_manifest_payload_sha256=""
  node -e '
const url = new URL(process.argv[1]);
const host = url.hostname.toLowerCase();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error("Installer source override is restricted to localhost or 127.0.0.1 test origins");
}
' "$raw_base"
else
  expected_manifest_payload_sha256="$EXPECTED_MANIFEST_PAYLOAD_SHA256"
fi

curl -fsSL "$raw_base/manifest.json" -o "$tmp_dir/manifest.json"
curl -fsSL "$raw_base/SKILL/agent-install/install-gitlawb-runner.mjs" -o "$tmp_dir/install-gitlawb-runner.mjs"

node -e '
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const [manifestPath, expectedPayloadSha256, runnerPath] = process.argv.slice(1);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const payloadFiles = (manifest.files || [])
  .filter((file) => !["SKILL/agent-install/install-gitlawb.sh", "SKILL/agent-install/install-gitlawb.ps1"].includes(file.source))
  .map((file) => ({ source: file.source, sha256: file.sha256 }));
const computedPayloadSha256 = createHash("sha256").update(JSON.stringify({ files: payloadFiles })).digest("hex");
const declaredPayloadSha256 = String(manifest.payload_sha256 || "").toLowerCase();
if (declaredPayloadSha256 !== computedPayloadSha256) {
  throw new Error("manifest payload_sha256 does not match manifest files");
}
if (expectedPayloadSha256 && computedPayloadSha256 !== expectedPayloadSha256.toLowerCase()) {
  throw new Error("manifest payload_sha256 mismatch");
}
const runnerEntry = (manifest.files || []).find((file) => file.source === "SKILL/agent-install/install-gitlawb-runner.mjs");
if (!runnerEntry || !/^[a-f0-9]{64}$/i.test(runnerEntry.sha256 || "")) {
  throw new Error("Missing sha256 for SKILL/agent-install/install-gitlawb-runner.mjs");
}
const runnerSha256 = createHash("sha256").update(readFileSync(runnerPath)).digest("hex");
if (runnerSha256.toLowerCase() !== runnerEntry.sha256.toLowerCase()) {
  throw new Error("sha256 mismatch for SKILL/agent-install/install-gitlawb-runner.mjs");
}
' "$tmp_dir/manifest.json" "$expected_manifest_payload_sha256" "$tmp_dir/install-gitlawb-runner.mjs"

node "$tmp_dir/install-gitlawb-runner.mjs" --manifest "$tmp_dir/manifest.json" "$@"
