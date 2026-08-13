// V22.8.94 — 통합 작업지시서 8.4(위젯형 홈 커스터마이즈) 검사.
//
// 11장이 건 통과 조건은 하나다: **설정 없는 계정에서 기본 순서 렌더.**
// 이 폴백이 정상 경로다 — 홈 구성 화면을 한 번도 연 적 없는 계정이 대다수이고,
// 폴백이 없으면 그 사람들의 홈이 통째로 비어 보인다. 그래서 "설정 없음" 뿐 아니라
// "설정이 깨졌을 때"까지 기본 순서로 돌아오는지 함께 본다.
//
// 8.4 가 정한 나머지 규칙:
//   · 대상은 리포트 4장(P1)과 바로가기(P3)뿐. P0 와 최근 내역은 **고정**한다 —
//     홈의 뼈대를 지울 수 있으면 "홈이 비었어요" 문의에 답할 방법이 없다.
//   · 저장은 accountbook_settings 의 (가계부·사용자) 키. 새 표를 만들지 않는다.
//   · 편집은 체크와 순서 이동. **드래그는 만들지 않는다**(키보드·스크린리더 비용).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";
const month = "2026-07";
const householdId = "house-home";

const reportsOf = (html) => [...html.matchAll(/<article class="homeReport"><div class="homeReportTop"><span>([^<]*)<\/span>/g)].map((m) => m[1]);
const shortcutsOf = (html) => {
  const nav = (html.match(/<nav class="homeQuick[^"]*">[\s\S]*?<\/nav>/) || [""])[0];
  return [...nav.matchAll(/<b>([^<]*)<\/b>/g)].map((m) => m[1]);
};
const DEFAULT_REPORTS = "어디에 썼나,쓰는 속도,예산 항목,앞으로 나갈 돈";
const DEFAULT_SHORTCUTS = "입력,예산,정기 수입·지출,스마트,분류,전체";

// ---------------------------------------------------------------------------
// 소스: 새 표를 만들지 않고, 드래그를 만들지 않는다
// ---------------------------------------------------------------------------
ok(source.includes('return `home-layout:v1:${String(householdId || "default").trim() || "default"}:${String(userKey || "shared").trim() || "shared"}`;'), "설정 키가 (가계부·사용자)별이다");
// 즐겨찾기와 같은 방식 — 키-값 저장소만 쓴다.
const saveStart = source.indexOf("async function handleHomeLayoutSave(");
const saveBody = source.slice(saveStart, source.indexOf("\nasync function handleBudgetCenterPage(", saveStart));
ok(saveBody.includes("saveSettingValue(env, homeLayoutKey("), "저장은 기존 키-값 저장소를 쓴다");
for (const table of ["home_layout", "accountbook_home_layout", "widgets"]) {
  eq(source.includes(table), false, `새 표(${table})를 만들지 않는다`);
}
// 드래그는 만들지 않는다.
const pageStart = source.indexOf("async function handleHomeLayoutPage(");
const pageBody = source.slice(pageStart, saveStart);
for (const token of ["draggable", "dragstart", "dragover", "ondrop"]) {
  eq(pageBody.includes(token) || source.slice(source.indexOf("function renderHomeLayoutSection("), pageStart).includes(token), false, `순서 이동에 ${token} 을 쓰지 않는다`);
}
// 편집 화면은 폼 submit 만으로 끝난다 — JS 가 없어도 체크와 순서 이동이 동작한다.
eq(/<script/.test(pageBody), false, "편집 화면에 스크립트가 없다(JS 없이 동작한다)");
ok(source.includes('<button type="submit" name="move" value="${escapeHtml(`${field}:${id}:up`)}"'), "순서 이동은 폼 submit 이다");

const fixture = await createV2265QaFixture();
try {
  const get = async (path, cookie) => {
    const response = await app.fetch(new Request(`${ORIGIN}${path}`, { headers: { cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
    return { status: response.status, text: await response.text() };
  };
  const post = async (params, cookie) => {
    const response = await app.fetch(new Request(`${ORIGIN}/home-layout/save`, {
      method: "POST",
      headers: { cookie, "user-agent": "Mozilla/5.0", origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }), fixture.env, {});
    return { status: response.status, location: response.headers.get("location") || "" };
  };
  const body = (pairs) => {
    const params = new URLSearchParams();
    params.set("household_id", householdId);
    params.set("month", month);
    for (const [key, value] of pairs) params.append(key, value);
    return params;
  };
  const allReports = [["reports_order", "where"], ["reports_order", "pace"], ["reports_order", "budget"], ["reports_order", "reserve"]];
  const allShortcuts = [["shortcuts_order", "add"], ["shortcuts_order", "budgets"], ["shortcuts_order", "reserve-plans"], ["shortcuts_order", "smart-tools"], ["shortcuts_order", "categories"], ["shortcuts_order", "menu"]];
  const onAll = [["reports_on", "where"], ["reports_on", "pace"], ["reports_on", "budget"], ["reports_on", "reserve"], ["shortcuts_on", "add"], ["shortcuts_on", "budgets"], ["shortcuts_on", "reserve-plans"], ["shortcuts_on", "smart-tools"], ["shortcuts_on", "categories"], ["shortcuts_on", "menu"]];

  // -------------------------------------------------------------------------
  // 통과 조건 — 설정 없는 계정에서 기본 순서 렌더
  // -------------------------------------------------------------------------
  const fresh = await get(`/app?month=${month}&household_id=${householdId}`, fixture.cookie);
  eq(fresh.status, 200, "설정이 없는 계정의 홈이 열린다");
  eq(reportsOf(fresh.text).join(","), DEFAULT_REPORTS, "설정이 없으면 리포트가 기본 순서다");
  eq(shortcutsOf(fresh.text).join(","), DEFAULT_SHORTCUTS, "설정이 없으면 바로가기가 기본 순서다");
  ok(fresh.text.includes('class="homeReportsEdit"'), "홈에 '홈 구성' 링크가 있다");

  // 설정이 **깨졌을 때**도 같은 자리로 돌아온다. 저장된 값을 믿고 그리면
  // 값 하나 깨진 계정의 홈이 통째로 비어 보인다.
  const key = `home-layout:v1:${householdId}:user-bin`;
  for (const broken of ['{"reports":"nope"}', "[]", "not json at all", '{"reports":{"order":["ghost","ghost"],"hidden":"x"}}']) {
    fixture.db.accountbook_settings.length = 0;
    fixture.db.accountbook_settings.push({ key, value: broken, updated_at: "2026-07-01T00:00:00.000Z" });
    const page = await get(`/app?month=${month}&household_id=${householdId}`, fixture.cookie);
    eq(reportsOf(page.text).join(","), DEFAULT_REPORTS, `깨진 설정(${broken.slice(0, 22)})에서도 기본 순서다`);
  }
  fixture.db.accountbook_settings.length = 0;

  // -------------------------------------------------------------------------
  // 저장 왕복 — 끄기와 순서 이동이 남는다
  // -------------------------------------------------------------------------
  const saved = await post(body([...allReports, ...allShortcuts,
    ["reports_on", "where"], ["reports_on", "pace"], ["reports_on", "budget"],
    ["shortcuts_on", "add"], ["shortcuts_on", "menu"],
    ["move", "reports:pace:up"]]), fixture.cookie);
  eq(saved.status, 303, "저장은 리다이렉트로 끝난다");
  ok(saved.location.includes("msg=saved"), "저장 결과를 알려 준다");
  const after = await get(`/app?month=${month}&household_id=${householdId}`, fixture.cookie);
  eq(reportsOf(after.text).join(","), "쓰는 속도,어디에 썼나,예산 항목", "끈 카드는 사라지고 옮긴 카드는 위로 간다");
  eq(shortcutsOf(after.text).join(","), "입력,전체", "끈 바로가기는 사라진다");
  // 새 표를 만들지 않았다 — 설정 한 줄에만 담긴다.
  eq(fixture.db.accountbook_settings.filter((row) => row.key === key).length, 1, "설정 한 줄에만 담긴다");

  // -------------------------------------------------------------------------
  // P0 와 최근 내역은 고정 — 끌 수 있는 대상 자체가 아니다
  // -------------------------------------------------------------------------
  // 네 장·여섯 개를 전부 끈 상태에서도 홈의 뼈대는 남아야 한다.
  await post(body([...allReports, ...allShortcuts]), fixture.cookie);
  const bare = await get(`/app?month=${month}&household_id=${householdId}`, fixture.cookie);
  eq(reportsOf(bare.text).length, 0, "전부 끄면 리포트가 없다");
  ok(bare.text.includes("이번 달 쓸 수 있는 돈"), "그래도 P0 는 남는다");
  ok(bare.text.includes("최근 내역"), "그래도 최근 내역은 남는다");
  eq(bare.text.includes('class="homeReports"'), false, "카드를 다 끄면 제목만 남은 빈 상자를 두지 않는다");
  // 되돌릴 길이 없으면 끈 사람이 갇힌다.
  ok(bare.text.includes('class="homeQuick homeQuickEmpty"'), "바로가기를 다 꺼도 되돌아갈 자리가 남는다");
  ok(bare.text.includes("/home-layout?"), "그 자리는 홈 구성으로 이어진다");
  // 편집 화면의 목록에 P0·최근 내역이 아예 없다.
  const editor = await get(`/home-layout?month=${month}&household_id=${householdId}`, fixture.cookie);
  eq(editor.status, 200, "홈 구성 화면이 열린다");
  eq((editor.text.match(/class="hlRow"/g) || []).length, 10, "고를 수 있는 것은 리포트 4 + 바로가기 6 뿐이다");
  for (const fixed of ["쓸 수 있는 돈", "최근 내역"]) {
    eq(new RegExp(`name="(reports|shortcuts)_on" value="[^"]*"[^>]*/><span>${fixed}`).test(editor.text), false, `${fixed} 는 끌 수 있는 대상이 아니다`);
  }
  ok(editor.text.includes("홈의 뼈대라 끄거나 옮길 수 없습니다"), "고정이라는 사실을 화면이 말한다");
  // 조작 요소는 44px 이상(1장 공통 규칙).
  ok(editor.text.includes(".hlMove button{width:44px;height:44px"), "순서 이동 버튼이 44px 이다");
  ok(editor.text.includes(".hlPick{flex:1;display:flex;align-items:center;gap:10px;min-height:44px"), "체크 영역이 44px 이다");

  // -------------------------------------------------------------------------
  // 범위 — 내 설정이 남의 홈을 바꾸지 않는다
  // -------------------------------------------------------------------------
  const other = await fixture.cookieFor("user-wifi");
  const otherHome = await get(`/app?month=${month}&household_id=${householdId}`, other);
  eq(reportsOf(otherHome.text).join(","), DEFAULT_REPORTS, "같은 가계부의 다른 참여자는 기본 순서 그대로다");
  eq(shortcutsOf(otherHome.text).join(","), DEFAULT_SHORTCUTS, "다른 참여자의 바로가기도 그대로다");
  const otherHousehold = await get(`/app?month=${month}&household_id=house-trip`, fixture.cookie);
  eq(reportsOf(otherHousehold.text).join(","), DEFAULT_REPORTS, "같은 사람의 다른 가계부도 기본 순서다");

  // -------------------------------------------------------------------------
  // 앞으로 카드가 늘어도 조용히 사라지지 않는다
  // -------------------------------------------------------------------------
  // 예전 설정에 없던 id 는 뒤에 붙고, 모르는 id 는 버린다.
  fixture.db.accountbook_settings.length = 0;
  fixture.db.accountbook_settings.push({ key, value: JSON.stringify({ reports: { order: ["reserve", "ghost"], hidden: [] } }), updated_at: "2026-07-01T00:00:00.000Z" });
  const partial = await get(`/app?month=${month}&household_id=${householdId}`, fixture.cookie);
  eq(reportsOf(partial.text).join(","), "앞으로 나갈 돈,어디에 썼나,쓰는 속도,예산 항목", "설정에 없던 카드는 뒤에 붙고 모르는 id 는 버려진다");
  fixture.db.accountbook_settings.length = 0;

  // -------------------------------------------------------------------------
  // 권한 — 볼 수 없는 가계부의 키에 쓰지 못한다
  // -------------------------------------------------------------------------
  const createdAt = "2026-07-01T00:00:00.000Z";
  fixture.db.users.push({ id: "user-out", kakao_user_key: "kakao_login:out", nickname: "바깥씨", created_at: createdAt });
  const outsider = await fixture.cookieFor("user-out");
  const before = fixture.db.accountbook_settings.length;
  const denied = await post(body([...allReports, ...allShortcuts, ...onAll]), outsider);
  eq(denied.status, 303, "소속이 없는 사람의 저장은 리다이렉트로 끝난다");
  eq(fixture.db.accountbook_settings.length, before, "소속이 없는 사람은 남의 가계부 키에 쓰지 못한다");

  // -------------------------------------------------------------------------
  // 비용 — 설정 한 줄을 읽는 것 이상은 늘리지 않는다
  // -------------------------------------------------------------------------
  // 절대 횟수로 재지 않는다 — 사용자 조회가 첫 호출 뒤 캐시돼서, 같은 프로세스
  // 안에서는 몇 번째로 재느냐에 따라 10 이 되기도 11 이 되기도 한다. 대신 **무엇이
  // 늘었는지**를 직접 센다: 홈 구성 때문에 늘어난 질의는 그 키 한 줄뿐이어야 한다.
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const requestUrl = new URL(typeof input === "string" ? input : input.url);
    if (requestUrl.hostname === "mock.supabase.co") calls.push(`${requestUrl.pathname}${decodeURIComponent(requestUrl.search)}`);
    return realFetch(input, init);
  };
  try {
    await get(`/app?month=${month}&household_id=${householdId}`, fixture.cookie);
  } finally {
    globalThis.fetch = realFetch;
  }
  const layoutReads = calls.filter((call) => call.includes(`key=eq.home-layout:v1:${householdId}:user-bin`));
  eq(layoutReads.length, 1, `홈 구성은 한 번만 읽는다 (${layoutReads.length})`);
  ok(layoutReads[0].includes("limit=1"), "그 한 번도 한 줄만 가져온다");
  // 나머지는 V22.8.91 그대로여야 한다 — 카드 순서를 정하려고 자료를 다시 받지 않는다.
  eq(calls.filter((call) => call.startsWith("/rest/v1/transactions")).length, 2, "거래 조회는 그대로 두 번이다");
  eq(calls.filter((call) => call.startsWith("/rest/v1/accountbook_budgets")).length, 1, "예산 조회는 그대로 한 번이다");
  eq(calls.filter((call) => call.startsWith("/rest/v1/households")).length, 1, "가계부 조회는 그대로 한 번이다");
} finally {
  fixture.restore();
}

console.log(`V22.8.94 홈 구성(8.4) 검사 통과 (${checks} checks)`);
