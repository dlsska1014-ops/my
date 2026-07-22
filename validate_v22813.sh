#!/usr/bin/env bash
set -euo pipefail

node validation/validate-receipt.mjs
node validation/validate-kakao-group.mjs
node validation/validate-household-security.mjs
node validation/validate-ux-principles.mjs
node validation/validate-performance-v22811.mjs

echo "V22.8.13 validation complete: 289 checks passed"
