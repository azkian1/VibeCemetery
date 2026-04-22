#!/usr/bin/env bash
set -euo pipefail

raw_base='https://raw.githubusercontent.com/azkian1/VibeCemetery/ba82543066d5696535d9af97f142872c6bf1ba00'
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

curl -fsSL "$raw_base/SKILL/install/install-contract.mjs" -o "$tmp_dir/install-contract.mjs"
curl -fsSL "$raw_base/SKILL/install/install-runner.mjs" -o "$tmp_dir/install-runner.mjs"

node "$tmp_dir/install-runner.mjs" "$@"
