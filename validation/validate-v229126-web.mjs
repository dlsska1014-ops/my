// 2026-11-16 최종 점검 결함 묶음 web 검사(FC-22·FC-21·FC-30·FC-20).
//   FC-22 백업 가져오기: 같은 이름에 번호를 붙인 표시 이름(‘카카오사용자 1’)으로만 찾은 행은 확인 필요·경고로 두고, 미리보기 표에 지출자 칸을 보인다.
//         저장 단계의 중복 후보는 ‘중복 건너뛰기’가 켜졌을 때만 읽고, 읽지 못하면 500 화면이 아니라 503 안내다. 같은 원본의 앞 묶음에서 저장한 행은
//         ‘중복 건너뛰기가 켜져 있어…’ 대신 실제 이유를 적는다.
//   FC-21 지출자가 소유자·관리자·구성원이 아닌 정기 규칙(예약 실행이 건너뜀)은 참여자 목록을 넘긴 계산에서 대기·월말 예상에서 빠지고 ‘지출자 확인 필요 N건’이 보인다.
//         참여자 목록을 넘기지 않는 호출은 예전과 같다.
//   FC-30 환불 차감은 그 범위의 지출 합을 넘지 않는다(차감 목록이 비면 — 환불 연결 꺼짐 — 예전과 같다).
//   FC-20 품목별 정산 후보 = 계산의 참여자(이 달에 돈을 낸 나간 사람 포함), 지출자 없는 행은 품목 목록에서 뺀다, 완료 지문에 기본 참여자 id·역할.
// 장면마다 고치기 전 결함이 나던 자료를 그대로 만들고(검증 재현과 같은 자료), 고친 동작과 그 자료의 결함 전제(예: 번호가 다른 사람을 가리킴)를 함께 본다.
// 2차 검토 장면: 지출자 없는 규칙은 예약 실행도 건너뜀(2-c), 예산 알림·알림센터 API·종합 리포트·스마트 도구의 같은 값(2-b), 관측 확인 불가 달의 안내(2-d),
// 지출자를 둔 같은 자료의 예전 값(2-e → 3차에 검사 d3 안으로 옮김), 번호 판정 = memberNameMap 의 실제 규칙(1-e), 음수 지출 달의 예전 식(3 C).
// 3차 검토 장면: ‘지출자 확인’ 알림과 API 값(2-b·2-f), 빈 참여자 목록·읽기 실패(2-a·2-d·2-g), 예산 범위(2-h), 이름 경계(1-f).
// 4차 검토 장면: 예산 밖의 자격 없는 규칙(2-h), 짝지은 정기지출 항목(2-i), 역할이 빈 지출자 = 예약 실행과 같은 판정(2-j), 예산 없는 달(2-k), 모르면 null(2-g).
// 네트워크를 쓰지 않는다(메모리 픽스처). 실행: node validation/validate-v229126-web.mjs  (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { app, BASE, ctx, counter, fixture, intercept, failure, page, post, api, formFields, settingValue, putSetting } from "./lib-audit-v22934.mjs";
import { budgetSummary, runRecurringAutoApply } from "../src/index.js";
import { homeUpcomingOut, monthSpendingOutlook, pendingRecurringRules } from "../src/modules/domain/spending-outlook.js";
import { refundDeductionApplied } from "../src/modules/domain/refund-links.js";
import { buildBudgetAlertPolishModel, renderPendingRecurringList } from "../src/modules/features/budget-alerts-annual-goals.js";
import { normalizeHomeLayout, renderHomeReportCards } from "../src/modules/my/home-sections.js";
import { fetchHouseholdMembers } from "../src/modules/data/households-members-rows.js";

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

// 1-e. 번호를 붙였는지는 memberNameMap 의 실제 규칙(같은 기본 이름이 둘 이상)으로 본다. 닉네임이 없는 사람(‘구성원’)과 이름이 ‘민수 2’인 사람은
//      하나뿐이라 번호가 아니고 바로 붙는다. 같은 ‘카카오사용자’ 둘만 번호라 확인을 묻는다.
const NULL_NICK = "a4444444-4444-4444-8444-444444444444";
const MINSU = "a5555555-5555-4555-8555-555555555555";
await at("2026-07-20", "12:00", () => fixture(async (fx) => {
  await importBase(fx, { kakaoUsers: false });
  const people = [[NULL_NICK, null, "닉네임없음밥"], [MINSU, "민수 2", "민수밥"], [K[0], "카카오사용자", "카톡1밥"], [K[1], "카카오사용자", "카톡2밥"]];
  people.forEach(([id, nickname, memo], i) => {
    fx.db.users.push({ id, kakao_user_key: `room_user_e${i}`, nickname, created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: HH, user_id: id, role: "member", created_at: `2026-07-0${2 + i}T05:00:00.000Z` });
    fx.db.transactions.push({ id: `e000000${i}-0000-4000-8000-00000000000${i}`, household_id: HH, user_id: id, transaction_date: "2026-07-11", type: "expense", amount: 1000 * (i + 1), category: "식비", memo, payment_method: "현금", source: "web", raw_text: memo });
  });
  const csv = await exportBackup(fx);
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH);
  const pv = await previewImport(fx, csv, { skip_duplicates: "1" });
  const state = (memo) => {
    const entry = readyOf(pv.payload, memo);
    return entry ? `${entry.row.user_id}|${entry.spender_name}|${entry.needs_confirmation ? "확인" : "바로"}|${/\bchecked\b/.test(pickTag(pv.html, entry.row_number)) ? "선택" : "미선택"}` : "(없음)";
  };
  t.deepEq(people.map(([, , memo]) => state(memo)), [`${NULL_NICK}|구성원|바로|선택`, `${MINSU}|민수 2|바로|선택`, `${K[0]}|카카오사용자 1|확인|미선택`, `${K[1]}|카카오사용자 2|확인|미선택`], "1-e 닉네임 없는 사람·이름이 ‘민수 2’인 사람은 번호가 아니라 바로 붙고, 같은 ‘카카오사용자’ 둘만 확인을 묻는다");
}));

// 1-f. 3차: 닉네임 없는 사람 둘, 대소문자만 다른 이름 둘, 앞뒤 공백만 다른 이름 둘. 백업 CSV 가 번호를 붙인 행만 확인을 묻는다.
//      대소문자만 다르면 CSV 는 번호 없이 두 이름을 적고, 가져오기의 이름 찾기(대소문자·공백 무시)는 예전부터 두 사람이 겹쳐 지출자 오류로 뺀다.
async function namesScene(people) {
  let result = null;
  await at("2026-07-20", "12:00", () => fixture(async (fx) => {
    await importBase(fx, { kakaoUsers: false });
    people.forEach(([id, nickname, memo], i) => {
      fx.db.users.push({ id, kakao_user_key: `room_user_f${i}`, nickname, created_at: "2026-07-01T00:00:00.000Z" });
      fx.db.household_members.push({ household_id: HH, user_id: id, role: "member", created_at: `2026-07-0${2 + i}T05:00:00.000Z` });
      fx.db.transactions.push({ id: `f000000${i}-0000-4000-8000-00000000000${i}`, household_id: HH, user_id: id, transaction_date: "2026-07-11", type: "expense", amount: 1000 * (i + 1), category: "식비", memo, payment_method: "현금", source: "web", raw_text: memo });
    });
    const csv = await exportBackup(fx);
    const printed = people.map(([, , memo]) => (csv.split("\n").find((line) => line.includes(`,${memo},`)) || "").split(",")[6] || "(없음)");
    fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH);
    const pv = await previewImport(fx, csv, { skip_duplicates: "1" });
    const states = people.map(([id, , memo]) => {
      const entry = readyOf(pv.payload, memo);
      if (!entry) return (pv.payload.outcomes || []).find((o) => String(o.raw || "").includes(memo))?.reason_code || "(없음)";
      return `${entry.row.user_id === id ? "본인" : "다른 사람"}|${entry.needs_confirmation ? "확인" : "바로"}|${/\bchecked\b/.test(pickTag(pv.html, entry.row_number)) ? "선택" : "미선택"}`;
    });
    result = { printed, states };
  }));
  return result;
}
{
  const nulls = await namesScene([["a6666666-6666-4666-8666-666666666666", null, "무명1밥"], ["a7777777-7777-4777-8777-777777777777", null, "무명2밥"]]);
  t.deepEq(nulls, { printed: ["구성원 1", "구성원 2"], states: ["본인|확인|미선택", "본인|확인|미선택"] }, "1-f 닉네임 없는 사람 둘: CSV 에 ‘구성원 1·2’ 로 번호가 붙고, 그 행은 확인을 묻는다");
  const cases = await namesScene([["a8888888-8888-4888-8888-888888888888", "Mina", "대문자밥"], ["a9999999-9999-4999-8999-999999999999", "mina", "소문자밥"]]);
  t.deepEq(cases, { printed: ["Mina", "mina"], states: ["invalid_spender", "invalid_spender"] }, "1-f 대소문자만 다른 이름 둘: CSV 에 번호가 없고 확인을 묻지 않는다(이름 찾기가 두 사람을 겹쳐 예전처럼 지출자 오류)");
  const spaces = await namesScene([["ab111111-1111-4111-8111-111111111111", " 지수", "앞공백밥"], ["ab222222-2222-4222-8222-222222222222", "지수 ", "뒤공백밥"]]);
  t.deepEq(spaces, { printed: ["지수 1", "지수 2"], states: ["본인|확인|미선택", "본인|확인|미선택"] }, "1-f 앞뒤 공백만 다른 이름 둘: CSV 에 ‘지수 1·2’ 로 번호가 붙고, 그 행은 확인을 묻는다");
}

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
  // 3차: 빈 참여자 목록은 넘기지 않은 것과 같다(모르면 거르지 않는다 — 빈 목록을 그대로 쓰면 모든 규칙이 자격 없음이 됐다).
  const emptyOut = monthSpendingOutlook({ month: "2026-11", rows, today: "2026-11-17", recurring: RULES(), plans: [], members: [] });
  t.deepEq([ids(pendingRecurringRules(RULES(), "2026-11", rows, [])), homeUpcomingOut({ month: "2026-11", today: "2026-11-17", rows, plans: [], recurring: RULES(), members: [] }), emptyOut], [ids(pendingRecurringRules(RULES(), "2026-11", rows)), before, outBefore], "2-a 3차: 빈 참여자 목록이면 대기·홈 계산·월말 예상이 참여자 목록 없이 부른 예전 값과 같다");
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
  // V22.9.137 U-13: 홈 구성을 저장하지 않으면 리포트 카드가 꺼진 것이 기본이다 — 네 장을 켠 저장 값으로 그린다.
  const cardsOn = normalizeHomeLayout(JSON.stringify({ reports: { order: ["where", "pace", "budget", "reserve"], hidden: [] } }));
  const cardAfter = renderHomeReportCards({ month: "2026-11", householdId: HH, upcoming: after, reserveLoaded: true, isCurrentMonth: true, layout: cardsOn });
  const cardBefore = renderHomeReportCards({ month: "2026-11", householdId: HH, upcoming: before, reserveLoaded: true, isCurrentMonth: true, layout: cardsOn });
  t.ok(cardAfter.includes("<small>지출자 확인 필요 2건</small>") && !cardBefore.includes("지출자 확인 필요"), "2-a 홈 카드: 참여자 목록으로 계산한 값에만 ‘지출자 확인 필요 2건’ 이 붙는다");
  t.ok(cardBefore.includes("540,000원") && cardBefore.includes("이번 달 남은 고정지출 2건"), "2-a 홈 카드: 참여자 없이 계산한 값은 예전 문구 그대로다");
}

// 2-b. 화면: 예산 알림과 생활비 리포트는 이미 읽은 참여자 목록을 넘긴다.
// 예산 알림·종합 리포트·스마트 도구 화면의 ‘월말 예상 지출’ 과 알림센터 API 의 budget_observation 을 함께 읽는다.
async function sameForecast(fx, month = "2026-11") {
  const q = `household_id=${HH}&month=${month}`;
  const htmls = [];
  for (const path of [`/budget-alerts?${q}`, `/my/analysis?view=report&${q}`, `/smart-tools?${q}`]) htmls.push((await page(fx, path)).html);
  const pages = htmls.map((html) => strip(html).match(/월말 예상 지출 ([0-9,]+)원/)?.[1] || "(없음)");
  const notes = await api(fx, `/u/api/notifications?${q}`);
  const notifications = notes.data?.notifications || [];
  return { pages, htmls, api: notes.data?.budget_observation || {}, notifications, pendingNotice: notifications.some((n) => n.key === `recurring-pending:${month}`) };
}
const noticeOf = (shared, key) => shared.notifications.find((n) => n.key === key) || null;
const SPENDER_NOTE_REPORT = "기록 + 남은 고정 + 남은 날 예상 · 지출자 확인 필요 2건 제외";
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
  // 같은 달의 월말 예상은 예산 알림·알림센터 API·종합 리포트(?view=report)·스마트 도구가 같은 값이다(같은 판에 참여자 목록을 함께 넘긴다).
  const shared = await sameForecast(fx);
  t.deepEq(shared.pages, ["197,647", "197,647", "197,647"], "2-b 고친 뒤: 예산 알림·종합 리포트·스마트 도구의 월말 예상이 모두 197,647원");
  t.deepEq([shared.api.forecast, shared.api.pending_total, shared.api.after_pending_assumption, shared.pendingNotice], [197647, 0, 197647, false], "2-b 고친 뒤: 알림센터 API 도 월말 예상 197,647원·반영 대기 0원이고 반영 대기 알림이 없다(고치기 전 737,647원·540,000원)");
  // 3차: 대기 알림에서 빠진 규칙은 달마다 ‘지출자 확인’ 알림 하나로 알리고(정기 수입·지출 화면으로), API 에 건수·금액을 대기 옆에 싣는다.
  const check = noticeOf(shared, "recurring-spender-check:2026-11");
  t.deepEq([check?.title, check?.body, check?.href, check?.level], ["지출자 확인이 필요한 정기 항목 2건", "540,000원 · 자동·수동 반영에서 건너뛰어 반영 대기에서 뺐어요. 지출자를 확인해 주세요.", `/reserve-plans?month=2026-11&household_id=${HH}`, "info"], "2-b 3차: 알림센터에 ‘지출자 확인이 필요한 정기 항목 2건’(540,000원) 알림이 달 붙은 키로 생긴다(2차는 알림센터에 흔적이 없었다)");
  t.deepEq([shared.api.spender_check_count, shared.api.spender_check_total], [2, 540000], "2-b 3차: budget_observation 에 spender_check_count·total(2건·540,000원)");
  // 3차: 종합 리포트·스마트 도구도 낮아진 월말 예상 옆에 뺀 건수를 적는다.
  t.ok(strip(shared.htmls[1]).includes(SPENDER_NOTE_REPORT) && shared.htmls[2].includes("<small>지출자 확인 필요 2건 제외</small>"), "2-b 3차: 종합 리포트 부제와 스마트 도구 칸에 ‘지출자 확인 필요 2건 제외’");
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
  const shared = await sameForecast(fx);
  t.ok(shared.pages.every((value) => value === shared.pages[0]) && shared.pages[0] === Number(shared.api.forecast).toLocaleString("en-US") && shared.api.pending_total === 500000 && shared.pendingNotice, "2-b 지출자가 모두 자격이 있으면 네 곳이 예전처럼 대기 500,000원을 넣은 같은 월말 예상이고 반영 대기 알림이 있다");
  t.ok(!noticeOf(shared, "recurring-spender-check:2026-11") && shared.api.spender_check_count === 0 && shared.api.spender_check_total === 0 && shared.htmls.every((html) => !html.includes("지출자 확인 필요")), "2-b 3차: 그때 ‘지출자 확인’ 알림·안내는 없고 API 값은 0건·0원");
}));

// 2-c. 지출자가 없는 규칙(user_id null·빈 값): 예약 실행은 소유자로 보정하지 않고 건너뛴다(recurringSpenderEligible 에 규칙의 user_id 를 그대로 넘김).
//      화면이 대기에서 뺀 규칙 = 예약 실행이 건너뛴 규칙이고, 대기에 남긴 규칙 = 예약 실행이 넣은 규칙이다.
await at("2026-11-17", "12:00", () => fixture(async (fx) => {
  fx.db.accountbook_recurring = [rule("rule-null", 10, 40000, "rule-null", null), rule("rule-empty", 10, 40000, "rule-empty", ""), rule("rule-owner", 10, 40000, "rule-owner", "user-bin")];
  fx.db.accountbook_budgets.push({ id: "b-nov-total", household_id: HH, month: "2026-11", category: "__total", amount: 1500000, created_at: "2026-11-01T00:00:00.000Z" });
  fx.cookie = await fx.cookieFor("user-bin");
  const before = await page(fx, `/budget-alerts?household_id=${HH}&month=2026-11`);
  t.ok(before.html.includes("<span>고정지출 대기</span><b>40,000원</b><small>지출자 확인 필요 2건</small>") && before.html.includes("<b>rule-owner</b>") && !before.html.includes("<b>rule-null</b>") && !before.html.includes("<b>rule-empty</b>"), "2-c 예산 알림: 지출자 있는 규칙만 대기(40,000원), 지출자 없는 둘은 ‘지출자 확인 필요 2건’");
  const plansPage = await page(fx, `/reserve-plans?month=2026-11&household_id=${HH}`);
  t.eq((plansPage.html.match(/지출자 확인 필요 · 지출자가 활성 참여자\(소유자·관리자·구성원\)가 아니어서 자동·수동 반영에서 건너뜁니다/g) || []).length, 2, "2-c 정기 수입·지출 화면도 예전부터 같은 두 규칙을 ‘반영에서 건너뜀’ 으로 알린다(같은 판정 함수)");
  const job = await runRecurringAutoApply(fx.env, { today: "2026-11-17", lock: false });
  const made = (id) => fx.db.transactions.filter((row) => row.raw_text === `recurring:${id}:2026-11`).length;
  const marker = (id) => fx.db.accountbook_recurring.find((r) => r.id === id).last_applied_month;
  t.ok(job.ok && job.applied === 1 && job.skipped === 2 && made("rule-owner") === 1 && made("rule-null") === 0 && made("rule-empty") === 0, "2-c 예약 실행: 지출자 없는 규칙은 기록하지 않고 건너뛴다(소유자로 보정하지 않음), 지출자 있는 규칙만 넣는다");
  t.ok(marker("rule-owner") === "2026-11" && marker("rule-null") === "2026-10" && marker("rule-empty") === "2026-10", "2-c 건너뛴 규칙의 표식은 그대로라 다음 달에도 대기가 아니라 ‘지출자 확인 필요’ 다");
  const after = await page(fx, `/budget-alerts?household_id=${HH}&month=2026-11`);
  t.ok(after.html.includes("<span>고정지출 대기</span><b>0원</b><small>지출자 확인 필요 2건</small>"), "2-c 예약 실행 뒤: 대기 0원, 지출자 없는 둘은 그대로 ‘지출자 확인 필요’");
}));

// 2-d. 관측이 확인 불가(읽은 행이 한도에 걸림)인 달: 월말 예상(outlook)은 없지만 대기에서 뺀 규칙의 안내는 남는다(모델 안의 대기 차집합으로 센다).
await at("2026-11-17", "12:00", async () => {
  const input = { month: "2026-11", rows: NOV_ROWS(), budgets: [{ month: "2026-11", category: "__total", amount: 1500000 }], recurring: RULES(), plans: [], receipt: { status: "limit" } };
  const limited = buildBudgetAlertPolishModel({ ...input, members: MEMBERS });
  t.ok(limited.observation.status === "unavailable" && limited.pendingState === "complete" && !limited.outlook.notYetRecorded?.spenderCheckRules?.length, "2-d 결함 전제: 관측 확인 불가라 월말 예상 쪽에는 뺀 규칙 목록이 없다");
  t.ok(ids(limited.pendingRecurring) === "" && ids(limited.spenderCheckRecurring) === "rule-gone,rule-viewer" && limited.spenderCheckTotal === 540000, "2-d 고친 뒤: 대기에서 뺀 규칙 둘(540,000원)을 모델이 직접 센다");
  t.ok(renderPendingRecurringList(limited).includes("지출자 확인 필요 2건(540,000원)"), "2-d 고친 뒤: 대기 목록에 안내가 붙는다(고치기 전 안내 없이 사라짐)");
  const plain = buildBudgetAlertPolishModel(input);
  t.ok(ids(plain.pendingRecurring) === "rule-gone,rule-viewer" && plain.spenderCheckRecurring.length === 0 && !renderPendingRecurringList(plain).includes("지출자 확인 필요"), "2-d 참여자 목록 없이 부르면 예전처럼 둘 다 대기다");
  // 3차: 관측이 되는 달에 빈 참여자 목록을 넘기면 모델도 넘기지 않은 것과 같다.
  const complete = { ...input, receipt: null };
  const pick = (model) => [model.forecastExpense, model.pendingRecurringTotal, ids(model.pendingRecurring), model.spenderCheckRecurring.length, model.outsidePendingTotal];
  t.deepEq(pick(buildBudgetAlertPolishModel({ ...complete, members: [] })), pick(buildBudgetAlertPolishModel(complete)), "2-d 3차: 빈 참여자 목록이면 모델(월말 예상·대기·지출자 확인)이 예전 값과 같다");
});

// 2-e. (3차에 옮김) 같은 두 규칙에 지출자를 둔 예전 단정(대기 50,000원·두 건·월별 대기 알림)은 검사 d3 안에서 같은 rules·seed 로 본다.

// 2-f. 3차: 일부만 자격이 있는 달 — 대기 알림(자격 있는 1건)과 ‘지출자 확인’ 알림(2건)이 함께 뜬다. 네 곳의 월말 예상은 같다.
await at("2026-11-17", "12:00", () => fixture(async (fx) => {
  seedRules(fx);
  fx.db.accountbook_recurring.push(rule("rule-bin-pending", 25, 20000, "적금-소유자", "user-bin"));
  fx.cookie = await fx.cookieFor("user-bin");
  const shared = await sameForecast(fx);
  t.ok(shared.pages.every((value) => value === "217,647") && shared.api.forecast === 217647, "2-f 네 곳의 월말 예상이 같은 217,647원(자격 있는 대기 20,000원만 넣음)");
  const pending = noticeOf(shared, "recurring-pending:2026-11");
  const check = noticeOf(shared, "recurring-spender-check:2026-11");
  t.deepEq([pending?.title, pending?.body, check?.title, check?.body.split(" · ")[0]], ["이번 달 반영 대기 고정지출 1건", "예상 20,000원 · 한 번에 반영할 수 있어요.", "지출자 확인이 필요한 정기 항목 2건", "540,000원"], "2-f 두 알림이 함께 뜬다(대기 1건 20,000원 · 지출자 확인 2건 540,000원)");
  t.deepEq([shared.api.pending_total, shared.api.spender_check_count, shared.api.spender_check_total], [20000, 2, 540000], "2-f API 도 대기 20,000원 옆에 지출자 확인 2건·540,000원");
}));

// 2-g. 3차: 참여자 목록 읽기가 빈 목록이면 지출자 자격을 모르는 것으로 보고 거르지 않는다(예전 값, ‘지출자 확인 필요’ 없음).
//      읽기가 실패하면(throw) 이 읽기는 지출자 이름에 쓰려고 예전부터 같은 자리에 있었으므로 화면·API 가 예전처럼 안전 화면(500)으로 끝난다.
const membersRead = ({ url, method }) => method === "GET" && url.pathname.endsWith("/household_members") && url.searchParams.has("household_id") && !url.searchParams.has("user_id") && String(url.searchParams.get("select") || "").startsWith("user_id,role,created_at");
await at("2026-11-17", "12:00", () => fixture(async (fx) => {
  seedRules(fx);
  fx.cookie = await fx.cookieFor("user-bin");
  let reads = 0;
  const restore = intercept((request) => { if (!membersRead(request)) return null; reads += 1; return new Response("[]", { status: 200, headers: { "content-type": "application/json" } }); });
  let shared = null;
  let reports = "";
  try {
    shared = await sameForecast(fx);
    reports = (await page(fx, `/reports?household_id=${HH}&month=2026-11`)).html;
  } finally { restore(); }
  t.eq(reads, 5, "2-g 빈 목록을 돌려준 것은 다섯 곳(예산 알림·종합 리포트·스마트 도구·알림센터·생활비 리포트)의 참여자 목록 읽기뿐이다");
  t.ok(shared.pages.every((value) => value === "737,647") && shared.api.forecast === 737647 && shared.api.pending_total === 540000, "2-g 빈 참여자 목록: 월말 예상 737,647원·대기 540,000원 = 참여자 목록을 넘기지 않은 예전 값");
  t.ok([...shared.htmls, reports].every((html) => !html.includes("지출자 확인 필요")) && !noticeOf(shared, "recurring-spender-check:2026-11"), "2-g 빈 참여자 목록: 어느 화면에도 ‘지출자 확인 필요’ 가 없다(모든 규칙이 자격 없음이 되지 않는다)");
  t.deepEq([shared.api.spender_check_count, shared.api.spender_check_total], [null, null], "2-g 4차: 참여자를 모르면(빈 목록) API 의 spender_check_count·total 은 0 이 아니라 null 이다(3차는 0 — ‘없음’과 ‘모름’이 같았다)");
  t.eq(noticeOf(shared, "recurring-pending:2026-11")?.title, "이번 달 반영 대기 고정지출 2건", "2-g 빈 참여자 목록: 반영 대기 알림도 예전 그대로(2건)");
}));
await at("2026-11-17", "12:00", () => fixture(async (fx) => {
  seedRules(fx);
  fx.cookie = await fx.cookieFor("user-bin");
  const restore = intercept((request) => (membersRead(request) ? failure(503) : null));
  const saved = [console.log, console.error, console.warn];
  console.log = console.error = console.warn = () => {};
  const seen = [];
  try {
    for (const path of ["/budget-alerts", "/my/analysis?view=report&x=1", "/smart-tools", "/reports"]) {
      const result = await page(fx, `${path}${path.includes("?") ? "&" : "?"}household_id=${HH}&month=2026-11`);
      seen.push([result.status, result.html.includes("지출자 확인 필요")]);
    }
    const notes = await api(fx, `/u/api/notifications?household_id=${HH}&month=2026-11`);
    seen.push([notes.status, JSON.stringify(notes.data || {}).includes("spender")]);
  } finally { restore(); [console.log, console.error, console.warn] = saved; }
  t.deepEq(seen, [[500, false], [500, false], [500, false], [500, false], [500, false]], "2-g 참여자 목록 읽기 실패: 네 화면·알림센터가 예전처럼 안전 화면(500)이고 ‘자격 없음’ 값으로 그리지 않는다");
}));

// 2-h. 4차: 분류별 예산만 쓰는 달 — ‘지출자 확인 필요’ 는 그 위 대기 금액과 같은 범위(예산 안)만 센다. 예산 밖 대기 목록(예산 알림 안내·
//      월말 예상 outsidePendingRules = 홈 ‘예산에 안 넣은’ 줄)에는 자격 있는 규칙만 남고, 예산 밖의 자격 없는 규칙은 같은 안내에 따로 적는다.
const scopeRules = () => [
  rule("rule-in-gone", 12, 40000, "식비-나간지출자", "user-gone", "2026-10", { category: "식비" }),
  rule("rule-out-gone", 15, 70000, "보험-나간지출자", "user-gone", "2026-10", { category: "보험" }),
  rule("rule-in-bin", 25, 20000, "식비-소유자", "user-bin", "2026-10", { category: "식비" }),
];
await at("2026-11-17", "12:00", () => fixture(async (fx) => {
  seedRules(fx);
  fx.db.accountbook_recurring = scopeRules();
  fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((b) => b.id !== "b-nov-total");
  fx.db.accountbook_budgets.push({ id: "b-nov-food", household_id: HH, month: "2026-11", category: "식비", amount: 300000, created_at: "2026-11-01T00:00:00.000Z" });
  fx.cookie = await fx.cookieFor("user-bin");
  const shared = await sameForecast(fx);
  const alerts = shared.htmls[0];
  t.ok(alerts.includes("<span>고정지출 대기</span><b>20,000원</b><small>지출자 확인 필요 1건</small>") && alerts.includes("지출자 확인 필요 1건(40,000원)"), "2-h 대기(예산 안 20,000원) 아래 ‘지출자 확인 필요’ 는 예산 안 1건(40,000원)만 센다(2차는 예산 밖까지 2건·110,000원)");
  t.ok(!alerts.includes("예산 밖 분류의 반영 대기") && alerts.includes("<p class=\"muted\">예산 밖 지출자 확인 필요 1건(70,000원)은 반영 대기에 넣지 않았습니다.</p>"), "2-h 4차: 예산 밖의 자격 없는 보험 규칙은 ‘반영 대기’ 가 아니라 ‘예산 밖 지출자 확인 필요 1건(70,000원)’ 이다(3차는 예약 실행이 매달 건너뛰는 그 규칙을 ‘예산 밖 분류의 반영 대기 1건(70,000원)’ 으로 적었다)");
  const check = noticeOf(shared, "recurring-spender-check:2026-11");
  t.deepEq([check?.title, check?.body], ["지출자 확인이 필요한 정기 항목 2건", "110,000원 · 자동·수동 반영에서 건너뛰어 반영 대기에서 뺐어요. 지출자를 확인해 주세요."], "2-h 4차: 알림센터의 ‘지출자 확인’ 알림은 예산 안팎을 모두 센다(2건 110,000원 — 3차는 예산 안 1건뿐이라 예산 밖 규칙의 신호가 없었다)");
  t.deepEq([shared.api.forecast, shared.api.pending_total, shared.api.spender_check_count, shared.api.spender_check_total, noticeOf(shared, "recurring-pending:2026-11")?.title], [187647, 20000, 1, 40000, "이번 달 반영 대기 고정지출 1건"], "2-h API budget_observation 은 pending_total 과 같은 예산 범위다(월말 예상 187,647원 · 대기 20,000원 · 지출자 확인 1건 40,000원)");
  t.deepEq(shared.pages, ["187,647", "217,647", "217,647"], "2-h 월말 예상: 예산 알림은 예산 범위 187,647원, 종합 리포트·스마트 도구는 전체 분류 217,647원(범위가 달라 예전부터 다른 값)");
  t.ok(strip(shared.htmls[1]).includes("· 지출자 확인 필요 2건 제외") && shared.htmls[2].includes("<small>지출자 확인 필요 2건 제외</small>"), "2-h 종합 리포트·스마트 도구(전체 분류)는 뺀 규칙 2건을 적는다");
}));
await at("2026-11-17", "12:00", async () => {
  const budgets = [{ month: "2026-11", category: "식비", amount: 300000 }];
  const input = { month: "2026-11", rows: NOV_ROWS(), today: "2026-11-17", recurring: scopeRules(), plans: [], budgets, scope: "budgeted" };
  const plain = monthSpendingOutlook(input);
  const scoped = monthSpendingOutlook({ ...input, members: MEMBERS });
  t.ok(scoped.notYetRecorded.spenderCheckCount === 1 && ids(scoped.notYetRecorded.spenderCheckRules) === "rule-in-gone" && ids(scoped.notYetRecorded.pendingFixedRules) === "rule-in-bin", "2-h 월말 예상(예산 범위)의 지출자 확인 목록도 pendingFixedRules 와 같은 범위 안이다");
  t.deepEq([ids(plain.notYetRecorded.outsidePendingRules), plain.notYetRecorded.outsidePendingFixed, ids(scoped.notYetRecorded.outsidePendingRules), scoped.notYetRecorded.outsidePendingFixed], ["rule-out-gone", 70000, "", 0], "2-h 4차: 범위 밖 대기 목록(홈 ‘예산에 안 넣은 … 따로 나가요’ 줄의 출처)도 참여자 목록을 넘기면 자격 있는 규칙만이다(3차는 넘겨도 70,000원)");
  const home = homeUpcomingOut({ month: "2026-11", today: "2026-11-17", rows: NOV_ROWS(), plans: [], recurring: scopeRules(), members: MEMBERS });
  t.deepEq([home.total, home.fixedCount, home.spenderCheckCount], [20000, 1, 2], "2-h 홈 ‘앞으로 나갈 돈’(전체 분류)은 대기 20,000원 아래 지출자 확인 2건 — 예산 밖 보험 규칙의 신호가 홈에 남는다");
  const model = buildBudgetAlertPolishModel({ month: "2026-11", rows: NOV_ROWS(), budgets, recurring: scopeRules(), plans: [], members: MEMBERS });
  t.deepEq([ids(model.outsidePendingRecurring), ids(model.outsideSpenderCheckRecurring), model.outsideSpenderCheckTotal, ids(model.spenderCheckRecurring), model.spenderKnown], ["", "rule-out-gone", 70000, "rule-in-gone", true], "2-h 4차: 예산 알림 모델은 예산 밖 대기(자격 있는 규칙만)와 예산 밖 지출자 확인(보험 70,000원)을 따로 돌려준다");
  t.deepEq([null, []].map((members) => buildBudgetAlertPolishModel({ month: "2026-11", rows: NOV_ROWS(), budgets, recurring: scopeRules(), plans: [], members }).spenderKnown), [false, false], "2-h 4차: 참여자 목록이 없거나 비면 모델의 spenderKnown 은 false(API 의 spender_check_* 가 null)");
});

// 2-i. 4차: 자격 없는 보험 규칙(70,000원·20일)과 같은 금액·날짜의 정기지출 항목 — 규칙은 기록을 만들지 않으므로 항목과 짝짓지 않고,
//      항목은 목록에 남아 월말 예상에 한 번(70,000원) 들어간다. 안내·알림은 ‘반영 대기에서 뺐다’ 고만 말한다(월말 예상에서 뺐다고 하지 않는다).
const insScene = (spender) => at("2026-11-17", "12:00", () => fixture(async (fx) => {
  seedRules(fx);
  fx.db.accountbook_recurring = [rule("rule-ins", 20, 70000, "보험-나간지출자", spender, "2026-10", { category: "보험" })];
  putSetting(fx, `reserve_plans:${HH}`, JSON.stringify([{ id: "p-ins", name: "보험-나간지출자", amount: 70000, due_months: [11], due_day: 20, category: "보험" }]));
  fx.cookie = await fx.cookieFor("user-bin");
  return sameForecast(fx);
}));
{
  const gone = await insScene("user-gone");
  const kept = await insScene("user-bin");
  const alerts = gone.htmls[0];
  const note = alerts.match(/<p class="muted">지출자 확인 필요 1건\(70,000원\)[^<]*<\/p>/)?.[0] || "";
  const check = noticeOf(gone, "recurring-spender-check:2026-11");
  t.ok(alerts.includes("<li><b>보험-나간지출자</b><span>정기지출 · 보험 · 20일 납부 예정</span><strong>70,000원</strong></li>") && alerts.includes("<span>고정지출 대기</span><b>0원</b><small>지출자 확인 필요 1건</small>"), "2-i 정기지출 항목은 납부 예정으로 목록에 남고, 규칙은 대기 0원 아래 지출자 확인 1건이다");
  t.deepEq([...gone.pages, gone.api.forecast, ...kept.pages, kept.api.forecast], ["267,647", "267,647", "267,647", 267647, "267,647", "267,647", "267,647", 267647], "2-i 월말 예상은 항목 70,000원을 한 번 넣은 267,647원(항목이 없으면 197,647원 — 2-b)이고, 지출자가 자격이 있어 규칙과 짝지을 때와 같다");
  t.ok(note.includes("반영 대기에 넣지 않았습니다.") && !note.includes("월말 예상") && check?.body === "70,000원 · 자동·수동 반영에서 건너뛰어 반영 대기에서 뺐어요. 지출자를 확인해 주세요.", "2-i 4차: 안내와 알림은 ‘반영 대기에서 뺐다’ 고만 말한다(3차의 ‘…월말 예상에 넣지 않았습니다’·‘…월말 예상에서 뺐어요’ 는 항목으로 들어간 70,000원과 맞지 않았다)");
  t.deepEq([gone.api.pending_total, gone.api.spender_check_count, gone.api.spender_check_total, kept.api.pending_total, kept.api.spender_check_count], [0, 1, 70000, 70000, 0], "2-i API: 자격 없으면 대기 0원·지출자 확인 1건 70,000원, 자격 있으면 대기 70,000원·0건");
}

// 2-j. 4차: 저장된 역할이 비어(null·빈 값) 화면에는 ‘구성원’ 으로 보이는 사람이 지출자인 규칙 — 예약 실행(보정 전 역할 행)은 건너뛴다.
//      화면도 같은 판정(참여자 읽기가 붙여 둔 숨은 값)을 쓴다. 역할 보정(권한)과 직렬화는 그대로다. 역할 member 는 대조군이다.
for (const role of [null, "", "member"]) {
  const skipped = role !== "member";
  await at("2026-11-17", "12:00", () => fixture(async (fx) => {
    fx.db.users.push({ id: "user-norole", kakao_user_key: "kakao_login:2401", nickname: "역할없음", created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: HH, user_id: "user-norole", role, created_at: "2026-07-02T00:00:00.000Z" });
    fx.db.accountbook_recurring = [rule("rule-norole", 10, 30000, "역할없음-규칙", "user-norole"), rule("rule-owner", 10, 40000, "소유자-규칙", "user-bin")];
    fx.db.accountbook_budgets.push({ id: "b-nov-total", household_id: HH, month: "2026-11", category: "__total", amount: 1500000, created_at: "2026-11-01T00:00:00.000Z" });
    fx.cookie = await fx.cookieFor("user-bin");
    const members = await fetchHouseholdMembers(fx.env, HH);
    const person = members.find((m) => m.user_id === "user-norole");
    t.ok(person.role === "member" && person.recurringSpender === !skipped && !Object.keys(person).includes("recurringSpender") && !JSON.stringify(members).includes("recurringSpender"), `2-j 역할 ${JSON.stringify(role)}: 참여자 읽기의 role 은 예전처럼 ‘member’(권한 보정 그대로), 지출자 판정은 예약 실행과 같은 값을 열거되지 않게 붙인다`);
    const alerts = await page(fx, `/budget-alerts?household_id=${HH}&month=2026-11`);
    const obs = (await api(fx, `/u/api/notifications?household_id=${HH}&month=2026-11`)).data.budget_observation;
    const job = await runRecurringAutoApply(fx.env, { today: "2026-11-17", lock: false });
    const made = (id) => fx.db.transactions.filter((row) => row.raw_text === `recurring:${id}:2026-11`).length;
    const screen = [alerts.html.includes(skipped ? "<span>고정지출 대기</span><b>40,000원</b><small>지출자 확인 필요 1건</small>" : "<span>고정지출 대기</span><b>70,000원</b></div>"), alerts.html.includes("<b>역할없음-규칙</b>"), obs.pending_total, obs.spender_check_count];
    t.deepEq(screen, skipped ? [true, false, 40000, 1] : [true, true, 70000, 0], `2-j 역할 ${JSON.stringify(role)}: 예산 알림·API 는 ${skipped ? "그 규칙을 대기(3차: 70,000원·목록에 있음)가 아니라 지출자 확인 1건으로 센다" : "예전처럼 두 규칙을 대기로 센다"}`);
    t.deepEq([job.applied, job.skipped, made("rule-norole"), made("rule-owner")], skipped ? [1, 1, 0, 1] : [2, 0, 1, 1], `2-j 역할 ${JSON.stringify(role)}: 예약 실행도 ${skipped ? "그 규칙을 건너뛴다" : "두 규칙을 넣는다"}(화면과 같은 판정)`);
  }));
}

// 2-k. 4차: 예산이 하나도 없는 달(2-b 자료에서 예산 행을 모두 지움) — 모델(inBudget)과 월말 예상(inScope)이 모두 전체 분류라
//      예산 알림·알림센터 API·종합 리포트·스마트 도구가 같은 월말 예상과 같은 지출자 확인 건수를 말한다.
await at("2026-11-17", "12:00", () => fixture(async (fx) => {
  seedRules(fx);
  fx.db.accountbook_budgets = [];
  fx.cookie = await fx.cookieFor("user-bin");
  const shared = await sameForecast(fx);
  const check = noticeOf(shared, "recurring-spender-check:2026-11");
  t.deepEq(shared.pages, ["197,647", "197,647", "197,647"], "2-k 예산 없음: 예산 알림·종합 리포트·스마트 도구의 월말 예상이 같은 197,647원");
  t.ok(shared.htmls[0].includes("<span>고정지출 대기</span><b>0원</b><small>지출자 확인 필요 2건</small>") && shared.htmls[0].includes("지출자 확인 필요 2건(540,000원)") && strip(shared.htmls[1]).includes("· 지출자 확인 필요 2건 제외") && shared.htmls[2].includes("<small>지출자 확인 필요 2건 제외</small>"), "2-k 예산 없음: 세 화면이 같은 지출자 확인 2건을 말한다");
  t.deepEq([shared.api.forecast, shared.api.pending_total, shared.api.spender_check_count, shared.api.spender_check_total, check?.title, check?.body.split(" · ")[0]], [197647, 0, 2, 540000, "지출자 확인이 필요한 정기 항목 2건", "540,000원"], "2-k 예산 없음: 알림센터 API·알림도 같은 월말 예상·2건 540,000원");
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
  // 3 C. 옛 음수 지출 행이 있는 달: 환불 연결이 꺼져 있으면(차감 목록 빔) 기록·등록액이 예전 식(지출 합 − 차감 합)과 같다.
  t.deepEq([refundDeductionApplied(-5000, []).applied, refundDeductionApplied(-5000, [{ amount: 1000 }]).applied, refundDeductionApplied(30000, []).applied], [0, 0, 0], "3 C 지출 합이 음수이거나 차감 목록이 비면 차감은 0 이다");
  const row = (id, date, amount) => ({ id, household_id: "h", transaction_date: date, type: "expense", amount, category: "식비", source: "web" });
  const oldExpression = (rows, deductions, today) => {
    const total = (list) => list.reduce((acc, item) => acc + Number(item.amount || 0), 0);
    return [total(rows.filter((r) => r.transaction_date <= today)) - total(deductions.filter((d) => d.transaction_date <= today)), total(rows) - total(deductions)];
  };
  for (const [label, rows] of [["음수 행만", [row("n1", "2026-11-02", -5000)]], ["양수·음수 섞임", [row("p1", "2026-11-03", 30000), row("n1", "2026-11-02", -5000)]], ["오늘 뒤 음수 행", [row("p1", "2026-11-03", 30000), row("n2", "2026-11-20", -8000)]]]) {
    for (const scope of ["all", "budgeted"]) {
      const out = monthSpendingOutlook({ month: "2026-11", today: "2026-11-05", rows, recurring: [], plans: [], budgets: scope === "budgeted" ? budgets : [], scope, refundDeductions: [] });
      t.deepEq([out.recorded.toDate, out.recorded.registered, out.recorded.refundDeduction], [...oldExpression(rows, [], "2026-11-05"), 0], `3 C ${label}(${scope}): 환불 연결 꺼짐이면 예전 식과 같다`);
    }
  }
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
