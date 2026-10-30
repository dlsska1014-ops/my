// V22.9.90 — 사용자 직접 확인 피드백(2026-10-30) 세 가지 검사.
//
// ── 이 파일이 왜 생겼는지 ──
//   1. "삭제하면 5초뒤 삭제되는데 바로 삭제되게하고 되돌리기를 5초 유지해줘": 웹 삭제는 5초 기다렸다 보냈고, 되돌리기는 그 대기 중에만 있었다.
//      이제 누르면 바로 지우고(lucian-b-mains.js — 즉시 전송은 validate-lucian-b-v22947 이 본다), 지운 응답의 돌아갈 주소에 되살리기 표(restore,
//      60초, 이 사용자·이 가계부·이 기록)를 싣는다. 돌아간 홈 알림이 ‘되돌리기’ 폼(POST /my/restore)을 5초 보이고, 서버는 DB 감사 기록(지운 행 전체)으로
//      같은 기록 번호를 다시 넣는다(카카오 ‘복구’와 같은 칸).
//   2. "점심 12000원 현금 이라고 적으면 점심 12000원 현 까지만 인식": 홈 한 줄 입력이 한글 조합 중 input 을 건너뛰어 마지막 글자가 띄어쓰기 전까지
//      결제수단·분류에 반영되지 않았다. 이제 조합 중에도 읽는다(조합 중 Enter 는 여전히 저장하지 않는다).
//   3. 관제 이용 현황(10-30 확인)의 카카오 기능 순위 1위가 ‘알 수 없음’(129회 중 53회)이었다. 메뉴 낱말 판별만 써서 기록 글·고치기 명령을 UNKNOWN
//      으로 셌고, 가계부 만들기·참여는 판별 이름(HOUSEHOLD_CREATE·HOUSEHOLD_JOIN)이 저장 허용 이름과 달라 UNKNOWN 이 됐다.
//   병합 전 독립 검토(2026-10-30)로 더한 것: 되돌리기가 따라오지 않는 삭제(관리자 세션·홈이 아닌 돌아갈 곳)는 먼저 묻는다(8), 표는 그 한 번의 삭제에만
//   쓴다(뒤 삭제는 restore_changed), /my 를 거쳐도 표를 넘긴다(8), 가져오기 기록 되살리기, 열린 수정 세션의 답은 EDIT, 조합 중에는 가계부 분류 요청을 미룬다(6).
// 모두 메모리 픽스처(DB·서버 없음)에서 실제 경로를 돌린다. 실제 휴대폰 한글 키보드·브라우저 동작은 사람 확인으로 남긴다.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parse } from "../tools/vendor/acorn.mjs";
import { app, BASE, ctx, counter, fixture, intercept, failure, page, post, putSetting, skill } from "./lib-audit-v22934.mjs";
import { makeDeleteRestoreTicket, readDeleteRestoreTicket, signedPurposeToken } from "../src/modules/auth/identity-reauth.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { createDemoHandler } from "../tools/staging/demo-handler.mjs";
import { AB_KAKAO_INFLIGHT, AB_KAKAO_REPEAT_GUARD } from "../src/modules/runtime/ops-telemetry.js";
import { quickAmountFieldState, quickSmartInputController } from "../src/modules/client/shared-input-parsers.js";
import { createInputBrowser } from "./lib-lucian-a-browser.mjs";

const t = counter("V22.9.90 사용자 피드백(삭제 즉시·되돌리기 5초·한글 조합 중 읽기·관제 기능 이름)");
const HH = "house-home";
const HOME = `/app?month=2026-07&household_id=${HH}`;
const RETURN_TO = `${HOME}&tab=transactions`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const unescape = (value) => String(value || "").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
const toast = (html) => (html.match(/<div class="abSaveFeedback[^]*?<\/button><\/div>/) || [""])[0];
const restoreForm = (html) => (toast(html).match(/<form class="abSaveFeedbackUndo" method="post" action="\/my\/restore">[^]*?<\/form>/) || [""])[0];
const hidden = (form, name) => unescape((form.match(new RegExp(`name="${name}" value="([^"]*)"`)) || [])[1]);
const home = async (fx, path, cookie = fx.cookie) => (await page(fx, path, { cookie, headers: { "user-agent": UA } })).html;
const params = (location) => new URL(location, BASE).searchParams;
const rowsOf = (fx, id) => fx.db.transactions.filter((row) => String(row.id) === id);

// 지우는 DB 함수(v227·_if_v22988)는 운영에서 감사 기록(before_value = 지운 행 전체)을 남긴다. 픽스처는 auditDeletes 를 켜면 같은 칸으로 남긴다
// (테스트 서버 tools/staging/demo-handler.mjs 도 켠다). 기본은 꺼짐이라 예전 검사의 fx.db 비교는 그대로다.
const withAudit = (task) => fixture(task, { auditDeletes: true });
const del = (fx, id, { cookie = fx.cookie, accept = "application/json", returnTo = RETURN_TO } = {}) =>
  post(fx, "/admin/delete", { id, household_id: HH, month: "2026-07", return_to: returnTo }, { cookie, accept });
const restore = (fx, ticket, { cookie = fx.cookie, returnTo = RETURN_TO } = {}) =>
  post(fx, "/my/restore", { ticket, month: "2026-07", return_to: returnTo }, { cookie });
const deleteForTicket = async (fx, id, options = {}) => {
  const res = await del(fx, id, options);
  const data = JSON.parse(res.text);
  return { res, data, location: data.location || res.location, ticket: params(data.location || res.location).get("restore") || "" };
};

// ── 1. 삭제 응답의 되살리기 표 ──
await withAudit(async (fx) => {
  const before = structuredClone(rowsOf(fx, "tx-expense-2")[0]);
  const { res, data, location, ticket } = await deleteForTicket(fx, "tx-expense-2");
  t.eq(res.status, 200, "1 JSON 삭제 성공");
  t.eq(data.deleted, true, "1 삭제 확인을 그대로 돌려준다");
  t.eq(rowsOf(fx, "tx-expense-2").length, 0, "1 누르면 바로 지운다(서버는 기다리지 않는다)");
  t.ok(!("restore_ticket" in data), "1 표는 JSON 칸이 아니라 돌아갈 주소에만 싣는다");
  t.eq(params(location).get("msg"), "deleted", "1 돌아갈 주소는 삭제 알림(msg=deleted)");
  t.eq(new URL(location, BASE).pathname, "/app", "1 돌아갈 화면은 지운 목록(return_to)");
  t.eq(params(location).get("tab"), "transactions", "1 돌아갈 주소는 원래 화면 값을 지킨다");
  const payload = await readDeleteRestoreTicket(fx.env, ticket, "user-bin");
  t.ok(!!payload, "1 로그인 사용자 삭제는 이 사용자의 되살리기 표를 싣는다");
  t.eq(String(payload?.r), "tx-expense-2", "1 표는 지운 기록 번호");
  t.eq(String(payload?.h), HH, "1 표는 그 가계부");
  t.ok(Number(payload?.exp) - Math.floor(Date.now() / 1000) <= 60 && Number(payload?.exp) - Math.floor(Date.now() / 1000) >= 55, "1 표는 60초");
  t.eq(await readDeleteRestoreTicket(fx.env, ticket, "user-wifi"), null, "1 다른 사용자는 이 표를 읽지 못한다");
  t.eq(await readDeleteRestoreTicket(fx.env, ticket.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "user-bin"), null, "1 고친 표는 거절한다");
  t.eq(fx.db.accountbook_transaction_audit.length, 1, "1 (픽스처) 지운 행 전체가 감사 기록에 남는다");
  t.deepEq(fx.db.accountbook_transaction_audit[0].before_value, before, "1 (픽스처) 감사 기록은 지운 행 그대로");

  // HTML 폼(JS 없음)도 같은 주소로 돌아간다.
  const form = await del(fx, "tx-expense-1", { accept: "text/html" });
  t.eq(form.status, 303, "1 JS 없는 폼 삭제는 그대로 돌아가기(303)");
  t.ok(!!(await readDeleteRestoreTicket(fx.env, params(form.location).get("restore"), "user-bin")), "1 JS 없는 폼 삭제에도 되살리기 표가 실린다");
});

await fixture(async (fx) => {
  // 관리자 세션은 표를 받지 않고, 돌아갈 주소에 남아 있던 앞선 삭제의 표도 지운다(단추가 다른 기록을 되살리지 않게).
  const admin = await app.fetch(new Request(`${BASE}/admin/delete`, {
    method: "POST",
    headers: { cookie: await adminCookie(fx), "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "application/json" },
    body: new URLSearchParams({ id: "tx-expense-2", household_id: HH, month: "2026-07", return_to: `${RETURN_TO}&restore=stale.ticket` }).toString(),
  }), fx.env, ctx);
  const data = await admin.json();
  t.eq(admin.status, 200, "1 관리자 삭제 성공");
  t.eq(params(data.location).has("restore"), false, "1 관리자 삭제는 표를 싣지 않고 앞선 표도 지운다");
  const user = await deleteForTicket(fx, "tx-expense-1", { returnTo: `${RETURN_TO}&restore=stale.ticket` });
  t.ok(user.ticket && user.ticket !== "stale.ticket", "1 사용자 삭제는 앞선 표를 이번 표로 바꾼다");
});

// ── 2. 홈 알림의 ‘되돌리기’ 단추 ──
await withAudit(async (fx) => {
  const { location, ticket } = await deleteForTicket(fx, "tx-expense-2");
  const html = await home(fx, location);
  const box = toast(html);
  const form = restoreForm(html);
  t.ok(box.includes("<b>기록을 삭제했습니다</b>"), "2 돌아간 화면은 삭제 알림");
  t.ok(!!form, "2 삭제 알림에 되돌리기 폼(POST /my/restore)이 있다");
  t.ok(form.includes('<button type="submit" class="abSaveFeedbackAction" data-ab-restore>되돌리기</button>'), "2 단추 이름은 ‘되돌리기’, 실행 취소와 같은 모양");
  t.eq(hidden(form, "ticket"), ticket, "2 폼은 받은 표를 그대로 보낸다");
  t.eq(hidden(form, "month"), "2026-07", "2 폼은 보던 달을 보낸다");
  const back = new URL(hidden(form, "return_to"), BASE);
  t.eq(back.pathname, "/app", "2 되돌린 뒤 같은 화면으로 돌아간다");
  t.ok(!["msg", "restore", "undo", "saved_rid", "err"].some((key) => back.searchParams.has(key)), "2 돌아갈 주소에는 알림·표 값이 없다");
  t.eq(back.searchParams.get("tab"), "transactions", "2 돌아갈 주소는 보던 탭을 지킨다");
  t.ok(!box.includes("data-ab-undo"), "2 삭제 알림에는 저장 실행 취소 단추가 없다");

  // 단추를 그리지 않는 경우: 표가 없거나 남의 것·다른 가계부·관리자 세션·다른 알림.
  t.eq(restoreForm(await home(fx, `${HOME}&msg=deleted`)), "", "2 표가 없으면 단추가 없다");
  const forged = `${ticket.slice(0, -2)}xx`;
  t.eq(restoreForm(await home(fx, `${HOME}&msg=deleted&restore=${encodeURIComponent(forged)}`)), "", "2 고친 표에는 단추가 없다");
  const wifi = await fx.cookieFor("user-wifi");
  t.eq(restoreForm(await home(fx, location, wifi)), "", "2 다른 사용자 화면에는 단추가 없다");
  const tripTicket = await makeDeleteRestoreTicket(fx.env, { transactionId: "tx-expense-2", householdId: "house-trip", userId: "user-bin" });
  t.eq(restoreForm(await home(fx, `${HOME}&msg=deleted&restore=${encodeURIComponent(tripTicket)}`)), "", "2 다른 가계부의 표에는 단추가 없다");
  t.eq(restoreForm(await home(fx, `${HOME}&msg=added&restore=${encodeURIComponent(ticket)}`)), "", "2 삭제 알림이 아니면 단추가 없다");
  const expired = await signedPurposeToken(fx.env, "delete-restore", { r: "tx-expense-2", h: HH, u: "user-bin", d: Math.floor(Date.now() / 1000) - 120 }, -1);
  t.eq(restoreForm(await home(fx, `${HOME}&msg=deleted&restore=${encodeURIComponent(expired)}`)), "", "2 시간이 지난 표에는 단추가 없다");
  t.eq(restoreForm(await home(fx, location, await adminCookie(fx))), "", "2 관리자 세션 화면에는 단추가 없다");
  // 조회 전용 구성원(기록을 바꿀 수 없음)에게는 두지 않는다.
  fx.db.household_members.find((m) => m.user_id === "user-bin" && m.household_id === HH).role = "viewer";
  t.eq(restoreForm(await home(fx, location)), "", "2 조회 전용이면 단추가 없다");
});

// ── 3. POST /my/restore ──
await withAudit(async (fx) => {
  const before = structuredClone(rowsOf(fx, "tx-expense-2")[0]);
  const { ticket } = await deleteForTicket(fx, "tx-expense-2");
  const res = await restore(fx, ticket);
  t.eq(res.status, 303, "3 되돌리기는 폼 제출(303)");
  t.eq(params(res.location).get("msg"), "restored", "3 되살린 뒤 알림은 msg=restored");
  t.ok(!params(res.location).has("restore") && !params(res.location).has("err"), "3 돌아갈 주소에 표·오류가 없다");
  t.eq(params(res.location).get("tab"), "transactions", "3 보던 화면으로 돌아간다");
  const rows = rowsOf(fx, "tx-expense-2");
  t.eq(rows.length, 1, "3 같은 기록 번호로 한 건 되살린다");
  for (const key of ["household_id", "user_id", "type", "amount", "category", "memo", "payment_method", "transaction_date", "source", "raw_text"]) {
    t.eq(rows[0][key], before[key], `3 되살린 기록의 ${key} 는 지우기 전과 같다`);
  }
  const again = await restore(fx, ticket);
  t.eq(params(again.location).get("msg"), "restored", "3 같은 표로 다시 눌러도(응답만 잃은 경우) 되살린 것으로 본다");
  t.eq(rowsOf(fx, "tx-expense-2").length, 1, "3 다시 눌러도 두 번 넣지 않는다");
  const html = await home(fx, res.location);
  t.ok(toast(html).includes("<b>기록을 되살렸습니다</b>"), "3 되살린 알림 제목");
  t.ok(toast(html).includes("지운 기록을 되살렸어요."), "3 되살린 알림 문구");
  t.ok(toast(html).includes("남은 예산"), "3 되살린 알림도 남은 예산을 말한다");
  t.eq(restoreForm(html), "", "3 되살린 알림에는 되돌리기가 없다");
});

await withAudit(async (fx) => {
  const { ticket } = await deleteForTicket(fx, "tx-expense-2");
  const errOf = (res) => params(res.location).get("err");
  // 거절: 표 없음·고친 표·시간 지난 표·다른 사용자·로그인 없음.
  t.eq(errOf(await restore(fx, "")), "restore_expired", "3 표가 없으면 되살리지 않는다");
  t.eq(errOf(await restore(fx, `${ticket.slice(0, -2)}xx`)), "restore_expired", "3 고친 표는 되살리지 않는다");
  const expired = await signedPurposeToken(fx.env, "delete-restore", { r: "tx-expense-2", h: HH, u: "user-bin", d: Math.floor(Date.now() / 1000) - 120 }, -1);
  t.eq(errOf(await restore(fx, expired)), "restore_expired", "3 시간이 지난 표는 되살리지 않는다");
  t.eq(errOf(await restore(fx, ticket, { cookie: await fx.cookieFor("user-wifi") })), "restore_expired", "3 다른 사용자는 이 표로 되살리지 못한다");
  const anonymous = await restore(fx, ticket, { cookie: "" });
  t.eq(anonymous.location, "/my", "3 로그인이 없으면 로그인 화면으로");
  const quickUndo = await signedPurposeToken(fx.env, "quick-undo", { r: "tx-expense-2", h: HH, u: "user-bin", f: "x" }, 60);
  t.eq(errOf(await restore(fx, quickUndo)), "restore_expired", "3 다른 용도의 표(저장 실행 취소)는 받지 않는다");
  const cross = await app.fetch(new Request(`${BASE}/my/restore`, {
    method: "POST",
    headers: { cookie: fx.cookie, "content-type": "application/x-www-form-urlencoded", origin: "https://evil.invalid", accept: "text/html" },
    body: new URLSearchParams({ ticket, month: "2026-07", return_to: RETURN_TO }).toString(),
  }), fx.env, ctx);
  t.eq(cross.status, 403, "3 다른 사이트에서 보낸 되돌리기는 막는다");
  t.eq(rowsOf(fx, "tx-expense-2").length, 0, "3 거절한 되돌리기는 아무것도 넣지 않는다");
  // 감사 기록이 없거나(다른 경로로 지움·2분 넘음) 다른 사람이 지운 기록이면 되살리지 않는다.
  // tx-expense-1 은 감사 없이(다른 경로로) 사라진 기록으로 둔다. 남아 있는 기록이면 ‘이미 있음 = 되살림’으로 답한다(아래 3 다시 누르기).
  fx.db.transactions = fx.db.transactions.filter((row) => row.id !== "tx-expense-1");
  const other = await makeDeleteRestoreTicket(fx.env, { transactionId: "tx-expense-1", householdId: HH, userId: "user-bin" });
  t.eq(errOf(await restore(fx, other)), "restore_expired", "3 감사 기록이 없으면 되살리지 않는다");
  fx.db.accountbook_transaction_audit[0].actor_user_id = "user-wifi";
  t.eq(errOf(await restore(fx, ticket)), "restore_changed", "3 그 기록의 가장 최근 삭제를 다른 사람이 했으면 되살리지 않는다(restore_changed)");
  fx.db.accountbook_transaction_audit[0].actor_user_id = "user-bin";
  fx.db.accountbook_transaction_audit[0].created_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  t.eq(errOf(await restore(fx, ticket)), "restore_expired", "3 지운 시각보다 2분 넘게 앞선 감사 기록은 쓰지 않는다");
  fx.db.accountbook_transaction_audit[0].created_at = new Date().toISOString();
  fx.db.accountbook_transaction_audit[0].before_value = { ...fx.db.accountbook_transaction_audit[0].before_value, id: "tx-other" };
  t.eq(errOf(await restore(fx, ticket)), "restore_expired", "3 감사 기록의 행 번호가 다르면 되살리지 않는다");
  fx.db.accountbook_transaction_audit[0].before_value = { ...fx.db.accountbook_transaction_audit[0].before_value, id: "tx-expense-2" };
  // 권한: 쓰기 권한이 없어졌으면 되살리지 않는다.
  const membership = fx.db.household_members.find((m) => m.user_id === "user-bin" && m.household_id === HH);
  membership.role = "viewer";
  t.eq(errOf(await restore(fx, ticket)), "write_not_allowed", "3 조회 전용이 되면 되살리지 않는다");
  membership.role = "owner";
  t.eq(rowsOf(fx, "tx-expense-2").length, 0, "3 거절은 모두 아무것도 넣지 않는다");
  t.eq(params((await restore(fx, ticket)).location).get("msg"), "restored", "3 조건이 돌아오면 같은 표로 되살린다(60초 안)");
});

// 표는 그 한 번의 삭제에만 쓴다(독립 검토): 되살린 뒤 다른 사람(관리자)이 다시 지웠거나 내가 나중에 다시 지운 기록은 옛 표로 되살리지 않는다.
// 감사 기록 순서가 흔들리지 않게 뒤의 삭제는 1초 뒤 시각으로 둔다.
await withAudit(async (fx) => {
  const errOf = (res) => params(res.location).get("err");
  const { ticket } = await deleteForTicket(fx, "tx-expense-2");
  t.eq(params((await restore(fx, ticket)).location).get("msg"), "restored", "3 (뒤 삭제) 먼저 표로 되살린다");
  const admin = await app.fetch(new Request(`${BASE}/admin/delete`, {
    method: "POST",
    headers: { cookie: await adminCookie(fx), "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "application/json" },
    body: new URLSearchParams({ id: "tx-expense-2", household_id: HH, month: "2026-07", return_to: RETURN_TO }).toString(),
  }), fx.env, ctx);
  t.eq(admin.status, 200, "3 (뒤 삭제) 관리자가 그 기록을 다시 지운다");
  const audit = fx.db.accountbook_transaction_audit;
  t.deepEq([audit.length, audit.at(-1)?.actor_user_id, audit.at(-1)?.actor_kind], [2, null, "admin"], "3 (뒤 삭제) 관리자 삭제도 감사 기록을 남긴다(행위자 없음·admin)");
  audit.at(-1).created_at = new Date(Date.now() + 1000).toISOString();
  t.eq(errOf(await restore(fx, ticket)), "restore_changed", "3 되살린 뒤 다른 사람이 다시 지운 기록은 옛 표로 되살리지 않는다");
  t.eq(rowsOf(fx, "tx-expense-2").length, 0, "3 다른 사람의 뒤 삭제는 그대로 남는다");
  audit.at(-1).actor_user_id = "user-bin"; audit.at(-1).actor_kind = "user";
  audit.at(-1).created_at = new Date(Date.now() + 60 * 1000).toISOString();
  t.eq(errOf(await restore(fx, ticket)), "restore_changed", "3 내가 30초 넘게 뒤에 다시 지운 기록도 옛 표로는 되살리지 않는다(그 삭제의 새 표를 쓴다)");
  audit.at(-1).created_at = new Date(Date.now() + 1000).toISOString();
  t.eq(params((await restore(fx, ticket)).location).get("msg"), "restored", "3 지운 시각 30초 안의 내 삭제면 되살린다(서버·DB 시계 차이 여유)");
});

// 가져오기로 넣은 기록(source my_import)은 가져오기 저장 경로(accountbook_commit_import_v22960)로 되살리고 번호로 다시 확인한다(카카오 ‘복구’와 같다).
// 그 함수는 운영처럼 UUID 기록 번호만 받으므로 UUID 번호의 행을 쓴다.
await withAudit(async (fx) => {
  const id = "7d3f2c1a-4b5e-4c6d-8e9f-0a1b2c3d4e5f";
  fx.db.transactions.push({ ...structuredClone(rowsOf(fx, "tx-expense-2")[0]), id, source: "my_import" });
  const before = structuredClone(rowsOf(fx, id)[0]);
  const { ticket } = await deleteForTicket(fx, id);
  t.eq(rowsOf(fx, id).length, 0, "3 가져오기 기록을 지운다");
  const res = await restore(fx, ticket);
  t.eq(params(res.location).get("msg") || params(res.location).get("err"), "restored", "3 가져오기 기록도 되살린다");
  const back = rowsOf(fx, id);
  t.deepEq(back.map((item) => [item.source, item.amount, item.category, item.memo, item.transaction_date, item.user_id]), [[before.source, before.amount, before.category, before.memo, before.transaction_date, before.user_id]], "3 가져오기 기록은 출처·금액·분류·메모·날짜·기록한 사람 그대로 한 건");
});

await withAudit(async (fx) => {
  // 구성원(소유자 아님): 자기 기록은 되살리고, 소유자가 ‘기록만’으로 정했으면 되살리지 않는다.
  const wifi = await fx.cookieFor("user-wifi");
  const own = await deleteForTicket(fx, "tx-expense-1", { cookie: wifi });
  t.ok(!!own.ticket, "3 구성원이 지운 자기 기록에도 표가 있다");
  putSetting(fx, "household_member_policy_v22943:house-home", { version: 1, mode: "record_only" });
  t.eq(params((await restore(fx, own.ticket, { cookie: wifi })).location).get("err"), "member_record_only", "3 ‘기록만’ 정책이면 구성원은 되살리지 않는다");
  putSetting(fx, "household_member_policy_v22943:house-home", { version: 1, mode: "record_edit" });
  t.eq(params((await restore(fx, own.ticket, { cookie: wifi })).location).get("msg"), "restored", "3 정책이 풀리면 구성원도 자기 기록을 되살린다");
  t.eq(rowsOf(fx, "tx-expense-1")[0]?.user_id, "user-wifi", "3 되살린 기록의 기록한 사람은 그대로");
});

for (const [kind, expected, rows] of [["reject", "restore_failed", 0], ["lost", "restored", 1], ["unknown", "db_write_unknown", 0]]) await withAudit(async (fx) => {
  const { ticket } = await deleteForTicket(fx, "tx-expense-2");
  const stop = intercept(async ({ url, method, forward }) => {
    if (!(method === "POST" && url.pathname.endsWith("/rest/v1/transactions"))) return null;
    if (kind === "reject") return failure(400, "simulated rejection");
    if (kind === "lost") { await forward(); return failure(503, "lost after commit"); }
    return failure(503, "unknown outcome");
  });
  const res = await restore(fx, ticket);
  stop();
  t.eq(params(res.location).get(expected === "restored" ? "msg" : "err"), expected, `3 저장소 ${kind}: ${expected}`);
  t.eq(rowsOf(fx, "tx-expense-2").length, rows, `3 저장소 ${kind}: 기록 ${rows}건`);
});

// 픽스처 기본값(auditDeletes 꺼짐)은 감사 기록을 남기지 않는다(예전 검사와 같은 fx.db).
await fixture(async (fx) => {
  const { ticket } = await deleteForTicket(fx, "tx-expense-2");
  t.eq((fx.db.accountbook_transaction_audit || []).length, 0, "3 픽스처 기본값은 지울 때 감사 기록을 남기지 않는다");
  t.eq(params((await restore(fx, ticket)).location).get("err"), "restore_expired", "3 감사 기록이 없으면 되살리지 않는다(기본 픽스처)");
});
await withAudit(async (fx) => {
  const before = structuredClone(rowsOf(fx, "tx-expense-2")[0]);
  await deleteForTicket(fx, "tx-expense-2");
  const audit = fx.db.accountbook_transaction_audit || [];
  t.eq(audit.length, 1, "3 auditDeletes 픽스처는 지울 때 감사 기록 한 줄을 남긴다");
  t.deepEq([audit[0]?.action, audit[0]?.transaction_id, audit[0]?.actor_user_id, audit[0]?.actor_kind, audit[0]?.after_value], ["delete", "tx-expense-2", "user-bin", "user", null], "3 감사 기록 칸이 운영 함수와 같다(종류·기록·행위자·after 없음)");
  t.deepEq(audit[0]?.before_value, before, "3 before_value 는 지운 행 전체다");
});

// 테스트 서버(npm run preview:app 의 처리기): 지우면 바로 지워지고, 알림의 표로 되살린다. 사용자가 그 서버에서 그대로 확인한다.
{
  const ORIGIN = "http://127.0.0.1:4400";
  const outer = globalThis.fetch;
  const handler = await createDemoHandler({ app, createFixture: createV2265QaFixture, publicOrigin: ORIGIN, version: "V22.9.90-test" });
  try {
    const row = handler.db.transactions.find((item) => item.household_id === HH && item.type === "expense" && item.user_id === "user-bin");
    const month = String(row?.transaction_date || "").slice(0, 7);
    const back = `/app?month=${month}&household_id=${HH}&tab=transactions`;
    const form = (path, body) => handler.fetch(new Request(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded", accept: "text/html" }, body: new URLSearchParams(body).toString() }));
    const deleted = await form("/admin/delete", { id: row.id, household_id: HH, month, return_to: back });
    const location = deleted.headers.get("location") || "";
    t.eq(params(location).get("msg"), "deleted", "3 테스트 서버: 지우면 바로 지운 화면으로 돌아간다");
    t.eq(handler.db.transactions.some((item) => item.id === row.id), false, "3 테스트 서버: 기록이 바로 빠진다");
    const ticket = params(location).get("restore") || "";
    t.ok(!!ticket, "3 테스트 서버: 돌아갈 주소에 되살리기 표가 있다");
    const html = await (await handler.fetch(new Request(`${ORIGIN}${location}`, { headers: { accept: "text/html", "user-agent": UA } }))).text();
    t.ok(restoreForm(html).includes("data-ab-restore"), "3 테스트 서버: 돌아간 홈 알림에 ‘되돌리기’ 단추가 있다");
    const restored = await form("/my/restore", { ticket, month, return_to: back });
    t.eq(params(restored.headers.get("location") || "").get("msg"), "restored", "3 테스트 서버: ‘되돌리기’로 되살린다");
    t.deepEq(handler.db.transactions.filter((item) => item.id === row.id).map((item) => [item.amount, item.category, item.transaction_date]), [[row.amount, row.category, row.transaction_date]], "3 테스트 서버: 같은 기록 번호·금액·분류·날짜로 돌아온다");
  } finally {
    globalThis.fetch = outer;
  }
}

// ── 4. 알림 5초(V5 자산의 저장 알림 함수) ──
const v5Module = readFileSync(new URL("../src/modules/client/v5-bundle-mains.js", import.meta.url), "utf8");
const feedbackSource = functionSource(v5Module, "accountbookSaveFeedbackClientMain");
const v5Asset = await (await app.fetch(new Request(`${BASE}/assets/accountbook-v5-v22990.js`), {}, ctx)).text();
t.ok(v5Asset.includes(`(${feedbackSource})();`), "4 V5 자산(v22990)이 고친 알림 함수를 싣고 부른다");
const restorable = toastHarness(feedbackSource, { search: `?month=2026-07&household_id=${HH}&tab=transactions&msg=deleted&restore=abc.def`, kind: "success", restore: true });
t.deepEq(restorable.pending(), [5000], "4 되돌리기 알림은 5초 보인다");
t.eq(restorable.location.search, `?month=2026-07&household_id=${HH}&tab=transactions`, "4 알림 값(msg)과 되살리기 표(restore)는 바로 주소에서 지운다(새로 불러와도 단추가 다시 나오지 않는다)");
restorable.fire("mouseenter");
t.deepEq(restorable.pending(), [], "4 마우스가 알림 위에 있으면 멈춘다");
restorable.fire("mouseleave");
t.deepEq(restorable.pending(), [2400], "4 마우스가 나가면 2.4초 뒤 닫는다");
restorable.focusInside();
restorable.fire("focusin");
t.deepEq(restorable.pending(), [], "4 키보드 초점이 단추에 오면 멈춘다");
restorable.blur();
restorable.fire("focusout");
restorable.runZero();
t.deepEq(restorable.pending(), [2400], "4 초점이 나가면 2.4초 뒤 닫는다");
restorable.run(2400);
t.ok(restorable.closed(), "4 시간이 지나면 알림(과 단추)이 닫힌다");
const plainDelete = toastHarness(feedbackSource, { search: `?month=2026-07&household_id=${HH}&msg=deleted`, kind: "success", restore: false });
t.deepEq(plainDelete.pending(), [5200], "4 되돌리기가 없는 삭제 알림(관리자 등)은 예전 성공 알림 시간 그대로");

// ── 5. 삭제 스크립트(V5 자산) ──
const deleteSource = functionSource(readFileSync(new URL("../src/modules/client/lucian-b-mains.js", import.meta.url), "utf8"), "accountbookTransactionDeleteClientMain");
t.ok(v5Asset.includes(deleteSource), "5 V5 자산이 고친 삭제 스크립트를 싣는다");
for (const gone of ["5초 후 삭제", "data-ab-delete-undo", "abDeleteCountdown", "cancelPending", "beforeunload"]) t.ok(!deleteSource.includes(gone), `5 삭제 스크립트에 옛 5초 대기(${gone})가 없다`);
const oldV5 = await (await app.fetch(new Request(`${BASE}/assets/accountbook-v5-v22987.js`), {}, ctx)).text();
t.ok(oldV5.includes("5초 후 삭제합니다."), "5 옛 주소(v22987, 운영 V87·88 이 쓰는 주소)는 옛 바이트 그대로 내려간다");

// ── 6. 한 줄 입력: 한글 조합 중에도 읽기 ──
const homeJs = await (await app.fetch(new Request(`${BASE}/assets/mobile-home-v22990.js`), {}, ctx)).text();
const shellJs = await (await app.fetch(new Request(`${BASE}/assets/mobile-home-shell-v22990.js`), {}, ctx)).text();
const START = "var abImeComposing=false;if(smart){";
for (const [label, source] of [["홈 스크립트", homeJs], ["홈 셸", shellJs]]) {
  t.eq(source.split(START).length - 1, 1, `6 ${label}에 한 줄 입력 연결이 한 번 있다`);
  t.ok(!source.includes("if(abImeComposing)return;applySmart(false)"), `6 ${label}은 조합 중 input 을 건너뛰지 않는다`);
}
const wiring = imeWiring(homeJs);
const ime = imeHarness(wiring);
ime.fire("compositionstart");
ime.input("점심 12000원 현", true);
ime.input("점심 12000원 현금", undefined);
t.deepEq(ime.calls, [["점심 12000원 현", false, true], ["점심 12000원 현금", false, true]], "6 조합 중 글자마다 읽는다(마지막 ‘금’까지, 칸 값은 지우지 않음, 조합 중이라고 알린다)");
ime.key("Enter", true);
t.deepEq(ime.calls.length, 2, "6 조합 중 Enter 는 저장하지 않는다");
ime.fire("compositionend");
t.deepEq(ime.calls.at(-1), ["점심 12000원 현금", false, false], "6 조합이 끝나면 한 번 더 읽는다(조합 끝)");
ime.input("점심 12000원 현금 ", false);
t.deepEq(ime.calls.at(-1), ["점심 12000원 현금 ", false, false], "6 조합 밖 입력은 조합 중이 아니다");
ime.key("Enter", false);
t.deepEq(ime.calls.at(-1), ["점심 12000원 현금 ", true, false], "6 조합이 끝난 Enter 는 저장한다");
// 읽는 쪽(공유 컨트롤러)은 한 줄 입력 칸을 Enter 때만 비운다 — 조합 중 읽기가 입력을 끊지 않는 까닭.
const sharedParsers = readFileSync(new URL("../src/modules/client/shared-input-parsers.js", import.meta.url), "utf8");
const applyBody = (sharedParsers.match(/function apply\(clearInput, composing\) \{[^]*?\n  \}\n/) || [""])[0];
t.ok(applyBody.includes("if (clearInput) smart.value=\"\";") && applyBody.split("smart.value=").length - 1 === 1, "6 읽기는 Enter(clearInput) 때만 한 줄 입력 칸을 비운다");
t.ok(homeJs.includes(sharedParsers.match(/function quickSmartInputController\(config\) \{/)[0]), "6 홈 스크립트가 같은 공유 컨트롤러를 싣는다");
// 공유 컨트롤러(독립 검토): 조합 중 읽기는 이 기기가 읽은 분류를 그대로 보이고 가계부 분류 요청을 보내지 않는다(자모마다 칸을 비우고 요청을 다시 걸던 깜빡임).
// 조합이 끝난 읽기가 한 번 묻고, 조합이 끝나기 전에 저장하면 분류 칸을 비워 서버가 가계부 규칙으로 정한다(요청 중 저장과 같다).
{
  const requests = [];
  const b = createInputBrowser({ fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ ok: true, household_id: HH, category: "가계부분류" }) }; } });
  b.element("input", { type: "hidden", name: "household_id", value: HH }, b.form);
  b.element("input", { id: "rawTextInput", type: "hidden", name: "raw_text" }, b.form);
  b.run([
    quickAmountFieldState.toString(), quickSmartInputController.toString(),
    'function normalizeInputText(s){return String(s||"").trim();}', "function foldInputWidth(s){return s;}", "function moneyTokenSpans(){return [];}", "function explicitDateIntent(){return false;}",
    'var abCtl=quickSmartInputController({amount:function(s){return s.indexOf("12000")>=0?12000:0;},date:function(s){return s.length===10&&s.charAt(4)==="-"?s:"";},type:function(){return "expense";},payment:function(s){return s.indexOf("현금")>=0?"현금":"";},category:function(s){return s.indexOf("점심")>=0?"외식":"";},memo:function(){return "점심";}});',
  ].join("\n"));
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 320)); await b.flush(); };
  const cat = () => b.fields.catInput.value;
  b.smart.value = "점심 12000원 현"; b.run("abCtl.apply(false,true)");
  t.deepEq([cat(), b.fields.payInput.value], ["외식", ""], "6 조합 중 읽기는 이 기기가 읽은 분류를 바로 보인다");
  b.smart.value = "점심 12000원 현금"; b.run("abCtl.apply(false,true)");
  t.deepEq([cat(), b.fields.payInput.value], ["외식", "현금"], "6 조합 중 마지막 글자(‘금’)까지 결제수단에 들어간다");
  await settle();
  t.eq(requests.length, 0, "6 조합 중에는 가계부 분류 요청을 보내지 않는다");
  t.ok(!b.fields.after.textContent.includes("분류를 확인하고"), "6 조합 중 미리보기는 ‘분류 확인 중’으로 바뀌지 않는다");
  b.run("abCtl.apply(false,false)");
  t.eq(cat(), "", "6 조합이 끝난 읽기는 분류 칸을 비우고 가계부 분류를 묻는다");
  await settle();
  t.deepEq(requests.map((body) => body.raw_text), ["점심 12000원 현금"], "6 조합이 끝나면 마지막 글자까지 한 번 묻는다");
  t.eq(cat(), "가계부분류", "6 가계부 분류 답을 칸에 넣는다");
  b.run("abCtl.apply(false,false)"); b.run("abCtl.apply(false,true)");
  await settle();
  t.deepEq([requests.length, cat()], [1, "외식"], "6 묻는 중에 조합을 다시 시작하면 걸린 요청을 보내지 않는다(옛 답이 칸을 바꾸지 않음)");
  t.eq(b.fire(b.form, "submit"), true, "6 조합 중 읽은 내용도 저장할 수 있다(제출을 막지 않음)");
  t.eq(cat(), "", "6 조합이 끝나기 전 저장은 분류 칸을 비워 서버가 정한다");
}

// ── 7. 관제 기능 이름(카카오 요청 → record_nlu_metric 의 p_intent) ──
await fixture(async (fx) => {
  AB_KAKAO_REPEAT_GUARD.clear(); AB_KAKAO_INFLIGHT.clear();
  Object.assign(fx.env, { NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
  putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
  const intents = [];
  intercept(({ url, init }) => {
    if (url.pathname.endsWith("/rpc/record_nlu_metric")) { intents.push(JSON.parse(init.body || "{}").p_intent); return new Response("null", { headers: { "content-type": "application/json" } }); }
    if (url.pathname.endsWith("/rpc/record_nlu_failure_sample")) return new Response("null", { headers: { "content-type": "application/json" } });
    return null;
  });
  const last = async (utterance) => {
    const before = intents.length;
    await skill(fx, utterance);
    for (let i = 0; i < 5 && intents.length === before; i += 1) await new Promise((resolve) => setImmediate(resolve));
    AB_KAKAO_REPEAT_GUARD.clear();
    return intents.slice(before).at(-1);
  };
  t.eq(await last("점심 12000원 현금"), "TRANSACTION", "7 기록 글은 ‘기록’(TRANSACTION)으로 센다(예전 UNKNOWN)");
  t.eq(await last("커피 4500 카드, 택시 8000"), "TRANSACTION", "7 여러 건 기록 글도 TRANSACTION");
  t.eq(await last("01번 금액 5000"), "EDIT", "7 고치기 명령 꼴은 EDIT");
  t.eq(await last("요약"), "SUMMARY", "7 메뉴 낱말은 그대로(요약)");
  t.eq(await last("남은 예산"), "BUDGET_STATUS", "7 메뉴 낱말은 그대로(남은 예산)");
  t.eq(await last("새 가계부 만들기"), "CREATE_HOUSEHOLD", "7 가계부 만들기는 저장 이름 CREATE_HOUSEHOLD(예전 UNKNOWN)");
  t.eq(await last("초대코드로 참여"), "JOIN_HOUSEHOLD", "7 초대코드 참여는 저장 이름 JOIN_HOUSEHOLD(예전 UNKNOWN)");
  t.eq(await last("ㅋㅋㅋ 고마워"), "UNKNOWN", "7 기록도 메뉴도 아닌 말은 그대로 UNKNOWN");
  // 독립 검토: 열린 수정 세션이 받은 답은 미리 읽기가 기록 글로 보았어도 고치기(EDIT)로 센다.
  t.eq(await last("수정 01번"), "EDIT", "7 수정 세션 열기는 EDIT");
  t.eq(await last("금액 13000"), "EDIT", "7 열린 수정 세션이 받은 답(금액 13000)은 기록이 아니라 EDIT");
});
const monitorModel = readFileSync(new URL("../monitoring/model.mjs", import.meta.url), "utf8");
for (const code of ["TRANSACTION", "EDIT", "CREATE_HOUSEHOLD", "JOIN_HOUSEHOLD"]) t.ok(new RegExp(`\\b${code}: "`).test(monitorModel), `7 관제 이름표에 ${code} 가 이미 있다(관제 배포 없이 이름으로 보인다)`);

// ── 8. 묻지 않는 삭제는 되돌리기가 따라올 때만(독립 검토 P2) ──
// 서버가 로그인 사용자 화면(관리자 세션 아님)의 삭제 단추·날짜 시트 폼에만 data-ab-delete-restorable 을 단다. 표시가 없으면 삭제 스크립트가 먼저 묻는다
// (그 동작은 validate-lucian-b-v22947 이 본다).
await fixture(async (fx) => {
  const button = (html) => (html.match(/<button class="danger" type="submit" formaction="\/admin\/delete"[^>]*>/) || [""])[0];
  const edit = async (cookie, extra = "") => (await page(fx, `/transactions/edit?id=tx-expense-2${extra}`, { cookie })).html;
  t.ok(button(await edit(fx.cookie)).includes(" data-ab-delete-restorable"), "8 로그인 사용자 수정 화면의 삭제 단추는 바로 지운다(되돌리기 있음)");
  t.ok(button(await edit(fx.cookie, "&fragment=1")).includes(" data-ab-delete-restorable"), "8 홈 안에서 여는 수정 폼 조각도 같다");
  const admin = await adminCookie(fx);
  const adminButton = button(await edit(admin));
  t.ok(!!adminButton && !adminButton.includes("data-ab-delete-restorable"), "8 관리자 세션 수정 화면의 삭제 단추는 표시가 없다(먼저 묻는다)");
  t.ok(adminButton.includes(`onclick="return confirm('삭제할까요?')"`), "8 JS 없는 확인(onclick)은 그대로 둔다");
  const day = async (cookie) => JSON.parse((await page(fx, `/u/api/day-transactions?date=2026-07-07&household_id=${HH}`, { cookie, headers: { accept: "application/json" } })).html);
  const userDay = await day(fx.cookie);
  t.deepEq([userDay.ok, userDay.restorable_delete, userDay.items.some((item) => item.can_delete)], [true, true, true], "8 날짜 시트 API: 로그인 사용자는 restorable_delete");
  const adminDay = await day(admin);
  t.deepEq([adminDay.ok, adminDay.restorable_delete], [true, false], "8 날짜 시트 API: 관리자 세션은 restorable_delete 가 아니다");
  t.ok(v5Asset.includes('(data && data.restorable_delete === true ? " data-ab-delete-restorable" : "")'), "8 V5 자산: 날짜 시트 삭제 폼은 restorable_delete 일 때만 표시를 단다");
});

// /my 로 돌아가는 삭제: /my 가 /app 으로 넘길 때 되살리기 표도 넘겨 홈 알림에 ‘되돌리기’가 있다(독립 검토). 삭제 알림이 아니면 넘기지 않는다.
await withAudit(async (fx) => {
  const { location, ticket } = await deleteForTicket(fx, "tx-expense-2", { returnTo: `/my?household_id=${HH}&month=2026-07` });
  t.eq(new URL(location, BASE).pathname, "/my", "8 /my 로 돌아가는 삭제");
  const hop = await page(fx, location);
  t.eq(params(hop.location).get("restore"), ticket, "8 /my 는 되살리기 표를 /app 으로 넘긴다");
  t.eq(params(hop.location).get("msg"), "deleted", "8 /my 는 삭제 알림도 넘긴다");
  t.ok(restoreForm(await home(fx, hop.location)).includes("data-ab-restore"), "8 /my 를 거쳐 돌아간 홈에도 ‘되돌리기’가 있다");
  const plain = await page(fx, `/my?household_id=${HH}&month=2026-07&msg=added&restore=${encodeURIComponent(ticket)}`);
  t.eq(params(plain.location).has("restore"), false, "8 삭제 알림이 아니면 표를 넘기지 않는다");
});

t.done();

// validate-design-uplift-v22987 과 같은 관리자 로그인(/login).
async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = "user-feedback-v22990-admin";
  fx.env.ADMIN_SESSION_SECRET = "user-feedback-v22990-admin-session";
  const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD }, { cookie: "" });
  const cookie = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  if (!cookie) throw new Error("관리자 로그인 쿠키를 받지 못했다");
  return cookie;
}

function functionSource(source, name) {
  const node = parse(source, { ecmaVersion: "latest", sourceType: "module" }).body.find((n) => n.type === "FunctionDeclaration" && n.id.name === name);
  if (!node) throw new Error(`${name} 이 없다`);
  return source.slice(node.start, node.end);
}

// validate-design-uplift-v22987 의 알림 틀과 같다(되돌리기 단추 [data-ab-restore] 를 넣을 수 있게).
function toastHarness(source, { search, kind, restore }) {
  const timers = new Map();
  let seq = 0;
  const classes = new Set();
  const handlers = {};
  const button = { name: "되돌리기" };
  const feedback = {
    attrs: {}, classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
    getAttribute: (key) => (key === "data-ab-feedback-kind" ? kind : null), hasAttribute(key) { return key in this.attrs; }, setAttribute(key, value) { this.attrs[key] = value; },
    querySelector: (selector) => (selector === "[data-ab-restore]" && restore ? button : null),
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
    contains: (node) => node === feedback || (restore && node === button),
  };
  const location = { pathname: "/app", search, hash: "" };
  const document = { readyState: "interactive", activeElement: null, addEventListener() {}, getElementById: () => null, querySelector: (selector) => (selector === "[data-ab-save-feedback]" ? feedback : null) };
  const window = { history: { replaceState(_state, _title, url) { location.search = url.includes("?") ? url.slice(url.indexOf("?")).replace(/#.*$/, "") : ""; } } };
  const context = vm.createContext({
    document, window, location, URLSearchParams, requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn, ms) => { seq += 1; timers.set(seq, { fn, ms }); return seq; },
    clearTimeout: (id) => { timers.delete(id); },
  });
  vm.runInContext(`${source}\naccountbookSaveFeedbackClientMain();`, context);
  const run = (ms) => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } };
  return {
    location,
    pending: () => [...timers.values()].map((timer) => timer.ms).filter((ms) => ms !== 180).sort((a, b) => a - b),
    run, runZero: () => run(0),
    fire: (type) => { for (const fn of handlers[type] || []) fn({ type }); },
    focusInside() { document.activeElement = button; },
    blur() { document.activeElement = null; },
    closed: () => classes.has("isLeaving"),
  };
}

// 홈 자산에서 한 줄 입력 연결(var abImeComposing=false;if(smart){…})만 꺼낸다. 괄호 짝으로 if 블록 끝을 찾는다.
function imeWiring(source) {
  const start = source.indexOf(START);
  let depth = 0;
  for (let i = start + START.length - 1; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error("한 줄 입력 연결의 끝을 찾지 못했다");
}

function imeHarness(code) {
  const handlers = {};
  const calls = [];
  const smart = { value: "", getAttribute: () => null, addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); } };
  const context = vm.createContext({ smart, applySmart: (clear, composing) => { calls.push([smart.value, clear, !!composing]); } });
  vm.runInContext(code, context);
  const fire = (type, event = {}) => { for (const fn of handlers[type] || []) fn({ type, preventDefault() {}, ...event }); };
  return {
    calls,
    fire,
    input(value, isComposing) { smart.value = value; fire("input", { isComposing }); },
    key(key, isComposing) { fire("keydown", { key, isComposing }); },
  };
}
