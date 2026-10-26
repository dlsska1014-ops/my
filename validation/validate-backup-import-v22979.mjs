// V22.9.79 백업 → 가져오기 왕복·백업센터·가져오기 해석 비용 검사 (V44 E-15·E-16·E-11·E-1). 메모리 픽스처(validation/qa-fixture.mjs)로
// 재현하며 네트워크를 쓰지 않는다.
//   E-15 백업 CSV 를 다시 가져오면 메모·분류·결제수단 앞에 수식 방지 작은따옴표가 남고, 같은 가계부에 다시 가져오면 그 행들이 중복으로
//        잡히지 않아 두 번 들어갔다. 작은따옴표는 "하나 이상 + 수식 기호"일 때만 하나를 뺀다(진짜 작은따옴표로 시작하는 글은 남는다).
//        이 앱이 내보낸 표(열 9개)는 빈 칸을 추측하지 않고, 원문은 내용 칸 값으로 둔다. 나간 사람·지출자 없음은 후보에서 빠지지 않는다.
//   E-11 매핑 안 된 열의 값이 분류·결제수단을 오염시키던 것(V22.9.5x 에서 이미 고쳐짐 — 되돌아오지 않게 지킨다)과,
//        ‘결제방법’ 열의 일시불·할부가 결제수단 이름이 되던 것.
//   E-16 백업센터: 가계부별 전체 기간 백업·연도별 백업, 모든 가계부 백업은 가계부 6개부터 읽다가 503 으로 끝나던 것을 읽기 전에 알림,
//        복구 단계가 받는 8MB 를 넘는 파일은 만들지 않음, 전체 기간 파일은 들여쓰기 없이.
//   E-1  가져오기 해석 비용: 날짜 칸을 행마다 네다섯 번 읽던 것, 같은 글을 분류·구분·결제수단이 각자 다시 정규화하던 것, 분류 낱말
//        수백 개를 글에서 찾던 것, 중복 후보 전체를 미리 정규화하던 것. 결과는 같다(기억을 끈 해석과 표본 전체에서 같다).
// 옛 코드(V22.9.78)에서 무엇이 깨지는지 보려면 V22979_SOFT=1 로 돌린다(실패한 검사를 모두 적고 끝낸다).
// 사용: node validation/validate-backup-import-v22979.mjs [--bench]
import assert from "node:assert/strict";
import app, { parseFlexibleImportRecords } from "../src/index.js";
import { READABLE_CSV_COLUMNS, buildReadableTransactionsCsv, csvSafeText } from "../src/modules/import/csv-duplicates.js";
import { CATEGORY_RULES, inferCategory } from "../src/modules/nlu/category-rules.js";
import * as amountParser from "../src/modules/nlu/amount-parser.js";
import { BASE, ctx, counter, fixture, intercept, page, post, putSetting } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.79 백업 왕복·백업센터·가져오기 해석 비용 검사 통과");
const SOFT = process.env.V22979_SOFT === "1";
const BENCH = process.argv.includes("--bench");
const failures = [];
let checks = 0;
const ok = (value, message) => {
  checks += 1;
  if (value) return t.ok(true, message);
  if (!SOFT) assert.fail(message);
  failures.push(message);
  return undefined;
};
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const deepEq = (actual, expected, message) => ok(JSON.stringify(actual) === JSON.stringify(expected), `${message} (실제 ${JSON.stringify(actual)?.slice(0, 300)}, 기대 ${JSON.stringify(expected)?.slice(0, 300)})`);

const HH = "house-home";
const BIN = "11111111-1111-4111-8111-111111111111";
const WIFI = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-14T12:00:00+09:00");

// ── 공용 도구 ───────────────────────────────────────────────────────────────────
// 운영 users.id 는 uuid 다. 가져오기가 uuid 가 아닌 user_id 를 지우므로 픽스처 id 를 uuid 로 바꾼다.
async function uuidFixture(fx) {
  for (const [name, rows] of Object.entries(fx.db)) {
    if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", BIN).replaceAll("user-wifi", WIFI));
  }
  fx.cookie = await fx.cookieFor(BIN);
  fx.db.__import_rpc_available = true;
  return fx;
}
const tokenPayload = (token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
async function importPreview(fx, text, { month = "2026-07", skip = true } = {}) {
  const response = await post(fx, "/my/import", { import_action: "preview", household_id: HH, month, csv_text: text, ...(skip ? { skip_duplicates: "1" } : {}) });
  const token = response.text.match(/name="import_token" value="([^"]+)"/)?.[1] || "";
  return { status: response.status, html: response.text, token, payload: token ? tokenPayload(token) : null };
}
async function importCommit(fx, preview, rowNumbers, month = "2026-07") {
  const values = new URLSearchParams({ import_action: "commit", import_token: preview.token, household_id: HH, month });
  for (const number of rowNumbers) values.append("selected_rows", String(number));
  return post(fx, "/my/import", values);
}
const exportCsv = async (fx, query = `household_id=${HH}&month=2026-07&range=all`) => {
  const response = await app.fetch(new Request(`${BASE}/my/backup.csv?${query}`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
  return { status: response.status, text: (await response.text()).replace(/^﻿/, "") };
};
const parse = (text, options = {}) => parseFlexibleImportRecords(text, HH, BIN, { source: "my_import", maxRows: 5000, importYear: 2026, ...options });
const key = (row) => [row.transaction_date, row.type, row.amount, row.category, row.memo, row.payment_method].join("|");

let adminSeq = 0;
async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = "admin-pass";
  fx.env.ADMIN_SESSION_SECRET = "admin-secret";
  adminSeq += 1;
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": `198.51.100.${100 + adminSeq}` },
    body: new URLSearchParams({ password: "admin-pass", return_to: "/backup" }).toString(),
  }), fx.env, ctx);
  return ((response.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
}
const links = (html) => [...String(html).matchAll(/<a class="btn[^"]*" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => ({ href: m[1].replaceAll("&amp;", "&"), label: m[2] }));
const outage = () => new Response(JSON.stringify({ message: "synthetic outage" }), { status: 503, headers: { "content-type": "application/json" } });
const settingsRead = (url, method, name) => method === "GET" && url.pathname.endsWith("/accountbook_settings") && decodeURIComponent(url.search).includes(name);
async function exportJson(fx, cookie, query) {
  const response = await page(fx, `/admin/export/json?${query}`, { cookie });
  let json = null;
  try { json = JSON.parse(response.html); } catch (_) { /* 파일이 아닌 오류 답 */ }
  return { status: response.status, text: response.html, json };
}
async function dbRequests(task) {
  let calls = 0;
  const stop = intercept(({ url }) => { if (url.hostname === "mock.supabase.co") calls += 1; return null; });
  try { return { result: await task(), calls }; } finally { stop(); }
}

// ── E-15 ────────────────────────────────────────────────────────────────────────
// 1) 내보내기: 수식 방지는 그대로이고, 되돌릴 수 있게 작은따옴표로 시작하는 값만 구분한다.
{
  for (const [input, expected] of [
    ["=SUM(A1)", "'=SUM(A1)"], ["+1 모임", "'+1 모임"], ["-5도 날씨", "'-5도 날씨"], ["@멘션", "'@멘션"], ["\t탭", "'\t탭"],
    ["'점심", "'점심"], ["''두개", "''두개"], ["'=수식", "''=수식"], ["''+더하기", "'''+더하기"],
    ["-123", "-123"], ["-12.5", "-12.5"], ["12345", "12345"], ["점심", "점심"], ["", ""],
  ]) eq(csvSafeText(input), expected, `E-15 내보내기: ${JSON.stringify(input)} → ${JSON.stringify(expected)}`);
  ok(csvSafeText("=cmd|' /C calc'!A0").startsWith("'="), "E-15 수식 방지는 그대로다: 엑셀이 수식으로 여는 값 앞에는 작은따옴표가 붙는다");
}

// 2) 파일에 적은 그대로 돌아오는 값들(메모·분류·결제수단·지출자)
{
  const values = ["=SUM(A1)", "+1 모임 회비", "-5도 날씨", "@멘션", "'점심", "''두개", "'=수식 같은 글", "'+더하기", "'-빼기", "-123", "-12.5", "+82", "=", "'", "가나다", "12345", "1,000원 할인", "국민카드(1234)", "현대카드 the Red Edition5 (본인 1234)", "삼성카드 taptap O", "A, B 카드", "큰\"따옴표\" 포함"];
  const rows = values.map((value, index) => ({ transaction_date: "2026-07-01", type: "expense", amount: 1000 + index, category: value, memo: value, payment_method: value, spender_name: "민수", source: "kakao", id: `v-${index}` }));
  const csv = buildReadableTransactionsCsv(rows);
  const result = parse(csv);
  eq(result.rows.length, rows.length, "E-15 왕복: 모든 행을 읽는다");
  const wrong = [];
  result.rows.forEach((row, index) => {
    const value = values[index];
    for (const field of ["category", "memo", "payment_method"]) if (row[field] !== value) wrong.push(`${field}:${JSON.stringify(value)}→${JSON.stringify(row[field])}`);
  });
  deepEq(wrong, [], "E-15 왕복: 메모·분류·결제수단이 내보낸 값과 같다(수식 기호로 시작하는 값·진짜 작은따옴표로 시작하는 값·긴 카드 이름)");
  ok(result.rows.every((row) => row._import_spender === "민수"), "E-15 왕복: 지출자 이름도 그대로다");

  // 우리 표가 아닌 파일에서도 작은따옴표 + 수식 기호는 같은 규칙으로 뺀다. 진짜 작은따옴표로 시작하는 글은 그대로다.
  const plain = parse("날짜,금액,내용\n2026-07-01,1000,'=1+1\n2026-07-02,2000,'점심\n2026-07-03,3000,''=이중\n2026-07-04,4000,'12:30 약속");
  deepEq(plain.rows.map((row) => row.memo), ["=1+1", "'점심", "'=이중", "'12:30 약속"], "E-15 다른 표에서도: ‘작은따옴표 + 수식 기호’만 한 개 뺀다");
}

// 3) 이 앱이 내보낸 표(열 9개)는 빈 칸을 추측하지 않는다. 열이 모자란 표는 예전처럼 읽는다.
{
  const base = { transaction_date: "2026-07-02", type: "expense", amount: 15000, category: "금융", memo: "신한카드 연회비", payment_method: "", spender_name: "민수", source: "web", id: "p-1" };
  const exported = buildReadableTransactionsCsv([base, { ...base, amount: 9900, id: "p-2", category: "구독", memo: "", payment_method: "" }, { ...base, amount: 4500, id: "p-3", category: "카페/간식", memo: "스타벅스 취소", payment_method: "신한카드" }]);
  const faithful = parse(exported).rows;
  deepEq(faithful.map((row) => row.payment_method), ["", "", "신한카드"], "E-15 백업 표: 결제수단 칸이 비면 내용 글에서 결제수단을 추측하지 않는다");
  deepEq(faithful.map((row) => row.memo), ["신한카드 연회비", "", "스타벅스 취소"], "E-15 백업 표: 빈 내용을 분류 이름으로 채우지 않는다");
  ok(faithful.every((row) => row._import_needs_confirmation === false), "E-15 백업 표: 메모의 ‘취소’ 같은 말로 확인 필요 표시를 하지 않는다(기본 선택에서 빠져 복원 때 조용히 빠졌다)");
  const columns = READABLE_CSV_COLUMNS.slice();
  eq(columns.length, 9, "E-15 내보내기 열은 9개다(가져오기의 백업 표 판정과 같은 목록)");
  const partial = exported.split("\r\n").map((line) => line.split(",").slice(0, 7).join(",")).join("\n");
  const generic = parse(partial).rows;
  eq(generic[0].payment_method, "신한카드", "E-15 열이 모자란 표(7열)는 예전처럼 내용 글에서 결제수단을 읽는다");
  ok(generic[2].memo === "스타벅스 취소" && generic[2]._import_needs_confirmation === true, "E-15 열이 모자란 표는 ‘취소’ 행을 예전처럼 확인 필요로 둔다");
  // 원문: 열 전체를 이은 줄(출처·기록ID 까지)이 아니라 내용 칸 값
  deepEq(faithful.map((row) => row.raw_text), ["신한카드 연회비", "", "스타벅스 취소"], "E-15 원문(raw_text)은 내용 칸 값이다(예전에는 ‘날짜,지출,15000,금융,…,web,p-1’ 같은 줄 전체)");
}

// 4) 화면 안내
await fixture(async (fx) => {
  await uuidFixture(fx);
  const html = (await page(fx, `/my/backup?household_id=${HH}&month=2026-07`)).html;
  ok(html.includes("작은따옴표는 다시 가져올 때 자동으로 빼고"), "E-15 /my/backup 안내: 수식 방지 작은따옴표를 다시 가져올 때 뺀다고 알린다");
  ok(!html.includes("가져오기에서도 유지합니다"), "E-15 /my/backup 안내: 예전 문구(작은따옴표를 유지한다)가 없다");
});

// 5) 실제 흐름: 내보내기 → (같은 가계부에 다시 가져오기 = 모두 중복) / (비운 가계부에 가져오기 = 같은 기록)
for (const categoriesPresent of [false, true]) {
  await fixture(async (fx) => {
    await uuidFixture(fx);
    const mode = categoriesPresent ? "분류 표 있음" : "분류 표 없음(운영)";
    const base = { household_id: HH, source: "kakao", created_at: "2026-07-21T01:00:00Z", user_id: BIN, type: "expense", category: "기타지출", memo: "", payment_method: "", raw_text: "" };
    let n = 0;
    const add = (o) => { n += 1; fx.db.transactions.push({ ...base, id: `e15-${n}`, transaction_date: `2026-07-${String(10 + (n % 15)).padStart(2, "0")}`, amount: 31000 + n, ...o }); };
    for (const memo of ["=SUM(A1)", "+1 모임", "-5도 날씨", "@멘션", "'작은따옴표로 시작", "''두개", "'=수식 같은", "점심"]) add({ memo, category: "외식", payment_method: "국민카드(1234)", raw_text: `${memo} 메모` });
    add({ memo: "", raw_text: "넷플릭스 9900", category: "구독", amount: 9900 });
    add({ memo: "", raw_text: "", category: "구독", amount: 9901 });
    add({ memo: "신한카드 연회비", raw_text: "", category: "금융", amount: 15000 });
    add({ memo: "스타벅스 취소", raw_text: "스타벅스 취소 4500", category: "카페/간식", amount: 4500, payment_method: "신한카드" });
    add({ memo: "수입 환불 취소", raw_text: "", category: "환급", amount: 7000, type: "income" });
    add({ memo: "현대카드 연회비", category: "금융", amount: 21000, payment_method: "현대카드 the Red Edition5 (본인 1234)", raw_text: "연회비" });
    const originals = fx.db.transactions.filter((row) => row.household_id === HH && row.transaction_date >= "2026-07-01" && row.transaction_date < "2026-08-01").map((row) => ({ ...row }));
    const exported = await exportCsv(fx);
    eq(exported.status, 200, `E-15 ${mode}: 전체 기간 CSV 를 내려받는다`);

    // 같은 가계부에 다시 가져오기: 모든 행이 중복이다
    const again = await importPreview(fx, exported.text);
    eq(again.status, 200, `E-15 ${mode}: 같은 가계부에 다시 가져오는 미리보기가 열린다`);
    eq(again.payload?.ready.length, 0, `E-15 ${mode}: 같은 가계부에 다시 가져오면 저장 후보가 0건이다(예전에는 수식 기호로 시작하는 메모 등이 중복으로 잡히지 않아 두 번 들어갔다)`);
    eq(again.payload?.reason_counts?.duplicate, fx.db.transactions.filter((row) => row.household_id === HH).length, `E-15 ${mode}: 모든 기록이 중복으로 제외된다`);

    // 비운 가계부에 가져오기: 기본 선택 그대로 저장하면 같은 기록이 돌아온다
    const keep = fx.db.transactions.filter((row) => row.household_id !== HH);
    fx.db.transactions = keep;
    const restore = await importPreview(fx, exported.text);
    const ready = restore.payload?.ready || [];
    eq(ready.length, exported.text.split("\r\n").length - 1, `E-15 ${mode}: 비운 가계부에는 모든 행이 저장 후보다`);
    deepEq(ready.filter((entry) => entry.needs_confirmation).map((entry) => entry.row_number), [], `E-15 ${mode}: 확인 필요로 기본 선택에서 빠지는 행이 없다(‘취소’·‘환불’ 말이 든 메모 포함)`);
    const saved = await importCommit(fx, restore, ready.filter((entry) => !entry.needs_confirmation).map((entry) => entry.row_number));
    eq(saved.status, 200, `E-15 ${mode}: 기본 선택 그대로 저장한다`);
    const restored = fx.db.transactions.filter((row) => row.household_id === HH);
    eq(restored.length, originals.length, `E-15 ${mode}: 기록 수가 같다`);
    const left = restored.map(key);
    const missing = [];
    for (const row of originals) {
      const wanted = key(row.memo === "" && row.raw_text ? { ...row, memo: row.raw_text } : row);
      const at = left.indexOf(wanted);
      if (at < 0) missing.push(wanted); else left.splice(at, 1);
    }
    deepEq(missing, [], `E-15 ${mode}: 날짜·구분·금액·분류·메모·결제수단이 원래 기록과 같다(메모가 없던 기록은 내용 칸에 적힌 원문이 메모가 된다)`);
    const noMemo = restored.find((row) => row.amount === 9900);
    eq(noMemo?.raw_text, "넷플릭스 9900", `E-15 ${mode}: 메모가 없던 기록의 원문이 그대로 돌아온다`);
    eq(restored.find((row) => row.amount === 9901)?.memo, "", `E-15 ${mode}: 메모도 원문도 없던 기록의 메모는 분류 이름으로 채워지지 않는다`);
    eq(restored.find((row) => row.amount === 15000)?.payment_method, "", `E-15 ${mode}: 결제수단이 없던 기록에 내용 글(‘신한카드 연회비’)에서 결제수단을 지어내지 않는다`);
    eq(restored.find((row) => row.amount === 21000)?.payment_method, "현대카드 the Red Edition5 (본인 1234)", `E-15 ${mode}: 긴 카드 이름이 줄지 않는다`);
    ok(restored.every((row) => !String(row.raw_text).includes("kakao") && !String(row.raw_text).includes("e15-")), `E-15 ${mode}: 원문에 출처·기록ID 가 섞이지 않는다`);
  }, { categoriesPresent });
}

// 6) 지금 참여자가 아닌 지출자('이전 구성원'·'미지정')는 후보에서 빠지지 않는다
await fixture(async (fx) => {
  await uuidFixture(fx);
  const base = { household_id: HH, source: "kakao", created_at: "2026-07-21T01:00:00Z", type: "expense", category: "외식", payment_method: "", raw_text: "" };
  fx.db.transactions.push({ ...base, id: "g-1", user_id: GONE, transaction_date: "2026-07-22", amount: 2222, memo: "나간 사람 행" });
  fx.db.transactions.push({ ...base, id: "g-2", user_id: null, transaction_date: "2026-07-21", amount: 1111, memo: "미지정 행" });
  const exported = await exportCsv(fx);
  ok(exported.text.includes(",이전 구성원,") && exported.text.includes(",미지정,"), "E-15 지출자: 나간 사람은 ‘이전 구성원’, 지출자 없음은 ‘미지정’으로 내보낸다");
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH);
  const restore = await importPreview(fx, exported.text);
  const ready = restore.payload?.ready || [];
  const placeholders = ready.filter((entry) => /나간 사람 행|미지정 행/.test(entry.raw));
  eq(placeholders.length, 2, "E-15 지출자: ‘이전 구성원’·‘미지정’ 행이 저장 후보에 든다(예전에는 ‘지출자 권한 확인 필요’로 후보에서 빠졌다)");
  ok(placeholders.every((entry) => entry.needs_confirmation && entry.warnings.some((w) => w.includes("가져오는 분 이름으로 저장합니다"))), "E-15 지출자: 그 행은 경고와 함께 확인 후 저장하게 한다(기본 선택 아님)");
  ok(placeholders.every((entry) => entry.row.user_id === BIN), "E-15 지출자: 지정하지 않은 지출자는 가져오는 분으로 둔다");
  const saved = await importCommit(fx, restore, ready.map((entry) => entry.row_number));
  eq(saved.status, 200, "E-15 지출자: 확인 후 저장한다");
  eq(fx.db.transactions.filter((row) => row.household_id === HH && [1111, 2222].includes(row.amount)).length, 2, "E-15 지출자: 두 행이 저장됐다");
  // 참여자 이름과 같으면 이전처럼 그 사람이다. 목록에 없는 다른 이름은 예전처럼 거절한다.
  const stranger = await importPreview(fx, "날짜,구분,금액,분류,내용,결제수단,지출자,출처,기록ID\n2026-07-05,지출,3000,외식,외부인 행,,낯선사람,kakao,x-1");
  eq((stranger.payload?.ready || []).length, 0, "E-15 지출자: 참여자도 ‘이전 구성원’ 표시도 아닌 이름은 예전처럼 후보가 되지 못한다");
});

// 7) 이름이 같은 구성원(단톡방 ‘카카오사용자’ 여럿): 내보낼 때 ‘Bin 1’·‘Bin 2’ 로 구분해 적은 이름으로 그 구성원을 찾는다
await fixture(async (fx) => {
  await uuidFixture(fx);
  const TWIN = "44444444-4444-4444-8444-444444444444";
  fx.db.users.push({ id: TWIN, kakao_user_key: "kakao_login:7777", nickname: "Bin", created_at: "2026-07-03T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: HH, user_id: TWIN, role: "member", created_at: "2026-07-03T00:00:00.000Z" });
  fx.db.transactions.push({ household_id: HH, source: "kakao", created_at: "2026-07-20T01:00:00Z", type: "expense", category: "외식", payment_method: "", raw_text: "", id: "twin-1", user_id: TWIN, transaction_date: "2026-07-20", amount: 8800, memo: "같은 이름 둘째" });
  const exported = await exportCsv(fx);
  const names = [...new Set(exported.text.split("\r\n").slice(1).map((line) => line.split(",")[6]))];
  ok(names.includes("Bin 1") && names.includes("Bin 2"), `E-15 같은 이름 구성원: 내보낸 지출자 칸이 ‘Bin 1’·‘Bin 2’ 로 구분된다 (${names.join(" | ")})`);
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH);
  const restore = await importPreview(fx, exported.text);
  const ready = restore.payload?.ready || [];
  eq(ready.length, exported.text.split("\r\n").length - 1, "E-15 같은 이름 구성원: 두 사람의 기록이 모두 저장 후보다(예전에는 ‘Bin 1’·‘Bin 2’ 를 찾지 못해 지출자 오류로 빠졌다)");
  eq(ready.find((entry) => entry.raw.includes("같은 이름 둘째"))?.row.user_id, TWIN, "E-15 같은 이름 구성원: ‘Bin 2’ 행의 지출자가 그 구성원이다");
  ok(ready.filter((entry) => entry.raw.includes(",Bin 1,")).length > 0 && ready.filter((entry) => entry.raw.includes(",Bin 1,")).every((entry) => entry.row.user_id === BIN), "E-15 같은 이름 구성원: ‘Bin 1’ 행의 지출자는 먼저 들어온 구성원이다");
  const ambiguous = await importPreview(fx, "날짜,구분,금액,분류,내용,결제수단,지출자,출처,기록ID\n2026-07-05,지출,3000,외식,어느 쪽인지 모르는 행,,Bin,kakao,x-1");
  eq((ambiguous.payload?.ready || []).length, 0, "E-15 같은 이름 구성원: 닉네임 그대로(‘Bin’)는 둘 중 누구인지 알 수 없어 예전처럼 거절한다");
});

// ── E-11 ────────────────────────────────────────────────────────────────────────
{
  // 감사 재현(V22.9.44): 매핑 안 된 열의 값이 분류를 오염시켰다. 지금은 읽는 열의 글만 분류·결제수단 판정에 쓴다.
  const bank = parse("거래일자,거래시간,적요,출금(원),입금(원),내용,잔액(원),거래점\n2026.10.01,12:00:00,체크카드,4500,0,스타벅스,995500,인터넷");
  eq(bank.rows[0].category, "카페/간식", "E-11 통장 표: 매핑 안 된 ‘거래점=인터넷’ 이 분류를 통신비로 만들지 않는다");
  eq(bank.rows[0].payment_method, "체크카드", "E-11 통장 표: 결제수단은 적요에서 읽는다");
  const card = parse("이용일자,이용가맹점,이용금액,업종,승인번호,상태\n2026.10.01,스타벅스 강남점,4500,통신판매,12345678,승인");
  eq(card.rows[0].category, "카페/간식", "E-11 카드 표: 매핑 안 된 ‘업종=통신판매’ 가 분류를 오염시키지 않는다");
  const untitled = parse("날짜,금액,내용,열4\n2026-10-01,4500,스타벅스,통신비");
  eq(untitled.rows[0].category, "카페/간식", "E-11 제목 없는 열의 값(‘통신비’)이 분류를 오염시키지 않는다");
  ok(untitled.rows[0].raw_text.includes("통신비"), "E-11 원문에는 모든 칸이 그대로 남는다(분류 판정에만 쓰지 않는다)");

  // 같은 표에 매핑 안 된 열을 넣어도 읽은 결과(원문 제외)가 같다 — 열 이름 × 값 × 자리 조합
  const bases = [
    { head: ["날짜", "내용", "금액"], rows: [["2026-10-01", "스타벅스", "4500"], ["2026-10-02", "점심", "9000"], ["2026-10-03", "월급", "3000000"]] },
    { head: ["거래일자", "적요", "출금액", "입금액", "내용", "잔액"], rows: [["2026.10.01", "체크카드", "4500", "0", "스타벅스", "995500"], ["2026.10.02", "타행이체", "0", "300000", "홍길동", "1295500"]] },
    { head: ["이용일자", "이용가맹점", "이용금액"], rows: [["2026.10.01", "스타벅스 강남점", "4500"], ["2026.10.02", "이마트 성수점", "52000"], ["2026.10.03", "GS25", "3000"]] },
  ];
  const quote = (cell) => (cell.includes(",") || cell.includes("\"") ? `"${cell.split("\"").join("\"\"")}"` : cell);
  const csvOf = (head, rows) => [head, ...rows].map((line) => line.map(quote).join(",")).join("\n");
  const shape = (result) => JSON.stringify({ rows: result.rows.map((row) => [row.transaction_date, row.type, row.amount, row.category, row.memo, row.payment_method, row._import_warnings, row._import_needs_confirmation]), rejected: result.rejected.map((item) => `${item.row_number}:${item.reason_code}`) });
  const extraHeads = ["거래점", "취급점", "업종", "열4", "참고사항", "수수료"];
  const extraValues = ["통신비", "인터넷", "신한카드", "현금", "급여", "환불", "취소", "병원", "일시불", "합계", "99999", "3,000"];
  let combos = 0;
  const polluted = [];
  for (const [index, spec] of bases.entries()) {
    const baseline = shape(parse(csvOf(spec.head, spec.rows)));
    for (const extraHead of extraHeads) for (const extraValue of extraValues) for (const at of [0, spec.head.length]) {
      const head = spec.head.slice(); head.splice(at, 0, extraHead);
      const rows = spec.rows.map((row) => { const copy = row.slice(); copy.splice(at, 0, extraValue); return copy; });
      combos += 1;
      if (shape(parse(csvOf(head, rows))) !== baseline) polluted.push(`${index}|${extraHead}|${extraValue}|${at}`);
    }
  }
  deepEq(polluted, [], `E-11 매핑 안 된 열을 더한 표 ${combos}가지가 더하기 전과 같은 분류·메모·결제수단·구분·경고로 읽힌다`);

  // 결제방법 열의 결제 방식(일시불·할부)은 결제수단이 아니다
  const installment = parse("이용일자,이용가맹점,이용금액,결제방법\n2026.10.01,스타벅스 강남점,4500,일시불\n2026.10.02,똑똑한쌤 학원,180000,3개월\n2026.10.03,이마트,52000,할부\n2026.10.04,쿠팡,13000,신한카드");
  deepEq(installment.rows.map((row) => row.payment_method), ["", "", "", "신한카드"], "E-11 ‘결제방법’ 열의 일시불·3개월·할부는 결제수단 이름이 되지 않고, 카드 이름은 그대로 쓴다");
  const withCard = parse("이용일자\t결제방법\t이용카드\t이용가맹점\t이용금액\n2026.10.01\t일시불\t본인 1234\t스타벅스\t4500");
  eq(withCard.rows[0].payment_method, "본인 1234", "E-11 ‘결제방법’ 이 ‘이용카드’ 앞에 있어도 이용카드 값을 결제수단으로 쓴다");
  deepEq(parse("날짜,금액,내용,결제수단\n2026-10-01,5000,커피,삼성카드 3개월\n2026-10-02,6000,점심,카드\n2026-10-03,7000,간식,현금").rows.map((row) => row.payment_method), ["삼성카드 3개월", "카드", "현금"], "E-11 이름이 든 결제수단(‘삼성카드 3개월’)은 그대로 둔다");
}

// ── E-16 ────────────────────────────────────────────────────────────────────────
for (const categoriesPresent of [false, true]) {
  await fixture(async (fx) => {
    const mode = categoriesPresent ? "분류 표 있음" : "분류 표 없음(운영)";
    const cookie = await adminCookie(fx);
    ok(!!cookie, `E-16 ${mode}: 관리자 로그인`);
    const base = fx.db.transactions.find((row) => row.household_id === HH);
    fx.db.transactions.push(
      { ...base, id: "y25-a", transaction_date: "2025-03-10", amount: 11000, memo: "작년 3월", created_at: "2025-03-10T01:00:00Z" },
      { ...base, id: "y25-b", transaction_date: "2025-12-31", amount: 12000, memo: "작년 말", created_at: "2025-12-31T01:00:00Z" },
      { ...base, id: "y26-a", transaction_date: "2026-01-01", amount: 13000, memo: "올해 첫날", created_at: "2026-01-01T01:00:00Z" },
    );
    fx.db.accountbook_budgets.push({ id: "b25", household_id: HH, month: "2025-03", category: "식비", amount: 300000, created_at: "2025-03-01T00:00:00Z" });
    putSetting(fx, `custom_categories:${HH}`, JSON.stringify([{ id: "e16-pet", name: "반려동물용품", type: "expense" }]));
    putSetting(fx, `category_keywords:${HH}`, JSON.stringify({ "expense::반려동물용품": ["사료"] }));

    // 백업센터 화면
    const center = await page(fx, `/backup?household_id=${HH}&month=2026-07`, { cookie });
    const list = links(center.html);
    const full = list.filter((item) => item.href.startsWith("/admin/export/json") && item.href.includes("range=all"));
    ok(full[0]?.label.includes("전체 기간") && full[0].href.includes(`household_id=${HH}`) && !full[0].href.includes("year="), `E-16 ${mode}: 첫 전체 기간 단추는 현재 가계부의 전체 기간 백업이다`);
    const perHousehold = full.filter((item) => !item.href.includes("year=") && !item.label.includes("전체 기간"));
    deepEq(perHousehold.map((item) => new URL(item.href, BASE).searchParams.get("household_id")).sort(), ["house-home", "house-trip"], `E-16 ${mode}: ‘가계부별 전체 기간 백업’ 목록에 모든 가계부가 하나씩 있다 (${perHousehold.map((item) => item.label).join(", ")})`);
    const years = full.filter((item) => item.href.includes("year="));
    deepEq(years.map((item) => item.label), ["2026년만", "2025년만", "2024년만", "2023년만", "2022년만"], `E-16 ${mode}: 현재 가계부의 연도별 전체 기간 단추가 최근 5년이다`);
    const monthOnly = list.filter((item) => item.href.startsWith("/admin/export/json") && !item.href.includes("range=all"));
    ok(monthOnly.length === 2 && monthOnly.every((item) => item.label.includes("2026-07")), `E-16 ${mode}: 한 달만 담는 단추는 이름에 그 달을 적는다 (${monthOnly.map((item) => item.label).join(" / ")})`);
    ok(center.html.includes("가계부별 전체 기간 백업") && center.html.includes("5개까지"), `E-16 ${mode}: 안내문이 ‘모든 가계부’ 백업의 한계(5개까지·한 달)와 대안을 적는다`);

    // 전체 기간 백업: 들여쓰기 없는 한 줄 JSON, 모든 달
    const fullBackup = await exportJson(fx, cookie, `household_id=${HH}&month=2026-07&range=all`);
    eq(fullBackup.status, 200, `E-16 ${mode}: 전체 기간 백업이 만들어진다`);
    ok(fullBackup.json && !fullBackup.text.includes("\n  "), `E-16 ${mode}: 전체 기간 백업은 들여쓰기 없이 만든다(8MB 상한 안에 더 많이 담는다)`);
    const homeRows = fx.db.transactions.filter((row) => row.household_id === HH);
    eq(fullBackup.json?.transactions.length, homeRows.length, `E-16 ${mode}: 전체 기간 백업이 모든 달 거래를 담는다`);
    eq(fullBackup.json?.scope.first_date, "2025-03-10", `E-16 ${mode}: 첫 날짜`);
    eq(fullBackup.json?.scope.last_date, "2026-07-09", `E-16 ${mode}: 마지막 날짜`);
    const pretty = await exportJson(fx, cookie, `household_id=${HH}&month=2026-07`);
    ok(pretty.text.includes("\n  ") && pretty.json?.transactions.every((row) => row.transaction_date.startsWith("2026-07")), `E-16 ${mode}: 한 달 백업은 예전처럼 들여쓴 파일이고 그 달 거래만 담는다`);

    // 연도별 백업
    const y25 = await exportJson(fx, cookie, `household_id=${HH}&month=2026-07&range=all&year=2025`);
    eq(y25.status, 200, `E-16 ${mode}: 연도별 백업이 만들어진다`);
    deepEq(y25.json?.transactions.map((row) => row.id).sort(), ["y25-a", "y25-b"], `E-16 ${mode}: 2025년 백업은 그 해 거래만 담는다`);
    deepEq(y25.json?.budgets[HH].map((row) => row.id), ["b25"], `E-16 ${mode}: 2025년 백업은 그 해 예산만 담는다`);
    ok(y25.json?.scope.year === "2025" && y25.json.scope.range === "all" && y25.json.scope.first_date === "2025-03-10" && y25.json.scope.last_date === "2025-12-31", `E-16 ${mode}: 범위에 year·첫/마지막 날짜가 적힌다`);
    ok(y25.json?.notes.some((note) => note.includes("2025년") && note.includes("연도별")), `E-16 ${mode}: 파일 안내에 연도별 백업이라고 적힌다`);
    const y26 = await exportJson(fx, cookie, `household_id=${HH}&month=2026-07&range=all&year=2026`);
    ok(y26.json?.transactions.length === homeRows.length - 2 && y26.json.transactions.every((row) => row.transaction_date.startsWith("2026-")), `E-16 ${mode}: 2026년 백업에는 2025년 거래가 없다`);
    for (const query of [`household_id=${HH}&month=2026-07&range=all&year=abc`, `household_id=${HH}&month=2026-07&range=all&year=1999`, `household_id=${HH}&month=2026-07&year=2025`]) {
      const bad = await exportJson(fx, cookie, query);
      ok(bad.status === 400 && bad.json?.error === "invalid_year", `E-16 ${mode}: 잘못된 연도 요청은 400 invalid_year (${query.split("&").slice(2).join("&")})`);
    }

    // 복구 단계가 이 파일을 읽는다(들여쓰기 없는 파일, 연도별 파일)
    for (const [label, file] of [["들여쓰기 없는 전체 기간 파일", fullBackup.text], ["연도별 파일", y25.text]]) {
      const form = new FormData();
      form.set("backup_file", new File([file], "backup.json", { type: "application/json" }));
      const response = await app.fetch(new Request(`${BASE}/backup/preview`, { method: "POST", headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin" }, body: form }), fx.env, ctx);
      const html = await response.text();
      ok(response.status === 200 && html.includes("검증 통과"), `E-16 ${mode}: 복구 단계의 백업 파일 확인이 ${label}을 읽는다`);
    }

    // 못 읽은 자료가 있으면 파일을 만들지 않는다(V22.9.77 N-15) — 연도별·전체 기간 모두
    for (const query of [`household_id=${HH}&month=2026-07&range=all&year=2025`, `household_id=${HH}&month=2026-07&range=all`]) {
      const stop = intercept(({ url, method }) => (settingsRead(url, method, `category_keywords:${HH}`) ? outage() : null));
      let failed;
      try { failed = await exportJson(fx, cookie, query); } finally { stop(); }
      ok(failed.status === 503 && failed.json?.error === "backup_read_failed", `E-16 ${mode}: 분류·키워드를 못 읽으면 파일을 만들지 않는다 (${query.endsWith("2025") ? "연도별" : "전체 기간"}, ${failed.status})`);
    }

    // 거래가 한도(15,000건)를 넘으면 연도별 백업을 안내한다
    const stopBig = intercept(({ url, method }) => {
      if (method !== "GET" || !url.pathname.endsWith("/transactions")) return null;
      const limit = Number(url.searchParams.get("limit") || 1000);
      const offset = Number(url.searchParams.get("offset") || 0);
      return Response.json(Array.from({ length: limit }, (_, i) => ({ ...base, id: `big-${offset + i}` })));
    });
    let big;
    try { big = await exportJson(fx, cookie, `household_id=${HH}&month=2026-07&range=all`); } finally { stopBig(); }
    ok(big.status === 413 && big.json?.error === "backup_too_large" && big.json.message.includes("연도별"), `E-16 ${mode}: 거래가 한도를 넘으면 자르지 않고 413 으로 연도별 백업을 안내한다`);
  }, { categoriesPresent });
}

// 가계부가 많을 때(요청 한도 50회)
await fixture(async (fx) => {
  const cookie = await adminCookie(fx);
  const addHouseholds = (count) => { for (let i = 0; i < count; i += 1) fx.db.households.push({ id: `extra-${i}`, name: `추가 가계부 ${i}`, invite_code: `X${i}`, created_at: `2026-08-0${(i % 9) + 1}T00:00:00Z` }); };
  // 가계부 5개: 한 번에 받는다(공통 읽기 3 + 가계부당 7 = 38회)
  addHouseholds(3);
  const five = await dbRequests(() => exportJson(fx, cookie, "month=2026-07"));
  ok(five.result.status === 200 && five.result.json?.households.length === 5, `E-16 가계부 5개: 모든 가계부 한 달 백업이 만들어진다 (${five.result.status})`);
  ok(five.calls <= 50, `E-16 가계부 5개: 저장소 요청이 50회 안이다 (${five.calls}회)`);
  const centerFive = links((await page(fx, `/backup?household_id=${HH}&month=2026-07`, { cookie })).html);
  ok(centerFive.some((item) => item.label.startsWith("모든 가계부")), "E-16 가계부 5개: 백업센터에 ‘모든 가계부’ 단추가 있다");
  // 가계부 8개: 읽다가 503 이 되지 않고 읽기 전에 이유를 알린다
  addHouseholds(3);
  const eight = await dbRequests(() => exportJson(fx, cookie, "month=2026-07"));
  ok(eight.result.status === 413 && eight.result.json?.error === "backup_too_many_households" && eight.result.json.households === 8 && eight.result.json.limit === 5, `E-16 가계부 8개: 모든 가계부 백업은 413 backup_too_many_households 로 이유를 알린다 (${eight.result.status} ${eight.result.json?.error || ""})`);
  ok(eight.calls <= 4, `E-16 가계부 8개: 가계부를 읽기도 전에 거절한다(저장소 요청 ${eight.calls}회, 예전에는 50회를 쓰다 503)`);
  ok(String(eight.result.json?.message).includes("가계부별 전체 기간 백업"), "E-16 가계부 8개: 거절 안내가 대안(가계부별 전체 기간 백업)을 알린다");
  const centerEight = await page(fx, `/backup?household_id=${HH}&month=2026-07`, { cookie });
  const listEight = links(centerEight.html);
  ok(!listEight.some((item) => item.label.startsWith("모든 가계부")) && centerEight.html.includes("단추를 두지 않았습니다"), "E-16 가계부 8개: 안 되는 ‘모든 가계부’ 단추를 두지 않고 이유를 적는다");
  const per = listEight.filter((item) => item.href.includes("range=all") && !item.href.includes("year=") && !item.label.includes("전체 기간"));
  eq(per.length, 8, "E-16 가계부 8개: 가계부별 전체 기간 단추는 8개다");
  // 가계부 하나를 고른 백업은 가계부가 아무리 많아도 그대로 된다
  const single = await dbRequests(() => exportJson(fx, cookie, `household_id=house-home&month=2026-07&range=all`));
  ok(single.result.status === 200 && single.calls <= 12, `E-16 가계부 8개: 가계부 하나의 전체 기간 백업은 요청 ${single.calls}회로 된다 (${single.result.status})`);
});

// 복구 단계가 받는 크기(8MB)를 넘는 파일은 만들지 않는다
await fixture(async (fx) => {
  const cookie = await adminCookie(fx);
  const longMemo = "가".repeat(160), longRaw = "나".repeat(500);
  const bulk = (count) => Array.from({ length: count }, (_, i) => ({ id: `bulk-${String(i).padStart(5, "0")}`, household_id: HH, user_id: "user-bin", transaction_date: `2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, type: "expense", amount: 1000 + i, category: "식비", memo: longMemo, payment_method: "신한카드", source: "kakao", raw_text: longRaw, created_at: "2025-01-01T00:00:00Z" }));
  fx.db.transactions.push(...bulk(5000));
  const medium = await exportJson(fx, cookie, `household_id=${HH}&month=2026-07&range=all`);
  ok(medium.status === 200 && medium.text.length < 8 * 1024 * 1024, `E-16 거래 5,000건(긴 메모·원문)의 전체 기간 백업은 8MB 안이다 (${(medium.text.length / 1048576).toFixed(2)}MB)`);
  fx.db.transactions.push(...bulk(9000).map((row) => ({ ...row, id: `more-${row.id}` })));
  const huge = await exportJson(fx, cookie, `household_id=${HH}&month=2026-07&range=all`);
  ok(huge.status === 413 && huge.json?.error === "backup_too_large" && huge.text.length < 600, `E-16 8MB 를 넘는 파일은 만들지 않고 413 으로 알린다 (${huge.status}, 답 ${huge.text.length}자)`);
  ok(String(huge.json?.message).includes("8MB") && String(huge.json?.message).includes("연도별"), "E-16 8MB 를 넘으면 이유(8MB)와 연도별 백업을 안내한다(거래 15,000건 한도가 아니라 파일 크기 때문이다)");
  const byYear = await exportJson(fx, cookie, `household_id=${HH}&month=2026-07&range=all&year=2025`);
  ok(byYear.status === 413 && String(byYear.json?.message).includes("달별"), "E-16 연도별 파일도 8MB 를 넘으면 달별 백업을 안내한다");
});

// ── E-1 ─────────────────────────────────────────────────────────────────────────
const MERCHANTS = ["스타벅스 강남점", "이마트 성수점", "GS25 역삼점", "쿠팡", "배달의민족", "카카오T 택시", "올리브영 신촌", "CGV 용산", "교보문고 광화문", "SK주유소 서초", "넷플릭스", "병원 내과", "약국", "KT 통신요금", "관리비", "월급", "용돈", "환불 수령", "삼성전자", "AMAZON.COM", "스타벅스 취소", "회식", "택시", "편의점", "미용실"];
const pad = (n) => String(n).padStart(2, "0");
const won = (n) => n.toLocaleString("en-US");
const cardTsv = (n) => ["이용일자\t이용카드\t이용가맹점\t이용금액\t결제방법\t승인번호", ...Array.from({ length: n }, (_, i) => `2026.09.${pad((i % 28) + 1)}\t본인 1234\t${MERCHANTS[i % MERCHANTS.length]} ${i}\t${won(1000 + (i * 137) % 90000)}\t일시불\t${10000000 + i}`)].join("\r\n");
const simpleCsv = (n) => "날짜,금액,내용\n" + Array.from({ length: n }, (_, i) => `2026-09-${pad((i % 28) + 1)},${1000 + i},점심 ${i}`).join("\n");
const naturalLines = (n) => Array.from({ length: n }, (_, i) => `${(i % 9) + 1}월 ${(i % 27) + 1}일 ${MERCHANTS[i % MERCHANTS.length]} ${1000 + i}원 카드`).join("\n");

// 표본(시드 고정): 카드·통장·영문·템플릿·단순 표·자연어·머리글 없는 표·JSON·키:값·여러 표·거친 입력·열 연결
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function buildCorpus(seed = 20260125) {
  const rnd = mulberry32(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const chance = (p) => rnd() < p;
  const PAYMENTS = ["신한카드", "국민카드", "현금", "카카오페이", "토스", "계좌이체", "체크카드", "삼성카드", "네이버페이", "본인 1234", "", "", ""];
  const CATEGORIES = ["식비", "교통", "카페/간식", "쇼핑", "의료", "구독", "급여", "용돈", "기타지출", "", "", ""];
  const cases = [];
  const add = (group, name, text, options = { maxRows: 5000, importYear: 2026 }) => cases.push({ group, name, text, options });
  const day = () => int(1, 28), month = () => int(1, 12);
  for (let c = 0; c < 20; c++) {
    const head = pick([["이용일자", "이용카드", "이용가맹점", "이용금액", "결제방법", "승인번호"], ["이용일", "카드", "가맹점", "이용금액", "할부개월", "승인번호"], ["승인일자", "가맹점명", "승인금액", "업종"], ["거래일자", "거래시간", "사용처", "금액", "카드번호"]]);
    const rows = [];
    for (let i = 0; i < pick([3, 8, 20, 60, 120]); i++) rows.push(head.map((h) => {
      if (/일자|이용일|승인일/.test(h)) return `2026.${pad(month())}.${pad(day())}`;
      if (/시간/.test(h)) return `${pad(int(0, 23))}:${pad(int(0, 59))}:${pad(int(0, 59))}`;
      if (/카드번호/.test(h)) return `1234-56**-****-${int(1000, 9999)}`;
      if (/카드/.test(h)) return pick(["본인 1234", "가족 5678", "신한카드", ""]);
      if (/가맹점|사용처/.test(h)) return `${pick(MERCHANTS)} ${i}`;
      if (/금액/.test(h)) return `${chance(0.08) ? "-" : ""}${won(int(500, 250000))}`;
      if (/결제방법/.test(h)) return pick(["신한카드", "현금", "국민카드"]);
      if (/할부개월/.test(h)) return pick(["", "3", "6"]);
      if (/승인번호/.test(h)) return String(int(10000000, 99999999));
      if (/업종/.test(h)) return pick(["통신판매", "음식점", "편의점", "주유소", "병원"]);
      return pick(MERCHANTS);
    }).join("\t"));
    const parts = [];
    if (chance(0.3)) parts.push("○○카드 이용내역 (2026년 9월)");
    parts.push(head.join("\t"), ...rows);
    if (chance(0.4)) parts.push(`합계\t\t\t${won(int(100000, 9999999))}`);
    add("card-tsv", `card-${c}`, parts.join(chance(0.5) ? "\r\n" : "\n"));
  }
  for (let c = 0; c < 12; c++) {
    const head = [["거래일자", "적요", "찾으신금액", "맡기신금액", "거래후잔액", "취급점"], ["거래일시", "적요", "기재내용", "출금(원)", "입금(원)", "거래후 잔액(원)", "취급점"], ["거래일자", "거래시간", "적요", "출금액", "입금액", "내용", "잔액"], ["날짜", "거래구분", "내용", "금액", "잔액", "거래점"]][c % 4];
    const lines = [head.join(",")];
    for (let i = 0; i < pick([4, 12, 40]); i++) {
      const out = chance(0.7), amt = int(1000, 900000);
      lines.push(head.map((h) => {
        if (/일자|날짜/.test(h) || h === "거래일시") return `2026.${pad(month())}.${pad(day())}${h === "거래일시" ? ` ${pad(int(0, 23))}:${pad(int(0, 59))}` : ""}`;
        if (/시간/.test(h)) return `${pad(int(0, 23))}:${pad(int(0, 59))}:00`;
        if (/적요|거래구분/.test(h)) return pick(["체크카드", "타행이체", "급여", "자동이체", "ATM", "카드대금"]);
        if (/찾으신|출금/.test(h)) return out ? String(amt) : pick(["0", ""]);
        if (/맡기신|입금/.test(h)) return out ? pick(["0", ""]) : String(amt);
        if (/^금액$/.test(h)) return String(amt);
        if (/잔액/.test(h)) return String(int(1000, 9999999));
        if (/내용|기재/.test(h)) return pick(MERCHANTS);
        return pick(["인터넷", "모바일", "본점", "역삼지점"]);
      }).join(","));
    }
    add("bank-csv", `bank-${c}`, lines.join("\n"));
  }
  for (let c = 0; c < 8; c++) {
    const lines = ["Date,Description,Amount,Category,Payment"];
    for (let i = 0; i < pick([5, 20, 50]); i++) {
      const amt = int(100, 90000);
      lines.push(`${month()}/${day()}/2026,${pick(MERCHANTS)} ${i},${chance(0.1) ? `"(${won(amt)})"` : chance(0.08) ? `$${amt}.50` : chance(0.08) ? `-${amt}` : String(amt)},${pick(["Food", "Travel", "Bills", ""])},${pick(["Card", "Cash", ""])}`);
    }
    add("english", `en-${c}`, lines.join("\n"));
  }
  for (let c = 0; c < 14; c++) {
    const lines = ["날짜,구분,금액,분류,내용,결제수단,지출자"];
    for (let i = 0; i < pick([3, 10, 30, 120]); i++) {
      const income = chance(0.2);
      lines.push([`2026-${pad(month())}-${pad(day())}`, income ? "수입" : "지출", income ? String(int(10000, 3000000)) : String(int(500, 300000)), pick(CATEGORIES), `${pick(MERCHANTS)}${chance(0.3) ? ` ${i}` : ""}`, pick(PAYMENTS), pick(["", "", "Bin"])].map((cell) => (/[",]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","));
    }
    add("template-csv", `tpl-${c}`, lines.join(chance(0.3) ? "\r\n" : "\n"));
  }
  for (let c = 0; c < 12; c++) {
    const head = pick([["날짜", "금액", "내용"], ["금액", "날짜", "분류", "메모"], ["일자", "내역", "금액"], ["date", "amount", "memo"], ["날짜", "내용", "금액", "구분"], ["사용일", "사용처", "사용금액", "카테고리"]]);
    const lines = [head.join(",")];
    for (let i = 0; i < pick([2, 15, 80]); i++) lines.push(head.map((h) => {
      if (/날짜|일자|사용일|date/i.test(h)) return pick([`2026-${pad(month())}-${pad(day())}`, `2026.${pad(month())}.${pad(day())}`, `${month()}/${day()}`, `${month()}월 ${day()}일`, `${pad(int(1, 12))}/${pad(day())}/${pad(int(20, 26))}`]);
      if (/금액|amount|사용금액/i.test(h)) return pick([String(int(1000, 90000)), `"${won(int(1000, 90000))}원"`, `₩${int(1000, 90000)}`, `-${int(1000, 90000)}`, `(${int(1000, 90000)})`, "1만2천원", "3만5천원", "△2000", "12000.0"]);
      if (/구분/.test(h)) return pick(["지출", "수입", "", "입금", "출금"]);
      return pick(MERCHANTS);
    }).join(","));
    add("simple-table", `simple-${c}`, lines.join("\n"), { maxRows: 5000, importYear: pick([2025, 2026, 2027]), dateBasisMode: pick(["default", "selected"]), referenceDate: pick(["2026-10-14", "2027-01-05", "2026-03-01"]) });
  }
  const forms = ["어제 {m} {a}원 카드", "{d}월 {dd}일 {m} {a}원 신한카드", "{m} {a}원", "오늘 {m} {a}원 현금", "지난주 금요일 {m} {a}원 카카오페이", "{a}원 {m}", "용돈 5만원 받음", "월급 300만원", "3만5천원 마트 장보기", "그저께 주유 50000원 현대카드", "환불 {a}원", "2026-09-30 관리비 {a}원 계좌이체", "이자 {a}원 들어옴"];
  for (let c = 0; c < 10; c++) {
    const lines = [];
    for (let i = 0; i < pick([1, 6, 25, 90]); i++) lines.push(pick(forms).replace("{m}", pick(MERCHANTS)).replace("{a}", String(int(500, 90000))).replace("{d}", String(month())).replace("{dd}", String(day())));
    add("natural", `nat-${c}`, lines.join("\n"));
  }
  for (let c = 0; c < 8; c++) {
    const delim = pick([",", "\t", "|", ";"]);
    const lines = [];
    for (let i = 0; i < pick([2, 10, 40]); i++) lines.push([`2026-${pad(month())}-${pad(day())}`, pick(MERCHANTS), chance(0.2) ? "1,200" : String(int(1000, 90000))].join(delim));
    add("headerless", `hl-${c}`, lines.join("\n"));
  }
  for (let c = 0; c < 6; c++) {
    const recs = [];
    for (let i = 0; i < pick([1, 4, 20]); i++) recs.push(chance(0.5) ? { date: `2026-${pad(month())}-${pad(day())}`, amount: int(500, 90000) * (chance(0.1) ? -1 : 1), memo: pick(MERCHANTS), category: pick(CATEGORIES), payment: chance(0.3) ? { method: pick(PAYMENTS) } : pick(PAYMENTS) } : { 날짜: `2026-${pad(month())}-${pad(day())}`, 금액: won(int(500, 90000)), 내용: pick(MERCHANTS), 구분: pick(["지출", "수입"]) });
    add("json", `json-${c}`, JSON.stringify(c % 2 ? { transactions: recs } : recs));
  }
  for (let c = 0; c < 4; c++) {
    const lines = [];
    for (let i = 0; i < pick([2, 8]); i++) lines.push(chance(0.5) ? `날짜: 2026-${pad(month())}-${pad(day())} | 금액: ${int(500, 90000)} | 내용: ${pick(MERCHANTS)} | 분류: ${pick(["카페/간식", "식비", "교통"])}` : `날짜=2026-${pad(month())}-${pad(day())}; 금액=${int(500, 90000)}; 메모=${pick(MERCHANTS)}; 결제수단=${pick(["국민카드", "현금"])}`);
    add("key-value", `kv-${c}`, lines.join("\n"));
  }
  for (let c = 0; c < 6; c++) {
    const lines = [];
    for (const [sheet, head] of [["9월", ["날짜", "내용", "금액", "결제수단"]], ["10월", ["금액", "날짜", "분류", "메모"]], ["11월", ["날짜", "적요", "출금액", "입금액"]]]) {
      if (chance(0.7)) lines.push(`# 시트: ${sheet}`);
      lines.push(head.join(","));
      for (let i = 0; i < pick([1, 4, 12]); i++) lines.push(head.map((h) => (/날짜/.test(h) ? `2026-${pad(month())}-${pad(day())}` : /금액|출금|입금/.test(h) ? String(int(1000, 90000)) : /분류/.test(h) ? pick(CATEGORIES) : /결제/.test(h) ? pick(PAYMENTS) : pick(MERCHANTS))).join(","));
    }
    add("sections", `sec-${c}`, lines.join("\n"));
  }
  add("rough", "quotes", ["날짜,내용,금액", '2026-09-01,"TV 55"" 거치대",30000', '2026-09-02,"닫히지 않은 메모,12000', "2026-09-03,점심,9000", '2026-09-04,"따옴표"뒤글자,5000'].join("\n"));
  add("rough", "newline-cell", ["날짜,내용,금액", '2026-09-01,"첫 줄\n둘째 줄",30000', "2026-09-02,점심,9000"].join("\n"));
  add("rough", "bom-crlf", "﻿" + ["날짜,내용,금액", "2026-09-01,점심,9000", "2026-09-02,커피,4500"].join("\r\n"));
  add("rough", "empty", "");
  add("rough", "long-cell", ["날짜,내용,금액", `2026-09-01,${"가".repeat(500)},9000`, `2026-09-02,${"a".repeat(2000)},4500`].join("\n"));
  add("rough", "over-limit", ["날짜,내용,금액", ...Array.from({ length: 150 }, (_, i) => `2026-09-${pad((i % 28) + 1)},${MERCHANTS[i % 10]},${1000 + i}`)].join("\n"), { maxRows: 100 });
  add("rough", "unicode", ["날짜,내용,금액", "2026-09-01,ＫＢ카드 ａｂｃ,９０００", "2026-09-02,🍕 피자,15000", "2026-09-03,한글​제로폭,4500"].join("\n"));
  add("rough", "dup-columns", ["날짜,내용,내용,금액,금액", "2026-09-01,점심,회식,9000,9000", "2026-09-02,커피,,4500,"].join("\n"));
  add("rough", "bad-dates", ["날짜,내용,금액", "2026-02-30,가짜,1000", "1999-01-01,옛날,2000", "2100-01-01,미래,3000", "46000,시리얼,4000", "2026-13-01,13월,5000", "내일,내일,6000"].join("\n"));
  add("rough", "summary-rows", ["날짜,내용,금액", "2026-09-01,점심,9000", "합계,,9000", "2026-09-02,월계 정산,5000", "누계,,16000"].join("\n"));
  add("rough", "cancellation", ["날짜,내용,금액,구분", "2026-09-01,스타벅스 취소,4500,지출", "2026-09-02,승인취소 마트,30000,지출", "2026-09-03,취소 수수료,1000,지출", "2026-09-04,refund 반품,20000,수입"].join("\n"));
  add("rough", "signed-majority", ["일자,내역,금액", ...Array.from({ length: 14 }, (_, i) => `2026-09-${pad(i + 1)},${MERCHANTS[i % 10]},${i % 5 ? "-" : ""}${2000 + i * 100}`), "2026-09-20,월급,3000000"].join("\n"));
  add("rough", "foreign", ["날짜,외화금액(USD),원화금액(원),내용", "2025-07-04,12.50,18000,coffee", "2025-07-05,9.99,13000,book"].join("\n"), { maxRows: 5000, importYear: 2025 });
  add("rough", "yearless-jan", ["날짜,내용,금액,구분", "12/28,송년회,85000,지출", "1/3,월급,3000000,수입", "12월 30일,택시,15000,지출", "2/29,윤일,1000,지출"].join("\n"), { importYear: 2026, dateBasisMode: "selected", referenceDate: "2027-01-05" });
  add("rough", "two-digit-year", ["날짜,내용,금액", "10/12/25,주유,50000", "25.10.13,마트,32000", "1/2/26,병원,12000"].join("\n"));
  for (let c = 0; c < 4; c++) {
    const delta = [[], [{ section: 1, column_index: 1, field: "payment" }, { section: 1, column_index: 4, field: "ignore" }], [{ section: 1, column_index: 2, field: "category" }], [{ section: 1, column_index: 0, field: "ignore" }]][c];
    add("mapping", `map-${c}`, cardTsv(pick([3, 12])), { maxRows: 5000, importYear: 2026, mappingMetadata: true, mappingDelta: delta });
  }
  add("big", "card-400", cardTsv(400));
  add("big", "simple-600", simpleCsv(600));
  add("big", "natural-300", naturalLines(300));
  return cases;
}

// 1) 기억을 끈 해석(scopeMemo:false)과 보통 해석이 모든 표본에서 같다 — 날짜·구분 칸 기억, 같은 글 정규화 기억이 결과를 바꾸지 않는다
{
  const corpus = buildCorpus();
  const differs = [];
  let accepted = 0;
  for (const item of corpus) {
    const fast = parseFlexibleImportRecords(item.text, HH, BIN, { ...item.options });
    const slow = parseFlexibleImportRecords(item.text, HH, BIN, { ...item.options, scopeMemo: false });
    accepted += fast.accepted.length;
    if (JSON.stringify(fast) !== JSON.stringify(slow)) differs.push(`${item.group}/${item.name}`);
  }
  deepEq(differs, [], `E-1 표본 ${corpus.length}개(카드·통장·영문·템플릿·단순 표·자연어·머리글 없는 표·JSON·키:값·여러 표·거친 입력·열 연결·큰 파일, 합 ${accepted}행)를 기억을 켠 해석과 끈 해석이 같은 결과로 읽는다`);
  ok(accepted > 1500 && corpus.some((item) => item.group === "natural") && corpus.some((item) => item.group === "mapping"), "E-1 표본에 수천 행과 여러 모양이 들어 있다");
}

// 2) 같은 글 정규화 기억 = 기억 없는 정규화, 분류 낱말 거름망 = 거름망 없는 분류
{
  const texts = new Set(["", " ", "0", "가", "점심 12000원", "스타벅스 4500", "🍕 피자 15000", "ＫＢ카드 ａｂｃ", "2026.09.01 본인 1234 스타벅스 강남점 4,500 일시불"]);
  for (const item of buildCorpus()) for (const line of item.text.split(/\r?\n/)) { texts.add(line); for (const cell of line.split(/[\t,|;]/)) texts.add(cell); }
  const words = [...new Set(CATEGORY_RULES.flatMap((rule) => [...(rule.words || []), ...(rule.exact || [])]))].filter(Boolean);
  for (const word of words) { texts.add(word); texts.add(`오늘 ${word} 3000원`); texts.add(`가${word}나`); texts.add(word.toUpperCase()); }
  const rnd = mulberry32(777);
  for (let i = 0; i < 2000; i++) texts.add(`${words[Math.floor(rnd() * words.length)]} ${words[Math.floor(rnd() * words.length)]}`);
  const list = [...texts];
  eq(typeof amountParser.withNormalizeTextScope, "function", "E-1 정규화 기억 범위(withNormalizeTextScope)가 있다");
  if (typeof amountParser.withNormalizeTextScope === "function") {
    const plain = list.map((text) => amountParser.normalizeText(text));
    const scoped = amountParser.withNormalizeTextScope(() => list.map((text) => amountParser.normalizeText(text)).concat(list.map((text) => amountParser.normalizeText(text))));
    deepEq(scoped.slice(0, list.length), plain, `E-1 같은 글 정규화 기억 안의 결과가 기억 밖과 같다(표본 ${list.length}개, 두 번 읽기 포함)`);
    deepEq(scoped.slice(list.length), plain, "E-1 기억에서 두 번째로 읽어도 같다");
    const outside = amountParser.normalizeText("가  나"), inside = amountParser.withNormalizeTextScope(() => amountParser.normalizeText("가  나"));
    eq(inside, outside, "E-1 범위 안팎 정규화 결과가 같다");
  }
  // 거름망을 끈 분류 = 낱말 첫 글자 단위 확인에서 항상 ‘있다’고 답하게 한 분류. 숫자 키만 바꾸므로 다른 Set 쓰임(문자열 키)은 그대로다.
  const realHas = Set.prototype.has;
  const unfiltered = (text, type) => {
    Set.prototype.has = function (item) { return typeof item === "number" ? true : realHas.call(this, item); };
    try { return inferCategory(text, type); } finally { Set.prototype.has = realHas; }
  };
  const mismatches = [];
  for (const text of list) for (const type of ["expense", "income"]) if (inferCategory(text, type) !== unfiltered(text, type)) mismatches.push(`${type}:${text}`);
  deepEq(mismatches.slice(0, 5), [], `E-1 분류 낱말 거름망이 결과를 바꾸지 않는다(표본 ${list.length}개 × 지출/수입, 낱말 ${words.length}개)`);
  ok(new Set(list.map((text) => inferCategory(text, "expense"))).size > 10, "E-1 분류 표본이 여러 분류에 걸친다");
}

// 3) 일의 양: 행마다 날짜 객체를 4번 만들던 것, 분류 낱말 indexOf 311번, 같은 글 정규화 3번
{
  const counts = { date3: 0, indexOf: 0, normalize: 0 };
  const RealDate = globalThis.Date, realIndexOf = String.prototype.indexOf, realReplace = String.prototype.replace;
  const count = (task) => {
    counts.date3 = 0; counts.indexOf = 0; counts.normalize = 0;
    globalThis.Date = new Proxy(RealDate, { construct(target, args, newTarget) { if (args.length === 3) counts.date3 += 1; return Reflect.construct(target, args, newTarget); } });
    String.prototype.indexOf = function (...args) { counts.indexOf += 1; return realIndexOf.apply(this, args); };
    String.prototype.replace = function (pattern, ...rest) { if (pattern instanceof RegExp && pattern.source === "^\\/+") counts.normalize += 1; return realReplace.call(this, pattern, ...rest); };
    try { return task(); } finally { globalThis.Date = RealDate; String.prototype.indexOf = realIndexOf; String.prototype.replace = realReplace; }
  };
  const options = { maxRows: 5000, importYear: 2026 };
  const card = cardTsv(1000);
  parseFlexibleImportRecords(card, HH, BIN, options);
  const parsed = count(() => parseFlexibleImportRecords(card, HH, BIN, options));
  eq(parsed.accepted.length, 1000, "E-1 카드 1,000행을 모두 읽는다");
  const perRow = (value) => value / 1000;
  ok(counts.normalize > 0, `E-1 계수 확인: 정규화 호출을 센다 (${counts.normalize}회)`);
  ok(perRow(counts.date3) <= 1, `E-1 카드 1,000행: 행당 날짜 객체 생성 ${perRow(counts.date3).toFixed(2)}회 ≤ 1 (예전 행당 4회: 같은 날짜 칸을 네 번 읽음)`);
  ok(perRow(counts.indexOf) <= 60, `E-1 카드 1,000행: 행당 문자열 찾기(indexOf) ${perRow(counts.indexOf).toFixed(0)}회 ≤ 60 (예전 행당 311회: 분류 낱말 수백 개를 모두 찾음)`);
  ok(perRow(counts.normalize) <= 1.5, `E-1 카드 1,000행: 행당 글 정규화 ${perRow(counts.normalize).toFixed(2)}회 ≤ 1.5 (예전 행당 3회)`);
  const simple = simpleCsv(1000);
  parseFlexibleImportRecords(simple, HH, BIN, options);
  count(() => parseFlexibleImportRecords(simple, HH, BIN, options));
  ok(perRow(counts.date3) <= 1 && perRow(counts.indexOf) <= 60 && perRow(counts.normalize) <= 1.5, `E-1 단순 표 1,000행: 날짜 ${perRow(counts.date3).toFixed(2)} · indexOf ${perRow(counts.indexOf).toFixed(0)} · 정규화 ${perRow(counts.normalize).toFixed(2)} (행당)`);
}

// 4) 중복 후보는 견줄 때만 정규화한다: 기존 기록이 많아도 미리보기의 정규화가 늘지 않는다
await fixture(async (fx) => {
  await uuidFixture(fx);
  const text = ["이용일자\t이용카드\t이용가맹점\t이용금액\t결제방법\t승인번호", ...Array.from({ length: 60 }, (_, i) => `2026.09.${pad((i % 28) + 1)}\t본인 1234\t${MERCHANTS[i % MERCHANTS.length]} ${i}\t${won(1000 + (i % 60) * 100)}\t일시불\t${10000000 + i}`)].join("\r\n");
  let normalizeCalls = 0;
  const realReplace = String.prototype.replace;
  const run = async () => {
    normalizeCalls = 0;
    String.prototype.replace = function (pattern, ...rest) { if (pattern instanceof RegExp && pattern.source === "^\\/+") normalizeCalls += 1; return realReplace.call(this, pattern, ...rest); };
    try { return await importPreview(fx, text, { month: "2026-09" }); } finally { String.prototype.replace = realReplace; }
  };
  await run();
  const emptyBook = await run();
  const baseline = normalizeCalls;
  // 후보 조회는 금액·날짜 범위로 하므로 3,000건이 모두 후보로 읽힌다. 날짜를 어긋나게 해 들어오는 행과 같은 (날짜·금액) 묶음에는 들지 않게 한다.
  for (let i = 0; i < 3000; i++) { const a = i % 60; fx.db.transactions.push({ id: `old-${i}`, household_id: HH, user_id: BIN, transaction_date: `2026-09-${pad(((a + 1 + (i % 27)) % 28) + 1)}`, type: "expense", amount: 1000 + a * 100, category: "식비", memo: `기존 기록 ${i}`, payment_method: "신한카드", source: "kakao", raw_text: `기존 ${i}`, created_at: "2026-09-01T00:00:00Z" }); }
  const fullBook = await run();
  eq(emptyBook.payload?.ready.length, 60, "E-1 중복 후보: 빈 가계부에서 60행이 저장 후보다");
  eq(fullBook.payload?.ready.length, 60, "E-1 중복 후보: 기존 기록 3,000건이 있어도 60행이 저장 후보다(내용이 달라 중복이 아니다)");
  ok(normalizeCalls - baseline <= 300, `E-1 중복 후보: 기존 기록 3,000건을 더해도 글 정규화가 ${normalizeCalls - baseline}회만 늘었다 ≤ 300 (예전에는 후보 건당 4회 = 약 12,000회)`);
  // 같은 기록은 여전히 중복으로 알아본다
  const dup = await importPreview(fx, "날짜,금액,분류,내용,결제수단\n2026-09-06,1200,식비,기존 기록 2,신한카드", { month: "2026-09" });
  ok(dup.payload?.reason_counts?.duplicate === 1 && dup.payload.ready.length === 0, "E-1 중복 후보: 기존 기록과 같은 행은 중복으로 제외된다");
});

// 5) 해석 시간(데운 뒤) — 넉넉한 상한. 숫자는 --bench 로 본다.
{
  const options = { maxRows: 5000, importYear: 2026 };
  const timed = (label, text) => {
    parseFlexibleImportRecords(text, HH, BIN, options);
    const samples = [];
    for (let i = 0; i < 5; i++) { const started = performance.now(); parseFlexibleImportRecords(text, HH, BIN, options); samples.push(performance.now() - started); }
    samples.sort((a, b) => a - b);
    if (BENCH) console.log(`${label}: 중앙값 ${samples[2].toFixed(1)}ms (행당 ${(samples[2] / Number(label.match(/(\d+)행/)?.[1] || 1) * 1000).toFixed(0)}µs)`);
    return samples[2];
  };
  ok(timed("카드 120행", cardTsv(120)) < 200, "E-1 카드 120행 해석이 200ms 안이다(옛 V22.9.44: 약 400ms)");
  ok(timed("카드 1000행", cardTsv(1000)) < 600, "E-1 카드 1,000행 해석이 600ms 안이다(옛 V22.9.44: 약 3.1초)");
  ok(timed("자연어 1000행", naturalLines(1000)) < 1200, "E-1 자연어 1,000행 해석이 1.2초 안이다");
}

if (SOFT) {
  console.log(`검사 ${checks}개 중 ${failures.length}개 실패(V22979_SOFT=1)`);
  for (const message of failures) console.log(`  ✗ ${message}`);
} else {
  t.done();
}
