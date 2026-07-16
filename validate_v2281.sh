#!/usr/bin/env bash
set -euo pipefail

node --check src/index.js

for test_file in \
  smoke_v2281_guided_uiux.mjs \
  smoke_v2280_asset_dashboard.mjs \
  static_asset_qa_v2271.mjs \
  static_asset_sql_qa_v2280.mjs \
  static_sql_qa_v2270.mjs \
  static_ui_qa_v2270.mjs \
  static_my_route_qa_v2272.mjs \
  smoke_v2270_auth_atomicity.mjs \
  smoke_v2273_user_navigation.mjs \
  smoke_v2273_webview_csrf_user_nav.mjs \
  smoke_v2273_webview_record_mutation.mjs \
  smoke_v2267_stabilization_hidden_incomplete.mjs \
  nlu_eval_v221.mjs
do
  node "$test_file"
done
