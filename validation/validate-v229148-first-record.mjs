// V22.9.148 첫 기록 판 검사.
//   1. 관제가 못 알아들은 답을 따로 센다 — 출시 뒤 ‘무슨 뜻인지 이해하지 못했어요’·‘내용과 금액을 한 문장으로…’ 답이 ‘ok’ 로 세어져
//      못 알아들음을 셀 수 없었다(관제가 옛 문장 ‘정확히 이해하지 못했’ 만 찾았다). 답을 만든 곳이 이름·결과를 직접 적는다(markKakaoNluOutcomeV229148):
//      못 알아들음 NO_MATCH/fallback, 금액 없음 NO_AMOUNT/fallback, 단추 이름만 BUTTON_LABEL/fallback, 이름·초대·예산·가계부 안내 NO_MATCH/clarify,
//      인사 GREETING/ok, 가계부 없는 사람의 첫 안내 FIRST_CONTACT/clarify(아직 기록 전의 안내 단계), 저장한 답 TRANSACTION/ok.
//      저장하는 관제 줄(record_nlu_metric)에도 그 이름이 간다(글은 없다). 낱말 없는 말(‘?’ — 판별 EMPTY)도 못 알아들음 답이면 NO_MATCH.
//   2. 관제가 답의 모든 말풍선 글을 읽는다 — 단톡방 답(단추가 붙으면 카드)과 1:1 답의 둘째 말풍선은 예전에 늘 ‘ok’ 였다(저장 확인 지연·
//      고치기 실패까지). 문구 판정은 봇이 쓴 말만 본다 — 기록 줄의 메모·이름 줄(‘가계부: 서버 오류 대응팀’)·따옴표 안의 원래 문장
//      (‘서버 오류 수리비’·‘잠시 후 다시 갈 커피’)은 뺀다. 저장한 답의 표시는 지금 답 꼴에서 결과를 바꾸지 않는 대비다(그런 줄을 모두 빼므로).
//   3. 못 알아들은 뒤의 바로답은 [기록방법]·[도움말 보기](예전 [오늘기록] 은 첫 기록 전엔 ‘아직 기록이 없어요’ 만 보였다), 1:1 도움말·기록하는 법의
//      예시에는 ‘@말해가계부’ 가 없다(단톡방은 그대로). 답 글의 첫 줄은 예전과 같다.
//   4. 웹 정산 소수 몫(추적표 V147:G-2): 90,000원 0.7 : 0.3 = 63,000 / 27,000(예전 62,999 / 27,001), 0.1 셋에 30,000원 = 10,000원씩.
//      무작위 소수 몫은 BigInt 정답과, 정수 몫·동일·품목별은 예전 식과 같은지 본다(바뀌는 것은 소수 몫뿐).
//   5. 2026-11-27 운영 DB 권한 정리의 기록 파일(실행 금지 가드, 프로젝트 식별자 없음)과 SQL_HISTORY 줄.
import { readFileSync } from "node:fs";
import { app, BASE, counter, fixture, page, putSetting, withClock } from "./lib-audit-v22934.mjs";
import { buildSettlementModel } from "../src/modules/features/settlement-ops-pages.js";
import { kakaoNluMarkV229148, markKakaoNluOutcomeV229148, nluOutcomeFromKakaoResponse } from "../src/modules/runtime/ops-telemetry.js";

const t = counter("V22.9.148 첫 기록(관제의 못 알아들음·카드 답 분류, 못 알아들은 뒤 단추, 1:1 도움말 예시, 웹 정산 소수 몫 G-2, DB 권한 정리 기록) 검사 통과");
const json = (value) => JSON.stringify(value);

// ── 2. 관제 분류 함수(단위) ──
const simple = (text, quick = []) => json({ version: "2.0", template: { outputs: [{ simpleText: { text } }], ...(quick.length ? { quickReplies: quick.map((label) => ({ label, action: "message", messageText: label })) } : {}) } });
const card = (description, buttons = []) => ({ textCard: { description, buttons } });
const message = (label) => ({ label, action: "message", messageText: label });
const link = (label) => ({ label, action: "webLink", webLinkUrl: `${BASE}/kakao-guide` });
const cards = (...outputs) => json({ version: "2.0", template: { outputs } });
const outcome = (raw, mark = null) => { const o = nluOutcomeFromKakaoResponse(raw, mark); return `${o.result}/${o.reason}`; };
// 저장 실패(kakaoSaveFailedText)는 단추가 없어 단톡방에서도 말풍선 하나다 — 예전에도 error 였다.
t.eq(outcome(simple("저장하지 못했어요 😢\n\n가계부 저장소가 요청을 거절해 이번 내용은 기록되지 않았어요.")), "error/save_failed", "2 저장 실패는 예전처럼 error");
// 단톡방 카드가 된 고치기 실패(edit-flow-v4.js — 단추가 붙는다)는 예전에 카드를 읽지 않아 ok 였다.
t.eq(outcome(cards(card("01번 기록을 바꾸지 못했어요. 기록은 그대로예요.\n잠시 후 다시 보내 주세요.", [message("오늘기록")]))), "error/safe_error_response", "2 단톡방 카드의 고치기 실패 = error(예전 ok)");
t.eq(outcome(cards({ simpleText: { text: "이 방 가계부 ‘우리 집’에 참여했어요." } }, card("지금은 저장 확인이 지연되고 있어요. 중복될 수 있으니 기다려 주세요."))), "error/save_uncertain", "2 둘째 말풍선의 저장 지연도 읽는다");
t.eq(outcome(cards(card("어떤 기록인가요? 골라 주세요.", [message("지출"), message("수입")]))), "clarify/guided_clarification", "2 카드의 메시지 단추는 바로답처럼 고를 것으로 센다");
t.eq(outcome(cards(card("어떤 기록인가요? 골라 주세요.", [link("입력 예시 보기")]))), "ok/handled", "2 링크 단추만 있으면 고를 것이 아니다");
t.eq(outcome(simple("어떤 기록인가요? 선택해 주세요.", ["지출", "수입"])), "clarify/guided_clarification", "2 1:1 바로답 되묻기는 예전처럼 clarify");
t.eq(outcome(simple("01번 - 커피 / 4,500원 💸 지출 저장했어요.")), "ok/handled", "2 저장 답은 예전처럼 ok");
t.eq(outcome(simple("무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요.\n예) 점심 12000원 국민카드")), "fallback/generic_fallback", "2 표시가 없어도 지금의 못 알아들음 문장은 fallback(예전 ok)");
const noMatchMark = { intent: "NO_MATCH", result: "fallback", reason: "no_match", signature: "무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요." };
t.eq(outcome(cards(card("무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요.\n예) @말해가계부 점심 12000원", [link("입력 예시 보기"), message("기록방법")])), noMatchMark), "fallback/no_match", "2 표시의 첫 줄이 마지막 답에 있으면 표시를 쓴다");
t.eq(nluOutcomeFromKakaoResponse(simple("01번 - 커피 / 4,500원 💸 지출 저장했어요."), noMatchMark).marked, undefined, "2 마지막 답에 표시의 첫 줄이 없으면(다른 답으로 바뀜) 표시를 쓰지 않는다");
t.eq(outcome(simple("01번 - 커피 / 4,500원 💸 지출 저장했어요."), noMatchMark), "ok/handled", "2 그때는 예전처럼 글로 읽는다");
// 독립 검토(V22.9.148): 답에 되풀이된 사용자의 글이 오류·되묻기 문구로 읽혔다 — 기록 줄의 메모와 따옴표 안의 원래 문장은 문구 판정에서 뺀다.
t.eq(outcome(cards(card("01번 - 서버 오류 수리비 / 30,000원 / 현금 / 기타 · 💸 지출 저장했어요. (2026-11-30)\n가계부: 우리 집\n지출자: 나", [message("지난주 요약")]))), "ok/handled", "2 기록 줄의 메모 ‘서버 오류 …’ 는 오류가 아니다(단톡방 카드 — 표시 없이도)");
t.eq(outcome(simple("🧾 2026-11-30 기록\n01번 - 잠시 후 다시 갈 커피 / 4,500원 / 현금 / 카페\n02번 - 어떤 커피 / 수입 3,000원 / 계좌 / 수입", ["수정"])), "ok/handled", "2 목록의 메모 ‘잠시 후 다시 …’·‘어떤 …’ 은 오류·되묻기가 아니다");
t.eq(outcome(simple("🧾 최근 입력 내역\n• 2026-11-30 지출 30,000원 · 서버 오류 수리비\n\n오늘 번호로 수정하려면 '오늘기록'을 보내세요.")), "ok/handled", "2 최근 입력 목록의 메모도 뺀다");
t.eq(outcome(simple("🧾 2026-11-27 기록\n가계부: 서버 오류 대응팀\n\n01번 - 커피 / 4,500원 / 현금 / 카페\n지출자: 어떤 사람", ["수정"])), "ok/handled", "2 이름 줄(가계부·지출자 — 사용자가 정한 이름)도 뺀다");
t.eq(outcome(simple("🛍️ 지출 중복 저장 안 함 😊\n서로 다른 구매라면 ‘별도 구매 추가 잠시 후 다시 갈 커피 4500원’라고 원래 기록 문장을 보내 후보를 확인해 주세요.")), "ok/handled", "2 따옴표 안의 원래 문장도 뺀다");
t.eq(outcome(simple("01번 - 커피 / 4,500원 / 현금 / 카페\n이 기록을 바꾸지 못했어요. 잠시 후 다시 보내 주세요.")), "error/safe_error_response", "2 기록 줄 밖의 봇 문장은 그대로 오류로 읽는다");
t.eq(outcome(simple("두 건으로 읽었어요.\n1) 커피 / 4,500원 / 현금\n2) 택시 / 8,000원 / 카드\n이대로 저장할까요?", ["네", "아니요"])), "clarify/guided_clarification", "2 기록 줄을 보여 주고 묻는 답은 그대로 되묻기");
{
  const env = { __AB_KAKAO_REQUEST: {} };
  const savedText = "01번 - 커피 / 4,500원 / 현금 / 카페 · 💸 지출 저장했어요. (2026-11-30)\n가계부: 우리 집";
  markKakaoNluOutcomeV229148(env, "saved", savedText);
  t.eq(json(kakaoNluMarkV229148(env)), json({ intent: "TRANSACTION", result: "ok", reason: "handled", kind: "saved", signature: "01번 - 커피 / 4,500원 / 현금 / 카페 · 💸 지출 저장했어요. (2026-11-30)" }), "2 저장한 답의 표시 = TRANSACTION/ok");
  t.eq(nluOutcomeFromKakaoResponse(simple(`${savedText}\n잠시 후 다시 확인해 주세요.`), kakaoNluMarkV229148(env)).result, "ok", "2 저장한 답은 표시가 먼저다(글로 짐작하지 않는다)");
  markKakaoNluOutcomeV229148(env, "first_contact", "친구와 함께 말 한마디로 기록하는 말해가계부입니다.\n‘커피 4500원’처럼 첫 기록을 보내면 바로 시작돼요.");
  t.eq(`${kakaoNluMarkV229148(env).intent}/${kakaoNluMarkV229148(env).result}`, "FIRST_CONTACT/clarify", "2 첫 안내의 표시 = FIRST_CONTACT/clarify(아직 기록 전)");
}
{
  const env = { __AB_KAKAO_REQUEST: {} };
  markKakaoNluOutcomeV229148(env, "toString", "아무 글");
  markKakaoNluOutcomeV229148(env, "no_match", "");
  t.eq(kakaoNluMarkV229148(env), null, "2 정해 둔 갈래가 아니거나 첫 줄이 비면 표시하지 않는다");
  markKakaoNluOutcomeV229148({}, "no_match", "무슨 뜻인지");
  t.eq(kakaoNluMarkV229148({}), null, "2 요청 표식이 없는 env 에는 적지 않는다(카카오 요청에서만)");
  markKakaoNluOutcomeV229148(env, "no_amount", "내용과 금액을 한 문장으로 보내면 바로 기록돼요.\n예) 점심 12000원");
  t.eq(json(kakaoNluMarkV229148(env)), json({ intent: "NO_AMOUNT", result: "fallback", reason: "no_amount", kind: "no_amount", signature: "내용과 금액을 한 문장으로 보내면 바로 기록돼요." }), "2 표시 = 이름·결과·까닭·갈래와 답의 첫 줄뿐");
}

// ── 1·3. 카카오 답(픽스처, 운영과 같은 코드) ──
const SKILL_SECRET = "synthetic-v229148-skill-secret";
async function kakao(fx, utterance, { user = "kakao_login:2265", room = "" } = {}) {
  for (const name of ["__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
  globalThis.__AB_QA_FIXED_NOW_MS += 31 * 1000;
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  const rpcBefore = fx.db.__rpc_calls.length;
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    // 운영처럼 인증된 스킬 요청으로 보낸다(인증 없는 요청은 새 사람을 만들지 않는다 — skill_identity_untrusted).
    headers: { "content-type": "application/json", "x-kakao-skill-secret": SKILL_SECRET },
    body: json({ intent: { id: "i1", name: "폴백 블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, { waitUntil(job) { jobs.push(job); } });
  const body = await response.json();
  for (let round = 0; round < 8 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  const requestId = response.headers.get("x-accountbook-request-id");
  const event = (globalThis.__AB_NLU_RUNTIME_EVENTS || []).filter((item) => item && item.request_id === requestId).at(-1) || {};
  const outputs = body?.template?.outputs || [];
  const text = outputs.map((o) => o.simpleText?.text || [o.textCard?.title, o.textCard?.description].filter(Boolean).join("\n") || "").join("\n");
  const buttons = outputs.flatMap((o) => o.textCard?.buttons || []);
  return {
    seen: `${response.headers.get("x-accountbook-intent")}/${response.headers.get("x-accountbook-nlu-result")}/${event.reason || "-"}`,
    stored: fx.db.__rpc_calls.slice(rpcBefore).filter((call) => call.name === "record_nlu_metric").map((call) => `${call.data.p_intent}/${call.data.p_result}`).join(","),
    text, first: text.split("\n")[0], buttons, labels: buttons.map((b) => b.label), quick: (body?.template?.quickReplies || []).map((q) => q.label),
  };
}

await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  // 1:1 — 가계부가 있는 사람.
  const expectDirect = [
    ["안녕", "GREETING/ok/handled", "안녕하세요 😊 무엇을 도와드릴까요?"],
    ["고마워", "GREETING/ok/handled", "저도 고마워요 😊 오늘 쓴 돈이 있으면 바로 적어 주세요."],
    ["이거 어떻게 써?", "NO_MATCH/fallback/no_match", "무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요."],
    ["커피 사먹음", "NO_AMOUNT/fallback/no_amount", "내용과 금액을 한 문장으로 보내면 바로 기록돼요."],
    ["지출로 기록", "BUTTON_LABEL/fallback/button_label", "이 단추만으로는 어떤 기록인지 알 수 없어요."],
    ["가계부 보여줘", "NO_MATCH/clarify/guided_clarification", "가계부를 새로 만들거나, 초대코드로 참여하거나, 다른 가계부로 전환할 수 있어요."],
  ];
  for (const [utterance, seen, first] of expectDirect) {
    const r = await kakao(fx, utterance);
    t.eq(r.seen, seen, `1 1:1 ‘${utterance}’ 관제 이름/결과/까닭`);
    t.eq(r.stored, seen.split("/").slice(0, 2).join("/"), `1 1:1 ‘${utterance}’ 저장하는 관제 줄(record_nlu_metric)도 같은 이름`);
    t.eq(r.first, first, `1 1:1 ‘${utterance}’ 답 첫 줄은 예전과 같다`);
  }
  for (const utterance of ["이거 어떻게 써?", "커피 사먹음"]) {
    const r = await kakao(fx, utterance);
    t.eq(json(r.quick), json(["기록방법", "도움말 보기"]), `3 1:1 ‘${utterance}’ 바로답 = 기록방법·도움말 보기(예전 오늘기록 없음)`);
    t.ok(r.buttons.some((b) => b.label === "입력 예시 보기" && b.action === "webLink" && /\/kakao-guide$/.test(b.webLinkUrl || "")), `3 1:1 ‘${utterance}’ 입력 예시 보기 링크 단추는 그대로`);
  }
  // 낱말 없는 말(판별 EMPTY)도 못 알아들음 답이면 NO_MATCH 로 센다(독립 검토 — 단톡방의 빈 부름 EMPTY/ok 와 섞이지 않게).
  for (const utterance of ["?", "…"]) {
    const r = await kakao(fx, utterance);
    t.eq(r.seen, "NO_MATCH/fallback/no_match", `1 1:1 ‘${utterance}’ = 못 알아들음(NO_MATCH — 예전 EMPTY)`);
    t.eq(r.stored, "NO_MATCH/fallback", `1 1:1 ‘${utterance}’ 저장하는 관제 줄`);
  }
  // 1:1 의 ‘기록 없음’ 답(그날·이번 달·기간 요약)의 예시에도 ‘@말해가계부’ 가 없다(독립 검토 — 도움말만 고쳤었다).
  for (const utterance of ["어제 기록 보기", "이번달요약", "2025년 1월 요약"]) {
    const r = await kakao(fx, utterance);
    t.ok(r.text.includes("아직") && r.text.split("\n").includes("예) 커피 4500원") && !r.text.includes("@말해가계부"), `3 1:1 ‘${utterance}’ 기록 없음 답의 예시 = ‘예) 커피 4500원’ (${r.text.replace(/\n/g, " / ").slice(0, 90)})`);
  }
  const saved = await kakao(fx, "커피 4500원");
  t.ok(saved.seen.startsWith("TRANSACTION/ok/") && saved.text.includes("저장했어요"), `1 1:1 기록 글은 예전처럼 TRANSACTION/ok (${saved.seen})`);
  // 메모가 오류·되묻기 문구와 겹쳐도 저장 성공이고, 그 메모가 보이는 목록도 오류가 아니다(독립 검토 — 1:1 은 예전부터 오류로 셌다).
  for (const utterance of ["잠시 후 다시 갈 택시 8000원", "서버 오류 수리비 30000원"]) {
    const r = await kakao(fx, utterance);
    t.eq(r.seen, "TRANSACTION/ok/handled", `1 1:1 ‘${utterance}’ 저장 = TRANSACTION/ok (${r.first})`);
    t.eq(r.stored, "TRANSACTION/ok", `1 1:1 ‘${utterance}’ 저장하는 관제 줄`);
  }
  const again = await kakao(fx, "서버 오류 수리비 30000원");
  t.ok(again.text.includes("중복 저장 안 함") && again.text.includes("‘별도 구매 추가 서버 오류 수리비 30000원’") && again.seen === "TRANSACTION/ok/handled", `1 1:1 같은 기록을 다시 보낸 답(원래 문장을 따옴표로 되풀이) = TRANSACTION/ok (${again.seen})`);
  const today = await kakao(fx, "오늘기록");
  t.ok(today.text.includes("01번 - 커피 / 4,500원") && today.text.includes("서버 오류 수리비 / 30,000원") && today.seen.split("/")[1] === "ok", `1 1:1 그 메모가 보이는 오늘기록 = ok (${today.seen})`);
  const help = await kakao(fx, "도움말");
  t.ok(help.seen.startsWith("HELP/ok/") && help.text.includes("기록은 ‘점심 12000원’처럼 보내면 돼요.") && !help.text.includes("@말해가계부"), `3 1:1 도움말 예시에 @말해가계부 없음 (${help.text.replace(/\n/g, " / ").slice(0, 120)})`);
  const record = await kakao(fx, "기록하기");
  t.ok(record.text.includes("‘점심 12000원’처럼 보내면 바로 기록돼요.") && !record.text.includes("@말해가계부"), `3 1:1 기록하는 법 예시에 @말해가계부 없음 (${record.text.replace(/\n/g, " / ").slice(0, 120)})`);

  // 1:1 — 가계부가 없는 새 사람.
  for (const utterance of ["안녕", "점심 먹음"]) {
    const r = await kakao(fx, utterance, { user: "v229148-new-direct-user" });
    t.eq(r.seen, "FIRST_CONTACT/clarify/guided_clarification", `1 가계부 없는 새 사람 ‘${utterance}’ = 첫 안내(FIRST_CONTACT 되묻기 — 예전 UNKNOWN/ok)`);
    t.eq(r.stored, "FIRST_CONTACT/clarify", `1 새 사람 ‘${utterance}’ 저장하는 관제 줄`);
    t.eq(r.first, "친구와 함께 말 한마디로 기록하는 말해가계부입니다.", `1 새 사람 ‘${utterance}’ 첫 안내 글은 그대로`);
  }

  // 단톡방 — 새 방의 첫 호출자.
  const room = "v229148-first-record-room", owner = "v229148-room-owner";
  const empty = await kakao(fx, "@말해가계부", { user: owner, room });
  t.eq(empty.seen.split("/").slice(0, 2).join("/"), "EMPTY/ok", "1 단톡방 빈 멘션은 예전처럼 EMPTY/ok");
  const expectRoom = [
    ["@말해가계부 안녕", "GREETING/ok/handled", "안녕하세요 😊 무엇을 도와드릴까요?"],
    ["@말해가계부 이거 어떻게 써?", "NO_MATCH/fallback/no_match", "무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요."],
    ["@말해가계부 커피 사먹음", "NO_AMOUNT/fallback/no_amount", "내용과 금액을 한 문장으로 보내면 바로 기록돼요."],
    ["@말해가계부 수입으로 기록", "BUTTON_LABEL/fallback/button_label", "이 단추만으로는 어떤 기록인지 알 수 없어요."],
  ];
  for (const [utterance, seen, first] of expectRoom) {
    const r = await kakao(fx, utterance, { user: owner, room });
    t.eq(r.seen, seen, `1 단톡방 ‘${utterance}’ 관제 이름/결과/까닭(예전 UNKNOWN/ok)`);
    t.eq(r.stored, seen.split("/").slice(0, 2).join("/"), `1 단톡방 ‘${utterance}’ 저장하는 관제 줄`);
    t.ok(r.text.includes(first), `1 단톡방 ‘${utterance}’ 답 글은 예전과 같다`);
  }
  const roomNoMatch = await kakao(fx, "@말해가계부 이거 어떻게 써?", { user: owner, room });
  t.eq(json(roomNoMatch.labels), json(["입력 예시 보기", "기록방법", "도움말 보기"]), "3 단톡방 못 알아들음 단추 = 입력 예시 보기(링크)·기록방법·도움말 보기");
  t.eq(roomNoMatch.buttons[0].action, "webLink", "3 단톡방 첫 단추는 링크");
  t.ok(roomNoMatch.text.includes("예) @말해가계부 점심 12000원"), "3 단톡방 예시에는 봇 부르기가 그대로 붙는다(V22.9.134 M-1)");
  const roomHelp = await kakao(fx, "@말해가계부 도움말 보기", { user: owner, room });
  t.ok(roomHelp.text.includes("기록은 @말해가계부 점심 12000원 처럼 보내면 돼요."), "3 단톡방 도움말 예시는 그대로(@말해가계부)");
  const roomQuestion = await kakao(fx, "@말해가계부 ?", { user: owner, room });
  t.eq(`${roomQuestion.seen} ${roomQuestion.stored}`, "NO_MATCH/fallback/no_match NO_MATCH/fallback", "1 단톡방 ‘@말해가계부 ?’ = 못 알아들음(빈 부름 EMPTY/ok 와 따로)");
  const roomEmptyDay = await kakao(fx, "@말해가계부 어제 기록 보기", { user: owner, room });
  t.ok(roomEmptyDay.text.split("\n").includes("예) @말해가계부 커피 4500원"), "3 단톡방 기록 없음 답의 예시는 그대로(@말해가계부 커피 4500원)");
  const create = await kakao(fx, "@말해가계부 가계부만들기", { user: owner, room });
  // 머리의 이름은 낱말 판별 이름(HOUSEHOLD_CREATE)이고 저장 줄은 CREATE_HOUSEHOLD 다(ops-telemetry.js nluDiagnosticFields).
  t.ok(create.seen.endsWith("/clarify/guided_clarification") && create.stored === "CREATE_HOUSEHOLD/clarify", `2 단톡방 흐름을 여는 물음은 1:1 처럼 clarify (${create.seen} · ${create.stored})`);
  await kakao(fx, "@말해가계부 취소", { user: owner, room });
  const roomSaved = await kakao(fx, "@말해가계부 커피 4500원", { user: owner, room });
  t.ok(roomSaved.seen.startsWith("TRANSACTION/ok/") && roomSaved.text.includes("저장했어요"), `1 단톡방 기록은 예전처럼 TRANSACTION/ok (${roomSaved.seen})`);
}));

// 단톡방 — 월요일의 그날 첫 기록은 답에 [지난주 요약] 단추가 붙어 카드가 된다(V22.9.123). 이 판이 카드를 읽게 되면서 메모가 오류·되묻기
// 문구로 읽혔다(독립 검토 — 2026-11-30 월요일 픽스처). 저장한 답은 표시가, 그 메모가 보이는 목록은 기록 줄 빼기가 막는다.
for (const [index, memo] of ["서버 오류 수리비 30000원", "잠시 후 다시 갈 커피 4500원", "어떤 커피 4500원"].entries()) {
  await withClock("2026-11-29", () => fixture(async (fx) => {
    Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
    const room = `v229148-monday-room-${index}`, owner = `v229148-monday-owner-${index}`;
    await kakao(fx, "@말해가계부", { user: owner, room });
    await kakao(fx, "@말해가계부 우유 2000원", { user: owner, room }); // 일요일 — 이 방의 첫 기록(첫 답의 길)
    globalThis.__AB_QA_FIXED_NOW_MS += 24 * 3600 * 1000; // 2026-11-30 월요일
    const r = await kakao(fx, `@말해가계부 ${memo}`, { user: owner, room });
    t.ok(r.labels.includes("지난주 요약") && r.text.includes("저장했어요"), `1 단톡방 월요일 첫 기록 ‘${memo}’ 답은 [지난주 요약] 단추가 붙은 카드 (${r.labels.join(",")})`);
    t.eq(`${r.seen} ${r.stored}`, "TRANSACTION/ok/handled TRANSACTION/ok", `1 단톡방 월요일 첫 기록 ‘${memo}’ = 저장 성공(메모가 오류·되묻기 문구와 겹쳐도)`);
    const list = await kakao(fx, "@말해가계부 오늘기록", { user: owner, room });
    t.ok(list.text.includes(memo.replace(/ [0-9]+원$/, "")) && list.seen.split("/")[1] === "ok", `1 단톡방 그 메모가 보이는 오늘기록 = ok (${list.seen})`);
  }));
}
// 가계부 이름도 사용자가 정한 글이다 — ‘가계부: 서버 오류 대응팀’ 줄은 기록 줄이 아니라 문구 판정에 남는다. 저장한 답은 표시가 지킨다
// (transaction-save.js kakaoSavedReplyV229148 — 한 건·중복·여러 건 세 길).
await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  fx.db.households.find((row) => row.id === "house-home").name = "서버 오류 대응팀";
  for (const [label, utterance, says] of [["한 건", "커피 4500원", "저장했어요"], ["같은 기록 다시", "커피 4500원", "중복 저장 안 함"], ["여러 건", "택시 8000원\n점심 12000원", "새로 저장 2건"]]) {
    const r = await kakao(fx, utterance);
    t.ok(r.text.includes("서버 오류 대응팀") && r.text.includes(says), `1 가계부 이름 ‘서버 오류 대응팀’ 이 저장 답(${label})에 보인다 (${r.first})`);
    t.eq(`${r.seen} ${r.stored}`, "TRANSACTION/ok/handled TRANSACTION/ok", `1 가계부 이름이 오류 문구와 겹쳐도 저장(${label}) = TRANSACTION/ok`);
  }
  // 저장한 답이 아닌 목록(표시 없음)은 이름 줄 빼기가 지킨다.
  const list = await kakao(fx, "오늘기록");
  t.ok(list.text.includes("가계부: 서버 오류 대응팀") && list.seen.split("/")[1] === "ok", `1 가계부 이름 ‘서버 오류 대응팀’ 이 보이는 오늘기록 = ok (${list.seen})`);
}));

// ── 4. 웹 정산 소수 몫(추적표 V147:G-2) ──
const people = (n) => Array.from({ length: n }, (_, i) => ({ user_id: `u${i}`, nickname: `사람${i}`, role: i ? "member" : "owner" }));
const sharesOf = (model, n) => { const byId = Object.fromEntries(model.people.map((p) => [p.user_id, p.share])); return Array.from({ length: n }, (_, i) => byId[`u${i}`]); };
const settle = (amount, weights, mode = "ratio") => buildSettlementModel([{ id: "r1", type: "expense", amount, user_id: "u0" }], people(weights.length), { mode, weights: Object.fromEntries(weights.map((w, i) => [`u${i}`, w])) });
{
  const m = settle(90000, [0.7, 0.3]);
  t.eq(json(sharesOf(m, 2)), json([63000, 27000]), "4 90,000원 0.7 : 0.3 = 63,000 / 27,000(예전 62,999 / 27,001)");
  t.eq(json(m.transfers.map((x) => x.amount)), json([27000]), "4 송금 제안도 27,000원");
  t.eq(json(sharesOf(settle(30000, [0.1, 0.1, 0.1]), 3)), json([10000, 10000, 10000]), "4 0.1 셋에 30,000원 = 10,000원씩(예전 9,999 / 9,999 / 10,002)");
  t.eq(json(sharesOf(settle(100000, [1.5, 1], "headcount"), 2)), json([60000, 40000]), "4 인원수 1.5 : 1 = 60,000 / 40,000");
  t.eq(json(sharesOf(settle(100000, [1, 1, 1]), 3)), json([33333, 33333, 33334]), "4 나누어떨어지지 않으면 예전처럼 내림, 남는 원은 마지막 사람");
}
let seed = 0x9148;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const pick = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const floorDiv = (a, b) => { const q = a / b; return a % b < 0n ? q - 1n : q; };
// 예전 식(V22.9.147 까지): 몫을 실수로 곱해 내림, 남는 원은 마지막 사람. 정수 몫·같은 몫에서는 정확했다.
const oldAllocate = (amount, weights) => { const sum = weights.reduce((s, w) => s + w, 0); let given = 0; return weights.map((w, i) => { const v = i === weights.length - 1 ? amount - given : Math.floor(amount * w / sum); given += v; return v; }); };
let decimalMismatch = 0, decimalWrongBefore = 0, integerMismatch = 0;
for (let n = 0; n < 1500; n += 1) {
  const size = pick(2, 8);
  const tenths = Array.from({ length: size }, () => (rand() < 0.5 ? pick(1, 30) : pick(1, 10000)));
  const amount = rand() < 0.5 ? pick(1, 999) * 1000 : pick(1, 20000000);
  const sumTenths = tenths.reduce((s, k) => s + BigInt(k), 0n);
  let given = 0n;
  const expected = tenths.map((k, i) => { const v = i === size - 1 ? BigInt(amount) - given : floorDiv(BigInt(amount) * BigInt(k), sumTenths); given += v; return Number(v); });
  const got = sharesOf(settle(amount, tenths.map((k) => k / 10)), size);
  if (json(got) !== json(expected)) { decimalMismatch += 1; t.eq(json(got), json(expected), `4 무작위 소수 몫 ${tenths.map((k) => k / 10).join(":")} · ${amount}원 = BigInt 정답`); }
  if (json(oldAllocate(amount, tenths.map((k) => k / 10))) !== json(expected)) decimalWrongBefore += 1;
}
t.eq(decimalMismatch, 0, `4 무작위 소수 몫 1,500건 모두 BigInt 정답과 같다(예전 식은 ${decimalWrongBefore}건 틀림)`);
t.ok(decimalWrongBefore > 0, "4 예전 식이 틀리는 소수 몫이 표본에 있다(검사가 결함을 볼 수 있다)");
for (let n = 0; n < 1500; n += 1) {
  const size = pick(2, 8);
  const mode = ["ratio", "headcount", "equal"][n % 3];
  const weights = Array.from({ length: size }, () => (mode === "equal" ? 1 : pick(1, 1000)));
  const amount = pick(1, 50000000);
  const got = sharesOf(settle(amount, weights, mode), size);
  const before = oldAllocate(amount, mode === "equal" ? weights.map(() => 1) : weights);
  if (json(got) !== json(before)) { integerMismatch += 1; t.eq(json(got), json(before), `4 정수 몫(${mode}) ${weights.join(":")} · ${amount}원은 예전 식과 같다`); }
}
t.eq(integerMismatch, 0, "4 정수 몫·동일 분배 1,500건은 예전 식과 같다");
{
  // 품목별: 품목마다 고른 사람끼리 같은 몫(마지막으로 고른 사람이 남는 원). 예전 식과 같아야 한다.
  let itemMismatch = 0;
  for (let n = 0; n < 300; n += 1) {
    const size = pick(2, 6);
    const rows = Array.from({ length: pick(1, 6) }, (_, i) => ({ id: `r${i}`, type: "expense", amount: pick(1, 3000000), user_id: `u${pick(0, size - 1)}` }));
    const itemParticipants = Object.fromEntries(rows.map((row) => [row.id, Array.from({ length: size }, (_, i) => `u${i}`).filter(() => rand() < 0.6)]));
    const model = buildSettlementModel(rows, people(size), { mode: "item", itemParticipants });
    const owed = Object.fromEntries(Array.from({ length: size }, (_, i) => [`u${i}`, 0]));
    for (const row of rows) {
      const chosen = itemParticipants[row.id].length ? itemParticipants[row.id] : Object.keys(owed);
      oldAllocate(row.amount, chosen.map(() => 1)).forEach((value, i) => { owed[chosen[i]] += value; });
    }
    const got = sharesOf(model, size), before = Object.values(owed);
    if (json(got) !== json(before)) { itemMismatch += 1; t.eq(json(got), json(before), `4 품목별 ${json(itemParticipants)} 은 예전 식과 같다`); }
  }
  t.eq(itemMismatch, 0, "4 품목별 300건은 예전 식과 같다");
}
{
  // 환불 차감(V22.9.79 D-5): 지난달 지출의 환불은 음수 금액으로 모두에게 똑같이 나눠 빼고, 비율 방식은 환불을 뺀 합계(음수일 수 있다)를 나눈다.
  // 음수의 내림(아래 방향)과 ‘남는 원은 마지막 사람’ 이 예전 식·BigInt 정답과 같아야 한다.
  let refundMismatch = 0;
  for (let n = 0; n < 400; n += 1) {
    const size = pick(2, 6);
    const amount = pick(1000, 3000000), refund = pick(1, 4000000);
    const refundNetting = { total: refund, received: new Map([["u1", refund]]), byExpense: new Map([["old-expense", refund]]) };
    const rows = [{ id: "r1", type: "expense", amount, user_id: "u0" }];
    const item = buildSettlementModel(rows, people(size), { mode: "item", itemParticipants: {}, refundNetting });
    const equalShares = Array.from({ length: size }, () => 1);
    const before = oldAllocate(amount, equalShares).map((value, i) => value + oldAllocate(-refund, equalShares)[i]);
    if (json(sharesOf(item, size)) !== json(before)) refundMismatch += 1, t.eq(json(sharesOf(item, size)), json(before), `4 품목별 + 지난달 환불 ${refund}원(${size}명, 지출 ${amount}원)은 예전 식과 같다`);
    const tenths = Array.from({ length: size }, () => pick(1, 10000));
    const ratio = buildSettlementModel(rows, people(size), { mode: "ratio", weights: Object.fromEntries(tenths.map((k, i) => [`u${i}`, k / 10])), refundNetting });
    const net = BigInt(amount - refund), sumTenths = tenths.reduce((s, k) => s + BigInt(k), 0n);
    let given = 0n;
    const expected = tenths.map((k, i) => { const v = i === size - 1 ? net - given : floorDiv(net * BigInt(k), sumTenths); given += v; return Number(v); });
    if (json(sharesOf(ratio, size)) !== json(expected)) refundMismatch += 1, t.eq(json(sharesOf(ratio, size)), json(expected), `4 비율 ${tenths.map((k) => k / 10).join(":")} · 환불 뺀 합계 ${amount - refund}원 = BigInt 정답`);
  }
  t.eq(refundMismatch, 0, "4 환불 차감(음수 금액) 400건 — 품목별은 예전 식과, 비율은 BigInt 정답과 같다");
}
await withClock("2026-07-15", () => fixture(async (fx) => {
  fx.db.transactions = fx.db.transactions.filter((row) => !(row.household_id === "house-home" && String(row.transaction_date || "").startsWith("2026-07")));
  fx.db.transactions.push({ id: "t-v229148-g2", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-10", type: "expense", amount: 90000, category: "식비", memo: "모임 저녁", payment_method: "카드", source: "web", raw_text: "모임 저녁 90000원", created_at: "2026-07-10T12:00:00.000Z" });
  const r = await page(fx, "/settlement-summary?month=2026-07&household_id=house-home&mode=ratio&weight_user-bin=0.7&weight_user-wifi=0.3");
  const plain = r.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  t.eq(r.status, 200, "4 로그인 뒤 웹 정산 화면(비율 0.7 : 0.3)이 열린다");
  t.ok(plain.includes("63,000원") && plain.includes("27,000원") && !plain.includes("62,999원") && !plain.includes("27,001원"), `4 웹 정산 화면 = 63,000원 / 27,000원 (${(plain.match(/[0-9]{2},[0-9]{3}원/g) || []).slice(0, 8).join(" ")})`);
}));

// ── 5. 운영 DB 권한 정리 기록 ──
{
  const sql = readFileSync(new URL("../migrations/V22_9_148_DB_ADVISOR_GRANTS_REVIEW_ONLY.sql", import.meta.url), "utf8");
  const lines = sql.split("\n");
  const guard = lines.findIndex((line) => /raise exception 'v229148_review_only_db_advisor_grants_already_applied/.test(line));
  const firstChange = lines.findIndex((line) => /^(?:revoke|grant|alter function)\b/.test(line));
  t.ok(lines[0].startsWith("-- 실행 금지(DO NOT RUN)") && guard > 0 && lines[guard - 1] === "begin;" && firstChange > guard, "5 기록 파일: 첫 줄 실행 금지, begin 바로 뒤 가드, 바꾸는 문은 가드 아래");
  for (const statement of [
    "revoke all on function public.record_nlu_metric(timestamp with time zone, text, text, integer, text) from public, anon, authenticated;",
    "revoke all on function public.record_nlu_failure_sample(text, text, text, text, text, text) from public, anon, authenticated;",
    "grant execute on function public.record_nlu_metric(timestamp with time zone, text, text, integer, text) to service_role;",
    "grant execute on function public.record_nlu_failure_sample(text, text, text, text, text, text) to service_role;",
    "alter function public.set_updated_at() set search_path = '';",
    "alter function public.set_accountbook_settings_updated_at() set search_path = '';",
  ]) t.ok(lines.includes(statement), `5 기록 파일에 적용한 문: ${statement.slice(0, 60)}`);
  t.ok(lines.filter((line) => /^(?:revoke|grant|alter function)\b/.test(line)).length === 6, "5 바꾸는 문은 그 여섯뿐(되돌리기 문은 저장소에 적지 않는다)");
  const projectRef = /(?<![a-z])[a-z]{20}(?![a-z])/;
  t.ok(!projectRef.test(sql) && !/supabase\.co/i.test(sql), "5 기록 파일에 프로젝트 식별자·주소가 없다(공개 저장소)");
  const history = readFileSync(new URL("../SQL_HISTORY.md", import.meta.url), "utf8");
  const section = history.slice(history.indexOf("## V22.9.148 SQL 판단"), history.indexOf("## V22.9.147 SQL 판단"));
  t.ok(history.indexOf("## V22.9.148 SQL 판단") === 0 && section.includes("V22_9_148_DB_ADVISOR_GRANTS_REVIEW_ONLY.sql") && section.includes("2026-11-27 11:49:52") && !projectRef.test(section), "5 SQL_HISTORY 맨 위 V22.9.148 절에 운영 적용 줄(식별자 없음)");
  const calculator = readFileSync(new URL("../src/modules/public/group-settlement-v229147.js", import.meta.url), "utf8");
  // 두 계산의 대조(정수 몫)는 validate-v229147-group-settlement 가 본다. 여기서는 계산기 설명 주석이 이 판의 고침과 맞는지만 본다.
  t.ok(!calculator.includes("웹 정산에 남은 결함") && calculator.includes("V22.9.148") && !calculator.includes("1~3원"), "4 계산기 설명 주석이 웹 정산의 고침(V22.9.148)을 가리킨다(어긋남 폭은 ‘몇 원’)");
}

t.done();
