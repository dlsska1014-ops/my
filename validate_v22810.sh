#!/usr/bin/env bash
set -euo pipefail

release_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$release_root"

expected_source_sha256="dbbe336ea7b75fade6906c3ae144c2e2945fbd7e009a00159e8c1f35fea05d3b"
actual_source_sha256=$(sha256sum src/index.js | awk '{print $1}')

if [[ "$actual_source_sha256" != "$expected_source_sha256" ]]; then
  echo "FAIL: src/index.js SHA-256 mismatch" >&2
  exit 1
fi

node --check src/index.js
node validation/validate-receipt.mjs
node validation/validate-kakao-group.mjs
node validation/validate-household-security.mjs
node validation/validate-ux-principles.mjs
node validation/validate-performance-v22810.mjs
node --input-type=module -e "import('./src/index.js').then((module) => { if (typeof module.default?.fetch !== 'function') process.exit(1); console.log('artifact_entrypoint: default.fetch available'); })"

echo "V22.8.10 release validation: 203 checks passed"
echo "src/index.js SHA-256: $actual_source_sha256"
