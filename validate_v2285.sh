#!/usr/bin/env bash
set -euo pipefail

node --check src/index.js
node smoke_v2285_mobile_access_menu_hierarchy.mjs
bash validate_v2284.sh
