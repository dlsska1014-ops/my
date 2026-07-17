#!/usr/bin/env bash
set -euo pipefail

node --check src/index.js
node smoke_receipt_screen_optimization.mjs
bash validate_v2285.sh
