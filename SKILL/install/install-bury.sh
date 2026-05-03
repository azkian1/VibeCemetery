#!/usr/bin/env bash
set -euo pipefail

install_ref="${VIBECEMETERY_INSTALL_REF:-ba4d1a0765b81d071b2824e92460687537786dd6}"
raw_base="https://raw.githubusercontent.com/azkian1/VibeCemetery/${install_ref}"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

curl -fsSL "$raw_base/SKILL/install/install-contract.mjs" -o "$tmp_dir/install-contract.mjs"
curl -fsSL "$raw_base/SKILL/install/install-runner.mjs" -o "$tmp_dir/install-runner.mjs"

node "$tmp_dir/install-runner.mjs" "$@"
