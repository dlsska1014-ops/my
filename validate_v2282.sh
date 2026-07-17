#!/usr/bin/env bash
set -euo pipefail

node --check src/index.js
node smoke_v2282_auth_ui_stability.mjs
bash validate_v2281.sh
node smoke_v2268_operations_data_integrity.mjs
node smoke_v2263_access_import.mjs
