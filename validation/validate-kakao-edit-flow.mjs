// V22.8.16 카카오 수정(edit) 플로우 V4 검증
// 수정플로우-최종판-구현지침서 7장 수락 기준 1~13을 자동화한다.
//  - 1~11: handleEditMessage 직접 호출 (지침서가 허용한 검증 방법)
//  - 12:   두 사용자의 세션 격리를 스킬 엔드투엔드로 확인
//  - 13:   selfTest + loopFuzzTest (5-3장)
//  - 추가: 실제 라우팅(3장) 재현 버그 시나리오를 스킬 엔드투엔드로 확인
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, {
  parseEditInput,
  handleEditMessage,
  isSessionExpired,
  selfTest,
  loopFuzzTest,
  SESSION_TTL_MS,
  MAX_FAILS,
  parseKakaoEditCommandV4,
  parseKakaoDeleteCommandV4,
  parseKakaoRestoreCommandV4,
} from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

// ---------------------------------------------------------------
// [13] selfTest + loopFuzzTest — 배포 차단 게이트 (지침서 5-3장·7장 13)
// ---------------------------------------------------------------
ok(String(selfTest()).includes("전부 통과"), "selfTest: 봇 안내문 예시 전부 파싱");
ok(String(loopFuzzTest({}, 200)).includes("중복응답 0건"), "loopFuzzTest: 200회 무한루프·예외 0건");

// ---------------------------------------------------------------
// 소스 불변식 (지침서 5-1장)
// ---------------------------------------------------------------
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
ok(!source.includes("handleKakaoDailyEditFlow"), "I8: 구 수정 플로우 경로가 완전히 제거됨");
ok(!source.includes("extractKakaoEditPatch"), "구 정규식 패치 파서가 완전히 제거됨");
eq((source.match(/kakaoEditMenuTextV4\(/g) || []).length, 2, "I8: 메뉴 출력은 정의 1곳 + 신규 세션 시작 1곳뿐(실패 분기에 메뉴 재출력 없음)");
ok(source.includes("sendKakaoEditReplyV4"), "5-2장: 전송 직전 중복응답 가드 존재");
ok(source.includes("duplicate_reply_guard"), "5-2장: duplicate_reply_guard 텔레메트리 존재");
ok(source.includes("unrecognized_inputs"), "6장: 미인식 입력 텔레메트리 적재 존재");
ok(!source.includes("결제자: ${payerName}"), "1-1장: 저장 응답의 결제자 표기가 지출자로 통일됨");
ok(source.includes("지출자: ${payerName}"), "1-1장: 저장 응답이 지출자 표기를 사용");

// ---------------------------------------------------------------
// 최상위 명령 파서 (3장 1·2단계)
// ---------------------------------------------------------------
{
  const cmd = parseKakaoEditCommandV4("수정 03번");
  eq(cmd?.seq, 3, "수정 03번 → seq 3");
  eq(cmd?.rest, "", "수정 03번 → 나머지 없음(메뉴)");
  const one = parseKakaoEditCommandV4("수정 03번 금액 13000");
  eq(one?.rest, "금액 13000", "수정 03번 금액 13000 → 나머지 파싱");
  const legacy = parseKakaoEditCommandV4("01번 금액 13000원");
  eq(legacy?.seq, 1, "레거시 01번 금액 13000원 도 흡수");
  const dated = parseKakaoEditCommandV4("어제 01번 금액 13000");
  ok(dated && dated.seq === 1 && dated.date !== parseKakaoEditCommandV4("수정 01번").date, "어제 01번 → 날짜 접두 해석");
  ok(!parseKakaoEditCommandV4("삭제 03번"), "삭제 명령은 수정 파서와 겹치지 않음");
  eq(parseKakaoDeleteCommandV4("삭제 03번")?.seq, 3, "삭제 03번 파싱");
  eq(parseKakaoDeleteCommandV4("03번 삭제")?.seq, 3, "레거시 03번 삭제 파싱");
  ok(parseKakaoDeleteCommandV4("방금 삭제")?.latest, "방금 삭제 → 최근 기록");
  eq(parseKakaoRestoreCommandV4("복구 03번")?.seq, 3, "복구 03번 파싱");
  eq(parseKakaoRestoreCommandV4("복구")?.seq, 0, "복구(번호 생략) 파싱");
}

// ---------------------------------------------------------------
// [1~11] 세션 상태머신 직접 호출 (7장)
// ---------------------------------------------------------------
const qaConfig = { members: ["엄마", "아빠"], methods: ["현대카드"], now: Date.now() };
const freshSession = () => ({
  entryNo: "03", step: "awaiting_field", repeatCount: 0, totalTurns: 0,
  lastBotMsg: "", updatedAt: Date.now(),
});
const isMenuText = (text) => String(text || "").includes("무엇을 바꿀까요? 번호를 보내주세요.");

// 1. 수정 03번 → 지출자 변경: 메뉴 재출력이 아니라 구성원 숫자 목록
{
  const r = handleEditMessage(freshSession(), "지출자 변경", qaConfig);
  eq(r.action, "ask_value", "[수락1] 지출자 변경 → ask_value");
  ok(!isMenuText(r.reply), "[수락1] 메뉴 재출력 아님");
  ok(r.reply.includes("지출자를 누구로 바꿀까요?") && r.reply.includes("1. 엄마"), "[수락1] 구성원 숫자 목록 제시");
}
// 2. 지출자 단독
{
  const r = handleEditMessage(freshSession(), "지출자", qaConfig);
  eq(r.action, "ask_value", "[수락2] 지출자 → ask_value");
  ok(r.reply.includes("1. 엄마") && !isMenuText(r.reply), "[수락2] 구성원 숫자 목록 제시");
}
// 3. 지출자 변경 엄마 → 즉시 반영
{
  const r = handleEditMessage(freshSession(), "지출자 변경 엄마", qaConfig);
  eq(r.action, "apply", "[수락3] 지출자 변경 엄마 → 즉시 반영");
  eq(r.field, "payer", "[수락3] payer 필드");
  eq(r.value, "엄마", "[수락3] 값 엄마");
  eq(r.nextSession, null, "[수락3] 세션 종료");
}
// 4. 6 → 2: 구성원 목록 → 2번 구성원 반영
{
  const r1 = handleEditMessage(freshSession(), "6", qaConfig);
  eq(r1.action, "ask_value", "[수락4] 6 → 구성원 목록");
  const r2 = handleEditMessage(r1.nextSession, "2", qaConfig);
  eq(r2.action, "apply", "[수락4] 2 → 반영");
  eq(r2.value, "아빠", "[수락4] 2번 구성원(아빠)으로 반영");
}
// 5. 6 → 9: 범위 안내 (메뉴 재출력 아님)
{
  const r1 = handleEditMessage(freshSession(), "6", qaConfig);
  const r2 = handleEditMessage(r1.nextSession, "9", qaConfig);
  eq(r2.action, "reprompt", "[수락5] 9 → reprompt");
  ok(r2.reply.includes("1~2 사이의 번호"), "[수락5] 1~N 사이 번호 안내");
  ok(!isMenuText(r2.reply), "[수락5] 메뉴 재출력 아님");
}
// 6. 결재자 엄마 (오타) → 지출자로 인식·반영
{
  const r = handleEditMessage(freshSession(), "결재자 엄마", qaConfig);
  eq(r.action, "apply", "[수락6] 결재자 엄마 → 반영");
  eq(r.field, "payer", "[수락6] 지출자로 인식");
}
// 7. 엄마 → 구성원명 추론으로 즉시 반영
{
  const r = handleEditMessage(freshSession(), "엄마", qaConfig);
  eq(r.action, "apply", "[수락7] 엄마 → 즉시 반영");
  eq(r.field, "payer", "[수락7] 지출자 추론");
}
// 8. ㅁㄴㅇㄹ ×3 → 서로 다른 문구 2회 → 3회째 종료 + 완성 예시
{
  let s = freshSession();
  const r1 = handleEditMessage(s, "ㅁㄴㅇㄹ", qaConfig);
  eq(r1.action, "reprompt", "[수락8] 1회차 reprompt");
  const r2 = handleEditMessage(r1.nextSession, "ㅁㄴㅇㄹ", qaConfig);
  eq(r2.action, "reprompt", "[수락8] 2회차 reprompt");
  ok(r1.reply !== r2.reply, "[수락8] 실패 문구가 회전(동일 문구 2연속 없음)");
  const r3 = handleEditMessage(r2.nextSession, "ㅁㄴㅇㄹ", qaConfig);
  eq(r3.action, "cancel", "[수락8] 3회째 세션 종료");
  ok(r3.reply.includes("수정 03번 지출자 엄마"), "[수락8] 복사 가능한 완성 예시(번호 포함)");
  eq(r3.nextSession, null, "[수락8] 세션 삭제");
}
// 9. 취소 → 즉시 종료
{
  const r = handleEditMessage(freshSession(), "취소", qaConfig);
  eq(r.action, "cancel", "[수락9] 취소 → 즉시 종료");
  eq(r.nextSession, null, "[수락9] 세션 삭제");
}
// 10. 수정 03번 금액 13000 → 세션 없이 즉시 반영 (파서 + 상태머신)
{
  const parsed = parseEditInput("금액 13000", {});
  eq(parsed?.field, "amount", "[수락10] 금액 13000 파싱");
  eq(parsed?.value, "13000", "[수락10] 금액 값");
  const r = handleEditMessage(freshSession(), "금액 13000", qaConfig);
  eq(r.action, "apply", "[수락10] 즉시 반영");
  eq(r.nextSession, null, "[수락10] 세션 미보존");
}
// 11. 세션 5분 방치 후 엄마 → 만료 안내 + 재시작 방법
{
  const stale = { ...freshSession(), updatedAt: Date.now() - SESSION_TTL_MS - 1000 };
  ok(isSessionExpired(stale), "[수락11] 만료 감지");
  const r = handleEditMessage(stale, "엄마", qaConfig);
  eq(r.action, "cancel", "[수락11] 만료 → 종료");
  ok(r.reply.includes("수정 시간이 지나") && r.reply.includes("수정 03번"), "[수락11] 만료 안내 + 재시작 예시");
}
// 예/아니오 확인 단계(L3) 회귀: 저신뢰 확인은 실패 카운트를 리셋하지 않음(I9 근거)
{
  const s = { ...freshSession(), repeatCount: 1 };
  const r = handleEditMessage(s, "국밥한그릇", qaConfig);
  eq(r.action, "confirm", "L3: 저신뢰 값은 확인 질문");
  eq(r.nextSession.repeatCount, 1, "I9: 확인 분기가 repeatCount를 리셋하지 않음");
  const yes = handleEditMessage(r.nextSession, "네", qaConfig);
  eq(yes.action, "apply", "L3: 네 → 반영");
}

// ---------------------------------------------------------------
// 엔드투엔드: 실제 라우팅(3장) — 재현 버그가 다시는 불가능함을 확인
// ---------------------------------------------------------------
const fixture = await createV2265QaFixture();
try {
  const kstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  fixture.db.transactions.push(
    { id: "tx-edit-1", household_id: "house-home", user_id: "user-bin", source_user_key: "kakao_login:2265", transaction_date: kstToday, type: "expense", amount: 30000, category: "식비", memo: "저녁 마라탕", payment_method: "현대카드", source: "kakao_skill", raw_text: "저녁 마라탕 30000 현대카드", created_at: `${kstToday}T01:00:00.000Z` },
    { id: "tx-edit-2", household_id: "house-home", user_id: "user-bin", source_user_key: "kakao_login:2265", transaction_date: kstToday, type: "expense", amount: 5000, category: "카페/간식", memo: "커피", payment_method: "카카오페이", source: "kakao_skill", raw_text: "커피 5000 카카오페이", created_at: `${kstToday}T02:00:00.000Z` },
    { id: "tx-edit-3", household_id: "house-home", user_id: "user-wifi", source_user_key: "kakao_login:2266", transaction_date: kstToday, type: "expense", amount: 8000, category: "식비", memo: "빵", payment_method: "현금", source: "kakao_skill", raw_text: "빵 8000 현금", created_at: `${kstToday}T03:00:00.000Z` },
  );
  fixture.db.accountbook_settings.push(
    { id: "setting-sel-bin", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: `${kstToday}T00:00:00.000Z` },
    { id: "setting-sel-wifi", key: "kakao_selected_household_v2251:user-wifi", value: "house-home", created_at: `${kstToday}T00:00:00.000Z` },
  );

  function skillPayload(utterance, userKey) {
    return {
      intent: { id: "qa-edit", name: "수정" },
      userRequest: {
        timezone: "Asia/Seoul", params: {}, block: { id: "qa-edit", name: "수정" },
        utterance, lang: "ko",
        user: { id: userKey, type: "botUserKey", properties: { botUserKey: userKey } },
      },
      bot: { id: "qa-bot", name: "똑똑한가계부" },
      action: { id: "qa-edit-action", name: "수정", params: {}, detailParams: {}, clientExtra: {} },
      contexts: [],
    };
  }
  async function say(utterance, userKey = "kakao_login:2265") {
    const response = await app.fetch(new Request("https://ttokttok-accountbook.com/skill", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(skillPayload(utterance, userKey)),
    }), fixture.env, {});
    eq(response.status, 200, `skill 200: ${utterance}`);
    const data = JSON.parse(await response.text());
    return (data?.template?.outputs || []).map((o) => o?.simpleText?.text || "").join("\n");
  }
  const txById = (id) => fixture.db.transactions.find((t) => t.id === id);

  // 재현 버그 시나리오: 수정 01번 → 지출자 변경 → 지출자 (연속 3턴)
  const menu1 = await say("수정 01번");
  ok(isMenuText(menu1) && menu1.includes("01번 - 저녁 마라탕"), "[E2E] 수정 01번 → V4 메뉴");
  ok(menu1.includes("한 줄로도 돼요: 지출자 엄마 / 금액 13000"), "[E2E] 1-1장 메뉴 문구");
  const step2 = await say("지출자 변경");
  ok(!isMenuText(step2), "[E2E·재현버그] 지출자 변경 → 메뉴 재출력 아님");
  ok(step2.includes("지출자를 누구로 바꿀까요?") && step2.includes("1. Bin") && step2.includes("2. WIFI♥"), "[E2E·재현버그] 실데이터 구성원 숫자 목록");
  const step3 = await say("9");
  ok(step3.includes("1~2 사이의 번호"), "[E2E] 범위 밖 번호 → 구체 피드백");
  const step4 = await say("2");
  ok(step4.includes("변경했어요"), "[E2E] 2 → 지출자 반영 응답");
  eq(txById("tx-edit-1").user_id, "user-wifi", "[E2E] DB에 지출자 변경 반영");

  // 한 줄 즉시 반영 + 세션 미보존
  const oneLiner = await say("수정 01번 금액 13000");
  ok(oneLiner.includes("변경했어요"), "[E2E·수락10] 한 줄 수정 즉시 반영");
  eq(txById("tx-edit-1").amount, 13000, "[E2E·수락10] DB 금액 반영");
  const sessionRow = fixture.db.accountbook_settings.find((r) => String(r.key).startsWith("kakao_edit_v4:") && String(r.key).endsWith("kakao_login:2265"));
  ok(!sessionRow || !String(sessionRow.value || "").trim(), "[E2E·수락10] 즉시 반영 시 세션 없음");

  // 구성원 목록 밖 이름 → 숫자 옵션 폴백(I2), 번호로 완결
  const menuAgain = await say("수정 01번");
  ok(isMenuText(menuAgain), "[E2E] 세션 재시작");
  const wrongName = await say("지출자 엄마");
  ok(wrongName.includes("찾지 못했어요") && wrongName.includes("1. Bin"), "[E2E·I2] 목록 밖 이름 → 구체 피드백 + 숫자 옵션");
  const pickOne = await say("1");
  ok(pickOne.includes("변경했어요"), "[E2E] 번호 선택으로 완결");
  eq(txById("tx-edit-1").user_id, "user-bin", "[E2E] DB에 지출자 재변경 반영");

  // 실패 3회 → 종료 + 완성 예시 (수락8 E2E) — 동일 입력 연속에도 반복가드가 세션을 존중
  await say("수정 02번");
  const f1 = await say("ㅁㄴㅇㄹ");
  const f2 = await say("ㅁㄴㅇㄹ");
  ok(f1 !== f2, "[E2E·수락8·I1] 동일 실패 문구 2연속 없음");
  const f3 = await say("ㅁㄴㅇㄹ");
  ok(f3.includes("취소했어요") && f3.includes("수정 02번"), "[E2E·수락8] 3회째 종료 + 번호 포함 예시");

  // 취소 즉시 종료 (수락9 E2E)
  await say("수정 02번");
  const cancelReply = await say("취소");
  ok(cancelReply.includes("취소했어요"), "[E2E·수락9] 취소 즉시 종료");

  // 삭제 + 복구 (2단계 + 되돌리기)
  const undoBufferRow = () => fixture.db.accountbook_settings.find((r) => String(r.key).startsWith("kakao_edit_undo_v4:") && String(r.key).endsWith("kakao_login:2265"));
  const delReply = await say("삭제 02번");
  ok(delReply.includes("삭제했어요") && delReply.includes("복구 02번"), "[E2E] 삭제 02번 → 삭제 + 복구 안내");
  ok(!txById("tx-edit-2"), "[E2E] DB에서 삭제됨");
  // 복구 INSERT의 NOT NULL 컬럼(household_id)이 버퍼에 저장되는지 — 운영 복구 실패 재발 방지
  eq(JSON.parse(undoBufferRow().value).row.household_id, "house-home", "[E2E·회귀] 복구 버퍼에 household_id 저장");
  const restoreReply = await say("복구 02번");
  ok(restoreReply.includes("복구했어요"), "[E2E] 복구 02번 → 복구 응답");
  ok(txById("tx-edit-2"), "[E2E] DB에 복구됨");

  // 레거시 버퍼 회귀: household_id 없이 저장된 기존 버퍼도 복구 시점에 보충되어 성공해야 한다
  await say("삭제 02번");
  ok(!txById("tx-edit-2"), "[E2E·회귀] 두 번째 삭제");
  {
    const buffer = undoBufferRow();
    const parsed = JSON.parse(buffer.value);
    delete parsed.row.household_id;
    buffer.value = JSON.stringify(parsed);
  }
  const legacyRestore = await say("복구 02번");
  ok(legacyRestore.includes("복구했어요"), "[E2E·회귀] household_id 없는 레거시 버퍼도 복구 성공");
  eq(txById("tx-edit-2")?.household_id, "house-home", "[E2E·회귀] 복구된 행에 household_id 보충됨");

  // [수락12] 두 사용자의 세션 격리 — 서로 다른 항목을 동시에 수정
  const binMenu = await say("수정 01번", "kakao_login:2265");
  ok(binMenu.includes("01번 - "), "[E2E·수락12] Bin 세션 시작");
  const wifiMenu = await say("수정 01번", "kakao_login:2266");
  ok(wifiMenu.includes("01번 - 빵"), "[E2E·수락12] WIFI 세션은 자신의 01번(빵)");
  const wifiAmount = await say("금액", "kakao_login:2266");
  ok(wifiAmount.includes("얼마로 바꿀까요?"), "[E2E·수락12] WIFI 세션 진행");
  const binStep = await say("지출자", "kakao_login:2265");
  ok(binStep.includes("지출자를 누구로 바꿀까요?"), "[E2E·수락12] Bin 세션 간섭 없음");
  const wifiApply = await say("9900", "kakao_login:2266");
  ok(wifiApply.includes("변경했어요"), "[E2E·수락12] WIFI 값 반영");
  eq(txById("tx-edit-3").amount, 9900, "[E2E·수락12] WIFI의 기록만 변경");
  eq(txById("tx-edit-1").amount, 13000, "[E2E·수락12] Bin의 기록은 그대로");
  await say("취소", "kakao_login:2265");

  // 저장 응답 하단 안내(1-1장) + 지출자 표기
  const saveReply = await say("김밥 4500원 현금", "kakao_login:2265");
  ok(saveReply.includes("지출자:"), "[E2E·1-1장] 저장 응답 지출자 표기");
  ok(/수정: "수정 \d{2}번" 또는 "수정 \d{2}번 금액 13000"/.test(saveReply), "[E2E·1-1장] 저장 응답 수정 안내 문구");
  ok(/삭제: "삭제 \d{2}번"/.test(saveReply), "[E2E·1-1장] 저장 응답 삭제 안내 문구");

  // 미인식 텔레메트리 적재 (6장)
  ok(fixture.db.unrecognized_inputs?.length >= 3, "[E2E·6장] unrecognized_inputs 적재");
  ok(fixture.db.unrecognized_inputs.some((r) => r.type === "unrecognized_final"), "[E2E·6장] unrecognized_final 적재");
} finally {
  fixture.restore();
}

console.log(`카카오 수정 플로우 V4 검증 통과 — ${checks}개 확인`);
