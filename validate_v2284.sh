#!/usr/bin/env bash
set -euo pipefail

node --check src/index.js
node smoke_v2284_ui_performance_revalidation.mjs
bash validate_v2283.sh
