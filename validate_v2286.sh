#!/usr/bin/env bash
set -euo pipefail

node --check src/index.js
node smoke_v2286_receipt_screen_optimization.mjs
