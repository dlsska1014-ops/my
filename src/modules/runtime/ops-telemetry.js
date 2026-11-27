// @build:imports-start
import {
  AB_NLU_RUNTIME_EVENTS, AB_NLU_RUNTIME_METRICS, AB_SKILL_EVENTS, AB_SKILL_RATE_BUCKETS,
} from "./global-state.js";
import { APP_MODE, APP_VERSION, publicBaseUrl } from "../public/site-config.js";
import { safeError } from "./leases.js";
import { getCookie, htmlResponse, jsonResponse, wantsTransactionDeleteJson } from "./http.js";
import { myReturnLocation } from "../my/access-control.js";
import {
  KAKAO_GROUP_MENTION_V229134, isUncertainStorageWrite, kakaoGroupQuotedSegmentsV229134, kakaoText,
} from "../kakao/response-builders.js";
import { KAKAO_RETRY_DEDUP_SECONDS } from "../kakao/transaction-save.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
// @build:imports-end

function nluOpsConfig(env = {}) {
  return {
    aggregate_metrics_enabled: String(env.NLU_METRICS_ENABLED || "0") === "1",
    failure_samples_enabled: String(env.NLU_PERSIST_FAILURE_SAMPLES || "0") === "1",
    store_redacted_text: String(env.NLU_STORE_REDACTED_TEXT || "0") === "1",
    failure_sample_rate: boundedRuntimeNumber(env.NLU_FAILURE_SAMPLE_RATE, 1, 0, 1),
    retention_days: nluRetentionDays(env),
    memory_event_limit: boundedRuntimeNumber(env.NLU_MEMORY_EVENT_LIMIT, 600, 100, 2000),
  };
}

function nluRetentionDays(env = {}) {
  if (env.NLU_FAILURE_RETENTION_DAYS === undefined) return 14;
  const value = String(env.NLU_FAILURE_RETENTION_DAYS).trim();
  if (!/^[1-9]\d?$/.test(value) || Number(value) > 90) return null;
  return Number(value);
}

// Only server-owned classifications cross the diagnostic persistence boundary.
// The legacy redacted-text flag never authorizes a new text sample.
function nluDiagnosticFields(event = {}) {
  // V22.9.148: 못 알아들음(NO_MATCH)·금액 없음(NO_AMOUNT)·단추 이름만 온 답(BUTTON_LABEL)·인사(GREETING)·가계부 없는 사람의 첫 안내(FIRST_CONTACT)는
  // 답을 만든 곳이 적는 이름이다. 저장하는 줄에는 까닭 칸이 없어서 갈래마다 이름이나 결과를 달리한다(이름·초대·예산·가계부 안내 = NO_MATCH/clarify).
  // (markKakaoNluOutcomeV229148). 예전에는 모두 ‘알 수 없음’(UNKNOWN)에 섞였다.
  const intents = ["EMPTY", "UNKNOWN", "EDIT", "MENU", "START", "CREATE_HOUSEHOLD", "JOIN_HOUSEHOLD", "HOUSEHOLD_SWITCH", "MEMBER_ALIAS_CHANGE", "INVITE_CODE_SHOW", "INVITE_MEMBER", "BUDGET_SETUP", "BUDGET_STATUS", "GROUP_LINK", "SETTLEMENT", "SUMMARY", "RECENT_RECORDS", "INPUT_EXAMPLE", "EDIT_GUIDE", "KEYWORD_GUIDE", "RESERVE_GUIDE", "DATA_POLICY", "CANCEL", "HELP", "WEB_LINK", "TRANSACTION", "NO_MATCH", "NO_AMOUNT", "BUTTON_LABEL", "GREETING", "FIRST_CONTACT"];
  const reasons = ["generic_fallback", "guided_clarification", "handled", "save_failed", "save_uncertain", "safe_error_response", "handler_error", "no_match", "no_amount", "button_label"];
  const reason = String(event.reason || "");
  // V22.9.90: the natural-intent detector names these two HOUSEHOLD_CREATE/HOUSEHOLD_JOIN; the stored names (and the monitor labels) are the ones below.
  const aliases = { HOUSEHOLD_CREATE: "CREATE_HOUSEHOLD", HOUSEHOLD_JOIN: "JOIN_HOUSEHOLD" };
  const intent = aliases[event.intent] || event.intent;
  return {
    intent: intents.includes(intent) ? intent : "UNKNOWN",
    result: ["ok", "fallback", "clarify", "error"].includes(event.result) ? event.result : "error",
    reason: reasons.includes(reason) || /^edit_(?:unrecognized|unrecognized_final|duplicate_reply_guard|restore_error):attempt_[0-3]$/.test(reason) ? reason : "handler_error",
  };
}

function redactNluOpsSample(text = "") {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
    .replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, "[전화번호]")
    .replace(/\b\d{2,4}[ -]?\d{3,4}[ -]?\d{4}\b/g, "[전화번호]")
    .replace(/\b[A-Z0-9]{6,16}\b/g, "[코드]")
    .replace(/\b\d{8,}\b/g, "[긴숫자]")
    .replace(/@?(?:말해가계부|똑똑한가계부)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function nluOpsFingerprint(text = "") {
  const input = String(text || "");
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `nlu_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function redactOpsDetail(value = "") {
  // V22.9.148(V148:C-33): 아래 값 지우기는 시작할 수 있는 자리마다 뒤를 훑으므로 먼저 1,000자로 자른다(따옴표만 4만 자인 글이 700ms 넘게 걸렸다).
  // 결과는 어차피 260자이고, 부르는 곳의 상세는 오류 글(safeError 400자)과 앞뒤 몇십 자다.
  return String(value || "").slice(0, 1000)
    // V22.9.148(Codex 3차 검토를 고치며 찾음 — V148:C-33): 오류 글이 옮겨 적은 값을 뺀다. DB(PostgREST) 오류의 details 는 막힌 행 전체(‘Failing row contains
    // (…)’ — 카카오 기록이면 메모·원문이 든다)나 키 값(‘Key (…)=(…)’)이고, 형식·범위 오류의 message 는 받은 값(‘… for type uuid: "…"’·‘value "…" is out of
    // range …’)을, JSON.parse 오류는 읽던 글(‘…, "…" is not valid JSON’ — V8 은 20자까지 그대로, 그보다 길면 10자와 ‘...’)을 옮겨 적는다. 이 글은 관리자
    // /ops-snapshot.json 의 운영·스킬·트래픽 사건(카카오 저장 실패·처리 중 오류의 상세)과 최근 NLU 사건의 까닭에 실패 사례 저장 설정과 상관없이 남았다.
    // 상태·오류 번호·제약·열·표 이름은 남긴다. 받은 값은 오류 글 길이(500자) 안, JSON.parse 가 옮긴 글은 64자 안에서만 찾는다(되짚기를 묶고, 64자 넘게
    // 앞에 있는 다른 따옴표부터 지우지 않는다 — V8 은 많아야 21자를 옮긴다). 받은 값에는 줄 바꿈 문자(U+2028 — DB 의 JSON 은 그대로 둔다)도 들 수 있어 . 대신
    // [\s\S] 로 찾는다(아래 공백 줄이기가 그 문자를 빈칸으로 바꾼 뒤에는 값이 그대로 보였다).
    // DB 오류 글은 500자에서 잘려 오므로(data/supabase-client.js) 닫는 따옴표가 잘린 details·받은 값은 글 끝까지 뺀다(끝에 홀로 남은 \ 도).
    .replace(/"details":"(?:[^"\\]|\\.)*\\?(?:"|$)/g, '"details":"[값 생략]"')
    .replace(/(: |value )\\"[\s\S]{0,500}\\"(?="|$| is out of range)/g, "$1[값 생략]")
    .replace(/(: |value )\\"(?:(?!\\")[\s\S])*$/, "$1[값 생략]")
    .replace(/(?:Unexpected token .{1,4}?, )?(?:\.\.\.)?"[\s\S]{0,64}"(?:\.\.\.)? is not valid JSON/g, "[JSON 이 아닌 글] is not valid JSON")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[사용자식별자]")
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}\b/g, "[토큰]")
    .replace(/(?:password|access[_-]?code|secret|apikey|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+/gi, "$1=[보호됨]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
    .replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, "[전화번호]")
    .replace(/([?&](?:code|token|key|secret|password)=)[^&\s]+/gi, "$1[보호됨]")
    .replace(/\b\d{10,}\b/g, "[긴숫자]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

// V22.9.148: 답을 만든 곳이 관제 이름·결과를 직접 적는다. 답 글을 정규식으로 짐작하던 방식은 답 글이 바뀌면 말없이 틀어졌다 — V22.9.67 에
// 못 알아들은 답을 ‘무슨 뜻인지 이해하지 못했어요’ 로 바꾼 뒤로 그 답은 ‘ok’ 로 세어져, 관제가 못 알아들음을 셀 수 없었다.
// 표시는 요청마다 새로 만드는 env.__AB_KAKAO_REQUEST(worker/router.js)에만 둔다. 표지(signature) = 그 답의 첫 줄이고, 마지막 답에 표지가
// 그대로 있을 때만 쓴다(그 사이 다른 답으로 바뀌었으면 예전처럼 글로 읽는다). 남기는 것은 아래에 정해 둔 이름·결과·까닭 낱말뿐이다(글 없음).
const KAKAO_NLU_MARKS_V229148 = Object.freeze({
  greeting: Object.freeze({ intent: "GREETING", result: "ok", reason: "handled" }),
  no_match: Object.freeze({ intent: "NO_MATCH", result: "fallback", reason: "no_match" }),
  no_amount: Object.freeze({ intent: "NO_AMOUNT", result: "fallback", reason: "no_amount" }),
  button_label: Object.freeze({ intent: "BUTTON_LABEL", result: "fallback", reason: "button_label" }),
  hint: Object.freeze({ intent: "NO_MATCH", result: "clarify", reason: "guided_clarification" }),
  // 가계부가 없는 사람의 첫 안내는 기록이 아직 안 된 안내 단계다 — 성공(ok)이 아니라 되묻기(clarify)로 센다(독립 검토: 새 사람의 ‘커피 사먹음’ 이 ok 였다).
  first_contact: Object.freeze({ intent: "FIRST_CONTACT", result: "clarify", reason: "guided_clarification" }),
  // 저장한 답(새로 저장·중복 저장 안 함). 답에 사용자의 메모·원래 문장이 되풀이되므로 글로 읽지 않는다(아래 kakaoNluBotWordsV229148 도 같은 까닭).
  saved: Object.freeze({ intent: "TRANSACTION", result: "ok", reason: "handled" }),
});

function markKakaoNluOutcomeV229148(env, kind = "", replyText = "") {
  const mark = Object.hasOwn(KAKAO_NLU_MARKS_V229148, kind) ? KAKAO_NLU_MARKS_V229148[kind] : null;
  const request = env && typeof env === "object" ? env.__AB_KAKAO_REQUEST : null;
  const signature = String(replyText || "").split("\n")[0].trim();
  if (!mark || !request || typeof request !== "object" || !signature) return;
  request.nluMarkV229148 = { ...mark, kind, signature };
}

function kakaoNluMarkV229148(env) {
  const request = env && typeof env === "object" ? env.__AB_KAKAO_REQUEST : null;
  const mark = request && typeof request === "object" ? request.nluMarkV229148 : null;
  return mark && typeof mark === "object" ? mark : null;
}

// V22.9.148: 답의 모든 말풍선 글을 읽는다. 예전에는 첫 말풍선의 simpleText 만 읽어, 단톡방 답(단추가 붙으면 카드로 바뀐다 — response-builders.js
// kakaoGroupCompatibleResponse·kakaoNextStepReply)은 저장 확인 지연·고치기 실패까지 늘 ‘ok’ 였고, 1:1 답의 둘째 말풍선도 읽지 않았다.
// 고를 수 있는 것 = 바로답 + 메시지 단추(단톡방은 바로답을 메시지 단추로 바꾼다). 링크·플러그인 단추는 세지 않는다.
// V22.9.148(Codex 검토): 카드 안의 머리말(carousel·listCard 의 header, itemCard 의 head)과 목록(items·itemList)도 읽는다 — 예전에는 carousel 의
// items 만 읽어 머리말의 ‘저장 확인이 지연되고 있어요.’ 가 빠졌다. 지금 답은 simpleText·textCard·basicCard 만 쓰지만, 단톡방이 받는 카드
// (response-builders.js KAKAO_GROUP_SUPPORTED_OUTPUTS — listCard·itemCard 포함)를 새로 쓰는 답이 생겨도 말없이 빠지지 않게 한다.
const KAKAO_NLU_OUTPUT_KINDS_V229148 = Object.freeze(["simpleText", "textCard", "basicCard", "commerceCard", "listCard", "itemCard", "carousel"]);
function kakaoNluResponsePartsV229148(body) {
  const template = body && typeof body === "object" && body.template && typeof body.template === "object" ? body.template : {};
  const texts = [];
  let choices = Array.isArray(template.quickReplies) ? template.quickReplies.length : 0;
  const read = (part, depth = 0) => {
    if (!part || typeof part !== "object" || depth > 3) return;
    for (const key of ["text", "title", "description"]) if (typeof part[key] === "string" && part[key]) texts.push(part[key]);
    if (Array.isArray(part.buttons)) choices += part.buttons.filter((button) => button && button.action === "message").length;
    for (const key of ["header", "head"]) read(part[key], depth + 1);
    for (const key of ["items", "itemList"]) if (Array.isArray(part[key])) part[key].forEach((item) => read(item, depth + 1));
  };
  for (const output of Array.isArray(template.outputs) ? template.outputs : []) {
    if (!output || typeof output !== "object") continue;
    for (const kind of KAKAO_NLU_OUTPUT_KINDS_V229148) read(output[kind]);
  }
  return { text: texts.join("\n"), choices };
}

// V22.9.148(독립 검토): 문구 판정은 봇이 쓴 말만 본다. 답에 되풀이된 사용자의 글 — 기록 줄의 메모(‘01번 - 서버 오류 수리비 / 30,000원 / …’,
// ‘• 2026-11-30 지출 4,500원 · 메모’), 이름 줄(‘가계부: 이름’)과 따옴표 안의 원래 문장 — 이 ‘서버.*오류’·‘잠시 후 다시’·‘어떤 ’ 에 걸려
// 정상 저장·목록이 오류·되묻기로 세어졌다(1:1 은 예전부터, 이 판이 카드를 읽으면서 단톡방까지). 봇의 실패·되묻기 문장은 그 밖에 있다.
// V22.9.148(Codex 검토): 줄마다 한 번씩만 본다 — 줄 전체를 덮는 정규식(^[^\n]*… 와 따옴표의 [^’\n]*)은 긴 줄을 여러 번 되짚었고, 따옴표는 안쪽
// 짝에서 멈췄다(‘모임 ‘개발’ 서버 오류 대응팀’ 의 뒤쪽이 남아 오류로 셈). 따옴표 짝은 단톡방 답이 봇 부르기를 넣을 때 쓰는 것과 같은 한 번의 훑기다
// (response-builders.js kakaoGroupQuotedSegmentsV229134 — 바깥쪽 짝까지).
const KAKAO_NLU_RECORD_ROW_V229148 = /\s\/\s(?:수입 )?-?[\d,]+원(?:\s\/|$)/;
const KAKAO_NLU_RECENT_ROW_V229148 = /^• \d{4}-\d{2}-\d{2} (?:지출|수입) -?[\d,]+원 · /;
// 이름 줄(‘가계부: 이름’·‘📒 가계부: 이름’·‘지출자: 이름’·‘수입자: 이름’)도 사용자가 정한 이름뿐이다(가계부 이름 ‘서버 오류 대응팀’).
// V22.9.148(Codex 검토): 시작·도움말 카드의 ‘이 방 가계부: 이름’·‘지금 가계부: 이름’, 만들기 확인의 ‘가계부 이름: 이름’ 과 그 밖에 사용자가 정한 이름·메모·
// 분류를 한 줄에 적는 꼬리표(src/modules/kakao 의 답 글에서 모았다 — 그 꼬리표 뒤에 봇의 실패·되묻기 문장은 없다)도 뺀다.
const KAKAO_NLU_NAME_LABELS_V229148 = Object.freeze([
  "가계부", "이 방 가계부", "지금 가계부", "가계부 이름", "연결 가계부", "현재 선택 가계부", "현재 연결", "현재", "변경",
  "지출자", "수입자", "분류", "기록", "복구하려던 기록", "마지막에 바뀐 기록", "마지막에 저장한 기록",
  // V22.9.148(Codex 3차 검토): 예시 줄(‘예: …’)은 보낼 말의 본보기다 — 가계부 만들기의 이름 제안(‘예: (카카오 별명) 가계부’ — guided-flows.js)에 별명이
  // 들어, 별명이 ‘서버 오류 대응팀’ 이면 정상 안내가 오류로 셌다. 답 글의 ‘예: ’ 줄에는 봇의 실패·되묻기 낱말이 없다(검사가 답 글을 모두 훑어 본다).
  "예",
]);
const KAKAO_NLU_NAME_LINE_V229148 = new RegExp(`^(?:(?:📒|✅) )?(?:${KAKAO_NLU_NAME_LABELS_V229148.join("|")}): `);
// V22.9.148(Codex 2차 검토): 사용자가 정한 이름·분류가 목록 줄로 되풀이되는 답도 그 줄을 뺀다 — 가계부 고르기·내 가계부 목록
// (‘1. 이름 · 소유자’·‘1. 이름 · 소유자 · 초대코드 …’ — household-budget-commands.js kakaoHouseholdListLines·intent-nlu.js), 이번 달 요약의 상위 지출
// (‘1. 분류: 30,000원’ — transactions-core.js formatSummary), 예산 현황(‘• 분류: 30,000원 사용 / …’ — budgets.js), 기록 고치기의 고를 값
// (‘1. 식비  2. 카페’ — edit-flow-v4.js·edit-state-machine.js, 아래 알리는 줄 규칙). 가계부 이름 ‘서버 오류 대응팀’ 이 든 가계부 고르기가 오류로 셌다.
// 이 줄들에 봇의 실패·되묻기 문장은 없다.
// V22.9.148(Codex 3차 검토): 상위 지출·예산 현황 줄은 만드는 꼴 그대로 본다 — ‘원’ 뒤에 무엇이 와도 빼던 규칙은 분류 이름이 ‘1. 점심: 5000원’ 인
// 예산 물음(‘1. 점심: 5000원 예산을 얼마로 설정할까요?’ — guided-flows.js)까지 빼 되묻기를 ok 로 셌다.
const KAKAO_NLU_LIST_ROWS_V229148 = Object.freeze([
  /^\d{1,2}\. .* · (?:소유자|관리자|구성원|조회전용|승인대기|차단)(?: · |$)/,
  /^\d{1,2}\. .*: [\d,]+원$/,
  /^• .*: [\d,]+원 사용 \/ [\d,]+원 (?:남음|초과) · [\d.]+%$/,
]);
// 목록을 알리는 줄 바로 다음부터 이어지는 번호 줄(‘1. ’)도 사용자가 정한 이름·값이다 — 기록 고치기의 고를 값(‘…번호로 골라주세요.’·‘분류를 번호로 골라
// 주세요.’·‘목록의 번호로 골라주세요.’ 다음의 ‘1. 서버팀  2. 오류왕’, 값이 하나면 ‘1. 오류왕’ 한 줄)과 참여 취소의 승인 대기 목록(‘승인 대기 중인 가계부가
// 2개예요.’ 다음의 ‘1. 이름’ — skill-handler.js). 번호 줄이 끊기면 다시 읽는다. 알리는 줄 다음에 오는 것은 그 목록뿐이다(모든 꼴을 훑어 확인).
const KAKAO_NLU_LIST_HEADS_V229148 = Object.freeze([
  /번호로 골라 ?주세요\.$/,
  /^승인 대기 중인 가계부가 \d+개예요\.$/,
]);
const KAKAO_NLU_LIST_ITEM_V229148 = /^\d{1,2}\. /;
// V22.9.148(Codex 3차 검토): 단톡방 답은 ‘…번호로 골라주세요.’ 끝에 번호 예시(‘ 예: @말해가계부 1’ — response-builders.js kakaoGroupNumberLineV229135)가
// 붙은 뒤 관제가 읽는다. 알리는 줄은 그 예시를 떼고 본다(예전에는 단톡방의 고를 값 줄이 남아 구성원 이름 ‘서버팀’·‘오류왕’ 에 오류로 셌다 — 1:1 은 ok).
// (다른 모듈의 상수라 묶음 파일의 순서와 상관없게 부를 때 읽는다.)
const kakaoNluListHeadV229148 = (line = "") => {
  const example = ` 예: ${KAKAO_GROUP_MENTION_V229134} 1`;
  const bare = line.endsWith(example) ? line.slice(0, -example.length) : line;
  return KAKAO_NLU_LIST_HEADS_V229148.some((head) => head.test(bare));
};
// V22.9.148(Codex 2차·3차 검토): 이름·메모 안의 짝 없는 따옴표. 공용 훑기(kakaoGroupQuotedSegmentsV229134)는 짝이 맞는 바깥 따옴표까지를 한 조각으로
// 보지만, 사용자 글 안에 짝 없는 따옴표가 있으면 답 글의 따옴표 하나가 짝을 잃는다. 답 글의 따옴표는 늘 짝이 맞으므로 관제에서만 방향별로 늘린다.
// - 짝 없는 여는 따옴표(가계부 이름 ‘서버 오류 ‘개발’, ‘모임 ‘분점’ 서버 오류 ‘개발’ → ‘이 방 가계부 ‘모임 ‘분점’ 서버 오류 ‘개발’에 참여했어요.’)는
//   그 뒤 같은 종류의 마지막 닫는 따옴표까지 — 2차 고침은 뒤의 첫 조각까지만 이어 이름 가운데의 ‘서버 오류’ 가 봇 말로 남았다(3차 검토). 실패 문장이
//   사용자 값 뒤에 오고 그 뒤에 또 따옴표가 있는 답 글은 없다(검사가 답 글을 모두 훑어 본다 — 있으면 그 실패 문장을 삼킨다).
// - 짝 없는 닫는 따옴표(이름 ‘개발’ 서버 오류’)는 그 앞 같은 종류의 가장 가까운 여는 따옴표부터 — 사이의 봇 문장(‘커피’ 기록은 처리하지 못했어요.
//   ‘택시’’ …)은 남는다.
// - 곧은 따옴표(' ")는 여닫는 글자가 같아 공용 훑기가 앞에서부터 둘씩 짝짓는다. 수가 홀수면 남는 마지막 하나를 닫는 따옴표로 보고 그 앞 같은 글자부터
//   ('O'Brien 서버 오류' 의 'Brien 서버 오류').
// 단톡방에 보내는 글(봇 부르기)은 공용 훑기 그대로다. 줄 길이에 비례한다(한 번씩 훑는다).
function kakaoNluQuotedSegmentsV229148(text = "") {
  const spans = kakaoGroupQuotedSegmentsV229134(text).map(({ start, end }) => [start, end]);
  for (const [open, close] of [["‘", "’"], ["“", "”"]]) {
    const stack = [];
    let lastOpen = -1, lastClose = -1;
    for (let at = 0; at < text.length; at += 1) {
      if (text[at] === open) { stack.push(at); lastOpen = at; }
      else if (text[at] === close) {
        lastClose = at;
        if (stack.length) stack.pop();
        else if (lastOpen >= 0) spans.push([lastOpen, at + 1]);
      }
    }
    for (const at of stack) if (lastClose > at) spans.push([at, lastClose + 1]);
  }
  for (const mark of ["'", "\""]) {
    let count = 0, previous = -1, last = -1;
    for (let at = 0; at < text.length; at += 1) if (text[at] === mark) { count += 1; previous = last; last = at; }
    if (count % 2 === 1 && previous >= 0) spans.push([previous, last + 1]);
  }
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out = [];
  for (const [start, end] of spans) {
    const before = out[out.length - 1];
    if (before && start < before.end) before.end = Math.max(before.end, end);
    else out.push({ start, end });
  }
  return out;
}
function kakaoNluWithoutQuotedV229148(line = "") {
  const segments = kakaoNluQuotedSegmentsV229148(line);
  if (!segments.length) return line;
  let out = "", at = 0;
  for (const segment of segments) { out += `${line.slice(at, segment.start)}‘’`; at = segment.end; }
  return out + line.slice(at);
}
function kakaoNluBotWordsV229148(text = "") {
  let listed = false;
  return String(text || "").split("\n").map((line) => {
    const item = listed && KAKAO_NLU_LIST_ITEM_V229148.test(line);
    listed = item || kakaoNluListHeadV229148(line);
    return item || KAKAO_NLU_RECORD_ROW_V229148.test(line) || KAKAO_NLU_RECENT_ROW_V229148.test(line) || KAKAO_NLU_NAME_LINE_V229148.test(line)
      || KAKAO_NLU_LIST_ROWS_V229148.some((row) => row.test(line))
      ? "" : kakaoNluWithoutQuotedV229148(line);
  }).join("\n");
}

// V22.9.148(Codex 검토): 표시는 그 첫 줄이 답의 한 줄 전체로 있을 때만 쓴다 — 예전에는 글 어디든 들어 있으면 썼다(바뀐 답의 메모에 앞 답의 첫 줄이
// 인용되기만 해도 표시가 먼저였다). 말풍선 사이·줄 사이의 경계는 그대로라 앞에 붙는 방 참여 안내 줄은 상관없다.
function kakaoNluMarkSeenV229148(text = "", mark = null) {
  if (!mark || typeof mark !== "object" || typeof mark.signature !== "string" || !mark.signature) return false;
  return String(text || "").split("\n").some((line) => line.trim() === mark.signature);
}

function nluOutcomeFromKakaoResponse(responseText = "", mark = null) {
  let text = "";
  let quickReplyCount = 0;
  try {
    const parts = kakaoNluResponsePartsV229148(JSON.parse(String(responseText || "{}")));
    text = parts.text;
    quickReplyCount = parts.choices;
  } catch (err) {
    text = String(responseText || "");
  }
  if (kakaoNluMarkSeenV229148(text, mark)) {
    return { result: mark.result, reason: mark.reason, text, quick_reply_count: quickReplyCount, marked: true };
  }
  const words = kakaoNluBotWordsV229148(text);
  // V22.9.148: 표시가 없는 길에서 나온 못 알아들음 답도 놓치지 않게 지금 문장(‘이해하지 못했어요’)을 함께 본다.
  if (/(정확히 이해하지 못했|이해하지 못했어요|아래 예시처럼 보내|원하는 내용을 찾지 못했|다시 보내주세요)/.test(words)) {
    return { result: "fallback", reason: "generic_fallback", text, quick_reply_count: quickReplyCount };
  }
  // V22.9.37(관제): 저장소가 거절한 저장("저장하지 못했어요")과 결과를 모르는 저장("저장 확인이 지연")은 관제에 "ok"로
  // 집계되고 있었다. 실패·불확실로 나눠 센다.
  if (/(저장하지 못했어요|기록되지 않았어요)/.test(words)) {
    return { result: "error", reason: "save_failed", text, quick_reply_count: quickReplyCount };
  }
  if (/저장 확인이 지연/.test(words)) {
    return { result: "error", reason: "save_uncertain", text, quick_reply_count: quickReplyCount };
  }
  if (/(잠시 후 다시|처리 중 오류|서버.*오류|문제가 발생|처리하지 못했어요)/.test(words)) {
    return { result: "error", reason: "safe_error_response", text, quick_reply_count: quickReplyCount };
  }
  if (quickReplyCount > 0 && /(인가요|할까요|선택해|입력해 주세요|어떻게 처리|무엇을|어떤 )/.test(words)) {
    return { result: "clarify", reason: "guided_clarification", text, quick_reply_count: quickReplyCount };
  }
  return { result: "ok", reason: "handled", text, quick_reply_count: quickReplyCount };
}

function nluPercentile(values = [], p = 0.5) {
  const arr = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const idx = Math.max(0, Math.min(arr.length - 1, Math.ceil(arr.length * p) - 1));
  return arr[idx];
}

function rememberNluRuntimeEvent(event = {}, env = {}) {
  try {
    const cfg = nluOpsConfig(env);
    const result = ["ok", "fallback", "clarify", "error"].includes(String(event.result || "")) ? String(event.result) : "error";
    const intent = String(event.intent || "UNKNOWN").slice(0, 80) || "UNKNOWN";
    const latencyMs = Math.max(0, Math.round(Number(event.latency_ms || 0)));
    const at = String(event.at || new Date().toISOString());
    const bucket = `${at.slice(0, 13)}:00:00.000Z`;
    const key = `${bucket}|${intent}|${result}`;
    const prev = AB_NLU_RUNTIME_METRICS.get(key) || { bucket_start: bucket, intent, result, request_count: 0, latency_sum_ms: 0, latency_max_ms: 0 };
    prev.request_count += 1;
    prev.latency_sum_ms += latencyMs;
    prev.latency_max_ms = Math.max(prev.latency_max_ms, latencyMs);
    AB_NLU_RUNTIME_METRICS.set(key, prev);
    while (AB_NLU_RUNTIME_METRICS.size > 1200) AB_NLU_RUNTIME_METRICS.delete(AB_NLU_RUNTIME_METRICS.keys().next().value);

    AB_NLU_RUNTIME_EVENTS.push({
      at,
      request_id: String(event.request_id || "").slice(0, 80),
      intent,
      confidence: Math.max(0, Math.min(1, Number(event.confidence || 0))),
      result,
      // V22.9.148(V148:C-33): 처리 중 오류의 까닭은 오류 글 그대로라(skill-handler.js 의 safeError) 운영 사건과 같이 가린다 — 정해 둔 까닭 이름은 그대로다.
      reason: redactOpsDetail(event.reason || "").slice(0, 100),
      latency_ms: latencyMs,
      block: String(event.block || "").slice(0, 100),
      version: String(event.version || APP_VERSION).slice(0, 100),
      // V22.9.148(Codex 검토): 실패 사례 저장(NLU_PERSIST_FAILURE_SAMPLES)이 꺼져 있으면 Worker 메모리의 최근 사건에도 문장을 남기지 않는다(운영은 꺼짐).
      // 예전에는 ok 가 아니면 가린 문장을 남겨 관리자 화면(/nlu-ops 의 최근 문제)에 보였다 — 이 판이 못 알아들음·금액 없음·첫 안내를 ok 밖으로 세면서
      // 문장이 남는 말이 늘었다(‘민지 병원 다녀옴’). 이름·결과·까닭과 문장 지문(sample_hash)은 그대로 남는다.
      sample: result === "ok" || !cfg.failure_samples_enabled ? "" : redactNluOpsSample(event.utterance || ""),
      sample_hash: nluOpsFingerprint(normalizeText(event.utterance || "")),
    });
    while (AB_NLU_RUNTIME_EVENTS.length > cfg.memory_event_limit) AB_NLU_RUNTIME_EVENTS.shift();
  } catch (err) {}
}

function getNluOpsSnapshot(env = {}) {
  const recent = AB_NLU_RUNTIME_EVENTS.slice().reverse();
  const latency = recent.map((e) => e.latency_ms).filter(Number.isFinite);
  const byResult = recent.reduce((acc, e) => { acc[e.result] = (acc[e.result] || 0) + 1; return acc; }, {});
  const byIntent = recent.reduce((acc, e) => { acc[e.intent] = (acc[e.intent] || 0) + 1; return acc; }, {});
  const total = recent.length;
  const successful = Number(byResult.ok || 0);
  const failureLike = Number(byResult.fallback || 0) + Number(byResult.clarify || 0) + Number(byResult.error || 0);
  return {
    generated_at: new Date().toISOString(),
    config: nluOpsConfig(env),
    total,
    successful,
    failure_like: failureLike,
    success_rate: total ? Math.round((successful / total) * 10000) / 100 : 0,
    fallback_rate: total ? Math.round((Number(byResult.fallback || 0) / total) * 10000) / 100 : 0,
    clarify_rate: total ? Math.round((Number(byResult.clarify || 0) / total) * 10000) / 100 : 0,
    error_rate: total ? Math.round((Number(byResult.error || 0) / total) * 10000) / 100 : 0,
    latency: { p50: nluPercentile(latency, 0.5), p95: nluPercentile(latency, 0.95), p99: nluPercentile(latency, 0.99), max: latency.length ? Math.max(...latency) : 0 },
    by_result: byResult,
    by_intent: byIntent,
    recent: recent.slice(0, 120),
    hourly: [...AB_NLU_RUNTIME_METRICS.values()].sort((a, b) => String(b.bucket_start).localeCompare(String(a.bucket_start))).slice(0, 240),
  };
}

async function persistNluMetricAggregate(env = {}, event = {}) {
  const cfg = nluOpsConfig(env);
  if (!cfg.aggregate_metrics_enabled || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  const at = String(event.at || new Date().toISOString());
  const fields = nluDiagnosticFields(event);
  return supabase(env, "/rest/v1/rpc/record_nlu_metric", {
    method: "POST",
    body: JSON.stringify({
      p_bucket_start: `${at.slice(0, 13)}:00:00.000Z`,
      p_intent: fields.intent,
      p_result: fields.result,
      p_latency_ms: Math.max(0, Math.round(Number(event.latency_ms || 0))),
      p_version: APP_VERSION,
    }),
  });
}

async function persistNluFailureSample(env = {}, event = {}) {
  const cfg = nluOpsConfig(env);
  if (!cfg.failure_samples_enabled || !["fallback", "clarify", "error"].includes(String(event.result || ""))) return { skipped: true };
  if (Math.random() > cfg.failure_sample_rate || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  const fields = nluDiagnosticFields(event);
  return supabase(env, "/rest/v1/rpc/record_nlu_failure_sample", {
    method: "POST",
    body: JSON.stringify({
      p_sample_hash: nluOpsFingerprint(JSON.stringify(fields)),
      p_redacted_sample: null,
      p_intent: fields.intent,
      p_result: fields.result,
      p_reason: fields.reason,
      p_version: APP_VERSION,
    }),
  });
}

function scheduleNluOpsPersistence(ctx, env = {}, event = {}) {
  const job = Promise.allSettled([
    persistNluMetricAggregate(env, event),
    persistNluFailureSample(env, event),
  ]).then((results) => {
    for (const r of results) if (r.status === "rejected") rememberOpsEvent({ kind: "nlu_persist_error", severity: "warn", path: "/skill", method: "POST", detail: "diagnostic_storage_failed" });
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
  else job.catch(() => {});
}

async function cleanupNluOpsRetention(env = {}) {
  const cfg = nluOpsConfig(env);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  if (cfg.retention_days === null) throw new Error("nlu_retention_days_invalid");
  const now = Date.now();
  if (!Number.isSafeInteger(now) || now < cfg.retention_days * 86400000 || !Number.isFinite(new Date(now).getTime())) throw new Error("nlu_retention_clock_invalid");
  const cutoff = new Date(now - cfg.retention_days * 86400000).toISOString();
  await supabase(env, `/rest/v1/nlu_failure_samples?last_seen=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
  return { ok: true, cutoff };
}

// V22.9.148(Codex 2차 검토): 오류·되묻기의 가린 문장도 실패 사례 저장(NLU_PERSIST_FAILURE_SAMPLES)이 켜졌을 때만 남긴다 — 최근 NLU 사건
// (rememberNluRuntimeEvent)과 같은 설정이다. 앞 고침은 그쪽만 막아, 설정이 꺼져 있어도 처리 중 오류(skill-handler.js 의 error)·짧은 말 되묻기(clarify)의
// 문장이 이 목록(관리자 /ops-snapshot.json 의 skill.recent·스킬 운영 화면)에 남았다. env 를 받지 않은 부름은 꺼진 것으로 본다.
function rememberSkillEvent(event = {}, env = {}) {
  try {
    const kind = String(event.kind || "info").slice(0, 40);
    const keepRedactedSample = ["bad_json", "error", "clarify"].includes(kind) && nluOpsConfig(env).failure_samples_enabled;
    AB_SKILL_EVENTS.push({
      at: new Date().toISOString(),
      kind,
      user_key: event.user_key ? nluOpsFingerprint(String(event.user_key)) : "",
      utterance: keepRedactedSample ? redactNluOpsSample(event.utterance || "").slice(0, 120) : "",
      detail: redactOpsDetail(event.detail || "").slice(0, 240),
    });
    while (AB_SKILL_EVENTS.length > 120) AB_SKILL_EVENTS.shift();
  } catch (err) {}
}

function getSkillOpsSnapshot() {
  const now = Date.now();
  let activeBuckets = 0;
  for (const [k, v] of AB_SKILL_RATE_BUCKETS.entries()) {
    if (!v || now - Number(v.windowStart || 0) > 10 * 60 * 1000) AB_SKILL_RATE_BUCKETS.delete(k);
    else activeBuckets++;
  }
  const recent = AB_SKILL_EVENTS.slice(-80).reverse();
  const byKind = recent.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  return { activeBuckets, recent, byKind };
}

function boundedRuntimeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : Number(fallback);
  return Math.max(min, Math.min(max, safe));
}

function pruneRateBucketMap(map, now, windowMs, maxEntries = 6000) {
  if (!(map instanceof Map) || map.size < maxEntries) return;
  for (const [key, bucket] of map.entries()) {
    if (!bucket || now - Number(bucket.windowStart || 0) > windowMs * 2) map.delete(key);
  }
  while (map.size > maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function pruneExpiringMap(map, now = Date.now(), maxEntries = 6000) {
  if (!(map instanceof Map) || map.size < maxEntries) return;
  for (const [key, value] of map.entries()) {
    if (!value || Number(value.expires_at || 0) <= now) map.delete(key);
  }
  while (map.size >= maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function pruneTimestampMap(map, now = Date.now(), maxAgeMs = 10 * 60 * 1000, maxEntries = 6000) {
  if (!(map instanceof Map) || map.size < maxEntries) return;
  for (const [key, timestamp] of map.entries()) {
    if (!timestamp || now - Number(timestamp) > maxAgeMs) map.delete(key);
  }
  while (map.size >= maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function checkSkillRateLimit(userKey = "", env = {}) {
  const key = String(userKey || "anonymous").slice(0, 120);
  const now = Date.now();
  const windowMs = boundedRuntimeNumber(env.SKILL_RATE_WINDOW_MS, 60000, 10000, 600000);
  const limit = boundedRuntimeNumber(env.SKILL_RATE_LIMIT, 60, 10, 10000);
  pruneRateBucketMap(AB_SKILL_RATE_BUCKETS, now, windowMs);
  let bucket = AB_SKILL_RATE_BUCKETS.get(key);
  if (!bucket || now - Number(bucket.windowStart || 0) > windowMs) {
    bucket = { windowStart: now, count: 0 };
  }
  bucket.count += 1;
  AB_SKILL_RATE_BUCKETS.set(key, bucket);
  const resetInMs = Math.max(0, windowMs - (now - bucket.windowStart));
  return { ok: bucket.count <= limit, count: bucket.count, limit, resetInMs };
}

const AB_TRAFFIC_BUCKETS = globalThis.__AB_TRAFFIC_BUCKETS || (globalThis.__AB_TRAFFIC_BUCKETS = new Map());
const AB_TRAFFIC_EVENTS = globalThis.__AB_TRAFFIC_EVENTS || (globalThis.__AB_TRAFFIC_EVENTS = []);
const AB_OPS_EVENTS = globalThis.__AB_OPS_EVENTS || (globalThis.__AB_OPS_EVENTS = []);
const AB_DUPLICATE_EVENTS = globalThis.__AB_DUPLICATE_EVENTS || (globalThis.__AB_DUPLICATE_EVENTS = []);
const AB_KAKAO_REPEAT_GUARD = globalThis.__AB_KAKAO_REPEAT_GUARD || (globalThis.__AB_KAKAO_REPEAT_GUARD = new Map());
const AB_KAKAO_INFLIGHT = globalThis.__AB_KAKAO_INFLIGHT || (globalThis.__AB_KAKAO_INFLIGHT = new Map());

// V22.9.118 재검토 P3: 남긴 항목을 돌려준다(약관 안내 빠짐 이벤트가 같은 요청 안에서 이유를 고쳐 쓸 때만 쓴다 — 다른 호출은 반환값을 쓰지 않는다). 실패하면 null.
function rememberOpsEvent(event = {}) {
  try {
    const entry = {
      at: new Date().toISOString(),
      kind: String(event.kind || "info").slice(0, 40),
      severity: String(event.severity || "info").slice(0, 20),
      path: String(event.path || "").slice(0, 120),
      method: String(event.method || "").slice(0, 12),
      label: String(event.label || "").slice(0, 80),
      detail: redactOpsDetail(event.detail || ""),
    };
    AB_OPS_EVENTS.push(entry);
    while (AB_OPS_EVENTS.length > 220) AB_OPS_EVENTS.shift();
    return entry;
  } catch (err) { return null; }
}

function getOpsEventsSnapshot() {
  const recent = AB_OPS_EVENTS.slice(-120).reverse();
  const byKind = recent.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  const bySeverity = recent.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {});
  const lastError = recent.find((e) => e.severity === "error" || e.kind === "server_error" || e.kind === "route_error") || null;
  return { recent, byKind, bySeverity, lastError };
}

function rememberDuplicateEvent(event = {}) {
  try {
    const kind = String(event.kind || "duplicate_guard").slice(0, 40);
    const detail = kind === "kakao_repeat"
      ? `utterance_hash=${nluOpsFingerprint(normalizeText(event.detail || ""))}`
      : redactNluOpsSample(String(event.detail || "")).slice(0, 220);
    AB_DUPLICATE_EVENTS.push({
      at: new Date().toISOString(),
      kind,
      source: String(event.source || "").slice(0, 40),
      household_id: event.household_id ? nluOpsFingerprint(String(event.household_id)) : "",
      user_id: event.user_id ? nluOpsFingerprint(String(event.user_id)) : "",
      amount: Number(event.amount || 0) || 0,
      transaction_date: String(event.transaction_date || "").slice(0, 20),
      detail,
    });
    while (AB_DUPLICATE_EVENTS.length > 180) AB_DUPLICATE_EVENTS.shift();
    if (["duplicate_skipped", "bulk_limited", "kakao_repeat"].includes(kind)) {
      rememberOpsEvent({ kind, severity: "warn", path: event.path || "", method: event.method || "", detail: detail || `${event.source || ""} ${event.transaction_date || ""} ${event.amount || ""}` });
    }
  } catch (err) {}
}

function getDuplicateOpsSnapshot() {
  const recent = AB_DUPLICATE_EVENTS.slice(-90).reverse();
  const byKind = recent.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {});
  const bySource = recent.reduce((acc, e) => { acc[e.source || "unknown"] = (acc[e.source || "unknown"] || 0) + 1; return acc; }, {});
  return { recent, byKind, bySource };
}

function duplicateGuardSeconds(env = {}, source = "") {
  const src = String(source || "");
  if (src === "kakao_skill") return boundedRuntimeNumber(env.KAKAO_RETRY_DEDUP_SECONDS, KAKAO_RETRY_DEDUP_SECONDS || 120, 10, 3600);
  if (src === "my_import") return 0;
  return boundedRuntimeNumber(env.DUPLICATE_GUARD_SECONDS, 90, 10, 3600);
}

function isDuplicateGuardSource(source = "") {
  const s = String(source || "");
  return ["my_web", "web_user", "ledger_live", "api", "kakao_skill", "web_admin"].includes(s);
}

function isDatabaseBusyError(err) {
  const m = String(err?.message || err || "").toLowerCase();
  return /supabase|fetch|network|timeout|timed|gateway|503|502|504|failed|database|connection/.test(m);
}

function userSafeErrorCode(err) {
  if (isUncertainStorageWrite(err)) return "db_write_unknown";
  if (isDatabaseBusyError(err)) return "db_delay";
  const raw = safeError(err);
  if (/spender_not_member|transaction_spender_not_member/i.test(raw)) return "spender_not_member";
  if (/amount_required|invalid_amount/i.test(raw)) return "amount_required";
  if (/record_not_found|transaction_not_found/i.test(raw)) return "record_not_found";
  return "save_failed";
}

function duplicateSkippedReturnLocation(month, householdId, extra = {}) {
  return myReturnLocation(month, householdId, { msg: "duplicate_skipped", ...extra });
}

function getOperationIntegritySnapshot() {
  return {
    profile: "atomic-dedup-and-cron-lease",
    migration: "schema_v22_6_8_operations_integrity.sql",
    database_lock_rpc_required: true,
    active_memory_fallback_leases: 0,
  };
}

function buildOpsSnapshot(env = {}) {
  const traffic = getTrafficOpsSnapshot();
  const skill = getSkillOpsSnapshot();
  const events = getOpsEventsSnapshot();
  const duplicates = getDuplicateOpsSnapshot();
  return {
    app_version: APP_VERSION,
    app_mode: APP_MODE,
    generated_at: new Date().toISOString(),
    traffic,
    skill,
    events,
    duplicates,
    operation_integrity: getOperationIntegritySnapshot(),
    nlu: getNluOpsSnapshot(env),
    limits: {
      traffic_guard_limit: boundedRuntimeNumber(env.TRAFFIC_GUARD_LIMIT, 240, 20, 10000),
      traffic_guard_window_ms: boundedRuntimeNumber(env.TRAFFIC_GUARD_WINDOW_MS, 60000, 10000, 600000),
      skill_rate_limit: boundedRuntimeNumber(env.SKILL_RATE_LIMIT, 60, 10, 10000),
      skill_rate_window_ms: boundedRuntimeNumber(env.SKILL_RATE_WINDOW_MS, 60000, 10000, 600000),
      duplicate_guard_seconds: boundedRuntimeNumber(env.DUPLICATE_GUARD_SECONDS, 90, 10, 3600),
      kakao_retry_dedup_seconds: boundedRuntimeNumber(env.KAKAO_RETRY_DEDUP_SECONDS, KAKAO_RETRY_DEDUP_SECONDS || 120, 10, 3600),
      kakao_repeat_guard_seconds: boundedRuntimeNumber(env.KAKAO_REPEAT_GUARD_SECONDS, 8, 2, 600),
      my_import_limit: boundedRuntimeNumber(env.MY_IMPORT_LIMIT, 120, 10, 1000),
      kakao_bulk_limit: boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80),
    },
  };
}

function rememberTrafficEvent(event = {}) {
  try {
    AB_TRAFFIC_EVENTS.push({
      at: new Date().toISOString(),
      kind: String(event.kind || "info").slice(0, 40),
      path: String(event.path || "").slice(0, 120),
      method: String(event.method || "").slice(0, 12),
      key: event.key ? nluOpsFingerprint(String(event.key || "")) : "",
      detail: redactOpsDetail(event.detail || "").slice(0, 220),
    });
    while (AB_TRAFFIC_EVENTS.length > 160) AB_TRAFFIC_EVENTS.shift();
    if (String(event.kind || "") === "limited") rememberOpsEvent({ kind: "rate_limited", severity: "warn", path: event.path, method: event.method, detail: event.detail });
  } catch (err) {}
}

function trafficClientKey(request) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
    const ua = request.headers.get("user-agent") || "";
    return `${String(ip).split(",")[0].trim()}|${String(ua).slice(0, 32)}`.slice(0, 120);
  } catch (err) {
    return "unknown";
  }
}

// KAKAO_SKILL_SECRET을 설정하기 전에는 /skill 요청 본문의 botUserKey를 신원으로
// 사용하므로 값을 바꿔가며 사용자별 제한을 우회할 수 있다. 그룹 챗봇의 정상 유입을
// 막지 않도록 높은 IP 상한을 함께 두고, 운영에서는 OpenBuilder 헤더 인증을 켠다.
function skillIpGuardLimit(env = {}) {
  return boundedRuntimeNumber(env.SKILL_IP_GUARD_LIMIT, 3000, 60, 100000);
}

function isTrafficGuardedPath(path = "", method = "GET") {
  const m = String(method || "GET").toUpperCase();
  const p = String(path || "");
  if (p === "/skill") return m === "POST";
  if (!["POST", "PATCH", "DELETE"].includes(m)) return false;
  return p === "/login" || p === "/my/local-login" || p === "/my/local-signup"
    || p.startsWith("/my/") || p.startsWith("/api/") || p.startsWith("/admin/") || p.startsWith("/backup/") || p.startsWith("/cron/");
}

function checkTrafficGuard(request, env, url) {
  const method = request.method || "GET";
  if (!isTrafficGuardedPath(url?.pathname || "", method)) return { ok: true, skipped: true };
  const now = Date.now();
  const windowMs = boundedRuntimeNumber(env.TRAFFIC_GUARD_WINDOW_MS, 60000, 10000, 600000);
  const authPath = ["/login", "/my/local-login", "/my/local-signup"].includes(String(url?.pathname || ""));
  const skillPath = String(url?.pathname || "") === "/skill";
  const limit = authPath
    ? boundedRuntimeNumber(env.AUTH_RATE_LIMIT, 8, 3, 30)
    : skillPath
      ? skillIpGuardLimit(env)
      : boundedRuntimeNumber(env.TRAFFIC_GUARD_LIMIT, 240, 20, 10000);
  const key = `${trafficClientKey(request)}|${String(url?.pathname || "").slice(0, 60)}`;
  pruneRateBucketMap(AB_TRAFFIC_BUCKETS, now, windowMs);
  let bucket = AB_TRAFFIC_BUCKETS.get(key);
  if (!bucket || now - Number(bucket.windowStart || 0) > windowMs) bucket = { windowStart: now, count: 0 };
  bucket.count += 1;
  AB_TRAFFIC_BUCKETS.set(key, bucket);
  const ok = bucket.count <= limit;
  if (!ok) rememberTrafficEvent({ kind: "limited", path: url?.pathname || "", method, key, detail: `${bucket.count}/${limit}` });
  return { ok, count: bucket.count, limit, resetInMs: Math.max(0, windowMs - (now - bucket.windowStart)), key };
}

function httpOriginFromHeader(value = "") {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "null") return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.origin : "";
  } catch (err) {
    return "";
  }
}

function hasBrowserSessionCookie(request) {
  try { return !!(getCookie(request, "ab_user") || getCookie(request, "ab_admin")); }
  catch (err) { return false; }
}

function isTrustedKakaoTransitionUrl(value = "") {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase();
    return host === "kakao.com" || host.endsWith(".kakao.com");
  } catch (err) {
    return false;
  }
}

function csrfSignalSummary(request, url) {
  const expected = String(url?.origin || "");
  const originRaw = String(request?.headers?.get("origin") || "").trim();
  const refererRaw = String(request?.headers?.get("referer") || "").trim();
  const origin = httpOriginFromHeader(originRaw);
  const referer = httpOriginFromHeader(refererRaw);
  const classify = (raw, parsed) => !raw ? "missing" : parsed ? (parsed === expected ? "same" : "different") : "opaque";
  return `fetch_site=${String(request?.headers?.get("sec-fetch-site") || "missing").slice(0, 20)};origin=${classify(originRaw, origin)};referer=${classify(refererRaw, referer)};session=${hasBrowserSessionCookie(request) ? "present" : "missing"}`;
}

function csrfOriginAllowed(request, url) {
  const method = String(request?.method || "GET").toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return true;
  const path = String(url?.pathname || "");
  if (path === "/skill" || path.startsWith("/cron/")) return true;
  if (/^Bearer\s+\S+/i.test(String(request.headers.get("authorization") || ""))) return true;
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") return false;
  const expectedOrigin = String(url?.origin || "");
  const originRaw = String(request.headers.get("origin") || "").trim();
  const origin = httpOriginFromHeader(originRaw);

  // A concrete HTTP(S) Origin is the strongest browser signal. A real mismatch
  // remains blocked even when a WebView reports a confusing Referer.
  if (origin) return origin === expectedOrigin;
  if (originRaw && originRaw.toLowerCase() !== "null") return false;

  // Kakao and a few mobile WebViews can preserve an opaque/app Referer or
  // `Origin: null` after OAuth. Fetch Metadata still identifies a same-site
  // form submission, so do not reject that legitimate request.
  if (["same-origin", "same-site", "none"].includes(fetchSite)) return true;

  const refererRaw = String(request.headers.get("referer") || "").trim();
  const refererOrigin = httpOriginFromHeader(refererRaw);
  if (refererOrigin) {
    if (refererOrigin === expectedOrigin) return true;
    if (originRaw.toLowerCase() === "null" && hasBrowserSessionCookie(request) && isTrustedKakaoTransitionUrl(refererRaw)) return true;
    return false;
  }

  // Older WebViews sometimes omit Fetch Metadata and expose only an opaque
  // app referrer. Accept that case only for an already authenticated browser.
  if ((originRaw || refererRaw) && !hasBrowserSessionCookie(request)) return false;
  return true;
}

function csrfRejectedResponse(url, request = null) {
  if (String(url?.pathname || "").startsWith("/api/") || wantsTransactionDeleteJson(request)) {
    return jsonResponse({ ok: false, error: "cross_site_request_blocked", reason: "cross_site_request_blocked", message: "보안 확인에 실패했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요." }, 403);
  }
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>요청을 확인할 수 없습니다</title></head><body><main style="max-width:680px;margin:48px auto;padding:20px;font-family:system-ui,sans-serif"><h1>요청을 안전하게 차단했습니다.</h1><p>다른 사이트에서 전송된 변경 요청으로 확인됐습니다. 가계부 화면을 새로 열어 다시 시도해주세요.</p><p><a href="/my">내 가계부로 이동</a></p></main></body></html>`, 403);
}

function getTrafficOpsSnapshot() {
  const now = Date.now();
  let activeBuckets = 0;
  for (const [k, v] of AB_TRAFFIC_BUCKETS.entries()) {
    if (!v || now - Number(v.windowStart || 0) > 10 * 60 * 1000) AB_TRAFFIC_BUCKETS.delete(k);
    else activeBuckets++;
  }
  const recent = AB_TRAFFIC_EVENTS.slice(-80).reverse();
  const byKind = recent.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  return { activeBuckets, recent, byKind };
}

function trafficLimitedResponse(url, request, result = {}, env = {}) {
  const retry = Math.max(1, Math.ceil(Number(result.resetInMs || 0) / 1000));
  if (url?.pathname === "/skill") return rateLimitedKakaoText(publicBaseUrl(env, url));
  if (String(url?.pathname || "").startsWith("/api/") || wantsTransactionDeleteJson(request)) return jsonResponse({ ok: false, error: "rate_limited", reason: "rate_limited", message: "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.", retry_after_seconds: retry }, 429);
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>요청이 잠시 제한되었어요</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:720px;margin:38px auto;padding:18px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;box-shadow:0 18px 44px rgba(15,23,42,.08)}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.muted{color:#64748b;line-height:1.6}</style></head><body><main class="wrap"><section class="card"><h1>잠시 후 다시 시도해주세요</h1><p class="muted">짧은 시간에 저장·수정 요청이 많아 데이터 중복을 막기 위해 잠깐 제한했습니다. 약 ${retry}초 뒤 다시 시도해주세요.</p><a class="btn" href="/my">내 가계부로 이동</a></section></main></body></html>`, 429, { "retry-after": String(retry) });
}

// V22.9.88(Y-7): 라우터의 요청 제한(trafficLimitedResponse)에서는 이 답이 응답 마무리 함수(kakaoGroupCompatibleResponse)를 거치지 않고
// 바로 나간다. 그래서 글에 주소를 넣지 않고 웹 가계부는 링크 버튼으로 단다(단톡방·1:1 모두 쓰는 글 카드, 바로가기 없음).
function rateLimitedKakaoText(origin = "") {
  const text = [
    "잠시만요 😊",
    "",
    "짧은 시간에 요청이 많아서 잠깐 쉬었다가 처리할게요.",
    "같은 내용을 여러 번 보내면 중복될 수 있어요.",
    "",
    "잠시 후 아래처럼 다시 보내주세요.",
    "• 요약",
    "• 오늘 기록 보기",
    "• 남은 예산",
  ].join("\n");
  if (!origin) return kakaoText(text);
  return jsonResponse({
    version: "2.0",
    template: { outputs: [{ textCard: { description: text, buttons: [{ label: "가계부 확인", action: "webLink", webLinkUrl: `${origin}/my` }], buttonLayout: "vertical" } }] },
  }, 200);
}
// @build:exports-start
export {
  AB_KAKAO_INFLIGHT, AB_KAKAO_REPEAT_GUARD, boundedRuntimeNumber, buildOpsSnapshot,
  checkSkillRateLimit, checkTrafficGuard, cleanupNluOpsRetention, csrfOriginAllowed,
  csrfRejectedResponse, csrfSignalSummary, duplicateGuardSeconds, duplicateSkippedReturnLocation,
  getNluOpsSnapshot, getSkillOpsSnapshot, getTrafficOpsSnapshot, isDatabaseBusyError,
  isDuplicateGuardSource, kakaoNluMarkV229148, markKakaoNluOutcomeV229148, nluOpsConfig,
  nluOutcomeFromKakaoResponse, pruneExpiringMap, pruneTimestampMap, rateLimitedKakaoText,
  rememberDuplicateEvent, rememberNluRuntimeEvent, rememberOpsEvent, rememberSkillEvent,
  scheduleNluOpsPersistence, skillIpGuardLimit, trafficClientKey, trafficLimitedResponse,
  userSafeErrorCode,
};
// @build:exports-end
