import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.96-HOME-TAB-STOPS"'), "runtime exposes the edit and restore fix release");

// 1. 날짜 힌트는 명령 접두부에서만 읽는다.
ok(source.includes("function splitKakaoEditDatePrefixV4("), "edit commands read the date hint from a dedicated prefix splitter");
ok(!/const explicitDate = hasDateHint\(raw\) \? extractDate\(raw\) : "";/.test(source), "the whole-utterance date hint is gone");
// 2. 복구 버퍼는 여러 건을 담는다.
ok(source.includes("const KAKAO_EDIT_UNDO_MAX = 10"), "the undo buffer keeps more than one deletion");
ok(source.includes("function kakaoEditUndoItemsV4("), "the undo buffer still reads the previous single-slot shape");
// 3. 금액 수정은 입력과 같은 표기를 받는다.
ok(source.includes("function normalizeKakaoEditAmountValue("), "amount edits reuse the input path's amount extractor");
ok(!source.includes("얼마로 바꿀까요? 숫자만 보내주세요"), "the digits-only amount prompt is gone");

const ORIGIN = "https://ttokttok-accountbook.com";
const USER = "kakao_login:2265";

async function say(fixture, utterance) {
  const payload = {
    userRequest: { utterance, user: { id: USER, properties: {} } },
    action: { params: {}, detailParams: {} },
    bot: { id: "bot" },
    intent: { id: "intent", name: "폴백블록" },
  };
  const response = await app.fetch(new Request(`${ORIGIN}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }), fixture.env, {});
  const raw = await response.text();
  try { return String(JSON.parse(raw)?.template?.outputs?.[0]?.simpleText?.text || raw); } catch (_error) { return raw; }
}

// 응답 문구가 아니라 저장된 행을 읽는다. "변경했어요"만 보고 넘어가면
// 엉뚱한 기록을 고쳐도 통과한다.
const at = (fixture, base, offset) => fixture.db.transactions[base + offset] || null;
const todayRows = (fixture, base) => fixture.db.transactions.slice(base);

const fixture = await createV2265QaFixture();
try {
  // 한 사용자로 100건 넘게 보낸다. 분당 60건 상한(별도 검사에서 확인)에 걸리면
  // 수정 흐름이 아니라 리미터를 재게 되므로 여기서만 상한을 올린다.
  fixture.env.SKILL_RATE_LIMIT = 10000;
  await say(fixture, "안녕");
  ok((await say(fixture, "2")).includes("선택했어요"), "가계부를 선택할 수 있다");

  // ── 왕복 기본 ────────────────────────────────────────────────
  const base = fixture.db.transactions.length;
  for (const utterance of ["점심 9000", "커피 4500", "택시 12000 카드"]) await say(fixture, utterance);
  eq(fixture.db.transactions.length - base, 3, "기록 3건이 저장된다");

  eq((await say(fixture, "수정 01번 금액 13000")).includes("변경했어요"), true, "금액 수정이 성공 응답을 준다");
  eq(at(fixture, base, 0).amount, 13000, "금액 수정이 저장값에 반영된다");

  await say(fixture, "수정 02번 내용 아이스아메리카노");
  eq(at(fixture, base, 1).memo, "아이스아메리카노", "내용 수정이 저장값에 반영된다");

  await say(fixture, "수정 03번 결제수단 현금");
  eq(at(fixture, base, 2).payment_method, "현금", "결제수단 수정이 저장값에 반영된다");

  await say(fixture, "수정 03번 분류 교통/차량");
  eq(at(fixture, base, 2).category, "교통/차량", "분류 수정이 저장값에 반영된다");

  // ── 날짜 수정: 값이 대상 날짜로 새지 않는다 ────────────────────
  // "수정 01번 날짜 어제"의 `어제`는 바꿀 값이다. 대상 기록의 날짜로 읽으면
  // 어제의 01번을 건드리고도 "변경했어요"라고 답한다.
  const dateBase = fixture.db.transactions.length;
  await say(fixture, "어제 도넛 2200");
  const yesterdayMemo = at(fixture, dateBase, 0)?.memo;
  eq(yesterdayMemo, "도넛", "어제 기록이 만들어진다");
  const yesterdayDate = at(fixture, dateBase, 0)?.transaction_date;

  const todayDate = at(fixture, base, 0)?.transaction_date;
  ok(todayDate !== yesterdayDate, "오늘과 어제가 서로 다른 날짜다");

  // 접두 날짜는 계속 대상 지정으로 동작한다. 어제에 기록이 하나뿐인 지금 확인한다.
  await say(fixture, "어제 수정 01번 금액 5000");
  eq(at(fixture, dateBase, 0).amount, 5000, "접두 날짜는 대상 기록을 고른다");
  eq(at(fixture, base, 0).amount, 13000, "접두 날짜 명령이 오늘 기록을 건드리지 않는다");

  ok((await say(fixture, "수정 01번 날짜 어제")).includes("변경했어요"), "날짜 수정이 성공 응답을 준다");
  eq(at(fixture, base, 0).transaction_date, yesterdayDate, "오늘 01번의 날짜가 실제로 어제로 바뀐다");
  eq(at(fixture, dateBase, 0).transaction_date, yesterdayDate, "어제 기록은 건드리지 않는다");
  eq(at(fixture, dateBase, 0).memo, "도넛", "어제 01번의 내용이 그대로다");
  eq(at(fixture, dateBase, 0).amount, 5000, "어제 01번의 금액이 그대로다");

  // ── 금액 표기: 입력과 수정이 같은 말을 받는다 ──────────────────
  // 앞선 날짜 수정으로 오늘 목록이 밀렸다. 번호를 굳혀 두면 엉뚱한 행을 재게 되므로
  // 새로 넣은 기록의 실제 번호를 오늘 행 수로 계산한다.
  const today = at(fixture, base, 1)?.transaction_date;
  const seqOf = (memo) => fixture.db.transactions.filter((row) => row.transaction_date === today).findIndex((row) => row.memo === memo) + 1;
  const amountBase = fixture.db.transactions.length;
  await say(fixture, "가나 1000");
  const amountNo = String(seqOf("가나")).padStart(2, "0");
  ok(Number(amountNo) > 0, `금액 검사 대상의 번호를 찾는다 (${amountNo}번)`);
  for (const [notation, expected] of [
    ["3만5천원", 35000],
    ["6만원", 60000],
    ["1만5천", 15000],
    ["12,345", 12345],
    ["100,000원", 100000],
    ["7500", 7500],
  ]) {
    const command = `수정 ${amountNo}번 금액 ${notation}`;
    const text = await say(fixture, command);
    ok(text.includes("변경했어요"), `"${command}" 가 받아들여진다 (${text.split("\n")[0].slice(0, 40)})`);
    eq(at(fixture, amountBase, 0).amount, expected, `"${command}" 가 저장값에 반영된다`);
  }
  // 금액이 아닌 값은 계속 거절한다.
  const badAmount = await say(fixture, `수정 ${amountNo}번 금액 사과`);
  eq(at(fixture, amountBase, 0).amount, 7500, "금액이 아닌 값은 저장을 바꾸지 않는다");
  ok(!badAmount.includes("변경했어요"), "금액이 아닌 값은 성공이라고 답하지 않는다");
  await say(fixture, "취소");

  // 메뉴 경로도 같은 표기를 받는다.
  await say(fixture, `수정 ${amountNo}번`);
  ok((await say(fixture, "1")).includes("얼마로"), "메뉴에서 금액을 고를 수 있다");
  ok((await say(fixture, "3만5천원")).includes("변경했어요"), "메뉴 경로도 단위 표기를 받는다");
  eq(at(fixture, amountBase, 0).amount, 35000, "메뉴 경로의 단위 표기가 저장값에 반영된다");

  // ── 연속 삭제 후 복구 ─────────────────────────────────────────
  // 삭제마다 "복구 NN번"이라고 안내하므로, 안내한 건 모두 되돌릴 수 있어야 한다.
  for (const utterance of ["가가 1100", "나나 2200", "다다 3300"]) await say(fixture, utterance);
  const beforeDelete = fixture.db.transactions.length;
  // 삭제·복구는 배열 끝에 다시 붙으므로 위치가 아니라 "내용의 집합"으로 대조한다.
  const memosBefore = todayRows(fixture, 0).map((row) => row.memo).sort().join(",");

  ok((await say(fixture, "삭제 01번")).includes("복구 01번"), "첫 삭제가 복구 번호를 안내한다");
  ok((await say(fixture, "삭제 01번")).includes("복구 01번"), "둘째 삭제도 복구 번호를 안내한다");
  eq(fixture.db.transactions.length, beforeDelete - 2, "두 건이 삭제된다");

  ok((await say(fixture, "복구 01번")).includes("복구했어요"), "첫 복구가 성공한다");
  ok((await say(fixture, "복구 01번")).includes("복구했어요"), "둘째 복구도 성공한다");
  eq(fixture.db.transactions.length, beforeDelete, "안내한 두 건이 모두 되돌아온다");

  const memosAfter = todayRows(fixture, 0).map((row) => row.memo).sort().join(",");
  eq(memosAfter, memosBefore, "삭제한 두 건이 내용 그대로 모두 살아난다");

  // 더 복구할 것이 없으면 정직하게 답한다.
  ok((await say(fixture, "복구 01번")).includes("복구할 삭제 기록이 없어요"), "빈 복구 버퍼를 정직하게 알린다");

  // ── 옛 한 칸짜리 버퍼 호환 ────────────────────────────────────
  // 배포 순간에 이미 삭제해 둔 사람의 버퍼는 `{ row, seq }` 형태다. 못 읽으면
  // 안내받은 복구가 배포 때문에 실패한다.
  const legacyBase = fixture.db.transactions.length;
  await say(fixture, "라라 4400");
  const legacyRow = { ...fixture.db.transactions[legacyBase] };
  const legacySeq = fixture.db.transactions.filter((row) => row.transaction_date === legacyRow.transaction_date).length;
  await say(fixture, `삭제 ${String(legacySeq).padStart(2, "0")}번`);
  eq(fixture.db.transactions.length, legacyBase, "옛 버퍼 검사를 위해 한 건을 지운다");
  const bufferRow = fixture.db.accountbook_settings.find((row) => String(row.key).startsWith("kakao_edit_undo_v4:"));
  ok(bufferRow, "복구 버퍼가 저장돼 있다");
  bufferRow.value = JSON.stringify({ row: legacyRow, seq: legacySeq, expires_at: Date.now() + 60000 });
  ok((await say(fixture, `복구 ${String(legacySeq).padStart(2, "0")}번`)).includes("복구했어요"), "옛 한 칸짜리 버퍼도 복구된다");
  eq(fixture.db.transactions.filter((row) => row.memo === "라라").length, 1, "옛 버퍼로 복구한 기록이 실제로 되살아난다");

  // ── 없는 번호 ────────────────────────────────────────────────
  ok((await say(fixture, "수정 99번 금액 1000")).includes("찾지 못했어요"), "없는 번호 수정을 알린다");
  ok((await say(fixture, "삭제 99번")).includes("찾지 못했어요"), "없는 번호 삭제를 알린다");

  // ── 수정 세션에 갇히지 않는다 ─────────────────────────────────
  const stuckBase = fixture.db.transactions.length;
  await say(fixture, "수정 01번");
  await say(fixture, "라면 3300");
  const declined = await say(fixture, "아니오");
  ok(declined.includes("취소"), "확인을 거절하면 빠져나가는 방법을 알려 준다");
  eq(fixture.db.transactions.length, stuckBase, "수정 세션 중에는 새 지출이 저장되지 않는다");
  await say(fixture, "취소");
  await say(fixture, "라면 3300");
  eq(fixture.db.transactions.length, stuckBase + 1, "취소 뒤에는 새 지출이 저장된다");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.71 edit and restore round trip (${checks} checks)`);
