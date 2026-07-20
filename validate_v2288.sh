#!/usr/bin/env bash
set -euo pipefail

node --check src/index.js
node smoke_v2286_receipt_screen_optimization.mjs
node smoke_v2287_kakao_group_manual_alignment.mjs
node smoke_v2288_ux_principles_action_feedback.mjs

node --input-type=module - <<'NODE'
import app from "./src/index.js";
if (typeof app?.fetch !== "function") throw new Error("src/index.js must export default.fetch");
console.log("deploy_source_esm: default.fetch verified");
NODE
