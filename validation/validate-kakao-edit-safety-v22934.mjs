// V22.9.34 — 카카오 수정·삭제·복구 안전성(감사 AUDIT_FINDINGS_V22_9_33 1절)을 고정한다.
//   N1·D4 풀리지 않는 날짜 접두·00번은 거절   D3 날짜 붙은 레거시 수정은 새 기록이 아니다
//   T2 안내·답장에 날짜와 기록 이름, 결과 모름은 "먼저 확인"   S1 복구 버퍼 엄격 읽기 + 잠금
//   N3·T11 수정 금액 20억 상한   N4·D5 풀리지 않는 수정 날짜는 다시 묻는다
//   T4 결과 모르는 복구는 id 로 확인   T12 다른 가계부 복구 거절·source 보존·지출자 규칙
//   T6 만료 세션은 없는 것으로, 세션 중 분명한 새 지출은 기록
// 메모리 픽스처만 쓴다. 날짜는 고정 시계(KST 2026-07-15)로 잰다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, { kakaoGroupLinkItemSettingsKey } from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const COLLECT = process.env.COLLECT === "1"; // 조사용: 실패를 모아 끝에 보여 준다
const failures = [];
let checks = 0;
const ok = (value, message) => { if (COLLECT && !value) failures.push(message); else assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { if (COLLECT && actual !== expected) failures.push(`${message} (actual ${actual})`); else assert.equal(actual, expected, message); checks += 1; };

const BASE = "https://malhaebook.com";
const ctx = { waitUntil() {}, passThroughOnException() {} };
const BIN = "kakao_login:2265";
const WIFI = "kakao_login:2266";
const TODAY = "2026-07-15";
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

const withClock = async (task) => {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${TODAY}T12:00:00+09:00`);
  try { return await task(); } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
};
const row = (id, date, memo, amount, extra = {}) => ({ id, household_id: "house-home", user_id: "user-bin", source_user_key: BIN, transaction_date: date, type: "expense", amount, category: "식비", memo, payment_method: "현금", source: "kakao_skill", raw_text: `${memo} ${amount}`, created_at: `${date}T0${extra.h || 1}:00:00.000Z`, ...extra, h: undefined });
const fixture = (task) => withClock(async () => {
  const fx = await createV2265QaFixture();
  fx.env.SKILL_RATE_LIMIT = 10000;
  fx.db.accountbook_settings.push(
    { id: "sel-bin", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: "2026-07-01T00:00:00Z" },
    { id: "sel-wifi", key: "kakao_selected_household_v2251:user-wifi", value: "house-home", created_at: "2026-07-01T00:00:00Z" },
  );
  fx.db.transactions.push(
    row("k1", TODAY, "저녁", 30000, { h: 1 }), row("k2", TODAY, "커피", 5000, { h: 2 }), row("k3", TODAY, "빵", 8000, { h: 3 }),
    row("y1", "2026-07-14", "어제 간식", 6600, { h: 1 }), row("d1", "2026-07-13", "그제 점심", 8000, { h: 1 }),
  );
  try { return await task(fx); } finally { fx.restore(); }
});
const skill = async (fx, utterance, { userKey = BIN, groupKey = "" } = {}) => {
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intent: { id: "i1", name: "블록" },
      userRequest: { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user: { id: userKey, type: "botUserKey", properties: { botUserKey: userKey, ...(groupKey ? { botGroupKey: groupKey } : {}) } } },
      bot: { id: "bot1", name: "말해가계부" },
      action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} },
      contexts: [],
    }),
  }), fx.env, ctx);
  const data = JSON.parse(await response.text());
  return { text: String(data?.template?.outputs?.map((o) => o?.simpleText?.text || "").join("\n") || ""), data };
};
const say = async (fx, utterance, options) => (await skill(fx, utterance, options)).text;
const tx = (fx, id) => fx.db.transactions.find((t) => t.id === id) || null;
const undoRow = (fx) => fx.db.accountbook_settings.find((r) => String(r.key).startsWith("kakao_edit_undo_v4:"));
const undoCount = (fx) => { try { return JSON.parse(undoRow(fx)?.value || "{}").items?.length || 0; } catch (_) { return -1; } };
const sessionRow = (fx) => fx.db.accountbook_settings.find((r) => String(r.key).startsWith("kakao_edit_v4:"));
const hookFetch = (fx, hook) => { const inner = globalThis.fetch; globalThis.fetch = (input, init = {}) => hook(inner, new URL(typeof input === "string" ? input : input.url), String(init.method || "GET").toUpperCase(), input, init); return () => { globalThis.fetch = inner; }; };
const lostAfterCommit = (matcher) => async (inner, url, method, input, init) => { const res = await inner(input, init); if (matcher.armed > 0 && matcher.test(url, method)) { matcher.armed -= 1; return new Response("{}", { status: 503 }); } return res; };

// ── N1·D4 날짜 접두·번호 ─────────────────────────────────────────────
await fixture(async (fx) => {
  for (const command of ["6월 31일 삭제 01번", "엊그제 01번 삭제", "2월 30일 01번 삭제", "13월 1일 01번 삭제"]) {
    const text = await say(fx, command);
    ok(text.includes("날짜를 알아듣지 못해서 아무것도 바꾸지 않았어요"), `N1 '${command}' 는 거절한다 (${text.split("\n")[0]})`);
  }
  ok(tx(fx, "k1") && tx(fx, "d1"), "N1 풀리지 않는 날짜 접두가 오늘 01번도, 그제 01번도 지우지 않는다");
  ok((await say(fx, "삭제 00번")).includes("번호는 01번부터예요") && tx(fx, "k1"), "N1 '삭제 00번' 은 01번을 지우지 않는다");
  ok((await say(fx, "수정 00번 금액 5000")).includes("번호는 01번부터예요"), "N1 '수정 00번' 을 거절한다");
  eq(tx(fx, "k1")?.amount, 30000, "N1 '수정 00번 금액 5000' 이 01번 금액을 바꾸지 않는다");
  const dated = await say(fx, "그제 01번 삭제");
  ok(!tx(fx, "d1") && tx(fx, "k1") && dated.includes("7월 13일 01번 기록을 삭제했어요") && dated.includes("그제 점심"), "N1 풀리는 접두(그제)는 그날 01번을 지우고 날짜와 이름을 말한다");
  ok((await say(fx, "복구 00번")).includes("번호는 01번부터예요") && !tx(fx, "d1"), "N1 '복구 00번' 은 가장 최근 삭제를 되살리지 않는다");
});

// ── D3 날짜 붙은 레거시 수정·삭제 ──────────────────────────────────
await fixture(async (fx) => {
  const count = () => fx.db.transactions.length;
  let before = count();
  ok((await say(fx, "어제 01번 금액 5000")).includes("변경했어요"), "D3 '어제 01번 금액 5000' 은 수정이다");
  ok(tx(fx, "y1")?.amount === 5000 && tx(fx, "k1")?.amount === 30000 && count() === before, "D3 어제 01번만 바뀌고 새 기록이 없다");
  before = count();
  await say(fx, "7/14 01번 삭제");
  ok(!tx(fx, "y1") && count() === before - 1, "D3 '7/14 01번 삭제' 는 어제 01번을 지우고 7원·14원 기록을 만들지 않는다");
  before = count();
  ok((await say(fx, "7-13 01번 삭제")).includes("날짜를 알아듣지 못해서") && tx(fx, "d1") && count() === before, "D3 'M-D' 접두는 거절하고 아무것도 만들지 않는다");
  ok((await say(fx, "지난주 금요일 01번 금액 5000")).includes("새 기록으로 저장하지 않았어요") && count() === before, "D3 수정 문법이 모르는 날짜 접두라도 새 기록으로 저장하지 않는다");
  ok((await say(fx, "3번 버스 1500원")).includes("저장했어요") && count() === before + 1, "D3 '3번 버스 1500원' 은 계속 기록이다");
});

// ── T2 안내의 날짜·답장의 기록 이름·결과 모름 ─────────────────────────
await fixture(async (fx) => {
  const saved = await say(fx, "어제 택시 15000원 현금");
  const hint = (saved.match(/수정: "(7월 14일 수정 \d{2}번)"/) || [])[1];
  ok(hint && /삭제: "7월 14일 삭제 \d{2}번"/.test(saved), `T2 어제 기록의 저장 안내에 날짜가 붙는다 (${hint})`);
  ok((await say(fx, `${hint} 금액 13000`)).includes("변경했어요"), "T2 안내를 그대로 따르면 수정된다");
  const taxi = fx.db.transactions.find((t) => t.memo === "택시") || {};
  ok(taxi.amount === 13000 && tx(fx, "k1")?.amount === 30000, "T2 안내를 따르면 오늘 01번이 아니라 어제 기록이 바뀐다");
  const list = await say(fx, "어제 기록 보기");
  ok(list.includes(`삭제: "7월 14일 삭제 01번"`), "T2 어제 목록의 안내에도 날짜가 붙는다");
  const today = await say(fx, "김밥 4500원 현금");
  ok(/수정: "수정 \d{2}번" 또는 "수정 \d{2}번 금액 13000"/.test(today), "T2 오늘 기록 안내는 예전 모양 그대로다");
  const deleted = await say(fx, "삭제 02번");
  ok(deleted.includes("02번 - 커피") && deleted.includes("복구 02번"), "T2 삭제 답장이 지운 기록을 말한다");
  ok((await say(fx, "수정 01번 금액 13000")).includes("기록: 저녁 / 13,000원"), "T2 수정 답장이 바뀐 기록을 말한다");
});
await fixture(async (fx) => {
  const lost = { armed: 1, test: (url, method) => method === "DELETE" && url.pathname === "/rest/v1/transactions" };
  const unhook = hookFetch(fx, lostAfterCommit(lost));
  let text = "";
  try { text = await say(fx, "삭제 02번"); } finally { unhook(); }
  ok(text.includes("삭제 결과를 확인하지 못했어요") && text.includes("먼저 확인") && !text.includes("다시 보내주세요"), `T2 결과 모르는 삭제는 다시 보내라고 하지 않는다 (${text.split("\n")[0]})`);
  ok(text.includes("커피") && text.includes("복구 02번"), "T2 결과 모르는 삭제 답장이 기록 이름과 복구 방법을 말한다");
});
await fixture(async (fx) => {
  const lost = { armed: 1, test: (url) => url.pathname.endsWith("/accountbook_update_transaction_v227") };
  const unhook = hookFetch(fx, lostAfterCommit(lost));
  let text = "";
  try { text = await say(fx, "수정 01번 날짜 어제"); } finally { unhook(); }
  ok(text.includes("수정 결과를 확인하지 못했어요") && text.includes("먼저 확인"), "T2 결과 모르는 수정도 먼저 확인하라고 한다");
  ok(!String(sessionRow(fx)?.value || "").trim(), "T2 결과 모르는 수정 뒤 세션을 남기지 않는다");
});

// ── S1 복구 버퍼 엄격 읽기·잠금 ─────────────────────────────────────
await fixture(async (fx) => {
  await say(fx, "삭제 01번");
  await say(fx, "삭제 01번");
  eq(undoCount(fx), 2, "S1 두 번 지우면 버퍼에 두 건이 있다");
  fx.db.__fail_settings_read_key = undoRow(fx)?.key || "";
  const refused = await say(fx, "삭제 01번");
  fx.db.__fail_settings_read_key = "";
  ok(refused.includes("기록을 지우지 않았어요") && tx(fx, "k3"), "S1 버퍼를 읽지 못하면 지우지 않는다");
  eq(undoCount(fx), 2, "S1 읽기 실패가 버퍼를 덮어쓰지 않는다");
  ok(fx.db.__rpc_calls.some((call) => call.name === "accountbook_claim_operation" && String(call.data.p_key || "").startsWith("kakao-edit-undo-rmw:")), "S1 삭제가 버퍼 잠금을 잡는다");
  ok((await say(fx, "복구")).includes("커피") && (await say(fx, "복구")).includes("저녁"), "S1 앞서 지운 두 건이 모두 되살아난다");
});
await fixture(async (fx) => {
  await say(fx, "삭제 03번");
  if (undoRow(fx)) undoRow(fx).value = "{broken";
  ok((await say(fx, "삭제 01번")).includes("기록을 지우지 않았어요") && tx(fx, "k1") && undoRow(fx)?.value === "{broken", "S1 깨진 버퍼를 덮어쓰지 않고 지우지도 않는다");
});
await fixture(async (fx) => {
  const unhook = hookFetch(fx, async (inner, url, method, input, init) => { await new Promise((r) => setTimeout(r, 2 + Math.random() * 6)); return inner(input, init); });
  try { await Promise.all([say(fx, "삭제 01번"), say(fx, "삭제 03번")]); } finally { unhook(); }
  eq(undoCount(fx), 2, "S1 동시에 지운 두 건이 모두 버퍼에 남는다");
});
await fixture(async (fx) => {
  await say(fx, "삭제 02번");
  await say(fx, "삭제 01번");
  ok((await say(fx, "복구 01번")).includes("저녁"), "S1 복구 01번");
  eq(undoCount(fx), 1, "S1 복구는 그 한 건만 버퍼에서 뺀다");
  fx.db.__fail_settings_read_key = undoRow(fx)?.key || "";
  const delayed = await say(fx, "복구 02번");
  fx.db.__fail_settings_read_key = "";
  ok(delayed.includes("복구가 잠시 지연") && !delayed.includes("복구할 삭제 기록이 없어요"), "S1 버퍼를 못 읽으면 '없어요'가 아니라 지연이라고 한다");
  ok((await say(fx, "복구 02번")).includes("커피"), "S1 읽기가 돌아오면 남은 한 건도 되살아난다");
});

// ── N3·T11 금액 상한 ────────────────────────────────────────────────
await fixture(async (fx) => {
  ok((await say(fx, "수정 01번 금액 2000000001")).includes("금액이 너무 커서 바꾸지 않았어요") && tx(fx, "k1")?.amount === 30000, "N3 20억 초과 한 줄 수정은 저장하지 않는다");
  await say(fx, "취소");
  ok((await say(fx, "수정 01번 금액 30억")).includes("금액이 너무 커서") && tx(fx, "k1")?.amount === 30000, "N3 '30억' 표기도 막는다");
  await say(fx, "취소");
  await say(fx, "수정 02번");
  await say(fx, "1");
  ok((await say(fx, "30000000000원")).includes("금액이 너무 커서") && tx(fx, "k2")?.amount === 5000, "N3 메뉴 경로도 막는다");
  await say(fx, "취소");
  ok((await say(fx, "수정 01번 금액 2000000000")).includes("변경했어요") && tx(fx, "k1")?.amount === 2000000000, "N3 20억은 경계값으로 받는다");
  ok(source.includes('if (out.amount !== undefined && out.amount > MAX_TRANSACTION_AMOUNT) throw new Error("amount_too_large");'), "N3 sanitizeTransactionBody 도 같은 상한을 둔다");
  ok(source.includes('if (date && !isValidTransactionDateString(date)) throw new Error("invalid_transaction_date");'), "N4 sanitizeTransactionBody 가 달력에 없는 날짜를 오늘로 바꾸지 않는다");
});

// ── N4·D5 수정 날짜 ────────────────────────────────────────────────
await fixture(async (fx) => {
  const first = await say(fx, "어제 수정 01번 날짜 2월 30일");
  ok(first.includes("날짜로 알아듣지 못했어요") && first.includes("기록은 그대로예요") && tx(fx, "y1")?.transaction_date === "2026-07-14", "N4 달력에 없는 날짜는 오늘로 바꾸지 않고 다시 묻는다");
  ok(JSON.parse(sessionRow(fx)?.value || "{}").field === "date", "N4 다시 묻는 동안 날짜 입력을 기다린다");
  ok((await say(fx, "아무날")).includes("날짜로 알아듣지 못했어요"), "N4 풀리지 않는 말도 다시 묻는다");
  ok((await say(fx, "엊그제")).includes("수정을 끝냈어요") && tx(fx, "y1")?.transaction_date === "2026-07-14", "N4 세 번째 실패에서 끝내고 기록은 그대로다");
  ok((await say(fx, "어제 수정 01번 날짜 7월 4일")).includes("날짜를 2026-07-04로 변경했어요") && tx(fx, "y1")?.transaction_date === "2026-07-04", "N4 풀리는 날짜는 실제 날짜로 답한다");
});

// ── T4 결과 모르는 복구 ─────────────────────────────────────────────
await fixture(async (fx) => {
  await say(fx, "삭제 02번");
  const lost = { armed: 1, test: (url, method) => method === "POST" && url.pathname === "/rest/v1/transactions" };
  const unhook = hookFetch(fx, lostAfterCommit(lost));
  let text = "";
  try { text = await say(fx, "복구 02번"); } finally { unhook(); }
  eq(fx.db.transactions.filter((t) => t.memo === "커피").length, 1, `T4 응답을 잃은 복구가 같은 기록을 두 번 만들지 않는다 (${text.split("\n")[0]})`);
  ok(tx(fx, "k2"), "T4 되살린 기록은 원래 id 를 지킨다");
});
await fixture(async (fx) => {
  await say(fx, "삭제 02번");
  const unhook = hookFetch(fx, async (inner, url, method, input, init) => {
    await new Promise((r) => setTimeout(r, 2 + Math.random() * 6));
    if (method === "POST" && url.pathname === "/rest/v1/transactions") {
      const items = [].concat(JSON.parse(String(init.body || "null")) || []);
      if (items.some((item) => item.id && fx.db.transactions.some((t) => t.id === item.id))) return new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }), { status: 409 });
    }
    return inner(input, init);
  });
  try { await Promise.all([say(fx, "복구 02번"), say(fx, "복구 02번")]); } finally { unhook(); }
  eq(fx.db.transactions.filter((t) => t.memo === "커피").length, 1, "T4 겹친 두 복구도 한 건만 만든다");
});

// ── T12 복구 범위·source·지출자 ─────────────────────────────────────
await fixture(async (fx) => {
  fx.db.__honor_select = true;
  await say(fx, "삭제 02번");
  await say(fx, "복구 02번");
  eq(tx(fx, "k2")?.source, "kakao_skill", "T12 되살린 기록이 source 를 지킨다(운영처럼 select 한 칸만 받을 때)");
});
await fixture(async (fx) => {
  fx.db.households.push({ id: "house-wifi", name: "WIFI 개인", invite_code: "WIFI2265", created_at: "2026-07-01T00:00:00Z" });
  fx.db.household_members.push({ household_id: "house-wifi", user_id: "user-wifi", role: "owner", created_at: "2026-07-01T00:00:00Z" });
  fx.db.transactions.push(row("w1", TODAY, "와이파이 빵", 8000, { h: 4, user_id: "user-wifi", source_user_key: WIFI }));
  await say(fx, "삭제 01번", { userKey: WIFI });
  fx.db.household_members = fx.db.household_members.filter((m) => !(m.household_id === "house-home" && m.user_id === "user-wifi"));
  fx.db.accountbook_settings.find((s) => s.key === "kakao_selected_household_v2251:user-wifi").value = "house-wifi";
  const text = await say(fx, "복구 01번", { userKey: WIFI });
  ok(text.includes("되살리지 않았어요") && !tx(fx, "w1"), "T12 나간 가계부에는 기록을 되살리지 않는다");
});
await fixture(async (fx) => {
  fx.db.transactions.push(row("w1", TODAY, "와이파이 빵", 8000, { h: 4, user_id: "user-wifi", source_user_key: WIFI }));
  ok((await say(fx, "수정 01번 지출자 Bin", { userKey: WIFI })).includes("소유자·관리자만") && tx(fx, "w1")?.user_id === "user-wifi", "T12 일반 참여자는 웹처럼 지출자를 바꿀 수 없다");
  ok((await say(fx, "수정 01번 지출자 WIFI♥")).includes("변경했어요") && tx(fx, "k1")?.user_id === "user-wifi", "T12 소유자는 지출자를 바꿀 수 있다");
});

// ── T6 세션 ────────────────────────────────────────────────────────
const ageSession = (fx, ms) => { const r = sessionRow(fx); const s = JSON.parse(r.value); s.updatedAt = Date.now() - ms; r.value = JSON.stringify(s); };
await fixture(async (fx) => {
  await say(fx, "수정 01번");
  ageSession(fx, 6 * 3600 * 1000);
  const text = await say(fx, "점심 12000원 국민카드");
  ok(text.includes("저장했어요") && !text.includes("수정 시간이 지나"), "T6 만료 세션이 새 지출을 삼키지 않는다");
  eq(fx.db.transactions.filter((t) => t.memo === "점심").length, 1, "T6 첫 시도에 저장된다");
});
await fixture(async (fx) => {
  await say(fx, "수정 01번");
  ageSession(fx, 6 * 3600 * 1000);
  ok((await say(fx, "오늘 기록 보기")).includes("🧾 2026-07-15 기록"), "T6 만료 세션이 조회 명령도 삼키지 않는다");
});
await fixture(async (fx) => {
  await say(fx, "수정 01번");
  const text = await say(fx, "점심 12000원 국민카드");
  ok(text.includes("01번 수정은 끝내고") && text.includes("저장했어요"), "T6 세션 중 분명한 새 지출은 세션을 끝내고 저장한다");
  ok(tx(fx, "k1")?.payment_method === "현금" && fx.db.transactions.some((t) => t.memo === "점심" && Number(t.amount) === 12000), "T6 결제수단이 문장으로 바뀌지 않고 새 기록이 생긴다");
  await say(fx, "수정 01번");
  ok((await say(fx, "금액 13000")).includes("변경했어요") && tx(fx, "k1")?.amount === 13000, "T6 항목 이름으로 시작하면 여전히 수정이다");
  await say(fx, "수정 01번");
  await say(fx, "돈까스 12000원");
  ok(tx(fx, "k1")?.amount === 13000 && fx.db.transactions.some((t) => t.memo === "돈까스"), "T6 '돈까스'의 '돈'을 금액 항목으로 읽지 않는다");
});
await fixture(async (fx) => {
  const group = "qa-room-v22934";
  fx.db.accountbook_settings.push({ id: "room", key: kakaoGroupLinkItemSettingsKey(group), value: JSON.stringify({ group_key: group, household_id: "house-home", household_name: "우리집 생활비" }), created_at: "2026-07-01T00:00:00Z" });
  await say(fx, "수정 01번", { groupKey: group });
  const reply = await skill(fx, "점심 12000원 국민카드", { groupKey: group });
  ok(reply.text.includes("저장했어요") && !Object.hasOwn(reply.data.template || {}, "quickReplies"), "T6 단톡방에서도 새 지출을 저장하고 QuickReplies 를 붙이지 않는다");
});

// ── 함께 고친 작은 문제 ─────────────────────────────────────────────
await fixture(async (fx) => {
  ok((await say(fx, "수정 01번 금액 9999")).includes("9,999원으로 변경했어요"), "조사: 9로 끝나는 금액도 '원으로'다");
  ok((await say(fx, "6월 31일 기록")).includes("달력에 없는 날짜"), "달력에 없는 날의 목록은 빈 날짜 머리말 대신 이유를 말한다");
});

if (COLLECT) { console.log(`FAILED ${failures.length}/${checks}`); for (const f of failures) console.log(` - ${f}`); }
else console.log(`V22.9.34 카카오 수정·삭제·복구 안전 검사 통과 (${checks} checks)`);
