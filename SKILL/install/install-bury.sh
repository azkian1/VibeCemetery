#!/usr/bin/env bash
set -euo pipefail

raw_base="${VIBECEMETERY_INSTALL_RAW_BASE_URL:-https://vibecemetery.app/skills/bury/v1}"
raw_base="${raw_base%/}"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

if [ -n "${VIBECEMETERY_INSTALL_RAW_BASE_URL:-}" ]; then
  node -e '
const url = new URL(process.argv[1]);
const host = url.hostname.toLowerCase();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error("Installer source override is restricted to localhost or 127.0.0.1 test origins");
}
' "$raw_base"
fi

curl -fsSL "$raw_base/manifest.json" -o "$tmp_dir/manifest.json"
curl -fsSL "$raw_base/SKILL/install/install-contract.mjs" -o "$tmp_dir/install-contract.mjs"
curl -fsSL "$raw_base/SKILL/install/install-runner.mjs" -o "$tmp_dir/install-runner.mjs"

node -e '
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const [manifestPath, ...pairs] = process.argv.slice(1);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const files = new Map((manifest.files || []).map((file) => [file.source, file.sha256]));
for (const pair of pairs) {
  const index = pair.indexOf("=");
  const source = pair.slice(0, index);
  const filePath = pair.slice(index + 1);
  const expected = files.get(source);
  if (!/^[a-f0-9]{64}$/i.test(expected || "")) throw new Error(`Missing sha256 for ${source}`);
  const actual = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`sha256 mismatch for ${source}`);
}
' "$tmp_dir/manifest.json" \
  "SKILL/install/install-contract.mjs=$tmp_dir/install-contract.mjs" \
  "SKILL/install/install-runner.mjs=$tmp_dir/install-runner.mjs"

node "$tmp_dir/install-runner.mjs" --manifest "$tmp_dir/manifest.json" "$@"
