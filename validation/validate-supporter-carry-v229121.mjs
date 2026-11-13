#!/usr/bin/env node
// V22.9.121 후원자 표시 옮기기·포인트 색 검사.
//   1. carryUserSettingsAfterMergeV229121(my/merge-carry.js)를 가짜 설정 표로 직접 부른다: 네 줄을 key=in.(…) 한 번으로 읽기, 보조 계정 표시만
//      있으면 옮기기, 둘 다 있으면 합치기(시작일·끝나는 날·메모·명단 이름), 값 오류는 그대로, 안내 확인 기록 복사(보조 줄은 남김),
//      읽기·쓰기·지우기 실패와 남은 호출 부족은 운영 이벤트만 남기고 던지지 않음, DB 호출 많아야 4회, 이벤트에 키·값 없음.
//   2. 관리자 계정 통합(POST /admin/identity/merge → performIdentityMerge)으로 같은 일이 실제로 일어나는지: 옮기기·합치기·둘 다 없음·값 오류·
//      안내 기록 복사, 설정 읽기·쓰기·지우기 실패에도 통합은 성공하고 운영 이벤트 하나, 늘어난 DB 호출은 옮긴 만큼(읽기 1 + 쓰기 3 = 4)뿐.
//   3. 포인트 색 쿠키 ab_sp: 홈(/app·/m)·전체 메뉴·참여자 화면이 켜진 후원자에게 주고 아닌 사람에게서 지운다(끝난·시작 전·값 오류·읽기 실패 = 지움),
//      관리자 세션과 구성원 50명 밖의 참여자 화면은 그대로, 세 화면의 HTML·DB 호출 수는 쿠키와 무관하게 같다.
//   4. 다른 셸 화면(리포트·소비 분석·설정·결제수단 등)은 로그인 세션 + ab_sp=1 일 때만 data-supporter 와 포인트 색 머리 조각을 받고, 그 둘을
//      빼면 바이트가 같다. 쿠키·세션이 없거나 ab_sp 가 1 이 아니면 응답 그대로. 공개 화면(사이트맵 전부)·관리자 화면·로그인 화면·
//      HTML 이 아닌 응답·404·HEAD 는 늘 그대로.
//   5. 로그아웃(/logout·/my/logout)과 세션을 새로 주는 응답(가입 등)은 ab_sp 를 지운다(한 번만). 처음부터 끝까지(쿠키 통) 흐름.
//   6. 소스: MANIFEST·호출 자리·DB 를 부르지 않는 응답 마무리·‘보기만 바꾼다’ 주석.
// 실제 번들(src/index.js)의 app.fetch 와 QA 픽스처, 그리고 두 모듈을 직접 불러 본다. DB·네트워크 없음. 장면 시계 2026-07-15(KST).
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { app, BASE, ctx, fixture, intercept, post, putSetting, settingValue, withClock } from "./lib-audit-v22934.mjs";
import { carryUserSettingsAfterMergeV229121 } from "../src/modules/my/merge-carry.js";
import { supporterAccentCookieV229121, supporterAccentResponseV229121, withSupporterAccentCookieV229121 } from "../src/modules/my/supporter-accent.js";
import { supporterHeadHtml } from "../src/modules/my/supporters.js";
import { ACCOUNTBOOK_SHELL_CSS_ASSET_PATH } from "../src/modules/assets/asset-registry.js";

let checks = 0;
const failures = [];
const show = (value) => { try { return String(JSON.stringify(value)).slice(0, 300); } catch (_) { return String(value).slice(0, 300); } };
function ok(cond, msg) { checks += 1; if (!cond) failures.push(msg); }
function eq(actual, expected, msg) { checks += 1; if (!isDeepStrictEqual(actual, expected)) failures.push(`${msg} — 실제 ${show(actual)} · 기대 ${show(expected)}`); }
async function section(name, task) {
  try { await task(); } catch (error) {
    checks += 1;
    failures.push(`${name}: 구간이 끝까지 돌지 못했다 — ${String(error?.stack || error).split("\n").slice(0, 3).join(" ").slice(0, 360)}`);
  }
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const opsEvents = () => globalThis.__AB_OPS_EVENTS || [];
const opsMark = () => new Set(opsEvents());
const eventsSince = (mark) => opsEvents().filter((entry) => !mark.has(entry));

const TODAY = "2026-07-15";
const SET = "ab_sp=1; Path=/; Max-Age=86400; SameSite=Lax; Secure; HttpOnly";
const CLEAR = "ab_sp=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly";
const HOME = "/app?month=2026-07&household_id=house-home";
const MOBILE = "/m?month=2026-07&household_id=house-home";
const MENU = "/menu?household_id=house-home&month=2026-07";
const MEMBERS = "/my/members?household_id=house-home&month=2026-07";
const SELF_PAGES = [["홈", HOME], ["홈(/m)", MOBILE], ["전체 메뉴", MENU], ["참여자", MEMBERS]];
const SHELL_PAGES = [
  "/reports?month=2026-07&household_id=house-home",
  "/my/analysis?month=2026-07&household_id=house-home",
  "/my/settings?month=2026-07&household_id=house-home",
  "/payment-methods?month=2026-07&household_id=house-home",
  "/budgets?month=2026-07&household_id=house-home",
  "/settlement-summary?month=2026-07&household_id=house-home",
  "/my/households",
  "/my/backup",
  "/goals",
  "/annual",
  "/my/setup",
];
const ACCENT_HEAD = supporterHeadHtml({ viewer: true });
const SHELL_LINK = `<link rel="stylesheet" href="${ACCOUNTBOOK_SHELL_CSS_ASSET_PATH}"/>`;
const ADMIN_PASSWORD = "qa-v229121-carry-admin";
const flagValue = (since, until = null, note = "QA", publicName = null) => ({ since, until, note, public_name: publicName });
const flag = (...args) => JSON.stringify(flagValue(...args));
const CONSENT = JSON.stringify({ version: "2026-11-13", at: "2026-07-02T00:00:00.000Z", via: "kakao" });
const CONSENT_PRIMARY = JSON.stringify({ version: "2026-11-13", at: "2026-07-01T00:00:00.000Z", via: "local" });

function spCookies(response) {
  return (typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []).filter((line) => /^ab_sp=/.test(line));
}
async function get(fx, path, cookie = "", { method = "GET", headers = {} } = {}) {
  const response = await app.fetch(new Request(`${BASE}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), accept: "text/html", ...headers } }), fx.env, ctx);
  return {
    status: response.status,
    headers: response.headers,
    location: response.headers.get("location") || "",
    cookies: typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [],
    sp: spCookies(response),
    html: method === "HEAD" ? "" : await response.text(),
  };
}
const htmlTag = (html) => (String(html).match(/<html\b[^>]*>/i) || [""])[0];
const accented = (html) => / data-supporter="1"/.test(htmlTag(html));
const count = (text, needle) => String(text).split(needle).length - 1;
const sameHeaders = (a, b, names = ["content-type", "cache-control", "content-security-policy", "vary", "x-frame-options"]) => names.every((name) => a.headers.get(name) === b.headers.get(name));

// Supabase 로 가는 요청만 적는다(픽스처 fetch 는 그대로 돈다).
async function withDb(task) {
  const log = [];
  const restore = intercept(({ url, method, init }) => {
    if (url.hostname.endsWith("supabase.co")) {
      const headers = new Headers(init?.headers || {});
      const path = `${url.pathname}${url.search}`;
      log.push({ method, path, decoded: decodeURIComponent(path), prefer: headers.get("prefer") || "", body: typeof init?.body === "string" ? init.body : "" });
    }
    return null;
  });
  try { return { result: await task(), log }; } finally { restore(); }
}

// ── 1. 옮기기 함수 직접(가짜 설정 표) ────────────────────────────────────────
const UNIT_ENV = Object.freeze({ SUPABASE_URL: "https://unit-v229121.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "unit-key-v229121" });
const P = "unit-primary";
const S = "unit-secondary";
async function unitCarry(rows = {}, { fail = {}, hasRoom = null, primary = P, secondary = S } = {}) {
  const table = new Map(Object.entries(rows));
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    const body = typeof init.body === "string" ? init.body : "";
    calls.push({ method, path: `${url.pathname}${url.search}`, key: url.searchParams.get("key") || "", body, prefer: new Headers(init.headers || {}).get("prefer") || "" });
    if (url.origin !== new URL(UNIT_ENV.SUPABASE_URL).origin || url.pathname !== "/rest/v1/accountbook_settings") return json({ message: "unexpected" }, 404);
    if (method === "GET") {
      if (fail.read) return json({ code: "QA", message: "read failed" }, 503);
      const list = String(url.searchParams.get("key") || "").match(/^in\.\((.*)\)$/)?.[1] || "";
      const keys = list.split(",").map((item) => item.replace(/^"|"$/g, "")).filter(Boolean);
      return json(keys.filter((key) => table.has(key)).map((key) => ({ key, value: table.get(key) })));
    }
    if (method === "POST") {
      const item = JSON.parse(body || "{}");
      if (fail.write?.includes(item.key)) return json({ code: "QA", message: "write failed" }, 503);
      table.set(item.key, item.value);
      return new Response(null, { status: 201 });
    }
    if (method === "DELETE") {
      if (fail.delete) return json({ code: "QA", message: "delete failed" }, 503);
      table.delete(String(url.searchParams.get("key") || "").replace(/^eq\./, ""));
      return new Response(null, { status: 204 });
    }
    return json([]);
  };
  const mark = opsMark();
  let outcome;
  let threw = null;
  try {
    outcome = await carryUserSettingsAfterMergeV229121({ ...UNIT_ENV }, primary, secondary, { path: "/my/account-link/run", ...(hasRoom ? { hasRoom } : {}) });
  } catch (err) {
    threw = err;
  } finally {
    globalThis.fetch = previous;
  }
  const events = eventsSince(mark).filter((entry) => /^merge_settings_carry_/.test(entry.kind));
  return { table, calls, outcome, threw, events, value: (key) => table.get(key), parsed: (key) => (table.has(key) ? JSON.parse(table.get(key)) : undefined) };
}
const sk = (id) => `supporter:${id}`;
const ck = (id) => `consent:${id}`;

await section("1 옮기기 함수", async () => {
  const none = await unitCarry({});
  eq(none.calls.length, 1, "1-a 줄이 하나도 없으면 읽기 한 번뿐");
  eq(none.calls[0]?.method, "GET", "1-a 그 한 번은 GET");
  eq(none.calls[0]?.key, `in.("${sk(P)}","${sk(S)}","${ck(P)}","${ck(S)}")`, "1-b 네 줄(후원자 주·보조, 안내 기록 주·보조)을 key=in.(…) 한 번으로 읽는다");
  ok(/[?&]select=key%2Cvalue(?:&|$)/.test(none.calls[0]?.path || "") && /[?&]limit=4(?:&|$)/.test(none.calls[0]?.path || ""), "1-b select=key,value · limit=4");
  eq(none.outcome, { read: true, supporter: "none", consent: false, deferred: false, failed: [] }, "1-c 둘 다 없으면 아무것도 쓰지 않는다");
  eq(none.events.length, 0, "1-c 운영 이벤트 없음");

  const moved = await unitCarry({ [sk(S)]: flag("2026-06-01", null, "QA 송금", "와이파이") });
  eq(moved.parsed(sk(P)), flagValue("2026-06-01", null, "QA 송금", "와이파이"), "1-d 보조 계정 표시만 있으면 그대로 주 계정에 적는다");
  ok(!moved.table.has(sk(S)), "1-d 보조 계정 줄은 지운다");
  eq(moved.calls.map((c) => c.method), ["GET", "POST", "DELETE"], "1-d 호출: 읽기 → 쓰기 → 지우기(3회)");
  const write = moved.calls.find((c) => c.method === "POST");
  ok(write?.path === "/rest/v1/accountbook_settings?on_conflict=key" && /resolution=merge-duplicates/.test(write?.prefer || ""), "1-d 쓰기는 설정 upsert(on_conflict=key, merge-duplicates)");
  ok(typeof JSON.parse(write?.body || "{}").value === "string", "1-d 값은 문자열(JSON)로 적는다(관리자 화면이 쓰는 모양과 같다)");
  eq(moved.calls.find((c) => c.method === "DELETE")?.path, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(sk(S))}`, "1-d 지우기는 보조 계정 키 하나(eq)");
  eq(moved.outcome.supporter, "moved", "1-d 결과 moved");

  const merged = await unitCarry({
    [sk(P)]: flag("2026-05-01", "2026-08-31", "카카오페이", null),
    [sk(S)]: flag("2026-03-01", "2026-12-31", "계좌 송금", "와이파이"),
  });
  eq(merged.parsed(sk(P)), flagValue("2026-03-01", "2026-12-31", "카카오페이 / 계좌 송금", "와이파이"), "1-e 둘 다 있으면: 이른 시작일 · 늦은 끝나는 날 · 메모 ‘주 / 보조’ · 명단 이름은 있는 쪽");
  ok(!merged.table.has(sk(S)), "1-e 합친 뒤 보조 계정 줄을 지운다");
  eq(merged.outcome.supporter, "merged", "1-e 결과 merged");
  const openEnded = await unitCarry({ [sk(P)]: flag("2026-05-01", "2026-08-31", "A", "주 이름"), [sk(S)]: flag("2026-06-01", null, "A", "보조 이름") });
  eq(openEnded.parsed(sk(P)), flagValue("2026-05-01", null, "A", "주 이름"), "1-f 한쪽 끝나는 날이 없으면(계속) 없음 · 같은 메모는 한 번 · 명단 이름은 주 계정 것");
  const noteFromSecondary = await unitCarry({ [sk(P)]: flag("2026-05-01", null, "", null), [sk(S)]: flag("2026-05-02", "2026-09-01", "보조 메모", null) });
  eq(noteFromSecondary.parsed(sk(P)), flagValue("2026-05-01", null, "보조 메모", null), "1-g 주 계정 메모가 비면 보조 메모 · 명단 이름이 둘 다 없으면 null");
  const longNotes = await unitCarry({ [sk(P)]: flag("2026-05-01", null, "가".repeat(150)), [sk(S)]: flag("2026-05-01", null, "나".repeat(150)) });
  eq(longNotes.parsed(sk(P))?.note?.length, 200, "1-h 합친 메모는 200자에서 자른다");
  ok(String(longNotes.parsed(sk(P))?.note || "").startsWith(`${"가".repeat(150)} / `), "1-h 자른 메모도 주 계정 메모가 앞");

  for (const [label, bad] of [["JSON 아님", "{not json"], ["끝나는 날이 시작일보다 빠름", flag("2026-07-10", "2026-07-01")], ["시작일 없음", JSON.stringify({ until: null, note: "x" })], ["배열", "[]"]]) {
    const invalid = await unitCarry({ [sk(P)]: flag("2026-05-01", null, "주"), [sk(S)]: bad });
    ok(invalid.calls.length === 1 && invalid.table.get(sk(S)) === bad && invalid.parsed(sk(P))?.note === "주" && invalid.outcome.supporter === "invalid", `1-i 보조 계정 값 오류(${label})면 아무것도 바꾸지 않는다(읽기 1회)`);
  }
  const invalidPrimary = await unitCarry({ [sk(P)]: "{broken", [sk(S)]: flag("2026-06-01", null, "보조") });
  eq(invalidPrimary.parsed(sk(P)), flagValue("2026-06-01", null, "보조", null), "1-j 주 계정 값이 오류면 보조 계정 표시로 덮는다");
  ok(!invalidPrimary.table.has(sk(S)) && invalidPrimary.outcome.supporter === "moved", "1-j 그때도 보조 줄을 지운다(moved)");

  const consent = await unitCarry({ [ck(S)]: CONSENT });
  ok(consent.value(ck(P)) === CONSENT && consent.value(ck(S)) === CONSENT, "1-k 안내 확인 기록: 주 계정에 없고 보조에 있으면 같은 값을 적고 보조 줄은 남긴다");
  eq(consent.calls.map((c) => c.method), ["GET", "POST"], "1-k 호출 2회(읽기·쓰기), 지우기 없음");
  ok(consent.outcome.consent === true && consent.outcome.supporter === "none", "1-k 결과 consent true");
  const consentKept = await unitCarry({ [ck(P)]: CONSENT_PRIMARY, [ck(S)]: CONSENT });
  ok(consentKept.value(ck(P)) === CONSENT_PRIMARY && consentKept.calls.length === 1, "1-l 주 계정에 이미 있으면 그대로(읽기 1회)");
  const consentEmpty = await unitCarry({ [ck(S)]: "" });
  ok(!consentEmpty.table.has(ck(P)) && consentEmpty.calls.length === 1, "1-l 보조 계정 값이 빈 글이면 옮기지 않는다");

  const all = await unitCarry({ [sk(S)]: flag("2026-06-01", null, "QA 송금", "와이파이"), [ck(S)]: CONSENT });
  eq(all.calls.length, 4, "1-m 가장 많이 쓰는 경우도 DB 호출 4회(읽기 1 + 쓰기 2 + 지우기 1)");
  ok(all.parsed(sk(P))?.public_name === "와이파이" && all.value(ck(P)) === CONSENT && !all.table.has(sk(S)), "1-m 후원자 표시와 안내 기록을 함께 옮긴다");

  const readFail = await unitCarry({ [sk(S)]: flag("2026-06-01") }, { fail: { read: true } });
  ok(!readFail.threw && readFail.calls.length === 1 && readFail.table.has(sk(S)) && !readFail.table.has(sk(P)), "1-n 읽기 실패: 던지지 않고 아무것도 쓰지 않는다");
  eq(readFail.events.map((e) => [e.kind, e.severity, e.detail]), [["merge_settings_carry_failed", "warn", "settings carry pending (read): http_503"]], "1-n 운영 이벤트 하나(merge_settings_carry_failed · warn · 단계 read · 상태 코드만)");
  eq(readFail.events[0]?.path, "/my/account-link/run", "1-n 이벤트 경로는 부른 쪽 경로");
  eq(readFail.outcome.failed, ["read"], "1-n 결과 failed [read]");

  const writeFail = await unitCarry({ [sk(S)]: flag("2026-06-01", null, "QA 송금", "와이파이"), [ck(S)]: CONSENT }, { fail: { write: [sk(P)] } });
  ok(!writeFail.threw && writeFail.table.has(sk(S)) && !writeFail.table.has(sk(P)), "1-o 후원자 쓰기 실패: 보조 줄을 지우지 않는다(표시를 잃지 않게)");
  ok(writeFail.value(ck(P)) === CONSENT, "1-o 그래도 안내 기록 복사는 한다");
  eq(writeFail.calls.filter((c) => c.method === "DELETE").length, 0, "1-o 지우기 호출 없음");
  eq(writeFail.events.map((e) => e.detail), ["settings carry pending (supporter): supabase_write_result_unknown"], "1-o 운영 이벤트 하나(단계 supporter)");
  const deleteFail = await unitCarry({ [sk(S)]: flag("2026-06-01") }, { fail: { delete: true } });
  ok(deleteFail.table.has(sk(P)) && deleteFail.table.has(sk(S)) && !deleteFail.threw, "1-p 지우기 실패: 주 계정에는 적고 보조 줄만 남는다");
  eq(deleteFail.events.map((e) => e.detail), ["settings carry pending (supporter_cleanup): supabase_write_result_unknown"], "1-p 운영 이벤트 하나(단계 supporter_cleanup)");
  const consentFail = await unitCarry({ [ck(S)]: CONSENT }, { fail: { write: [ck(P)] } });
  ok(!consentFail.threw && !consentFail.table.has(ck(P)) && consentFail.outcome.consent === false, "1-q 안내 기록 쓰기 실패도 던지지 않는다");
  eq(consentFail.events.map((e) => e.detail), ["settings carry pending (consent): supabase_write_result_unknown"], "1-q 운영 이벤트 하나(단계 consent)");

  const noRoom = await unitCarry({ [sk(S)]: flag("2026-06-01") }, { hasRoom: () => false });
  ok(noRoom.calls.length === 0 && noRoom.outcome.deferred === true && noRoom.table.has(sk(S)), "1-r 남은 호출이 없으면 읽지도 않는다");
  eq(noRoom.events.map((e) => [e.kind, e.detail]), [["merge_settings_carry_deferred", "settings carry pending: no database budget (read)"]], "1-r 운영 이벤트 merge_settings_carry_deferred(읽기)");
  const readOnlyRoom = await unitCarry({ [sk(S)]: flag("2026-06-01"), [ck(S)]: CONSENT }, { hasRoom: (calls) => calls <= 1 });
  ok(readOnlyRoom.calls.length === 1 && readOnlyRoom.table.has(sk(S)) && !readOnlyRoom.table.has(sk(P)) && !readOnlyRoom.table.has(ck(P)), "1-s 쓰기 몫이 모자라면 아무것도 쓰지 않는다(반쯤 옮기지 않는다)");
  eq(readOnlyRoom.events.map((e) => [e.kind, e.detail]), [["merge_settings_carry_deferred", "settings carry pending: no database budget (3 write(s))"]], "1-s 운영 이벤트 merge_settings_carry_deferred(쓰기 3)");
  eq(readOnlyRoom.outcome.supporter, "deferred", "1-s 결과 supporter deferred");

  const same = await unitCarry({ [sk(P)]: flag("2026-06-01") }, { primary: P, secondary: P });
  const empty = await unitCarry({ [sk(S)]: flag("2026-06-01") }, { primary: "", secondary: S });
  ok(same.calls.length === 0 && empty.calls.length === 0 && same.events.length === 0 && empty.events.length === 0, "1-t 같은 계정·빈 id 는 아무것도 하지 않는다");

  const details = [readFail, writeFail, deleteFail, consentFail, noRoom, readOnlyRoom].flatMap((run) => run.events.map((e) => e.detail)).join("\n");
  ok(!/unit-primary|unit-secondary|supporter:|consent:|와이파이|QA 송금|kakao/.test(details), "1-u 운영 이벤트에 계정 id·키·값(메모·명단 이름·안내 기록)이 없다");
});

// ── 2. 관리자 계정 통합(performIdentityMerge)으로 ───────────────────────────
// 합치기 RPC(schema_v22_7_0_auth_atomicity.sql)의 효과만 흉내 낸다(V22.9.117 검사와 같은 모양). 설정 표의 사용자 줄은 옮기지 않는다 — 운영 RPC 와 같다.
function applyStoredMergeSql(fx, { p_primary_user_id: primary, p_secondary_user_id: secondary }) {
  const ranks = { owner: 60, admin: 50, member: 40, viewer: 30, pending: 20, blocked: 10 };
  for (const old of fx.db.household_members.filter((item) => item.user_id === secondary)) {
    const existing = fx.db.household_members.find((item) => item.user_id === primary && item.household_id === old.household_id);
    if (existing) { if (ranks[old.role] > ranks[existing.role]) existing.role = old.role; } else fx.db.household_members.push({ ...old, user_id: primary });
  }
  let moved = 0;
  for (const item of fx.db.transactions) if (item.user_id === secondary) { item.user_id = primary; moved += 1; }
  for (const item of fx.db.accountbook_recurring || []) if (item.user_id === secondary) item.user_id = primary;
  fx.db.accountbook_user_identities = (fx.db.accountbook_user_identities || []).filter((item) => !(item.user_id === secondary && fx.db.accountbook_user_identities.some((other) => other.user_id === primary && other.provider === item.provider)));
  for (const item of fx.db.accountbook_user_identities) if (item.user_id === secondary) item.user_id = primary;
  fx.db.household_members = fx.db.household_members.filter((item) => item.user_id !== secondary);
  fx.db.accountbook_user_security = (fx.db.accountbook_user_security || []).filter((item) => item.user_id !== secondary);
  putSetting(fx, `identity_merge_redirect:${secondary}`, JSON.stringify({ primary_user_id: primary, secondary_user_id: secondary, merged_at: new Date().toISOString() }));
  const old = fx.db.users.find((item) => item.id === secondary);
  old.kakao_user_key = `merged:${secondary}:synthetic`;
  old.nickname = `${old.nickname || "이전 계정"} (통합됨)`;
  return moved;
}
async function mergeFixture(task) {
  return withClock(TODAY, () => fixture(async (fx) => {
    fx.env.ADMIN_API_TOKEN = "qa-admin-token-v229121";
    const rpcs = [];
    const restore = intercept(async ({ url, init }) => {
      if (url.pathname !== "/rest/v1/rpc/accountbook_merge_users_v227") return null;
      const body = JSON.parse(String(init.body || "{}"));
      rpcs.push(body);
      return json({ merged: true, transactions: applyStoredMergeSql(fx, body) });
    });
    try { return await task(fx, rpcs); } finally { restore(); }
  }));
}
const MERGE_DONE = "계정 통합이 완료됐습니다";
async function adminMerge(fx) {
  const mark = opsMark();
  const { result, log } = await withDb(async () => {
    const response = await app.fetch(new Request(`${BASE}/admin/identity/merge`, {
      method: "POST",
      headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}`, "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" },
      body: new URLSearchParams({ household_id: "house-home", primary_user_id: "user-bin", secondary_user_id: "user-wifi", confirm_text: "통합" }).toString(),
    }), fx.env, ctx);
    return { status: response.status, location: decodeURIComponent(response.headers.get("location") || "") };
  });
  const carry = log.filter((r) => /"?(supporter|consent):user-(bin|wifi)/.test(r.decoded) || /"key":"(supporter|consent):/.test(r.body));
  const events = eventsSince(mark).filter((entry) => /^merge_settings_carry_/.test(entry.kind));
  return { ...result, log, carry, events };
}
const carryShape = (run) => run.carry.map((r) => `${r.method} ${r.method === "POST" ? JSON.parse(r.body || "{}").key : r.method === "DELETE" ? r.decoded.replace(/^.*key=eq\./, "") : "in"}`);

await section("2 계정 통합", async () => {
  const totals = {};
  await mergeFixture(async (fx, rpcs) => {
    putSetting(fx, "supporter:user-wifi", flag("2026-06-01", null, "QA 송금", "와이파이"));
    putSetting(fx, "consent:user-wifi", CONSENT);
    const run = await adminMerge(fx);
    ok(run.status === 303 && run.location.includes(MERGE_DONE), "2-a 통합은 성공 안내로 끝난다");
    ok(rpcs.length === 1 && fx.db.transactions.filter((t) => t.user_id === "user-wifi").length === 0, "2-a 합치기 RPC 한 번, 보조 계정 기록이 주 계정으로 옮겨졌다");
    eq(JSON.parse(settingValue(fx, "supporter:user-bin") || "null"), flagValue("2026-06-01", null, "QA 송금", "와이파이"), "2-b 보조 계정(user-wifi)의 후원자 표시가 주 계정(user-bin)으로 옮겨졌다");
    eq(settingValue(fx, "supporter:user-wifi"), undefined, "2-b 보조 계정 줄은 지워졌다(관리자 목록·공개 명단에 두 번 나오지 않는다)");
    ok(settingValue(fx, "consent:user-bin") === CONSENT && settingValue(fx, "consent:user-wifi") === CONSENT, "2-c 안내 확인 기록을 주 계정에 복사하고 보조 줄은 남긴다");
    eq(carryShape(run).slice().sort(), ["DELETE supporter:user-wifi", "GET in", "POST consent:user-bin", "POST supporter:user-bin"], "2-d 옮기기 호출 4회: 읽기 1 · 후원자 쓰기 1 · 안내 기록 쓰기 1 · 보조 줄 지우기 1");
    const carryRead = run.carry.find((r) => r.method === "GET");
    ok(carryRead && ["supporter:user-bin", "supporter:user-wifi", "consent:user-bin", "consent:user-wifi"].every((key) => carryRead.decoded.includes(`"${key}"`)), "2-d 읽기는 네 키를 key=in.(…) 한 번으로");
    ok(run.carry.filter((r) => r.method === "POST").every((r) => r.path === "/rest/v1/accountbook_settings?on_conflict=key" && /resolution=merge-duplicates/.test(r.prefer)), "2-d 쓰기는 설정 upsert");
    eq(run.events.length, 0, "2-e 실패·미룸 운영 이벤트 없음");
    totals.all = run.log.length;
    const carryAt = run.log.indexOf(carryRead);
    const rpcAt = run.log.findIndex((r) => r.path.startsWith("/rest/v1/rpc/accountbook_merge_users_v227"));
    const lastLinksAt = run.log.map((r, i) => (r.decoded.includes("user_identity_links") ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1;
    ok(rpcAt >= 0 && carryAt > rpcAt && lastLinksAt > carryAt, "2-f 옮기기는 합치기 RPC 뒤, 링크 표 정리 앞");

    // 옮긴 표시가 실제로 쓰인다: 주 계정의 전체 메뉴에 배지·포인트 색, 쿠키 ab_sp 를 받는다.
    const menu = await get(fx, MENU, fx.cookie);
    ok(menu.status === 200 && accented(menu.html) && menu.html.includes("abSupporterThanks"), "2-g 통합 뒤 주 계정의 전체 메뉴에 후원자 줄·포인트 색");
    eq(menu.sp, [SET], "2-g 그 화면이 포인트 색 쿠키를 준다");
  });

  await mergeFixture(async (fx) => {
    putSetting(fx, "supporter:user-bin", flag("2026-05-01", "2026-08-31", "카카오페이", null));
    putSetting(fx, "supporter:user-wifi", flag("2026-03-01", "2026-12-31", "계좌 송금", "와이파이"));
    putSetting(fx, "consent:user-bin", CONSENT_PRIMARY);
    putSetting(fx, "consent:user-wifi", CONSENT);
    const run = await adminMerge(fx);
    ok(run.location.includes(MERGE_DONE), "2-h 둘 다 후원자여도 통합은 성공");
    eq(JSON.parse(settingValue(fx, "supporter:user-bin") || "null"), flagValue("2026-03-01", "2026-12-31", "카카오페이 / 계좌 송금", "와이파이"), "2-h 두 표시를 합친다(이른 시작·늦은 끝·메모 둘·명단 이름)");
    eq(settingValue(fx, "supporter:user-wifi"), undefined, "2-h 보조 줄을 지운다");
    eq(settingValue(fx, "consent:user-bin"), CONSENT_PRIMARY, "2-h 주 계정 안내 기록은 그대로");
    eq(carryShape(run).slice().sort(), ["DELETE supporter:user-wifi", "GET in", "POST supporter:user-bin"], "2-h 호출 3회(안내 기록 쓰기 없음)");
  });

  await mergeFixture(async (fx) => {
    const run = await adminMerge(fx);
    ok(run.location.includes(MERGE_DONE), "2-i 둘 다 없으면 통합만");
    eq(carryShape(run), ["GET in"], "2-i 옮기기 몫은 읽기 한 번뿐");
    ok(settingValue(fx, "supporter:user-bin") === undefined && settingValue(fx, "consent:user-bin") === undefined, "2-i 아무 줄도 만들지 않는다");
    totals.none = run.log.length;
  });
  eq(totals.all - totals.none, 3, `2-j 통합 요청의 DB 호출은 옮긴 쓰기만큼(3회)만 늘어난다(없음 ${totals.none}회 · 다 옮김 ${totals.all}회)`);
  ok(totals.all <= 50, `2-j 다 옮겨도 한 요청 한도(50) 안(${totals.all}회)`);

  await mergeFixture(async (fx) => {
    const bad = "{\"since\":\"2026-07-10\",\"until\":\"2026-07-01\"}";
    putSetting(fx, "supporter:user-bin", flag("2026-05-01", null, "주"));
    putSetting(fx, "supporter:user-wifi", bad);
    const run = await adminMerge(fx);
    ok(run.location.includes(MERGE_DONE), "2-k 보조 계정 값 오류여도 통합은 성공");
    ok(settingValue(fx, "supporter:user-wifi") === bad && JSON.parse(settingValue(fx, "supporter:user-bin")).note === "주", "2-k 값 오류인 보조 표시는 그대로 두고 주 계정 표시도 그대로");
    eq(carryShape(run), ["GET in"], "2-k 쓰기·지우기 없음");
  });

  await mergeFixture(async (fx) => {
    putSetting(fx, "supporter:user-wifi", flag("2026-06-01", null, "QA 송금", "와이파이"));
    putSetting(fx, "consent:user-wifi", CONSENT);
    const restore = intercept(({ url, method }) => (method === "GET" && decodeURIComponent(url.search).includes("\"consent:user-wifi\"") ? json({ code: "QA", message: "settings read failed" }, 503) : null));
    let run;
    try { run = await adminMerge(fx); } finally { restore(); }
    ok(run.status === 303 && run.location.includes(MERGE_DONE), "2-l 설정 읽기가 실패해도 통합은 성공 안내 그대로");
    ok(fx.db.transactions.filter((t) => t.user_id === "user-wifi").length === 0, "2-l 통합 자체(기록 옮기기)는 끝났다");
    ok(settingValue(fx, "supporter:user-wifi") !== undefined && settingValue(fx, "supporter:user-bin") === undefined && settingValue(fx, "consent:user-bin") === undefined, "2-l 아무것도 쓰지 않았다");
    eq(run.events.map((e) => [e.kind, e.severity, e.path, e.detail]), [["merge_settings_carry_failed", "warn", "/admin/identity/merge", "settings carry pending (read): http_503"]], "2-l 운영 이벤트 하나(merge_settings_carry_failed)");
  });

  await mergeFixture(async (fx) => {
    putSetting(fx, "supporter:user-wifi", flag("2026-06-01", null, "QA 송금", "와이파이"));
    putSetting(fx, "consent:user-wifi", CONSENT);
    const restore = intercept(({ url, method, init }) => (method === "POST" && url.pathname === "/rest/v1/accountbook_settings" && String(init?.body || "").includes("\"key\":\"supporter:user-bin\"") ? json({ code: "QA", message: "settings write failed" }, 503) : null));
    let run;
    try { run = await adminMerge(fx); } finally { restore(); }
    ok(run.location.includes(MERGE_DONE), "2-m 후원자 쓰기가 실패해도 통합은 성공");
    ok(settingValue(fx, "supporter:user-wifi") !== undefined && settingValue(fx, "supporter:user-bin") === undefined, "2-m 보조 줄은 지우지 않는다(표시를 잃지 않는다)");
    eq(settingValue(fx, "consent:user-bin"), CONSENT, "2-m 안내 기록 복사는 한다");
    eq(run.events.map((e) => e.detail), ["settings carry pending (supporter): supabase_write_result_unknown"], "2-m 운영 이벤트 하나(단계 supporter)");
  });

  await mergeFixture(async (fx) => {
    putSetting(fx, "supporter:user-wifi", flag("2026-06-01"));
    const restore = intercept(({ url, method }) => (method === "DELETE" && decodeURIComponent(url.search).includes("key=eq.supporter:user-wifi") ? json({ code: "QA", message: "settings delete failed" }, 503) : null));
    let run;
    try { run = await adminMerge(fx); } finally { restore(); }
    ok(run.location.includes(MERGE_DONE) && settingValue(fx, "supporter:user-bin") !== undefined && settingValue(fx, "supporter:user-wifi") !== undefined, "2-n 보조 줄 지우기가 실패해도 통합 성공 · 주 계정에는 적었다");
    eq(run.events.map((e) => e.detail), ["settings carry pending (supporter_cleanup): supabase_write_result_unknown"], "2-n 운영 이벤트 하나(단계 supporter_cleanup)");
  });

  await mergeFixture(async (fx) => {
    putSetting(fx, "supporter:user-wifi", flag("2026-06-01"));
    const restore = intercept(({ url, method }) => (method === "GET" && decodeURIComponent(url.search).includes("\"supporter:user-wifi\"") ? Promise.reject(new TypeError("fetch failed")) : null));
    let run;
    try { run = await adminMerge(fx); } finally { restore(); }
    ok(run.location.includes(MERGE_DONE), "2-o 설정 읽기 전송 오류(던짐)도 통합 결과를 바꾸지 않는다");
    eq(run.events.length, 1, "2-o 운영 이벤트 하나");
    ok(/^settings carry pending \(read\): /.test(run.events[0]?.detail || ""), "2-o 단계 read");
  });
});

// ── 2c. 링크 표 정리 몫 예약(독립 검토 V22.9.121 1차 P2) ─────────────────────
// 합치기 뒤 남은 호출이 옮기기(읽기 1 + 쓰기 3)와 링크 표 정리(4)를 다 받지 못하면, 옮기기를 미루고 링크 표 정리를 한다 — 링크 표가 밀리면
// 강한 식별 없는 옛 가입자가 다음 웹 로그인에서 빈 새 계정을 만들 수 있다(V22.9.91). performIdentityMerge 를 모듈에서 바로 부르고
// 요청 예산(__AB_DB_BUDGET)을 옮기기 직전 사용량 + 7 로 둔다(읽기 1 뒤 쓰기 3 + 링크 표 4 = 7 은 남지 않고, 링크 표 4 는 남는다).
// 예약이 없던 초안은 이 예산에서 옮기기를 하고 링크 표 정리를 미뤘다.
await section("2c 링크 표 몫 예약", async () => {
  const { performIdentityMerge } = await import("../src/modules/admin/identity-merge.js");
  const setup = (fx) => {
    putSetting(fx, "supporter:user-wifi", flag("2026-06-01", null, "QA 송금", "와이파이"));
    putSetting(fx, "consent:user-wifi", CONSENT);
  };
  const runMerge = async (fx, limit) => {
    const env = { ...fx.env, __AB_DB_BUDGET: { used: 0, limit } };
    let usedAtCarryRead = -1;
    const mark = opsMark();
    const restore = intercept(({ url }) => {
      const key = url.searchParams.get("key") || "";
      if (usedAtCarryRead < 0 && url.hostname.endsWith("supabase.co") && url.pathname === "/rest/v1/accountbook_settings" && key.startsWith("in.(") && key.includes("supporter:user-wifi")) {
        usedAtCarryRead = env.__AB_DB_BUDGET.used;
      }
      return null;
    });
    let threw = null;
    try {
      await performIdentityMerge(env, { primaryId: "user-bin", secondaryId: "user-wifi", householdId: "house-home", path: "/admin/identity/merge" });
    } catch (err) { threw = err; } finally { restore(); }
    const events = eventsSince(mark);
    return { threw, usedAtCarryRead, events, kinds: events.map((entry) => entry.kind), used: env.__AB_DB_BUDGET.used };
  };
  let before = -1;
  await mergeFixture(async (fx) => {
    setup(fx);
    const wide = await runMerge(fx, 900);
    ok(!wide.threw && wide.usedAtCarryRead > 0, `2c-a 넉넉한 예산: 합치기가 끝나고 옮기기 읽기를 보았다(${wide.threw?.message || "ok"}, 읽기 때 사용량 ${wide.usedAtCarryRead})`);
    ok(!wide.kinds.some((kind) => /^merge_settings_carry_|^identity_legacy_link_cleanup_/.test(kind)) && settingValue(fx, "supporter:user-bin") !== undefined,
      `2c-a 넉넉한 예산: 옮기기와 링크 표 정리가 모두 된다(${show(wide.kinds)})`);
    before = wide.usedAtCarryRead - 1; // 읽기 요청이 보일 때는 그 읽기 몫이 이미 더해져 있다.
  });
  await mergeFixture(async (fx) => {
    setup(fx);
    const tight = await runMerge(fx, before + 7);
    ok(!tight.threw && tight.usedAtCarryRead === before + 1,
      `2c-b 빠듯한 예산(옮기기 직전 ${before} + 7)에서도 합치기는 끝나고 옮기기 읽기는 같은 자리에서 한다: ${tight.threw?.message || "ok"} · 읽기 때 ${tight.usedAtCarryRead}`);
    ok(tight.kinds.includes("merge_settings_carry_deferred") && !tight.kinds.includes("identity_legacy_link_cleanup_deferred") && !tight.kinds.includes("identity_legacy_link_cleanup_failed"),
      `2c-b 옮기기는 미루고(운영 이벤트) 링크 표 정리는 한다: ${show(tight.kinds)}`);
    ok(/no database budget \(3 write\(s\)\)/.test(tight.events.find((entry) => entry.kind === "merge_settings_carry_deferred")?.detail || ""),
      "2c-b 미룬 단계는 쓰기 3회(링크 표 4회를 남기려고) — 읽기는 했다");
    ok(settingValue(fx, "supporter:user-bin") === undefined && JSON.parse(settingValue(fx, "supporter:user-wifi") || "null")?.since === "2026-06-01",
      "2c-c 미룬 옮기기는 아무것도 쓰지 않는다(보조 줄이 그대로 남아 관리자가 다시 켤 수 있다)");
    const links = JSON.parse(settingValue(fx, "user_identity_links") || "{}");
    ok(Object.values(links).some((value) => value?.user_id === "user-bin" && value?.provider === "identity_merge"), "2c-d 링크 표는 주 계정을 가리키게 고쳐졌다");
  });
});

// ── 3·4·5. 포인트 색 쿠키와 응답 마무리 ──────────────────────────────────────
await withClock(TODAY, () => fixture(async (fx) => {
  fx.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  fx.env.ADMIN_SESSION_SECRET = "qa-v229121-carry-session";
  const login = await post(fx, "/login", { password: ADMIN_PASSWORD, return_to: "/admin/supporters" }, { cookie: "" });
  const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  ok(admin.length > "ab_admin=".length, "0 관리자 로그인 쿠키를 받는다(검사 준비)");
  const user = fx.cookie;
  const withSp = `${user}; ab_sp=1`;
  const getAll = async (paths, cookie) => { const out = []; for (const path of paths) out.push(await get(fx, path, cookie)); return out; };
  const dropFlags = () => { fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => !String(row.key).startsWith("supporter:")); };

  await section("3 세 화면의 쿠키", async () => {
    dropFlags();
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    for (const [label, path] of SELF_PAGES) {
      const fresh = await get(fx, path, user);
      const kept = await get(fx, path, withSp);
      const odd = await get(fx, path, `${user}; ab_sp=0`);
      ok(fresh.status === 200 && accented(fresh.html), `3-a 후원자의 ${label}: 200 · 스스로 포인트 색을 그린다`);
      eq(fresh.sp, [SET], `3-b 후원자의 ${label}: 쿠키가 없으면 ab_sp=1(1일·HttpOnly·Secure·Lax)을 준다`);
      eq(kept.sp, [], `3-c 후원자의 ${label}: 이미 ab_sp=1 이면 다시 주지 않는다`);
      eq(odd.sp, [SET], `3-d 후원자의 ${label}: ab_sp 값이 1 이 아니면 1 로 고친다`);
      ok(fresh.html === kept.html && kept.html === odd.html, `3-e 후원자의 ${label}: HTML 은 쿠키와 무관하게 바이트가 같다`);
    }
    const supporterCalls = [];
    for (const [, path] of SELF_PAGES) {
      const a = await withDb(() => get(fx, path, user));
      const b = await withDb(() => get(fx, path, withSp));
      supporterCalls.push([a.log.length, b.log.length]);
    }
    ok(supporterCalls.every(([a, b]) => a === b && a > 0), `3-f 세 화면의 DB 호출 수는 쿠키와 무관하다(${show(supporterCalls)})`);

    dropFlags();
    const plainCalls = [];
    for (const [label, path] of SELF_PAGES) {
      const none = await get(fx, path, user);
      const stale = await get(fx, path, withSp);
      eq(none.sp, [], `3-g 비후원자의 ${label}: 쿠키가 없으면 아무 쿠키도 주지 않는다`);
      eq(stale.sp, [CLEAR], `3-h 비후원자의 ${label}: 남은 ab_sp 를 지운다(Max-Age=0)`);
      ok(!accented(none.html) && none.html === stale.html && !none.html.includes("abSupporterAccent"), `3-i 비후원자의 ${label}: 포인트 색 없음 · 쿠키와 무관하게 바이트가 같다`);
      const a = await withDb(() => get(fx, path, user));
      plainCalls.push(a.log.length);
    }
    eq(plainCalls, supporterCalls.map(([a]) => a), "3-j 후원자와 비후원자의 DB 호출 수가 같다(쿠키를 위해 더 읽지 않는다)");

    for (const [label, value] of [["끝난 표시(어제 끝)", flag("2026-06-01", "2026-07-14")], ["시작 전 표시(내일 시작)", flag("2026-07-16")], ["값 오류", "{oops"]]) {
      dropFlags();
      putSetting(fx, "supporter:user-bin", value);
      const results = await getAll(SELF_PAGES.map(([, path]) => path), withSp);
      ok(results.every((r) => isDeepStrictEqual(r.sp, [CLEAR]) && !accented(r.html)), `3-k ${label}: 세 화면 모두 ab_sp 를 지우고 색을 그리지 않는다`);
    }
    dropFlags();
    putSetting(fx, "supporter:user-bin", flag("2026-06-01", TODAY));
    const lastDay = await getAll(SELF_PAGES.map(([, path]) => path), user);
    ok(lastDay.every((r) => isDeepStrictEqual(r.sp, [SET]) && accented(r.html)), "3-l 끝나는 날 당일은 아직 후원자(쿠키를 준다)");

    dropFlags();
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    const restore = intercept(({ url, method }) => (method === "GET" && decodeURIComponent(url.search).includes("supporter:user-bin") ? json({ code: "QA", message: "flag read failed" }, 503) : null));
    let failed;
    try { failed = await getAll(SELF_PAGES.map(([, path]) => path), withSp); } finally { restore(); }
    ok(failed.every((r) => r.status === 200 && !accented(r.html) && isDeepStrictEqual(r.sp, [CLEAR])), "3-m 표시를 읽지 못하면 세 화면 모두 색 없이 그리고(200) 쿠키도 지운다(화면과 쿠키가 같은 값)");

    const adminSelf = await getAll([HOME, MENU], `${admin}; ab_sp=1`);
    ok(adminSelf.every((r) => r.status === 200 && r.sp.length === 0), "3-n 관리자 세션의 홈·전체 메뉴는 표시를 읽지 않으므로 ab_sp 를 그대로 둔다");

    // 구성원 50명 밖의 참여자 화면: 보는 사람의 표시를 읽지 않았으면 쿠키를 그대로 둔다.
    dropFlags();
    const before = fx.db.household_members.length;
    fx.db.household_members.find((m) => m.household_id === "house-home" && m.user_id === "user-wifi").role = "admin";
    for (let i = 0; i < 55; i += 1) {
      const id = `user-crowd-${String(i).padStart(2, "0")}`;
      fx.db.users.push({ id, kakao_user_key: `kakao_login:crowd-${i}`, nickname: `구성원${i}`, created_at: "2026-06-01T00:00:00.000Z" });
      fx.db.household_members.push({ household_id: "house-home", user_id: id, role: "member", created_at: `2026-06-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z` });
    }
    const wifi = await fx.cookieFor("user-wifi");
    const crowd = await withDb(() => get(fx, MEMBERS, `${wifi}; ab_sp=1`));
    const flagRead = crowd.log.find((r) => r.decoded.includes("supporter:user-crowd"));
    ok(crowd.result.status === 200 && flagRead && !flagRead.decoded.includes("supporter:user-wifi"), "3-o (준비) 구성원 57명: 앞 50명의 표시만 읽고 보는 사람(user-wifi)은 그 밖이다");
    eq(crowd.result.sp, [], "3-o 그 화면은 보는 사람의 표시를 읽지 않았으므로 ab_sp 를 그대로 둔다");
    fx.db.household_members = fx.db.household_members.slice(0, before);
    fx.db.household_members.find((m) => m.household_id === "house-home" && m.user_id === "user-wifi").role = "member";
    fx.db.users = fx.db.users.filter((u) => !String(u.id).startsWith("user-crowd-"));
  });

  await section("4 다른 셸 화면", async () => {
    dropFlags();
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    for (const path of SHELL_PAGES) {
      const plain = await get(fx, path, user);
      const lit = await get(fx, path, withSp);
      ok(plain.status === 200 && /<body\b[^>]*class="[^"]*\babV22812Shell\b/.test(plain.html), `4-a (준비) ${path}: 200 셸 화면`);
      ok(!accented(plain.html) && !plain.html.includes(ACCENT_HEAD), `4-b ${path}: ab_sp 가 없으면 포인트 색 없음`);
      ok(lit.status === 200 && accented(lit.html), `4-c ${path}: 세션 + ab_sp=1 이면 <html data-supporter="1">`);
      eq(count(lit.html, ACCENT_HEAD), 1, `4-d ${path}: 포인트 색 머리 조각(배지·포인트 색 CSS·스크립트)이 한 번`);
      const headEnd = lit.html.indexOf("</head>");
      const at = lit.html.indexOf(ACCENT_HEAD);
      const linkAt = lit.html.indexOf(SHELL_LINK);
      ok(at > 0 && at < headEnd && (linkAt < 0 || linkAt > headEnd || at + ACCENT_HEAD.length === linkAt), `4-e ${path}: 조각은 <head> 안, 셸 CSS 링크 바로 앞(셸 링크가 머리의 마지막 스타일로 남는다)`);
      eq(lit.html.replace(ACCENT_HEAD, "").replace(' data-supporter="1">', ">"), plain.html, `4-f ${path}: 두 군데를 빼면 쿠키 없는 응답과 바이트가 같다`);
      ok(lit.headers.get("content-type") === plain.headers.get("content-type") && lit.headers.get("content-security-policy") === plain.headers.get("content-security-policy") && lit.headers.get("cache-control") === plain.headers.get("cache-control"), `4-g ${path}: 형식·CSP·캐시 머리는 그대로`);
      const csp = String(lit.headers.get("content-security-policy") || "");
      ok(/script-src [^;]*'unsafe-inline'/.test(csp) && !/script-src [^;]*'(?:nonce-|strict-dynamic)/.test(csp) && /style-src [^;]*'unsafe-inline'/.test(csp), `4-h ${path}: 그 화면의 CSP 가 붙인 조각(인라인 style·script)을 막지 않는다`);
      ok(/(?:^|,\s*)cookie(?:\s*,|$)/i.test(lit.headers.get("vary") || "") && lit.headers.get("content-length") === null, `4-i ${path}: Vary 에 Cookie, 길이 머리 없음`);
      eq(lit.sp, [], `4-j ${path}: 이 화면들은 ab_sp 를 주거나 지우지 않는다`);
      const zero = await get(fx, path, `${user}; ab_sp=0`);
      const bare = await get(fx, path, "ab_sp=1");
      const plainAnon = await get(fx, path, "");
      const forged = await get(fx, path, "ab_user=forged-session; ab_sp=1");
      const forgedPlain = await get(fx, path, "ab_user=forged-session");
      ok(zero.html === plain.html && sameHeaders(zero, plain), `4-k ${path}: ab_sp 가 1 이 아니면 응답 그대로`);
      ok(bare.status === plainAnon.status && bare.html === plainAnon.html && bare.location === plainAnon.location && !accented(bare.html), `4-l ${path}: 로그인 세션 없이 ab_sp=1 만 있으면 응답 그대로`);
      ok(forged.status === forgedPlain.status && forged.html === forgedPlain.html && !accented(forged.html), `4-m ${path}: 맞지 않는 세션 쿠키 + ab_sp=1 도 응답 그대로(로그인 화면으로)`);
    }

    // 비후원자가 쿠키를 위조해도 자기 화면 색만 바뀐다 — 다른 사람이 보는 배지는 서버 표시로만 그린다.
    dropFlags();
    const forgedOwn = await get(fx, SHELL_PAGES[0], withSp);
    ok(accented(forgedOwn.html), "4-n (설계) 비후원자가 ab_sp=1 을 만들어 넣으면 자기 셸 화면에 색이 칠해진다 — 보기만");
    const managerView = await get(fx, MEMBERS, user);
    putSetting(fx, "supporter:user-wifi", flag("2026-07-01"));
    const managerViewWithFlag = await get(fx, MEMBERS, user);
    ok(!managerView.html.includes("abSupporterBadge") && managerViewWithFlag.html.includes("abSupporterBadge"), "4-n 참여자 화면의 다른 사람 배지는 쿠키가 아니라 서버의 후원자 표시로만 그린다");
    dropFlags();

    // 세 화면은 응답 마무리가 덧붙이지 않는다(스스로 정한다) — 비후원자 + ab_sp=1 이어도 색 없음.
    for (const [label, path] of SELF_PAGES) {
      const self = await get(fx, path, withSp);
      ok(!accented(self.html) && !self.html.includes(ACCENT_HEAD), `4-o ${label}: 비후원자에게 남은 ab_sp=1 로 색을 칠하지 않는다`);
    }

    // 공개 화면: 사이트맵 전부 + 첫 화면·후원·방침·약관·둘러보기.
    const sitemap = await get(fx, "/sitemap.xml", "");
    const publicPaths = [...new Set([...[...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname), "/", "/support", "/privacy", "/terms", "/demo", "/faq", "/articles"])];
    ok(publicPaths.length >= 60, `4-p (준비) 공개 화면 ${publicPaths.length}곳(사이트맵 + 기본)`);
    const publicMiss = [];
    for (const path of publicPaths) {
      const a = await get(fx, path, withSp);
      const b = await get(fx, path, user);
      if (a.status !== b.status || a.html !== b.html || accented(a.html) || a.html.includes("abSupporterAccent") || !sameHeaders(a, b)) publicMiss.push(path);
    }
    eq(publicMiss, [], "4-q 공개 화면은 세션 + ab_sp=1 이어도 응답이 바이트까지 같다(포인트 색 없음)");

    // 관리자 화면.
    const adminPaths = ["/admin-view", "/identity-audit?household_id=house-home", "/admin/supporters", "/ops-dashboard", "/?legacy=1", "/admin-view?return_to=%2Fadmin%2Fsupporters"];
    const adminMiss = [];
    for (const path of adminPaths) {
      const a = await get(fx, path, `${admin}; ${user}; ab_sp=1`);
      const b = await get(fx, path, `${admin}; ${user}`);
      if (a.status !== b.status || a.html !== b.html || accented(a.html) || !sameHeaders(a, b)) adminMiss.push(`${path}(${a.status})`);
    }
    eq(adminMiss, [], "4-r 관리자·운영 화면은 응답 그대로");
    const adminShell = await get(fx, "/admin/supporters", `${admin}; ${user}; ab_sp=1`);
    ok(adminShell.status === 200 && !accented(adminShell.html), "4-r 관리자 후원자 화면(200)에도 포인트 색 없음");

    // 로그인 화면(세션이 맞지 않음)·HTML 이 아닌 응답·404·HEAD·POST.
    const loginA = await get(fx, "/my", "ab_user=forged-session; ab_sp=1");
    const loginB = await get(fx, "/my", "ab_user=forged-session");
    ok(loginA.status === loginB.status && loginA.html === loginB.html && !accented(loginA.html), "4-s 로그인 화면은 그대로");
    const signupA = await get(fx, "/my?mode=signup", "ab_sp=1");
    const signupB = await get(fx, "/my?mode=signup", "");
    ok(signupA.html === signupB.html && !accented(signupA.html), "4-s 가입 화면도 그대로");
    for (const path of ["/u/api/tx/search?q=%EC%A3%BC%EC%9C%A0&household_id=house-home&month=2026-07", "/robots.txt", "/sitemap.xml", ACCOUNTBOOK_SHELL_CSS_ASSET_PATH, "/no-such-page-v229121"]) {
      const a = await get(fx, path, withSp);
      const b = await get(fx, path, user);
      ok(a.status === b.status && a.html === b.html && sameHeaders(a, b) && !accented(a.html), `4-t ${path}(${a.status}): HTML 이 아니거나 200 이 아닌 응답은 그대로`);
    }
    const headA = await get(fx, SHELL_PAGES[0], withSp, { method: "HEAD" });
    const headB = await get(fx, SHELL_PAGES[0], user, { method: "HEAD" });
    ok(headA.status === headB.status && sameHeaders(headA, headB), "4-u HEAD 는 그대로");
    const postA = await post(fx, "/support/visit", {}, { cookie: withSp });
    const postB = await post(fx, "/support/visit", {}, { cookie: user });
    ok(postA.status === postB.status && postA.text === postB.text && postA.setCookie === postB.setCookie && !/ab_sp=/.test(postA.setCookie), `4-v POST 응답(${postA.status})은 그대로(ab_sp 를 건드리지 않는다)`);
  });

  await section("5 로그아웃·세션 바뀜", async () => {
    const myLogout = await post(fx, "/my/logout", {}, { cookie: withSp });
    eq(myLogout.status, 303, "5-a /my/logout 303");
    eq(count(myLogout.setCookie, "ab_sp="), 1, "5-a /my/logout 은 ab_sp 를 한 번 지운다");
    ok(myLogout.setCookie.includes(CLEAR), "5-a 지우는 쿠키 모양(Path=/ · Max-Age=0)");
    const myLogoutBare = await post(fx, "/my/logout", {}, { cookie: user });
    eq(count(myLogoutBare.setCookie, "ab_sp="), 1, "5-b 쿠키가 없어도 /my/logout 은 지우는 줄 하나(앞과 같은 응답)");
    const adminLogout = await post(fx, "/logout", {}, { cookie: `${admin}; ab_sp=1` });
    ok(adminLogout.status === 303 && count(adminLogout.setCookie, "ab_sp=") === 1 && adminLogout.setCookie.includes(CLEAR) && adminLogout.setCookie.includes("ab_admin=; Path=/; Max-Age=0"), "5-c /logout(관리자)도 ab_admin 과 함께 ab_sp 를 지운다");

    const signup = (cookie) => app.fetch(new Request(`${BASE}/my/local-signup`, {
      method: "POST",
      headers: { ...(cookie ? { cookie } : {}), "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html" },
      body: new URLSearchParams({ login_name: `qa-carry-${cookie ? "sp" : "plain"}`, display_name: "QA", access_code: "qa-carry-pass-1234", access_code_confirm: "qa-carry-pass-1234", consent: "1" }).toString(),
    }), fx.env, ctx);
    const withCookie = await signup("ab_sp=1");
    const withCookieLines = withCookie.headers.getSetCookie();
    ok(withCookie.status === 303 && withCookieLines.some((line) => /^ab_user=[^;]/.test(line)), "5-d (준비) 가입은 새 로그인 세션을 준다");
    eq(withCookieLines.filter((line) => /^ab_sp=/.test(line)), [CLEAR], "5-d 새 세션을 주는 응답은 앞사람의 ab_sp 를 지운다");
    const withoutCookie = await signup("");
    eq(withoutCookie.headers.getSetCookie().filter((line) => /^ab_sp=/.test(line)), [], "5-e 요청에 ab_sp 가 없으면 아무 줄도 더하지 않는다");

    // 모듈 직접: 세션이 바뀌는 응답·이미 ab_sp 를 정한 응답·쿠키 없는 요청.
    const req = (cookie, method = "GET", path = "/reports") => new Request(`${BASE}${path}`, { method, headers: cookie ? { cookie } : {} });
    const sessionSet = new Response(null, { status: 303, headers: { location: "/app", "set-cookie": "ab_user=next-session; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax" } });
    const cleared = await supporterAccentResponseV229121(req("ab_sp=1", "POST", "/my/local-login"), {}, sessionSet);
    eq(cleared.headers.getSetCookie().filter((line) => /^ab_sp=/.test(line)), [CLEAR], "5-f (모듈) ab_user 를 주는 응답 + 요청 ab_sp → 지우는 줄을 더한다");
    const sessionGone = new Response(null, { status: 303, headers: { location: "/my", "set-cookie": "ab_user=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } });
    eq((await supporterAccentResponseV229121(req("ab_sp=1; ab_user=x"), {}, sessionGone)).headers.getSetCookie().filter((line) => /^ab_sp=/.test(line)), [CLEAR], "5-f (모듈) ab_user 를 지우는 응답도 ab_sp 를 지운다");
    const untouched = new Response(null, { status: 303, headers: { location: "/app", "set-cookie": "ab_user=next; Path=/" } });
    ok((await supporterAccentResponseV229121(req(""), {}, untouched)) === untouched, "5-g (모듈) 요청에 ab_sp 가 없으면 같은 응답 객체를 돌려준다");
    const decided = new Response(null, { status: 303, headers: [["set-cookie", "ab_user=next; Path=/"], ["set-cookie", SET]] });
    ok((await supporterAccentResponseV229121(req("ab_sp=1"), {}, decided)) === decided, "5-g (모듈) 응답이 ab_sp 를 이미 정했으면 그대로");
    const page200 = new Response("<!doctype html><html lang=\"ko\"><head><title>t</title></head><body class=\"abV22812Shell\"><main>x</main></body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    ok((await supporterAccentResponseV229121(req("ab_sp=1"), {}, page200)) === page200, "5-h (모듈) 로그인 세션 쿠키가 없으면 셸 HTML 도 같은 응답 객체");
    const shellPage = () => new Response("<!doctype html><html lang=\"ko\"><head><title>t</title></head><body class=\"abV22812Shell\"><main>x</main></body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8", vary: "Accept-Encoding" } });
    const litModule = await supporterAccentResponseV229121(req("ab_sp=1; ab_user=x"), {}, shellPage());
    const litText = await litModule.text();
    ok(litText === `<!doctype html><html lang="ko" data-supporter="1"><head><title>t</title>${ACCENT_HEAD}</head><body class="abV22812Shell"><main>x</main></body></html>`, "5-i (모듈) 셸 링크가 없으면 </head> 바로 앞에 붙인다");
    eq(litModule.headers.get("vary"), "Accept-Encoding, Cookie", "5-i (모듈) 기존 Vary 에 Cookie 를 더한다");
    for (const [label, html] of [
      ["로그인 이름 로그인 폼", "<!doctype html><html><head></head><body class=\"abV22812Shell\"><form method=\"post\" action=\"/my/local-login\"></form></body></html>"],
      ["공개 머리말", "<!doctype html><html><head></head><body class=\"abV22812Shell\"><header class=\"pubHeader\"></header></body></html>"],
      ["운영 내비", "<!doctype html><html><head></head><body class=\"abV22812Shell\"><nav data-nav-scope=\"ops\"></nav></body></html>"],
      ["이미 data-supporter", "<!doctype html><html data-supporter=\"1\"><head></head><body class=\"abV22812Shell\"></body></html>"],
      ["셸 아님", "<!doctype html><html><head></head><body class=\"pubBody\"></body></html>"],
    ]) {
      const response = new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      ok((await supporterAccentResponseV229121(req("ab_sp=1; ab_user=x"), {}, response)) === response, `5-j (모듈) ${label}: 같은 응답 객체`);
    }
    for (const [label, path] of [["홈", "/app"], ["홈(/m)", "/m"], ["전체 메뉴", "/menu"], ["참여자", "/my/members"], ["관리자", "/admin/supporters"], ["운영", "/ops-dashboard"], ["계정 통합", "/identity-audit"]]) {
      const response = shellPage();
      ok((await supporterAccentResponseV229121(req("ab_sp=1; ab_user=x", "GET", path), {}, response)) === response, `5-k (모듈) ${label}(${path}) 주소는 덧붙이지 않는다`);
    }

    // withSupporterAccentCookieV229121: 읽지 않음(null)·200 아님·이미 맞음은 같은 객체.
    const base = () => new Response("x", { status: 200, headers: { "content-type": "text/html" } });
    const r1 = base(); ok(withSupporterAccentCookieV229121(req("ab_sp=1"), r1, null) === r1, "5-l (모듈) 표시를 읽지 않았으면(null) 그대로");
    const r2 = new Response("x", { status: 403 }); ok(withSupporterAccentCookieV229121(req(""), r2, true) === r2, "5-l (모듈) 200 이 아니면 그대로");
    const r3 = base(); ok(withSupporterAccentCookieV229121(req("ab_sp=1"), r3, true) === r3, "5-l (모듈) 후원자 + 이미 1 이면 그대로");
    const r4 = base(); ok(withSupporterAccentCookieV229121(req(""), r4, false) === r4, "5-l (모듈) 비후원자 + 쿠키 없음이면 그대로");
    eq(withSupporterAccentCookieV229121(req(""), base(), true).headers.getSetCookie(), [SET], "5-m (모듈) 후원자 + 쿠키 없음 → 주기");
    eq(withSupporterAccentCookieV229121(req("ab_sp=1"), base(), false).headers.getSetCookie(), [CLEAR], "5-m (모듈) 비후원자 + 쿠키 있음 → 지우기");
    ok(supporterAccentCookieV229121(true) === SET && supporterAccentCookieV229121(false) === CLEAR, "5-m (모듈) 쿠키 모양 두 가지");

    // 처음부터 끝까지: 홈에서 받고 → 다른 화면에 색 → 표시가 끝나면 전체 메뉴에서 지워지고 → 색 없음 → 로그아웃.
    dropFlags();
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    const jar = new Map(user.split(";").map((pair) => pair.trim()).filter(Boolean).map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]));
    const cookieOf = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const take = (lines) => { for (const line of lines) { const [pair, ...attrs] = line.split(";").map((s) => s.trim()); const name = pair.slice(0, pair.indexOf("=")); const value = pair.slice(pair.indexOf("=") + 1); if (!value || attrs.some((a) => /^max-age=0$/i.test(a))) jar.delete(name); else jar.set(name, value); } };
    const step1 = await get(fx, HOME, cookieOf()); take(step1.cookies);
    ok(jar.get("ab_sp") === "1", "5-n 흐름 1: 홈에서 쿠키를 받는다");
    const step2 = await get(fx, "/reports?month=2026-07&household_id=house-home", cookieOf());
    ok(accented(step2.html), "5-n 흐름 2: 리포트 화면에 포인트 색");
    dropFlags();
    putSetting(fx, "supporter:user-bin", flag("2026-06-01", "2026-07-14"));
    const step3 = await get(fx, MENU, cookieOf()); take(step3.cookies);
    ok(!jar.has("ab_sp") && !accented(step3.html), "5-n 흐름 3: 표시가 끝난 뒤 전체 메뉴가 쿠키를 지운다");
    const step4 = await get(fx, "/reports?month=2026-07&household_id=house-home", cookieOf());
    ok(!accented(step4.html), "5-n 흐름 4: 그 뒤 리포트 화면에 색 없음");
    dropFlags();
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    const step5 = await get(fx, MEMBERS, cookieOf()); take(step5.cookies);
    ok(jar.get("ab_sp") === "1", "5-n 흐름 5: 다시 후원자가 되면 참여자 화면에서 받는다");
    const step6 = await post(fx, "/my/logout", {}, { cookie: cookieOf() });
    take(step6.setCookie ? step6.setCookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/) : []);
    ok(!jar.has("ab_sp") && !jar.has("ab_user"), "5-n 흐름 6: 로그아웃이 세션과 함께 지운다");
    dropFlags();
  });
}));

// ── 6. 소스 ────────────────────────────────────────────────────────────────
await section("6 소스", async () => {
  const modules = read("../src/modules/MANIFEST.txt").split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".js"));
  ok(modules.includes("my/supporter-accent.js") && modules.includes("my/merge-carry.js"), "6-a 새 모듈 둘이 MANIFEST 에 있다");
  ok(modules.indexOf("my/supporters.js") < modules.indexOf("my/supporter-accent.js") && modules.indexOf("my/supporters.js") < modules.indexOf("my/merge-carry.js"), "6-a 새 모듈은 my/supporters.js 뒤에 온다");
  const merge = read("../src/modules/admin/identity-merge.js");
  eq(count(merge, "carryUserSettingsAfterMergeV229121(env, primaryId, secondaryId"), 1, "6-b performIdentityMerge 가 옮기기를 한 번 부른다");
  const callAt = merge.indexOf("await carryUserSettingsAfterMergeV229121(");
  ok(callAt > merge.indexOf("await options.afterMerge(") && callAt < merge.indexOf("withGlobalIdentitySettingsRmw(env") && callAt > merge.indexOf("rpc/accountbook_merge_users_v227"), "6-b 자리: 합치기 RPC·세션(afterMerge) 뒤, 링크 표 정리 앞");
  ok(/carryUserSettingsAfterMergeV229121\(env, primaryId, secondaryId, \{ path, hasRoom: \(calls\) => dbRoom\(calls \+ 4\) \}\)/.test(merge), "6-b 남은 호출을 넘기되 바로 뒤 링크 표 정리 몫(4회)은 남긴다(독립 검토 1차 P2)");
  const carry = read("../src/modules/my/merge-carry.js");
  ok(carry.includes("saveSettingValue(env, keys.supporterPrimary") && carry.includes("saveSettingValue(env, keys.consentPrimary") && carry.includes("merge_settings_carry_failed"), "6-c 쓰기는 설정 upsert 도우미 · 실패 이벤트 이름");
  const accent = read("../src/modules/my/supporter-accent.js");
  ok(!/\bsupabase\(|fetchSetting|getSettingValue/.test(accent), "6-d 응답 마무리·쿠키 모듈은 DB 를 부르지 않는다");
  ok(accent.includes("위조한 쿠키는 위조한 사람 자기 화면의 색만 바꾸고") && accent.includes("서명하지 않는다"), "6-e ‘보기만 바꾼다(위조해도 자기 화면 색만)’ 주석");
  const router = read("../src/modules/worker/router.js");
  ok(/supporterAccentResponseV229121\(routed\.request, env, await setupBandResponse\(/.test(router), "6-f 라우터 응답 마무리: 설정 띠 다음에 포인트 색");
  for (const [file, label] of [["../src/modules/my/mobile-home.js", "홈"], ["../src/modules/web/menu-and-guides.js", "전체 메뉴"], ["../src/modules/my/members-page.js", "참여자"]]) {
    eq(count(read(file), "withSupporterAccentCookieV229121(request, htmlResponse("), 1, `6-g ${label} 화면이 그린 응답에 쿠키를 맞춘다(한 곳)`);
  }
  ok(read("../src/modules/auth/kakao-oauth.js").includes("clearConsentStateCookie(), supporterAccentCookieV229121(false)]") && read("../src/modules/admin/transactions-households.js").includes("supporterAccentCookieV229121(false),"), "6-h 두 로그아웃이 ab_sp 를 지운다");
});

if (failures.length) for (const line of failures) console.error(`실패: ${line}`);
if (failures.length) { console.error(`V22.9.121 후원자 옮기기·포인트 색 검사 실패 checks ${checks} failed ${failures.length}`); process.exit(1); }
console.log(`V22.9.121 후원자 옮기기·포인트 색 검사 통과 (${checks} checks)`);
