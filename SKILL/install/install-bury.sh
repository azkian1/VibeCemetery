#!/usr/bin/env bash
set -euo pipefail

raw_base="https://vibecemetery.app/skills/bury/v1"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

curl -fsSL "$raw_base/SKILL/install/install-contract.mjs" -o "$tmp_dir/install-contract.mjs"
curl -fsSL "$raw_base/SKILL/install/install-runner.mjs" -o "$tmp_dir/install-runner.mjs"

node "$tmp_dir/install-runner.mjs" "$@"
