#!/usr/bin/env bash
set -euo pipefail

node --check src/index.js
node smoke_v2283_reviewed_stability.mjs
bash validate_v2282.sh
