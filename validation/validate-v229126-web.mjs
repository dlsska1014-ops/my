// 2026-11-16 최종 점검 결함 묶음 web 검사(FC-22·FC-21·FC-30·FC-20).
//   FC-22 백업 가져오기: 같은 이름에 번호를 붙인 표시 이름(‘카카오사용자 1’)으로만 찾은 행은 확인 필요·경고로 두고, 미리보기 표에 지출자 칸을 보인다.
//         저장 단계의 중복 후보는 ‘중복 건너뛰기’가 켜졌을 때만 읽고, 읽지 못하면 500 화면이 아니라 503 안내다. 같은 원본의 앞 묶음에서 저장한 행은
//         ‘중복 건너뛰기가 켜져 있어…’ 대신 실제 이유를 적는다.
//   FC-21 지출자가 소유자·관리자·구성원이 아닌 정기 규칙(예약 실행이 건너뜀)은 참여자 목록을 넘긴 계산에서 대기·월말 예상에서 빠지고 ‘지출자 확인 필요 N건’이 보인다.
//         참여자 목록을 넘기지 않는 호출은 예전과 같다.
//   FC-30 환불 차감은 그 범위의 지출 합을 넘지 않는다(차감 목록이 비면 — 환불 연결 꺼짐 — 예전과 같다).
//   FC-20 품목별 정산 후보 = 계산의 참여자(이 달에 돈을 낸 나간 사람 포함), 지출자 없는 행은 품목 목록에서 뺀다, 완료 지문에 기본 참여자 id·역할.
// 장면마다 고치기 전 결함이 나던 자료를 그대로 만들고(검증 재현과 같은 자료), 고친 동작과 그 자료의 결함 전제(예: 번호가 다른 사람을 가리킴)를 함께 본다.
// 네트워크를 쓰지 않는다(메모리 픽스처). 실행: node validation/validate-v229126-web.mjs  (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { app, BASE, ctx, counter, fixture, intercept, failure, page, post, formFields, settingValue } from "./lib-audit-v22934.mjs";
import { budgetSummary } from "../src/index.js";
import { homeUpcomingOut, monthSpendingOutlook, pendingRecurringRules } from "../src/modules/domain/spending-outlook.js";
import { renderHomeReportCards } from "../src/modules/my/home-sections.js";

const t = counter("web fixes FC-20·21·22·30");
const HH = "house-home";
async function at(ymd, hm, task) {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${ymd}T${hm}:00+09:00`);
  try { return await task(); } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
}
const strip = (html = "") => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");

// ── FC-22 백업 가져오기 ─────────────────────────────────────────────────────────
// 가져오기는 사용자 id 가 UUID 꼴이어야 저장 단계까지 간다(검증 재현 p5·p6·p8 과 같은 준비).
const BIN = "11111111-1111-4111-8111-111111111111";
const WIFI = "22222222-2222-4222-8222-222222222222";
const K = ["a1111111-1111-4111-8111-111111111111", "a2222222-2222-4222-8222-222222222222", "a3333333-3333-4333-8333-333333333333"];
const decodeToken = (html = "") => {
  const token = html.match(/name="import_token" value="([^"]+)"/)?.[1] || "";
  return { token, payload: token ? JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) : null };
};
async function importBase(fx, { kakaoUsers = true } = {}) {
  for (const [name, rows] of Object.entries(fx.db)) if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", BIN).replaceAll("user-wifi", WIFI));
  fx.cookie = await fx.cookieFor(BIN);
  fx.db.__import_rpc_available = true;
  if (!kakaoUsers) return;
  // 단톡방 기본 닉네임 ‘카카오사용자’ 셋(참여 순서 K1 → K2 → K3). 백업 CSV 에는 ‘카카오사용자 1·2·3’ 으로 적힌다.
  for (let i = 0; i < 3; i += 1) {
    fx.db.users.push({ id: K[i], kakao_user_key: `room_user_${i + 1}`, nickname: "카카오사용자", created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: HH, user_id: K[i], role: "member", created_at: `2026-07-0${2 + i}T05:00:00.000Z` });
    fx.db.transactions.push({ id: `b000000${i}-0000-4000-8000-00000000000${i}`, household_id: HH, user_id: K[i], transaction_date: "2026-07-10", type: "expense", amount: 10000 * (i + 1), category: "식비", memo: `K${i + 1}밥`, payment_method: "현금", source: "web", raw_text: `K${i + 1}밥` });
  }
}
async function exportBackup(fx) {
  const response = await app.fetch(new Request(`${BASE}/my/backup.csv?household_id=${HH}&month=2026-07&range=all`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
  return (await response.text()).replace(/^﻿/, "");
}
const previewImport = async (fx, csv, extra = {}) => {
  const response = await post(fx, "/my/import", { import_action: "preview", household_id: HH, month: "2026-07", csv_text: csv, ...extra });
  return { status: response.status, html: response.text, ...decodeToken(response.text) };
};
const readyOf = (payload, memo) => (payload?.ready || []).find((entry) => entry.row?.memo === memo);
const pickTag = (html, rowNumber) => html.match(new RegExp(`<input class="importPick"[^>]*value="${rowNumber}"[^>]*>`))?.[0] || "";
const NUMBERED_WARNING = "같은 이름이 여럿이라 붙인 번호로 찾았습니다";

let BACKUP_CSV = "";
await at("2026-07-20", "12:00", () => fixture(async (fx) => {
  await importBase(fx);
  BACKUP_CSV = await exportBackup(fx);
}));
t.ok(/카카오사용자 1/.test(BACKUP_CSV) && /카카오사용자 3/.test(BACKUP_CSV), "결함 전제: 같은 닉네임 셋은 백업 CSV 에 ‘카카오사용자 1·2·3’ 으로 적힌다");

// 1-a. K1 이 나간 뒤 기록을 지우고 복구 — 번호가 한 칸씩 밀려 다른 사람을 가리킨다.
await at("2026-07-20", "12:00", () => fixture(async (fx) => {
  await importBase(fx);
  fx.db.household_members = fx.db.household_members.filter((m) => m.user_id !== K[0]);
  fx.db.transactions = fx.db.transactions.filter((row) => !/^K\d밥$/.test(row.memo));
  const pv = await previewImport(fx, BACKUP_CSV, { skip_duplicates: "1" });
  t.eq(pv.status, 200, "1-a 미리보기가 그려진다");
  const k1 = readyOf(pv.payload, "K1밥");
  const k2 = readyOf(pv.payload, "K2밥");
  t.ok(k1 && k1.row.user_id === K[1], "1-a 결함 전제: K1 이 쓴 ‘카카오사용자 1’ 은 지금 번호로는 K2 다");
  t.ok(k1.needs_confirmation === true && k1.warnings.some((w) => w.includes(NUMBERED_WARNING)), "1-a 고친 뒤: 번호로만 찾은 행은 확인 필요와 경고를 단다");
  t.ok(!/\bchecked\b/.test(pickTag(pv.html, k1.row_number)), "1-a 고친 뒤: 그 행은 미리 선택되지 않는다(그대로 저장되지 않는다)");
  t.ok(k2 && k2.row.user_id === K[2] && k2.needs_confirmation === true, "1-a K2 가 쓴 ‘카카오사용자 2’ 도 확인 필요다(지금 번호로는 K3)");
  t.eq(k1.spender_name, "카카오사용자 1", "1-a 미리보기 항목에 저장될 지출자의 지금 이름표가 실린다");
  t.ok(pv.html.includes("<th>지출자</th>") && pv.html.includes('<td data-label="지출자">카카오사용자 1</td>'), "1-a 미리보기 표에 지출자 칸이 있다");
  const k3 = (pv.payload.outcomes || []).find((o) => String(o.raw || "").includes("K3밥"));
  t.eq(k3?.reason_code, "invalid_spender", "1-a 지금 없는 번호(‘카카오사용자 3’)는 예전처럼 지출자 오류로 뺀다");
  const kept = (pv.payload.outcomes || []).filter((o) => o.reason_code === "duplicate");
  t.ok(kept.length > 0 && kept.every((o) => o.suggestion.includes("중복 건너뛰기가 켜져 있어")), "1-a 중복 건너뛰기를 켠 화면의 내용 중복 안내는 예전 그대로다");
}));

// 1-b. 구성원이 그대로일 때: 번호가 맞아도 확인을 묻는다(가져올 때는 바뀌었는지 알 수 없다). 이름이 하나뿐인 지출자는 예전처럼 바로 붙는다.
await at("2026-07-20", "12:00", () => fixture(async (fx) => {
  await importBase(fx);
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH);
  const pv = await previewImport(fx, BACKUP_CSV, { skip_duplicates: "1" });
  const k1 = readyOf(pv.payload, "K1밥");
  t.ok(k1 && k1.row.user_id === K[0] && k1.needs_confirmation === true, "1-b 구성원이 그대로면 번호가 맞는 사람을 가리키되 확인을 묻는다");
  const wifiRow = readyOf(pv.payload, "주말 장보기");
  t.ok(wifiRow && wifiRow.row.user_id === WIFI && wifiRow.needs_confirmation === false && !wifiRow.warnings.some((w) => w.includes(NUMBERED_WARNING)), "1-b 이름이 하나뿐인 지출자(WIFI♥)는 번호 없이 예전처럼 붙는다");
  t.eq(wifiRow.spender_name, "WIFI♥", "1-b 지출자 칸에 그 사람 이름이 보인다");
  t.ok(/\bchecked\b/.test(pickTag(pv.html, wifiRow.row_number)), "1-b 그 행은 예전처럼 미리 선택된다");
}));

// 1-c. 저장 단계의 중복 후보 읽기: 중복 건너뛰기가 꺼져 있으면 읽지 않고, 켜져 있을 때 읽기가 실패하면 503 안내(저장 0건·잠금 없음).
const IMPORT_CSV = ["날짜,구분,금액,분류,내용,결제수단", "2026-07-02,지출,4100,식비,커밋검사1,현금", "2026-07-03,지출,4200,식비,커밋검사2,현금"].join("\n");
for (const scene of [{ skip: false, fail: false }, { skip: true, fail: false }, { skip: true, fail: true }]) {
  await at("2026-07-20", "12:00", () => fixture(async (fx) => {
    await importBase(fx, { kakaoUsers: false });
    let phase = "preview";
    const reads = { preview: 0, commit: 0 };
    const restore = intercept(async ({ url, method }) => {
      if (url.hostname === "mock.supabase.co" && url.pathname === "/rest/v1/transactions" && url.searchParams.get("amount")?.startsWith("in.")) {
        reads[phase] += 1;
        if (scene.fail && phase === "commit" && method === "HEAD") return failure(503, "simulated candidate read failure");
      }
      return null;
    });
    try {
      const pv = await previewImport(fx, IMPORT_CSV, scene.skip ? { skip_duplicates: "1" } : {});
      phase = "commit";
      const values = new URLSearchParams({ import_action: "commit", import_token: pv.token, household_id: HH, month: "2026-07" });
      for (const entry of pv.payload.ready) values.append("selected_rows", String(entry.row_number));
      const before = fx.db.transactions.length;
      const committed = await post(fx, "/my/import", values);
      const saved = fx.db.transactions.length - before;
      const locks = fx.db.accountbook_operation_locks.filter((lock) => String(lock.key || lock.lock_key || "").includes("transaction-import")).length;
      const label = `1-c 중복 건너뛰기 ${scene.skip ? "켬" : "끔"}${scene.fail ? " · 후보 읽기 실패" : ""}`;
      if (!scene.skip) {
        t.eq(reads.commit, 0, `${label}: 저장 단계에서 중복 후보를 읽지 않는다(고치기 전 1회)`);
        t.ok(committed.status === 200 && saved === 2, `${label}: 두 행이 저장된다`);
      } else if (!scene.fail) {
        t.ok(reads.commit >= 1 && committed.status === 200 && saved === 2, `${label}: 켜져 있으면 예전처럼 후보를 읽고 저장한다`);
      } else {
        t.eq(committed.status, 503, `${label}: 500 화면이 아니라 503 안내다`);
        t.ok(committed.text.includes("기존 거래를 끝까지 확인하지 못해 저장을 중단했습니다") && committed.text.includes("import_token"), `${label}: 미리보기를 그대로 두고 다시 저장하라고 안내한다`);
        t.ok(saved === 0 && locks === 0, `${label}: 저장 0건이고 가져오기 잠금이 남지 않는다`);
      }
    } finally { restore(); }
  }));
}

// 1-d. 중복 건너뛰기를 끈 채 다음 묶음을 분석: 앞 묶음에서 저장한 120행의 안내가 ‘켜져 있어…’ 가 아니다(검증 재현 p8).
await at("2026-07-20", "12:00", () => fixture(async (fx) => {
  await importBase(fx, { kakaoUsers: false });
  const lines = ["날짜,구분,금액,분류,내용,결제수단"];
  for (let i = 1; i <= 300; i += 1) lines.push(`2026-06-${String(1 + (i % 28)).padStart(2, "0")},지출,${1000 + i},식비,항목${i},현금`);
  const csv = lines.join("\n");
  const pass = (previous) => previewImport(fx, csv, { mapping_protocol: "1", mapping_delta: "[]", mapping_offset: "0", input_source: "text", input_revision: "1", ...(previous ? { previous_import_token: previous } : {}) });
  const first = await pass("");
  t.ok(first.payload.skip_duplicates === false && first.payload.ready.length === 120, "1-d 첫 묶음 120행(중복 건너뛰기 꺼짐)");
  const values = new URLSearchParams({ import_action: "commit", import_token: first.token, household_id: HH, month: "2026-07" });
  for (const entry of first.payload.ready) values.append("selected_rows", String(entry.row_number));
  await post(fx, "/my/import", values);
  const second = await pass(first.token);
  const duplicates = (second.payload.outcomes || []).filter((o) => o.reason_code === "duplicate");
  t.ok(second.payload.skip_duplicates === false && duplicates.length === 120 && duplicates.every((o) => o.reason === "기존 기록과 중복"), "1-d 결함 전제: 둘째 분석에서 앞 묶음 120행이 중복으로 빠진다(이유 이름은 그대로)");
  t.ok(duplicates.every((o) => o.suggestion.startsWith("이 원본에서 앞서 저장한 행이라 다시 저장하지 않았습니다")), "1-d 고친 뒤: 그 행의 안내는 실제 이유다");
  t.ok(!second.html.includes("중복 건너뛰기가 켜져 있어"), "1-d 고친 뒤: 옵션을 끈 화면에 ‘중복 건너뛰기가 켜져 있어’ 가 나오지 않는다");
}));

// ── FC-21 지출자 자격을 잃은 정기 규칙 ─────────────────────────────────────────────
const rule = (id, day, amount, memo, user, applied = "2026-10", extra = {}) => ({ id, household_id: HH, type: "expense", amount, category: "주거/관리", memo, payment_method: "", day_of_month: day, user_id: user, is_active: true, last_applied_month: applied, created_at: "2026-10-01T00:00:00.000Z", ...extra });
const spend = (id, date, amount, extra = {}) => ({ id, household_id: HH, user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo: `메모 ${id}`, payment_method: "", source: "web", raw_text: `메모 ${id}`, created_at: `${date}T03:00:00.000Z`, ...extra });
// 검증 재현 p2 와 같은 자료: user-wifi 는 조회 전용이 됐고 user-gone 은 나갔다. 통신비는 이번 달에 반영됐다.
const RULES = () => [
  rule("rule-ok", 5, 30000, "통신비-정상", "user-bin", "2026-11"),
  rule("rule-viewer", 10, 500000, "월세-조회전용지출자", "user-wifi"),
  rule("rule-gone", 12, 40000, "구독-나간지출자", "user-gone"),
];
const NOV_ROWS = () => [
  ...["02", "06", "09", "13"].map((d) => spend(`nov-${d}`, `2026-11-${d}`, 20000)),
  spend("nov-gone-paid", "2026-11-03", 15000, { user_id: "user-gone" }),
  spend("nov-rule-ok", "2026-11-05", 30000, { category: "주거/관리", memo: "통신비-정상", source: "recurring_auto", raw_text: "recurring:rule-ok:2026-11" }),
];
const MEMBERS = [{ user_id: "user-bin", role: "owner", nickname: "Bin" }, { user_id: "user-wifi", role: "viewer", nickname: "WIFI♥" }];
const ids = (list) => (list || []).map((r) => r.id).sort().join(",");

// 2-a. 계산 함수: 참여자 목록이 없으면 예전 값, 있으면 자격 없는 규칙을 대기에서 빼고 따로 돌려준다.
{
  const rows = NOV_ROWS();
  t.eq(ids(pendingRecurringRules(RULES(), "2026-11", rows)), "rule-gone,rule-viewer", "2-a 결함 장면(참여자 없이 부름 = 예전): 자격 없는 규칙 둘이 대기다");
  t.eq(ids(pendingRecurringRules(RULES(), "2026-11", rows, MEMBERS)), "", "2-a 고친 뒤: 참여자 목록을 넘기면 대기에서 빠진다");
  const before = homeUpcomingOut({ month: "2026-11", today: "2026-11-17", rows, plans: [], recurring: RULES() });
  const after = homeUpcomingOut({ month: "2026-11", today: "2026-11-17", rows, plans: [], recurring: RULES(), members: MEMBERS });
  t.ok(before.total === 540000 && before.fixedCount === 2 && !("spenderCheckCount" in before), "2-a 홈 ‘앞으로 나갈 돈’ 계산: 참여자 없이 부르면 예전과 같은 540,000원·2건(모양도 같다)");
  t.ok(after.total === 0 && after.fixedCount === 0 && after.spenderCheckCount === 2 && ids(after.spenderCheckRules) === "rule-gone,rule-viewer", "2-a 고친 뒤: 0원 + 지출자 확인 필요 2건");
  const outBefore = monthSpendingOutlook({ month: "2026-11", rows, today: "2026-11-17", recurring: RULES(), plans: [] });
  const outAfter = monthSpendingOutlook({ month: "2026-11", rows, today: "2026-11-17", recurring: RULES(), plans: [], members: MEMBERS });
  t.ok(outBefore.expected.total === 737647 && outBefore.notYetRecorded.pendingFixed === 540000 && !("spenderCheckCount" in outBefore.notYetRecorded), "2-a 월말 예상: 참여자 없이 부르면 예전 737,647원");
  t.ok(outAfter.expected.total === 197647 && outAfter.notYetRecorded.pendingFixed === 0 && outAfter.notYetRecorded.spenderCheckCount === 2, "2-a 고친 뒤: 월말 예상 197,647원(대기 0원) + 지출자 확인 필요 2건");
  // 모든 지출자가 자격이 있으면 참여자 목록을 넘겨도 값이 같다.
  const okMembers = [...MEMBERS.filter((m) => m.user_id !== "user-wifi"), { user_id: "user-wifi", role: "member" }, { user_id: "user-gone", role: "admin" }];
  const same = homeUpcomingOut({ month: "2026-11", today: "2026-11-17", rows, plans: [], recurring: RULES(), members: okMembers });
  const { spenderCheckCount, spenderCheckRules, ...sameRest } = same;
  t.deepEq(sameRest, before, "2-a 지출자가 모두 자격이 있으면 참여자 목록을 넘겨도 예전 값과 같다");
  t.eq(spenderCheckCount, 0, "2-a 그때 지출자 확인 필요는 0건이다");
  // 규칙과 짝지은 정기지출 항목: 자격 없는 규칙은 기록을 만들지 않으므로 항목 쪽으로 센다(합계에서 사라지지 않는다).
  const insRule = [rule("r-ins", 20, 70000, "보험", "user-gone", "2026-10", { category: "보험" })];
  const insPlan = [{ id: "p-ins", name: "보험", amount: 70000, due_day: 20, due_months: [11], category: "보험" }];
  const planBefore = homeUpcomingOut({ month: "2026-11", today: "2026-11-05", rows: [], plans: insPlan, recurring: insRule });
  const planAfter = homeUpcomingOut({ month: "2026-11", today: "2026-11-05", rows: [], plans: insPlan, recurring: insRule, members: MEMBERS });
  t.ok(planBefore.fixedCount === 1 && planBefore.planCount === 0 && planBefore.total === 70000, "2-a 예전: 정기지출 항목은 같은 지출로 짝지은 규칙 쪽으로 한 번 센다");
  t.ok(planAfter.fixedCount === 0 && planAfter.planCount === 1 && planAfter.total === 70000 && planAfter.spenderCheckCount === 1, "2-a 고친 뒤: 규칙이 반영되지 않으므로 항목으로 한 번 센다");
  // 홈 리포트 카드(앞으로 나갈 돈): 값이 있을 때만 한 줄을 더한다.
  const cardAfter = renderHomeReportCards({ month: "2026-11", householdId: HH, upcoming: after, reserveLoaded: true, isCurrentMonth: true });
  const cardBefore = renderHomeReportCards({ month: "2026-11", householdId: HH, upcoming: before, reserveLoaded: true, isCurrentMonth: true });
  t.ok(cardAfter.includes("<small>지출자 확인 필요 2건</small>") && !cardBefore.includes("지출자 확인 필요"), "2-a 홈 카드: 참여자 목록으로 계산한 값에만 ‘지출자 확인 필요 2건’ 이 붙는다");
  t.ok(cardBefore.includes("540,000원") && cardBefore.includes("이번 달 남은 고정지출 2건"), "2-a 홈 카드: 참여자 없이 계산한 값은 예전 문구 그대로다");
}

// 2-b. 화면: 예산 알림과 생활비 리포트는 이미 읽은 참여자 목록을 넘긴다.
function seedRules(fx) {
  fx.db.household_members.find((m) => m.household_id === HH && m.user_id === "user-wifi").role = "viewer";
  fx.db.users.push({ id: "user-gone", kakao_user_key: "kakao_login:2299", nickname: "Gone", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.accountbook_recurring = RULES();
  fx.db.accountbook_budgets.push({ id: "b-nov-total", household_id: HH, month: "2026-11", category: "__total", amount: 1500000, created_at: "2026-11-01T00:00:00.000Z" });
  fx.db.transactions.push(...NOV_ROWS());
}
await at("2026-11-17", "12:00", () => fixture(async (fx) => {
  seedRules(fx);
  fx.cookie = await fx.cookieFor("user-bin");
  const alerts = await page(fx, `/budget-alerts?household_id=${HH}&month=2026-11`);
  t.eq(alerts.status, 200, "2-b 예산 알림이 그려진다");
  t.ok(alerts.html.includes("<span>고정지출 대기</span><b>0원</b><small>지출자 확인 필요 2건</small>"), "2-b 고친 뒤: 고정지출 대기 0원 아래 ‘지출자 확인 필요 2건’(고치기 전 540,000원)");
  t.ok(alerts.html.includes("지출자 확인 필요 2건(540,000원)"), "2-b 대기 목록에 뺀 규칙의 건수·금액을 적는다");
  const text = strip(alerts.html);
  t.ok(text.includes("197,647원") && !text.includes("737,647원") && text.includes("남은 고정·정기 0원"), "2-b 고친 뒤: 월말 예상 197,647원(고치기 전 737,647원)");
  t.ok(!alerts.html.includes("<b>월세-조회전용지출자</b><span>주거/관리 · 매월 10일 예정</span>"), "2-b 반영 대기 목록에 자격 없는 규칙이 오르지 않는다");
  const reports = await page(fx, `/reports?household_id=${HH}&month=2026-11`);
  t.eq(reports.status, 200, "2-b 생활비 리포트가 그려진다");
  t.eq((reports.html.match(/<span class="lrTag isWarn">지출자 확인 필요<\/span>/g) || []).length, 2, "2-b 고친 뒤: 리포트 정기 항목 두 개가 ‘반영 전’ 대신 ‘지출자 확인 필요’");
  t.ok(reports.html.includes('<span class="lrTag isOk">이번 달 반영</span>'), "2-b 반영된 규칙은 예전처럼 ‘이번 달 반영’");
}));
await at("2026-11-17", "12:00", () => fixture(async (fx) => {
  seedRules(fx);
  fx.db.household_members.find((m) => m.household_id === HH && m.user_id === "user-wifi").role = "member";
  fx.db.accountbook_recurring = RULES().filter((r) => r.id !== "rule-gone");
  fx.cookie = await fx.cookieFor("user-bin");
  const alerts = await page(fx, `/budget-alerts?household_id=${HH}&month=2026-11`);
  const reports = await page(fx, `/reports?household_id=${HH}&month=2026-11`);
  t.ok(alerts.html.includes("<span>고정지출 대기</span><b>500,000원</b></div>") && !alerts.html.includes("지출자 확인 필요"), "2-b 지출자가 모두 자격이 있으면 예산 알림은 예전과 같다");
  t.ok(alerts.html.includes("<b>월세-조회전용지출자</b><span>주거/관리 · 매월 10일 예정</span>"), "2-b 그때 그 규칙은 예전처럼 반영 대기 목록에 있다");
  t.ok(!reports.html.includes("지출자 확인 필요") && reports.html.includes('<span class="lrTag ">반영 전</span>'), "2-b 지출자가 모두 자격이 있으면 리포트는 예전처럼 ‘반영 전’");
}));

// ── FC-30 환불 차감은 지출 합 이하 ─────────────────────────────────────────────────
{
  const refundA = [{ transaction_date: "2026-11-01", amount: 100000, category: "쇼핑" }];
  const outA = monthSpendingOutlook({ month: "2026-11", today: "2026-11-05", rows: [], recurring: [], plans: [], refundDeductions: refundA });
  t.ok(outA.recorded.toDate === 0 && outA.recorded.registered === 0 && outA.expected.total === 0 && outA.recorded.refundDeduction === 0, "3 A 고친 뒤: 지출 없는 달의 환불 100,000원 차감이 기록·월말 예상을 음수로 만들지 않는다(고치기 전 −100,000원)");
  const budgets = [{ month: "2026-11", category: "__total", amount: 500000 }];
  const rowsB = [{ id: "b1", household_id: "h", transaction_date: "2026-11-03", type: "expense", amount: 30000, category: "식비", source: "web" }];
  const refundB = [{ transaction_date: "2026-11-01", amount: 100000, category: "식비" }];
  const outB = monthSpendingOutlook({ month: "2026-11", today: "2026-11-05", rows: rowsB, recurring: [], plans: [], budgets, scope: "budgeted", refundDeductions: refundB });
  const sumB = budgetSummary(rowsB, budgets, { refundDeductions: refundB });
  t.ok(outB.recorded.toDate === 0 && outB.recorded.registered === 0 && outB.recorded.refundDeduction === 30000, "3 B 고친 뒤: 차감은 그 달 지출 30,000원까지만(고치기 전 기록 −70,000원)");
  t.ok(outB.budget.remaining === 500000 && outB.budget.remaining === sumB.remaining, "3 B 고친 뒤: 남은 예산이 예산(500,000원)을 넘지 않고 budgetSummary 와 같다(고치기 전 570,000원)");
  t.ok(outB.expected.total === 150000 && outB.budget.dailyAllowance === Math.floor(500000 / 26), "3 B 고친 뒤: 월말 예상 150,000원·하루 사용 가능 19,230원(고치기 전 80,000원·21,923원)");
  const partial = monthSpendingOutlook({ month: "2026-11", today: "2026-11-05", rows: rowsB, recurring: [], plans: [], budgets, scope: "budgeted", refundDeductions: [{ transaction_date: "2026-11-01", amount: 10000, category: "식비" }] });
  t.ok(partial.recorded.toDate === 20000 && partial.recorded.registered === 20000 && partial.budget.remaining === 480000, "3 지출보다 작은 차감은 예전과 같다(30,000 − 10,000)");
  const off = monthSpendingOutlook({ month: "2026-11", today: "2026-11-05", rows: rowsB, recurring: [], plans: [], budgets, scope: "budgeted", refundDeductions: [] });
  const omitted = monthSpendingOutlook({ month: "2026-11", today: "2026-11-05", rows: rowsB, recurring: [], plans: [], budgets, scope: "budgeted" });
  t.deepEq(off, omitted, "3 환불 연결 꺼짐(차감 목록 빔)은 차감을 넘기지 않은 것과 같다");
  t.ok(off.budget.remaining === 470000 && off.expected.total === 180000, "3 환불 연결 꺼짐 값은 예전과 같다(남은 470,000원·월말 180,000원)");
}

// ── FC-20 정산 품목별 후보·완료 지문 ──────────────────────────────────────────────
const Q = `household_id=${HH}&month=2026-11`;
const NAMES = "Bin|WIFI♥|Gone\\(나간 구성원\\)|New";
const transfersOf = (html) => [...new Set([...strip(html).matchAll(new RegExp(`(?:${NAMES})\\s*→\\s*(?:${NAMES})\\s*[0-9,]+원`, "g"))].map((m) => m[0].replace(/\s+/g, " ")))];
const itemFormOf = (html) => [...html.matchAll(/<form\b[^>]*action="\/settlement-summary"[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]).find((form) => form.includes('name="item_')) || "";
function fieldsOf(form) {
  const fields = new URLSearchParams();
  for (const m of form.matchAll(/<input\b([^>]*)>/g)) {
    const tag = m[1];
    const name = (tag.match(/\bname="([^"]+)"/) || [])[1];
    if (!name) continue;
    const type = ((tag.match(/\btype="([^"]+)"/) || [])[1] || "text").toLowerCase();
    if ((type === "checkbox" || type === "radio") && !/\bchecked\b/.test(tag)) continue;
    fields.append(name, (tag.match(/\bvalue="([^"]*)"/) || [, ""])[1].replace(/&amp;/g, "&"));
  }
  return fields;
}
const completedOf = (fx) => JSON.parse(String(settingValue(fx, `settlement_history:${HH}`) || "[]")).filter((x) => x && x.status === "completed");
function seedSettlement(fx) {
  fx.db.users.push({ id: "user-gone", kakao_user_key: "kakao_login:2299", nickname: "Gone", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.transactions.push(
    spend("s-a", "2026-11-03", 60000, { memo: "장보기A" }),
    spend("s-b", "2026-11-05", 30000, { user_id: "user-wifi", memo: "외식B" }),
    spend("s-c", "2026-11-07", 30000, { user_id: "user-gone", memo: "택시C" }),
    spend("s-d", "2026-11-09", 20000, { user_id: null, memo: "지출자없음D" }),
  );
}
const joinNewMember = (fx) => {
  fx.db.users.push({ id: "user-new", kakao_user_key: "kakao_login:2297", nickname: "New", created_at: "2026-11-17T03:00:00.000Z" });
  fx.db.household_members.push({ household_id: HH, user_id: "user-new", role: "member", created_at: "2026-11-17T03:01:00.000Z" });
};
const EQUAL_TRANSFERS = ["WIFI♥ → Bin 10,000원", "Gone(나간 구성원) → Bin 10,000원"];

// 4-a. 품목별: 후보 = 계산의 참여자(나간 결제자 포함), 지출자 없는 행은 목록에서 뺀다, 그대로 ‘다시 계산’ 해도 결과가 같다.
await at("2026-11-17", "12:00", () => fixture(async (fx) => {
  seedSettlement(fx);
  fx.cookie = await fx.cookieFor("user-bin");
  const first = await page(fx, `/settlement-summary?${Q}&mode=item`);
  const form = itemFormOf(first.html);
  const people = [...new Set([...form.matchAll(/name="item_[^"]+" value="([^"]+)"/g)].map((m) => m[1]))];
  t.deepEq(people, ["user-bin", "user-wifi", "user-gone"], "4-a 고친 뒤: 품목별 후보에 이 달에 돈을 낸 나간 사람이 있다(고치기 전 Bin·WIFI♥ 둘)");
  t.ok(!form.includes('name="item_s-d"') && !form.includes("지출자없음D"), "4-a 고친 뒤: 지출자가 없는 행은 나눌 품목 목록에 없다");
  t.ok(form.includes("결제 Gone(나간 구성원) · 30,000원") && !form.includes("결제 지출자 미지정"), "4-a 고친 뒤: 나간 결제자의 행이 ‘결제 지출자 미지정’ 이 아니다");
  t.deepEq(transfersOf(first.html), EQUAL_TRANSFERS, "4-a 처음 화면(선택 없음 = 전체 참여자)의 송금 제안");
  const again = await page(fx, `/settlement-summary?${fieldsOf(form).toString()}`);
  t.deepEq(transfersOf(again.html), EQUAL_TRANSFERS, "4-a 고친 뒤: 바꾸지 않고 ‘다시 계산’ 해도 같다(고치기 전 WIFI♥ → Gone 30,000원)");
  // 동일·비율·인원수 결과는 그대로다(계산식은 바꾸지 않았다).
  t.deepEq(transfersOf((await page(fx, `/settlement-summary?${Q}`)).html), EQUAL_TRANSFERS, "4-a 동일 분배 결과는 예전과 같다");
  t.deepEq(transfersOf((await page(fx, `/settlement-summary?${Q}&mode=headcount`)).html), EQUAL_TRANSFERS, "4-a 인원수 분배(모두 1) 결과는 예전과 같다");
  // 비율 1:2(나간 결제자는 비율 칸이 없어 1): 부담 30,000·60,000·30,000 → WIFI♥ 가 Bin 에게 30,000원.
  const ratio = await page(fx, `/settlement-summary?${Q}&mode=ratio&weight_user-bin=1&weight_user-wifi=2`);
  t.deepEq(transfersOf(ratio.html), ["WIFI♥ → Bin 30,000원"], "4-a 비율 분배 결과는 예전과 같다");
}));

// 4-b. 완료 지문: 미리 본 뒤 참여자가 바뀌면 완료 저장을 거절한다(플래그 꺼짐·켜짐 모두). 바뀌지 않으면 예전처럼 저장한다.
for (const flag of ["", "1"]) {
  const label = flag ? "환불 연결 켜짐(연결 없음)" : "환불 연결 꺼짐";
  await at("2026-11-17", "12:00", () => fixture(async (fx) => {
    seedSettlement(fx);
    if (flag) { fx.env.REFUND_LINKS_ENABLED = flag; fx.db.accountbook_refund_links = []; }
    fx.cookie = await fx.cookieFor("user-bin");
    const preview = await page(fx, `/settlement-summary?${Q}`);
    const save = formFields(preview.html, "/my/settlement/save");
    t.ok(save.found && /^[a-f0-9]{32}$/.test(save.fields.get("preview_digest") || ""), `4-b ${label}: 완료 폼에 미리보기 지문이 있다`);
    t.eq(formFields((await page(fx, `/settlement-summary?${Q}`)).html, "/my/settlement/save").fields.get("preview_digest"), save.fields.get("preview_digest"), `4-b ${label}: 같은 상태면 지문이 같다`);
    joinNewMember(fx);
    const values = new URLSearchParams(save.fields);
    values.set("confirmed", "yes");
    const rejected = await post(fx, "/my/settlement/save", values);
    t.ok(/err=settlement_changed/.test(rejected.decoded) && completedOf(fx).length === 0, `4-b ${label} 고친 뒤: 미리 본 뒤 새 구성원이 들어오면 완료를 저장하지 않는다(고치기 전 4명으로 저장)`);
    const notice = await page(fx, rejected.location);
    t.ok(notice.html.includes("화면을 연 뒤 이 달 지출 기록이나 참여자가 바뀌어 저장하지 않았습니다"), `4-b ${label}: 거절 이유를 알려 준다`);
    const fresh = formFields((await page(fx, `/settlement-summary?${Q}`)).html, "/my/settlement/save");
    t.ok(fresh.fields.get("preview_digest") !== save.fields.get("preview_digest"), `4-b ${label}: 참여자가 바뀌면 지문이 바뀐다`);
    const again = new URLSearchParams(fresh.fields);
    again.set("confirmed", "yes");
    const saved = await post(fx, "/my/settlement/save", again);
    const last = completedOf(fx).at(-1);
    t.ok(/msg=settlement_completed/.test(saved.decoded) && last?.participant_count === 4 && last?.rows_digest === fresh.fields.get("preview_digest"), `4-b ${label}: 새로 본 화면으로는 예전처럼 완료된다(4명)`);
  }));
}
// 플래그 꺼짐과 켜짐(연결 없음)의 지문이 같다 — 환불 연결 지문 형식(연결이 있을 때)은 그대로다.
{
  const digests = [];
  for (const flag of ["", "1"]) {
    await at("2026-11-17", "12:00", () => fixture(async (fx) => {
      seedSettlement(fx);
      if (flag) { fx.env.REFUND_LINKS_ENABLED = flag; fx.db.accountbook_refund_links = []; }
      fx.cookie = await fx.cookieFor("user-bin");
      digests.push(formFields((await page(fx, `/settlement-summary?${Q}`)).html, "/my/settlement/save").fields.get("preview_digest"));
    }));
  }
  t.ok(digests.length === 2 && digests[0] && digests[0] === digests[1], "4-b 환불 연결 꺼짐과 켜짐(연결 없음)의 완료 지문이 같다");
}

t.done();
