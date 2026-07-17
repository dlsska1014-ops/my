import fs from "node:fs";
import assert from "node:assert/strict";

const src = fs.readFileSync(new URL("./src/index.js", import.meta.url), "utf8");
let assertions = 0;
const ok = (condition, message) => { assertions += 1; assert.ok(condition, message); };
const match = (re, message) => { assertions += 1; assert.match(src, re, message); };

match(/const APP_VERSION = "V22\.6\.9-SECURITY-SPENDER-PRIVACY-HOTFIX"/, "version");

const commandBlock = src.match(/const KAKAO_REPRESENTATIVE_COMMANDS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
const expected = ["시작","새 가계부 만들기","초대코드로 참여","단톡방 연결","기록 방법","오늘 기록 보기","예산 설정","남은 예산","이번 달 요약","가계부 전환"];
for (const [index, command] of expected.entries()) {
  match(new RegExp(`order: ${index + 1}, label: "${command}", command: "${command}", messageText: "${command}"`), `representative command ${command}`);
}
ok((commandBlock.match(/description: "/g) || []).length === 10, "all representative commands have explicit description field");
ok((commandBlock.match(/description: "(?!")/g) || []).length === 3, "only three representative commands have descriptions");

match(/const KAKAO_FLOW_STEPS_V2254 = Object\.freeze/, "flow schema");
match(/create_household: Object\.freeze\(\["kind", "name", "confirm_name"\]\)/, "create flow steps");
match(/household_choice: Object\.freeze\(\["choose", "confirm_bind"\]\)/, "household bind confirmation step");
match(/budget_setup: Object\.freeze\(\["root", "category", "category_custom", "amount", "confirm"\]\)/, "budget flow steps");
match(/function normalizeKakaoFlowStateV2254/, "state validation");
match(/expiresAt <= Date\.now\(\)/, "expired state invalidation");
match(/function shouldInterruptKakaoFlowV2254/, "top-level command flow interruption");
match(/function isExplicitKakaoTopLevelCommandV2254/, "explicit command detection");
match(/!\/\[\\p\{L\}\\p\{N\}\]\/u\.test\(t\)/, "Unicode-safe Korean name validation");

match(/function kakaoEditConversationScope/, "conversation-scoped edit state");
match(/kakao_edit_v2254:.*stableShortHash\(kakaoEditConversationScope\(payload\)\)/, "edit key contains conversation scope");
match(/삭제하려면 [“"]삭제 확인[”"]/, "destructive delete confirmation");
match(/source_user_key/, "transaction creator key retained");
match(/function isKakaoRowOwnedByRequesterV2254/, "creator authorization helper");

match(/const conversationScope = getKakaoBotGroupKey\(payload\) \|\| "direct"/, "repeat guard scoped by conversation");
match(/KAKAO_REPEAT_GUARD_SECONDS/, "repeat guard configurable");
match(/replace_confirmation_required/, "group rebind confirmation");
match(/!\["owner", "admin"\]\.includes\(role\)/, "group bind owner/admin authorization");
match(/allowReplace: true/, "confirmed group rebind path");
match(/not_allowed_current/, "current linked household authorization");
match(/kakao_group_link_v2254:/, "per-room group-link storage");
match(/Authoritative per-room row prevents lost updates/, "concurrent group-link lost-update protection");

for (const route of ["/sitemap.xml", "/sitemap.xsl", "/ads.txt", "/identity-audit", "/nlu-ops", "/my/analysis"]) {
  ok(src.includes(route), `retained route ${route}`);
}
ok(!src.includes('const APP_VERSION = "V22.5.3-'), "previous version not active");
ok(!src.includes('/ → /my'), "no accidental public-root rollback marker");

console.log(JSON.stringify({ ok: true, assertions, representative_commands: expected, description_count: 3 }));
