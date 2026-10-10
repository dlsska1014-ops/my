// V22.9.36 카카오 분류 표 대체 검사.
// 운영 DB 에는 분류 표(accountbook_categories)가 없다 — /ready 가 unavailable_optional_tables 로 알려 왔고, 모든 배포
// 기록이 "예전부터 없었다"고 적었다. 웹 경로(fetchCustomCategories)는 표 조회 실패를 설정에 저장된 분류로 대체하지만,
// V22.9.30 부터 카카오 새 기록 경로(fetchKakaoInputSettings)는 설정 조회와 표 조회를 함께 기다리며 실패를 그대로 던졌다.
// 메모리 픽스처에는 표가 있어 모든 검사가 통과했고, 운영에서만 카카오 새 기록 저장이 실패했다(V22.9.35 가입 해시와 같은
// 유형의 "픽스처가 운영보다 너그러운" 결함). 이 검사는 표가 없는 운영 조건(PostgREST 404 PGRST205)과 표 조회 장애(503)를
// 흉내 내어 카카오 저장이 되는지, 설정 저장 분류·키워드가 그대로 적용되는지, 표가 있을 때의 동작은 그대로인지 본다.
import { readFileSync } from "node:fs";
import { counter, fixture, intercept, post, skill } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.36 카카오 분류 표 대체 검사 통과");
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

const TABLE_MISSING = () => new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.accountbook_categories' in the schema cache" }), { status: 404, headers: { "content-type": "application/json" } });
const TABLE_DOWN = () => new Response(JSON.stringify({ code: "QA", message: "simulated outage" }), { status: 503, headers: { "content-type": "application/json" } });
const categoryTable = (url) => url.pathname.includes("/rest/v1/accountbook_categories");

function selectHome(fx) {
  fx.env.SKILL_RATE_LIMIT = 10000;
  fx.db.accountbook_settings.push({ id: "sel-bin-v22936", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: "2026-07-01T00:00:00Z" });
}
const savedRow = (fx, marker) => fx.db.transactions.find((row) => row.household_id === "house-home" && String(row.raw_text || row.memo || "").includes(marker));
const events = () => globalThis.__AB_OPS_EVENTS || [];

// ── 1. 소스: 표 조회 실패를 대체하고, 설정 조회 실패만 오류로 본다 ──────────────
{
  const fn = source.slice(source.indexOf("async function fetchKakaoInputSettings("), source.indexOf("const KAKAO_RETRY_DEDUP_SECONDS"));
  ok(fn.length > 200, "fetchKakaoInputSettings 를 찾았다");
  ok(/accountbook_categories\?[^\n]*\n\s*\.catch\(/.test(fn), "분류 표 조회에 .catch 대체가 붙어 있다(운영에는 이 표가 없다)");
  ok(fn.includes('kind: "kakao_category_table_unavailable"'), "표 조회 실패를 운영 이벤트 kakao_category_table_unavailable 로 남긴다");
  ok(fn.includes("globalThis.__AB_KAKAO_CATEGORY_TABLE_WARNED"), "운영 이벤트는 인스턴스마다 한 번만 남긴다(220개 버퍼를 채우지 않는다)");
  ok(fn.includes('if (!Array.isArray(settings)) throw new Error("kakao_input_settings_invalid");'), "설정 조회 실패만 오류로 본다(표 결과는 빈 목록이어도 된다)");
  ok(!fn.includes("!Array.isArray(categories)"), "표 결과를 필수로 보던 검사가 없다");
  ok(source.includes("inputSettingsPromise.catch(() => {});"), "allSettled 가 붙기 전의 거절이 처리되지 않은 거절이 되지 않는다");
}

// ── 2. 운영 조건(표 없음, 404): 카카오 새 기록이 저장된다 ────────────────────
await fixture(async (fx) => {
  selectHome(fx);
  delete globalThis.__AB_KAKAO_CATEGORY_TABLE_WARNED;
  const restore = intercept(async ({ url }) => (categoryTable(url) ? TABLE_MISSING() : null));
  try {
    const before = events().length;
    const reply = await skill(fx, "점심 9000 표없음저장");
    ok(reply.includes("저장했어요"), `표가 없어도 카카오 새 기록이 저장된다(예전에는 실패) — ${reply.split("\n")[0]}`);
    const row = savedRow(fx, "표없음저장");
    ok(row && row.amount === 9000 && row.type === "expense", "거래 행이 들어갔다(9,000원 지출)");
    ok(row && row.category && row.category !== "", `기본 분류 규칙이 그대로 적용된다(${row?.category})`);
    const warned = events().slice(before).filter((e) => e.kind === "kakao_category_table_unavailable");
    eq(warned.length, 1, "표 조회 실패를 운영 이벤트로 한 번 남긴다");
    ok(String(warned[0]?.detail || "").includes("404"), "이벤트 상세에 실패 이유(404)가 있다");

    const again = await skill(fx, "커피 4500 표없음둘째");
    ok(again.includes("저장했어요") && savedRow(fx, "표없음둘째"), "두 번째 저장도 된다");
    eq(events().slice(before).filter((e) => e.kind === "kakao_category_table_unavailable").length, 1, "같은 인스턴스에서는 이벤트를 다시 남기지 않는다");
  } finally { restore(); }
});

// ── 3. 운영 조건에서 설정에 저장된 사용자 분류·키워드가 그대로 적용된다 ──────────
await fixture(async (fx) => {
  selectHome(fx);
  fx.db.accountbook_settings.push(
    { id: "cc-v22936", key: "custom_categories:house-home", value: JSON.stringify([{ name: "반려동물", type: "expense", keywords: ["사료"] }]), created_at: "2026-07-01T00:00:00Z" },
    { id: "kw-v22936", key: "category_keywords:house-home", value: JSON.stringify({ "expense::반려동물": ["간식캔"] }), created_at: "2026-07-01T00:00:00Z" },
  );
  const restore = intercept(async ({ url }) => (categoryTable(url) ? TABLE_MISSING() : null));
  try {
    const bySetting = await skill(fx, "사료 32000 표없음설정분류");
    ok(bySetting.includes("저장했어요"), "설정 저장 분류의 키워드로 보낸 기록이 저장된다");
    eq(savedRow(fx, "표없음설정분류")?.category, "반려동물", "설정에 저장된 사용자 분류(사료 → 반려동물)가 적용된다");
    const byKeyword = await skill(fx, "간식캔 7000 표없음키워드");
    eq(savedRow(fx, "표없음키워드")?.category, "반려동물", "키워드 맵(간식캔 → 반려동물)도 적용된다");
  } finally { restore(); }
});

// ── 4. 표 조회 장애(503)도 저장을 막지 않는다 ─────────────────────────────
await fixture(async (fx) => {
  selectHome(fx);
  delete globalThis.__AB_KAKAO_CATEGORY_TABLE_WARNED;
  const restore = intercept(async ({ url }) => (categoryTable(url) ? TABLE_DOWN() : null));
  try {
    const before = events().length;
    const reply = await skill(fx, "주유 50000 표장애저장");
    ok(reply.includes("저장했어요") && savedRow(fx, "표장애저장"), "표 조회가 503 이어도 새 기록은 저장된다");
    ok(events().slice(before).some((e) => e.kind === "kakao_category_table_unavailable" && String(e.detail).includes("503")), "503 도 운영 이벤트로 남는다");
  } finally { restore(); }
});

// ── 5. 설정 조회 실패는 예전처럼 저장하지 않고 분명히 알린다 ─────────────────
await fixture(async (fx) => {
  selectHome(fx);
  const restore = intercept(async ({ url }) => (url.pathname.includes("/rest/v1/accountbook_settings") && url.searchParams.get("key")?.startsWith("in.(") ? TABLE_DOWN() : null));
  try {
    const reply = await skill(fx, "택시 12000 설정장애");
    ok(!reply.includes("저장했어요") && !savedRow(fx, "설정장애"), "설정(키워드·결제수단·별칭) 조회가 실패하면 저장하지 않는다(사용자 설정 없이 저장하지 않는 기존 규칙)");
    ok(reply.length > 10, "실패를 안내한다");
  } finally { restore(); }
});

// ── 6. 표가 있을 때(픽스처 기본)의 동작은 그대로다 ───────────────────────────
await fixture(async (fx) => {
  selectHome(fx);
  fx.db.accountbook_categories.push({ id: "cat-v22936", household_id: "house-home", name: "표분류", type: "expense", sort_order: 1, created_at: "2026-07-01T00:00:00Z", keywords: ["표키워드"] });
  const before = events().length;
  const reply = await skill(fx, "표키워드 3000 표있음저장");
  ok(reply.includes("저장했어요"), "표가 있으면 예전처럼 저장된다");
  eq(savedRow(fx, "표있음저장")?.category, "표분류", "표의 분류·키워드가 적용된다");
  eq(events().slice(before).filter((e) => e.kind === "kakao_category_table_unavailable").length, 0, "표가 있으면 이벤트를 남기지 않는다");
}, { categoriesPresent: true });

// ── 7. 웹 빠른 입력은 전부터 표 없이도 저장됐다(두 경로가 같은 조건에서 같은 결과) ──
await fixture(async (fx) => {
  const restore = intercept(async ({ url }) => (categoryTable(url) ? TABLE_MISSING() : null));
  try {
    const res = await post(fx, "/my/transactions", { household_id: "house-home", month: "2026-07", type: "expense", amount: "8000", category: "", memo: "웹표없음", payment_method: "", transaction_date: "2026-07-15", quick_text: "" });
    ok(res.status === 303 || res.status === 200, `웹 빠른 입력도 표 없이 저장된다(HTTP ${res.status})`);
    ok(savedRow(fx, "웹표없음"), "웹 기록 행이 들어갔다");
  } finally { restore(); }
});

done();
