// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError } from "../runtime/leases.js";
import { jsonResponse } from "../runtime/http.js";
import { kakaoSkillSafeFallbackText } from "./reply-texts.js";
import { KAKAO_MANUAL_HOME_TITLE } from "./manual-guides.js";
import { kakaoEditDayPrefixV4 } from "./edit-session-v4.js";
import { kakaoRecordGuardV229120 } from "./request-guards.js";
import { getKakaoBotGroupKey } from "./group-links-first-record.js";
import { parseMultipleTransactions } from "../nlu/transaction-parser.js";
import { formatDate, nowKstDate } from "../nlu/date-payment.js";
// @build:imports-end

// V22.9.26: 저장소가 상태 코드로 거절한 경우(Supabase 4xx·5xx)는 저장된 행이 없다.
function isUncertainStorageWrite(err) {
  // Alias/security wrappers must retain the transport outcome classification.
  for (let current = err, depth = 0; current && depth < 8; current = current.cause, depth += 1) {
    if (current.uncertain_write === true || current.code === "supabase_write_result_unknown") return true;
  }
  return false;
}

function isDefiniteStorageFailure(err) {
  if (isUncertainStorageWrite(err)) return false;
  return /^Supabase 4\d\d\b/.test(safeError(err) || "") && !/^Supabase 408\b/.test(safeError(err) || "");
}

function kakaoSaveFailedText(origin = "") {
  return [
    "저장하지 못했어요 😢",
    "",
    "가계부 저장소가 요청을 거절해 이번 내용은 기록되지 않았어요.",
    "잠시 후 같은 내용을 다시 보내 주세요.",
  ].join("\n");
}

// V22.9.119 O-1: 운영 DB 에만 있는 유니크 인덱스 transactions_kakao_request_unique_idx(같은 가계부·같은 카카오 사용자 키·같은 날·같은 구분·같은 금액·
// 같은 문장, source='kakao_skill'; 2026-11-10 운영 스키마 덤프)가 저장·수정을 거절했는가. 이 거절은 그날 몇 번 다시 보내도 같아서 ‘잠시 후 다시’ 가 틀린
// 안내다. PostgREST 오류 JSON 은 값이 든 details 가 인덱스 이름이 든 message 보다 앞이라, 문장이 길면 supabase() 가 자른 오류 글에서 이름이 빠질 수
// 있다. 그래서 details 앞쪽의 칸 목록으로도 알아본다(운영 스키마에서 이 칸 목록의 유니크 인덱스는 이것 하나다). 인덱스를 지우면(검토용 SQL
// migrations/V22_9_119_DROP_KAKAO_REQUEST_UNIQUE_REVIEW_ONLY.sql) 이 거절은 생기지 않고 둘째 기록이 저장된다.
const KAKAO_REQUEST_UNIQUE_INDEX_V229119 = "transactions_kakao_request_unique_idx";
const KAKAO_REQUEST_UNIQUE_COLUMNS_V229119 = "(household_id, source_user_key, transaction_date, type, amount, raw_text)=(";
function isKakaoRequestUniqueConflictV229119(err) {
  for (let current = err, depth = 0; current && depth < 8; current = current.cause, depth += 1) {
    const text = String(current?.message || "");
    if (/^Supabase 409\b/.test(text) && /\b23505\b/.test(text)
      && (text.includes(KAKAO_REQUEST_UNIQUE_INDEX_V229119) || text.includes(KAKAO_REQUEST_UNIQUE_COLUMNS_V229119))) return true;
  }
  return false;
}

// V22.9.119 O-1 후속(독립 검토 C·E): 다시 보낼 예시는 고정 문장이 아니라 걸린 그 문장 끝에 ‘두 번째’ 를 붙여 만든다(이미 ‘두 번째’·‘세 번째’ …
// 로 끝나면 다음 차례, ‘열 번째’ 다음은 예시 없음). 예시를 저장 경로와 같은 파서로 한 번 읽어(DB 요청 없음) 한 건·같은 날짜·같은 금액·같은
// 구분일 때만 보인다 — 그대로 보내면 그 기록이 저장된다는 뜻이다. 60자를 넘거나 주소 꼴이 든 문장은 예시 없이 방법만 말한다.
const KAKAO_SAME_TEXT_ORDINALS_V229119 = ["두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];
const KAKAO_SAME_TEXT_EXAMPLE_MAX_V229119 = 60;
// 후속 2(재검토 P2): 저장하는 원문(raw_text)은 300자에서 잘린다(카카오 저장·별도 구매). 290자 이상 문장은 끝에 덧붙인 말이 잘려 같은 문장이 되므로
// (그대로 따르면 다시 거절) 문장 앞에 덧붙이라고 하고, 끝에 ‘두 번째’ 를 붙인 예시는 내지 않는다.
const KAKAO_SAME_TEXT_LONG_V229119 = 290;
function kakaoSameTextLongV229119(rows = []) {
  return (Array.isArray(rows) ? rows : [rows]).some((row) => String(row?.raw_text ?? "").length >= KAKAO_SAME_TEXT_LONG_V229119);
}
// V22.9.120 통합 수정: 예시는 파서 확인에 더해 저장 직전 안전망(kakaoRecordGuardV229120)도 통과할 때만 보인다 — 그대로 보내면 저장된다는 위 약속을
// 안전망이 생긴 뒤에도 지킨다(메모에 ‘며칠 전에’·‘몇 월 며칠’ 같은 말이 남은 기록의 날짜 수정 예시가 되묻기로 막혔다). 걸리면 예시 없이 사실만(아래 세 답의 빈 예시 길).
// today = 예시를 만드는 그 요청의 오늘(skill-handler 가 안전망을 판정할 때 남긴 날) — 자정 근처에서 저장 지점 판정과 어긋나지 않게. 없으면 지금 날짜.
// 판정은 저장소를 읽지 않는다. request-guards 와 서로 가져오지만 두 모듈 모두 모듈을 읽을 때(최상위)는 서로의 값을 쓰지 않고 함수 안에서만 부른다.
function kakaoExampleParsesAsV229119(example = "", item = {}, today = "") {
  let parsed = null;
  try { parsed = parseMultipleTransactions(example, {}); } catch (_) { return false; }
  const one = Array.isArray(parsed) && !parsed.blocked && parsed.length === 1 ? parsed[0] : null;
  const kind = (value) => (value === "income" ? "income" : "expense");
  return !!one && String(one.transaction_date || "") === String(item?.transaction_date || "") && Number(one.amount) === Number(item?.amount)
    && kind(one.type) === kind(item?.type) && !kakaoRecordGuardV229120(example, parsed, String(today || "") || formatDate(nowKstDate()));
}
function kakaoSameTextExampleV229119(item = {}, today = "") {
  const base = String(item?.raw_text ?? "").replace(/\s+/g, " ").trim();
  if (!base || /:\/\/|www\./i.test(base)) return "";
  const ordinal = base.match(/^(.*\S)\s+(두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째$/);
  const next = ordinal ? KAKAO_SAME_TEXT_ORDINALS_V229119[KAKAO_SAME_TEXT_ORDINALS_V229119.indexOf(ordinal[2]) + 1] : "두";
  if (!next) return "";
  const example = `${ordinal ? ordinal[1] : base} ${next} 번째`;
  if (example.length > KAKAO_SAME_TEXT_EXAMPLE_MAX_V229119) return "";
  return kakaoExampleParsesAsV229119(example, item, today) ? example : "";
}

// 후속 2(재검토 P2): 날짜 수정 예시는 원문이 아니라 기록 칸(메모·금액·구분)과 바꿀 날짜로 만든다(‘11월 10일 버스 1500원 두 번째’). 원문에 ‘어제’ 같은
// 날짜 말이 있으면 앞에 날짜를 붙여도 파서가 그 말을 먼저 읽어 다른 날로 저장됐다. 위와 같은 파서가 한 건·그 날짜·그 금액·그 구분으로 읽을 때만
// 쓴다(수입은 ‘받음’ 을 넣은 꼴도 본다). 못 만들면 빈 값 — 답은 방법 문장 없이 사실만 말한다.
function kakaoDateEditExampleV229119(row = {}, date = "", today = "") {
  const amount = Number(row?.amount);
  if (!date || !Number.isSafeInteger(amount) || amount <= 0) return "";
  const memo = String(row?.memo ?? "").replace(/\s+/g, " ").trim().replace(/(?:^|\s+)(?:두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째$/, "");
  const base = `${kakaoEditDayPrefixV4(date)}${memo ? `${memo} ` : ""}${amount}원`;
  for (const example of row?.type === "income" ? [`${base} 두 번째`, `${base} 받음 두 번째`] : [`${base} 두 번째`]) {
    if (example.length > KAKAO_SAME_TEXT_EXAMPLE_MAX_V229119 || /:\/\/|www\./i.test(example)) continue;
    if (kakaoExampleParsesAsV229119(example, { transaction_date: date, amount, type: row?.type }, today)) return example;
  }
  return "";
}

// V22.9.119 O-1: 그 인덱스 때문에 저장하지 않았을 때의 답. 아무것도 새로 저장하지 않았고(여러 건이면 한 건도) 대기 표식·잠금도 남기지 않았다.
// items: [{ transaction_date, type, amount, raw_text, existing, repeated }] — 입력 순서, 같은 문장은 한 번. existing = 이미 저장된 같은 기록이 있음,
// repeated = 이번에 보낸 글 안에 같은 문장이 두 번 이상. 답 글에 주소를 넣지 않는다.
// 후속(독립 검토 A): skipped = 같은 글 안에서 120초 중복으로 건너뛴 내용(이미 가계부에 있다, 이번 요청은 그 행을 건드리지 않았다). 예전 답은 이것을
// 말하지 않고 ‘N건은 하나도 저장하지 않았어요 … 문장을 바꿔 전체를 다시’ 라고 해, 따르면 건너뛴 기록이 두 번 저장됐다. 이제 건너뛴 내용을 따로
// 적고 ‘새로 저장한 것은 없어요’ 로 시작하며, 다시 보낼 때 건너뛴 내용은 빼라고 한다.
// 후속 2(재검토 P2·P3): long = 걸린 문장(모르면 이번에 보낸 문장) 가운데 290자 이상이 있음 → ‘문장 앞에’, 예시 없음. 걸린 문장이 둘 이상이면
// ‘걸린 문장마다’, 한 글 안에서 같은 문장을 두 번 쓴 것이면 ‘둘 중 하나에만’(예전 ‘그 문장 끝에’ 는 어느 문장·몇 줄을 바꿀지 몰라 따르면 다시 거절됐다).
function kakaoSameTextExistsTextV229119(items = [], total = 1, skipped = [], options = {}) {
  const list = Array.isArray(items) ? items : [];
  const skippedList = Array.isArray(skipped) ? skipped : [];
  const kinds = new Set(list.map((item) => (item?.type === "income" ? "income" : "expense")));
  const word = kinds.size === 1 ? (kinds.has("income") ? "수입" : "지출") : "기록";
  const long = options?.long === true || kakaoSameTextLongV229119(list);
  const where = long ? "앞에" : "끝에";
  const example = list.length && !long ? kakaoSameTextExampleV229119(list[0], options?.today) : "";
  const exampleText = example ? ` 예: ‘${example}’` : "";
  const day = (date) => kakaoEditDayPrefixV4(date).trim();
  if (total <= 1 && !skippedList.length) {
    const date = list[0]?.transaction_date || "";
    return [
      "이번 내용은 저장하지 않았어요.",
      day(date) ? `${day(date)} 기록 중에 같은 문장으로 저장한 기록이 이미 있어요.` : "오늘 같은 문장으로 저장한 기록이 이미 있어요.",
      `같은 ${word}이 한 번 더 있었다면 문장 ${where} 낱말을 하나 덧붙여 다시 보내 주세요.${exampleText}`,
    ].join("\n");
  }
  // 보낸 문장 그대로 인용한다(‘어제 커피 4500’ 처럼 날짜 말이 문장에 들어 있어 날짜를 앞에 더 붙이지 않는다).
  const quote = (item) => `‘${String(item?.raw_text || "").replace(/\s+/g, " ").trim().slice(0, 30)}’`;
  const listed = (rows) => `${rows.slice(0, 3).map(quote).join(", ")}${rows.length > 3 ? ` 외 ${rows.length - 3}개` : ""}`;
  const existing = list.filter((item) => item?.existing);
  const repeated = list.filter((item) => !item?.existing && item?.repeated);
  const target = existing.length + repeated.length >= 2
    ? `걸린 문장마다${repeated.length ? "(같은 문장이 두 번이면 둘 중 하나에만)" : ""} ${where}`
    : repeated.length ? `같은 문장 둘 중 하나에만, 문장 ${where}` : `그 문장 ${where}`;
  return [
    skippedList.length ? "이번에 새로 저장한 것은 없어요." : `이번에 보낸 ${total}건은 하나도 저장하지 않았어요.`,
    ...(skippedList.length ? [`이미 저장돼 있어 건너뛴 내용: ${listed(skippedList)}`] : []),
    ...(existing.length ? [`같은 날 같은 문장으로 이미 저장한 기록이 있는 내용: ${listed(existing)}`] : []),
    ...(repeated.length ? [`이번에 보낸 글 안에 같은 문장이 두 번 있는 내용: ${listed(repeated)}`] : []),
    ...(!existing.length && !repeated.length ? [`${skippedList.length ? "나머지 중에" : "그중에"} 같은 날 같은 문장으로 이미 저장한 기록이 있는 내용이 있어요.`] : []),
    skippedList.length
      ? `같은 ${word}이 한 번 더 있었다면 건너뛴 내용은 빼고, ${target} 낱말을 하나 덧붙여 다시 보내 주세요.${exampleText}`
      : `같은 ${word}이 한 번 더 있었다면 ${target} 낱말을 하나 덧붙여 전체를 다시 보내 주세요.${exampleText}`,
  ].join("\n");
}

// V22.9.119 O-1: 카카오 수정(날짜·금액·구분을 바꾸는 수정)이 같은 인덱스에 걸렸을 때. 기록은 그대로다(DB 가 UPDATE 를 거절했다).
// 후속(독립 검토 E): 날짜 수정이면 다시 보낼 문장에 그 날짜가 있어야 한다(날짜 없이 보내면 오늘로 저장된다). 금액·구분 수정은 예전 문장 그대로다.
// 후속 2(재검토 P2): 날짜 수정 예시는 기록 칸으로 만든 문장(kakaoDateEditExampleV229119)이고, 그 문장을 보내라고 직접 말한다. 예시를 못 만들면
// 방법 문장(예전: ‘날짜를 넣고 문장 끝에 낱말을 …’ — 원문에 ‘어제’ 가 있으면 따라 보낸 문장이 다른 날로 저장됐다)을 내지 않고 사실 두 줄만 말한다.
function kakaoEditSameTextTextV229119(entryNo = "", row = {}, patch = {}, options = {}) {
  const date = String(patch?.transaction_date || row?.transaction_date || "");
  const day = kakaoEditDayPrefixV4(date).trim();
  const word = String(patch?.type || row?.type || "") === "income" ? "수입" : "지출";
  const dateEdit = !!patch?.transaction_date && String(patch.transaction_date) !== String(row?.transaction_date || "")
    && patch?.amount === undefined && patch?.type === undefined;
  const facts = [
    `${entryNo}번 기록을 바꾸지 않았어요. 기록은 그대로예요.`,
    `${day ? `${day} 기록 중에` : "오늘"} 같은 문장·같은 금액으로 저장한 기록이 이미 있어서 바꿀 수 없어요.`,
  ];
  if (!dateEdit) return [...facts, `서로 다른 ${word}이라면 이 기록을 지우고 문장을 조금 바꿔 다시 보내 주세요.`].join("\n");
  const example = kakaoDateEditExampleV229119(row, date, options?.today);
  return (example ? [...facts, `서로 다른 ${word}이라면 이 기록을 지우고 이 문장으로 다시 보내 주세요: ‘${example}’`] : facts).join("\n");
}

// V22.9.119 O-1 후속(독립 검토 B): 120초 중복 답이 권하는 ‘별도 구매 추가 <원문>’ 은 원래 기록과 같은 날·같은 문장으로 넣으므로, 인덱스가 있는 동안
// 확정(INSERT)이 늘 23505 로 거절된다. 예전 답(‘저장소가 요청을 거절해 … 같은 확인 식별자로만 다시 시도해 주세요’)은 다시 해도 같은 길을 권했다.
// 후속 2(재검토 P2): 290자 이상 문장은 위 규칙대로 ‘문장 앞에’, 예시 없음.
function kakaoSeparateSameTextTextV229119(row = {}, options = {}) {
  const income = row?.type === "income";
  const long = kakaoSameTextLongV229119([row]);
  const example = long ? "" : kakaoSameTextExampleV229119(row, options?.today);
  return [
    `별도 ${income ? "기록을" : "구매를"} 추가하지 않았어요. 새 기록은 저장하지 않았어요.`,
    "같은 날 같은 문장은 한 번 더 저장되지 않아요.",
    `${income ? "따로 들어온 돈이라면" : "서로 다른 구매라면"} ‘별도 ${income ? "기록" : "구매"} 추가’ 없이 문장 ${long ? "앞에" : "끝에"} 낱말을 하나 덧붙여 보내 주세요.${example ? ` 예: ‘${example}’` : ""}`,
  ].join("\n");
}

function kakaoSafeText(text = "") {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  // Kakao simpleText는 길이가 과하면 스킬 테스트에서 응답 검증 실패로 처리될 수 있어 안전 길이로 자릅니다.
  if (raw.length <= 950) return raw || "잠시 후 다시 시도해주세요.";
  // V22.9.77 감사 A-14: 자를 때는 줄 경계에서 자른다(예전에는 930자에서 줄 중간이 잘렸다). 줄바꿈이 앞쪽 절반에만 있으면
  // 낱말 경계에서, 그것도 없으면 예전처럼 930자에서 자른다.
  const head = raw.slice(0, 930);
  const line = head.lastIndexOf("\n");
  const space = head.lastIndexOf(" ");
  const cut = line >= 465 ? line : space >= 465 ? space : head.length;
  return `${head.slice(0, cut).trimEnd()}\n\n…자세한 내용은 메뉴를 눌러 확인해주세요.`;
}

function kakaoQr(label, messageText = label, extra = null) {
  const safeLabel = String(label || "").trim().slice(0, 14);
  const safeMessage = String(messageText || label || "").trim().slice(0, 80);
  if (!safeLabel || !safeMessage) return null;
  const out = { label: safeLabel, action: "message", messageText: safeMessage };
  // 오픈빌더 스킬 테스트 호환성을 위해 빈 extra 객체는 보내지 않습니다.
  if (extra && typeof extra === "object" && Object.keys(extra).length) out.extra = extra;
  return out;
}

function dedupeQuickReplies(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const q = item && item.label ? item : (Array.isArray(item) ? kakaoQr(item[0], item[1] || item[0]) : null);
    if (!q) continue;
    const key = `${q.label}|${q.messageText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= 10) break;
  }
  return out;
}

function kakaoDefaultQuickReplies() {
  // 문서/운영 화면에서 보여주는 단계형 바로연결 후보입니다.
  // 실제 일반 응답에는 자동 첨부하지 않습니다.
  return dedupeQuickReplies([
    ["시작", "시작"],
    ["가계부만들기", "가계부만들기"],
    ["초대코드참여", "초대코드참여"],
    ["예산설정", "예산설정"],
    ["이름설정", "이름설정"],
  ]);
}

function kakaoQuickRepliesForText(text = "") {
  // V21.5: 과거의 문구 기반 자동 바로연결은 사용하지 않습니다.
  // 단계형 흐름에서만 호출부가 quickReplies를 명시적으로 전달합니다.
  return [];
}

function kakaoText(text, quickReplies = null, status = 200) {
  const template = {
    outputs: [
      {
        simpleText: {
          text: kakaoSafeText(text),
        },
      },
    ],
  };
  const replies = Array.isArray(quickReplies) ? dedupeQuickReplies(quickReplies) : [];
  if (replies.length) template.quickReplies = replies;
  return jsonResponse({
    version: "2.0",
    template,
  }, status);
}

// 그룹 단톡방에서 봇만 멘션하고 내용 없이 보낸 경우(빈 발화)의 짧은 안내.
// 카카오 심사 요청: 문구는 기본 시작 안내의 절반 이하로 줄이고, 자세한 설명은
// 관리자센터 '도움말 블록'에 둔다. 버튼은 그룹 챗봇 스킬 응답 플러그인 액션
// guide(도움말 하단 창)와 mention(입력창에 챗봇 멘션 자동 입력)을 사용한다.
// V22.9.118(조정자 결정 2026-11-12): 가장 자주 나오고 방 사람 모두가 보는 답이라 약관 안내를 따로 말풍선으로 붙이지 않고 이 카드 안에 둔다 —
// 글 끝 짧은 한 줄(KAKAO_GROUP_EMPTY_MENTION_TERMS_LINE_V229118)과 ‘기록하기’ 바로 위 단추 ‘이용약관’(/terms 링크). 답은 말풍선 하나이고 글 전체(제목 + 설명)는
// 예전 시작 안내의 절반(96자) 이하, 글에 주소 없음. 상태·저장소를 읽지 않고 늘 같다(답 전 저장소 호출 0회). 개인정보처리방침 단추는 넣지 않는다
// (설명서 첫 화면의 약관 안내 카드와 ‘개인정보’ 답에 있다). kakaoTermsNoticeResponseV229118 은 이 카드 뒤에 카드를 더하지 않는다.
const KAKAO_GROUP_EMPTY_MENTION_TITLE = "안녕하세요 😊 말해가계부예요";
const KAKAO_GROUP_EMPTY_MENTION_TERMS_LINE_V229118 = "이용하면 이용약관에 동의한 것으로 봐요.";
const KAKAO_GROUP_EMPTY_MENTION_DESCRIPTION = [
  "친구와 함께 말 한마디로 간단히 기록하는 가계부 챗봇이에요.",
  "예) @말해가계부 점심 12000원",
  KAKAO_GROUP_EMPTY_MENTION_TERMS_LINE_V229118,
].join("\n");

function kakaoGroupEmptyMentionReply(origin = "") {
  return jsonResponse({
    version: "2.0",
    template: {
      outputs: [
        {
          textCard: {
            title: KAKAO_GROUP_EMPTY_MENTION_TITLE,
            description: KAKAO_GROUP_EMPTY_MENTION_DESCRIPTION,
            buttons: [
              // V22.9.70: ‘도움말’ 발화는 OpenBuilder 기본 도움말 블록(고정 패턴, 글만 있는 하단 창)으로 가므로,
              // 버튼형 설명서는 ‘도움말 보기’로 연다(단톡방은 버튼 이름을 그대로 보낸다 → 스킬이 ‘도움말’로 읽는다).
              // V22.9.72: 디자이너 피드백(2026-10-20) — ‘챗봇 멘션하기’는 ‘기록하기’로, 맨 아래에 둔다.
              { label: KAKAO_MANUAL_HOME_GROUP_LABEL, action: "message", messageText: KAKAO_MANUAL_HOME_GROUP_LABEL },
              // V22.9.118: 이용약관 링크(글 끝 안내 줄과 짝)는 ‘기록하기’ 앞에 둔다 — V22.9.72 규칙(‘기록하기’ 맨 아래)과 링크를 멘션 앞에 끼우는
              // kakaoPlaceLeftLinks 와 같은 순서(조정자 결정 2026-11-12). 주소는 단추에만 둔다(V22.9.88 Y-7).
              ...(origin ? [kakaoLinkButton("이용약관", `${origin}/terms`)] : []),
              { ...KAKAO_RECORD_MENTION_BUTTON },
            ],
            // V22.9.118: 단추가 셋이라 세로 배열을 적어 둔다 — 그룹 챗봇 안내서: 가로(horizontal)는 단추 2개까지만, 세로(vertical)는 5개까지 보인다.
            buttonLayout: "vertical",
          },
        },
      ],
    },
  }, 200);
}

// V22.9.72: 버튼 이름 상수. 단톡방 메시지 버튼은 이름을 그대로 보내므로 이름 = 명령이다.
const KAKAO_MANUAL_HOME_GROUP_LABEL = "도움말 보기";
const KAKAO_RECORD_MENTION_BUTTON = Object.freeze({ label: "기록하기", action: "mention" });
const KAKAO_NEXT_STEP_CARD_TEXT_MAX = 400;

// V22.9.72: 다음 행동으로 이어지는 답(2026-10-20 디자이너 피드백: 빈 결과·참여 전·예산 없음 안내는 짧게 쓰고 버튼으로 잇는다).
// 단톡방은 textCard 세로 버튼(메시지 버튼 + 맨 아래 ‘기록하기’ 멘션 플러그인), 1:1 은 바로가기(quickReplies)로 보낸다.
function kakaoNextStepReply(text, payload = {}, quickReplies = [], { record = true } = {}) {
  const replies = dedupeQuickReplies(Array.isArray(quickReplies) ? quickReplies : []).map((q) => [q.label, q.messageText]);
  if (!getKakaoBotGroupKey(payload)) return kakaoText(text, record ? [...replies, ["기록방법", "기록방법"]] : replies);
  const buttons = replies.slice(0, record ? 4 : 5).map(([label, messageText]) => ({ label: messageText.length <= 14 ? messageText : label, action: "message", messageText }));
  if (record) buttons.push({ ...KAKAO_RECORD_MENTION_BUTTON });
  return jsonResponse({
    version: "2.0",
    template: {
      outputs: [{ textCard: { description: kakaoSafeText(text).slice(0, KAKAO_NEXT_STEP_CARD_TEXT_MAX), buttons, buttonLayout: "vertical" } }],
    },
  }, 200);
}

const KAKAO_GROUP_SUPPORTED_OUTPUTS = new Set([
  "simpleText",
  "simpleImage",
  "textCard",
  "basicCard",
  "listCard",
  "itemCard",
]);

function kakaoGroupTextChoices(quickReplies = []) {
  const replies = dedupeQuickReplies(Array.isArray(quickReplies) ? quickReplies : []).slice(0, 5);
  if (!replies.length) return "";
  const lines = replies.map((reply, index) => {
    const command = String(reply.messageText || reply.label || "").replace(/\s+/g, " ").trim().slice(0, 60);
    return command ? `${index + 1}. ${command}` : "";
  }).filter(Boolean);
  if (!lines.length) return "";
  return ["더 고르려면 아래 문구를 보내 주세요.", ...lines].join("\n");
}

// V22.9.65: 그룹 챗봇은 QuickReplies 를 지원하지 않으므로 textCard 의 세로 메시지 버튼(카드당 최대 5개)으로 바꾼다.
// V22.9.67: 단톡방 메시지 버튼은 messageText 가 아니라 버튼 이름을 그대로 보낸다. 그래서 버튼 이름을 보낼 명령과
// 똑같이 맞춘다(14자 이하일 때). 안내 글이 짧으면 글과 버튼을 한 말풍선에 담아 대화창이 길어지지 않게 한다.
const KAKAO_GROUP_CARD_TEXT_MAX = 400;

function kakaoGroupChoiceButtons(quickReplies = []) {
  return dedupeQuickReplies(Array.isArray(quickReplies) ? quickReplies : [])
    .filter((reply) => reply.action === "message" && reply.messageText)
    .map((reply) => ({ label: reply.messageText.length <= 14 ? reply.messageText : reply.label, action: "message", messageText: reply.messageText }));
}

// V22.9.88(Y-7): 링크 버튼(leadButtons)은 메시지 버튼보다 앞에 둔다. 그래서 늘 첫 카드에 들어가고, 글로 늘어놓는 나머지(rest)에는 오지 않는다.
// 말풍선이 이미 3개이고 마지막 글이 길어 카드를 못 만들면 링크는 kakaoPlaceLeftLinks 가 다른 자리에 붙인다.
function kakaoGroupChoiceCards(quickReplies = [], outputs = [], leadButtons = []) {
  const buttons = [...leadButtons, ...kakaoGroupChoiceButtons(quickReplies)];
  if (!buttons.length) return { outputs, rest: [] };
  let merged = [...outputs];
  let used = 0;
  const lastIndex = merged.length - 1;
  const lastText = merged[lastIndex]?.simpleText?.text;
  if (typeof lastText === "string" && lastText.length <= KAKAO_GROUP_CARD_TEXT_MAX) {
    const chunk = buttons.slice(0, 5);
    merged[lastIndex] = { textCard: { description: lastText, buttons: chunk, buttonLayout: "vertical" } };
    used = chunk.length;
  }
  while (used < buttons.length && merged.length < 3) {
    const chunk = buttons.slice(used, used + 5);
    const title = used ? "더 보기" : chunk.every((button) => button.action === "webLink") ? "바로 열기" : "골라 주세요";
    merged.push({ textCard: { title, buttons: chunk, buttonLayout: "vertical" } });
    used += chunk.length;
  }
  const leftLinks = buttons.slice(used).filter((button) => button.action === "webLink");
  if (leftLinks.length) merged = kakaoPlaceLeftLinks(merged, leftLinks);
  return { outputs: merged, rest: buttons.slice(used).filter((button) => button.action === "message") };
}

// 글에서 주소를 뺐으므로 링크 버튼은 버리지 않는다. 자리를 찾는 차례: 버튼 자리가 남은 카드 → (단톡방만) 400자 이하 글 말풍선을 카드로 →
// 이웃한 글 말풍선 둘을 하나로 합쳐(합쳐도 950자 이하일 때) 생긴 자리에 ‘바로 열기’ 카드. 1:1 은 글 말풍선을 카드로 바꾸지 않는다(웹 연결
// 코드처럼 복사할 글이 있다). 그래도 자리가 없으면(말풍선 셋이 모두 버튼이 찬 카드이거나 합칠 수 없는 긴 글) 붙이지 못한다 — 지금 그런 답은 없다.
function kakaoPlaceLeftLinks(outputs = [], links = [], { convertText = true } = {}) {
  const placed = [...outputs];
  let left = [...links];
  for (let index = placed.length - 1; index >= 0 && left.length; index -= 1) {
    const card = placed[index]?.textCard;
    if (card) {
      const buttons = Array.isArray(card.buttons) ? card.buttons : [];
      const room = 5 - buttons.length;
      if (room <= 0) continue;
      const mention = buttons.filter((button) => button?.action === "mention");
      placed[index] = { textCard: { ...card, buttons: [...left.slice(0, room), ...buttons.filter((button) => button?.action !== "mention"), ...mention], buttonLayout: "vertical" } };
      left = left.slice(room);
    } else if (convertText && typeof placed[index]?.simpleText?.text === "string" && placed[index].simpleText.text.length <= KAKAO_GROUP_CARD_TEXT_MAX) {
      placed[index] = { textCard: { description: placed[index].simpleText.text, buttons: left.slice(0, 5), buttonLayout: "vertical" } };
      left = left.slice(5);
    }
  }
  while (left.length && placed.length >= 3) {
    const at = placed.findIndex((output, index) => index > 0 && typeof output?.simpleText?.text === "string" && typeof placed[index - 1]?.simpleText?.text === "string"
      && placed[index - 1].simpleText.text.length + 2 + output.simpleText.text.length <= KAKAO_SIMPLE_TEXT_SAFE_MAX);
    if (at < 1) break;
    placed.splice(at - 1, 2, { simpleText: { ...placed[at - 1].simpleText, text: `${placed[at - 1].simpleText.text}\n\n${placed[at].simpleText.text}` } });
  }
  if (left.length && placed.length < 3) placed.push({ textCard: { title: "바로 열기", buttons: left.slice(0, 5), buttonLayout: "vertical" } });
  return placed;
}

// V22.9.88(Y-7): 카카오 그룹 챗봇 심사 의견(2026-10-29) — 챗봇 답의 글에 http(s) 주소를 그대로 넣지 말고, 버튼을 누르면 그 페이지가
// 열리게 한다. 우리 사이트 주소는 링크 버튼(webLink)으로 옮긴다(주소만 있는 줄 바로 앞의 짧은 줄이 버튼 이름). 다른 곳 주소(사용자가
// 쓴 메모 등)는 버튼으로 만들지 않고 글에서 ‘(링크)’로 바꾼다. 단톡방의 ‘웹가계부’ 메시지 버튼도 바로 열리는 링크 버튼으로 바꾼다
// (1:1 의 ‘웹가계부’ 답은 웹 연결 코드를 주므로 메시지 버튼으로 둔다).
// 버튼을 누르면 카카오가 주소 뒤에 botUserKey·appUserId·botGroupKey 를 붙인다. V22.9.105 R-1 부터 웹은 botUserKey·botGroupKey 가 둘 다 있고 그 사람이
// 그 방 가계부 구성원일 때만 그 값으로 로그인 화면 없이 그 방 가계부를 연다(auth/kakao-room-open.js). appUserId 로는 열지 않는다.
// 주소는 주소에 쓰는 ASCII 글자까지만 본다. 한글이 바로 붙어도(‘…/my에서’) 주소에 넣지 않아 버튼 주소가 깨지지 않는다.
const KAKAO_TEXT_URL = /https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%[\]-]+/gi;
const KAKAO_URL_TRAILING = /[)\].,;:!?'"]+$/;
// 버튼 이름으로 쓰지 않는 줄: 문장 끝(.!?)·목록 줄(•·-·숫자·그림 글자로 시작)·‘이름: 값’ 꼴. 본문 줄을 버튼 이름으로 먹지 않는다.
const KAKAO_LINK_LABEL_SKIP = /[.!?。…]$|^[•·*▶※\d-]|^\p{Extended_Pictographic}|[:：]/u;
// 주소를 뺀 자리에 남는 빈 괄호·따옴표 쌍.
const KAKAO_EMPTY_PAIR = /\(\s*\)|\[\s*\]|‘\s*’|“\s*”|'\s*'|"\s*"/g;
const KAKAO_LINK_LABEL_MAX = 14;
// 한 답의 링크 버튼은 카드 하나에 들어가는 5개까지(지금 답은 많아야 2개).
const KAKAO_LINK_BUTTON_MAX = 5;
// 글 말풍선 안전 길이(kakaoSafeText 가 이보다 길면 자른다).
const KAKAO_SIMPLE_TEXT_SAFE_MAX = 950;
const KAKAO_WEB_LEDGER_COMMANDS = new Set(["웹가계부", "웹 가계부 열기"]);

function kakaoLinkButton(label, webLinkUrl) {
  return { label: String(label || "").trim().slice(0, KAKAO_LINK_LABEL_MAX) || "웹에서 보기", action: "webLink", webLinkUrl: String(webLinkUrl) };
}

function kakaoLinkDefaultLabel(pathname = "") {
  if (pathname === "/my" || pathname === "/app") return "웹 가계부 열기";
  if (pathname.startsWith("/my/households")) return "가계부 관리";
  if (pathname.startsWith("/my/settings")) return "설정 열기";
  if (pathname.startsWith("/my/analysis")) return "분석 보기";
  return "웹에서 보기";
}

// V22.9.105 R-9: 카카오는 방에서 링크 버튼을 누른 사람의 값(botUserKey·appUserId·botGroupKey)을 주소 뒤에 붙인다. 답 글에 이미 그 값이 적힌 우리 주소가
// 있으면(남의 기록 메모를 되풀이한 글 등) 버튼 주소에서 지워, 누른 사람의 값만 남게 한다(웹은 같은 이름의 값이 두 번 오면 열지 않는다).
const KAKAO_LINK_BUTTON_STRIP_PARAMS = ["botUserKey", "appUserId", "botGroupKey"];

function kakaoOwnLinkUrl(raw = "", origin = "") {
  try {
    const url = new URL(String(raw).replace(KAKAO_URL_TRAILING, ""));
    if (!origin || url.origin !== new URL(origin).origin) return null;
    if (KAKAO_LINK_BUTTON_STRIP_PARAMS.some((name) => url.searchParams.has(name))) {
      for (const name of KAKAO_LINK_BUTTON_STRIP_PARAMS) url.searchParams.delete(name);
    }
    return url;
  } catch (_) {
    return null;
  }
}

function kakaoTextLinks(text, origin = "") {
  if (typeof text !== "string" || !/https?:\/\//i.test(text)) return { text, links: [] };
  const lines = [];
  const links = [];
  for (const line of text.split("\n")) {
    const found = line.match(KAKAO_TEXT_URL);
    if (!found) {
      lines.push(line);
      continue;
    }
    let rest = line;
    const own = [];
    for (const raw of found) {
      // 주소 끝의 문장부호(마침표·닫는 괄호·따옴표)는 주소가 아니므로 글에 남긴다. 빈 괄호·따옴표 쌍은 아래에서 지운다.
      const cut = raw.replace(KAKAO_URL_TRAILING, "");
      const url = kakaoOwnLinkUrl(cut, origin);
      const at = rest.indexOf(cut);
      let before = rest.slice(0, at);
      const after = rest.slice(at + cut.length);
      // 우리 주소 바로 뒤에 낱말이 붙어 있으면(‘…/my에서’) 앞 빈칸도 지워 ‘웹 가계부에서’ 처럼 잇는다.
      if (url && /\s$/.test(before) && /^[^\s.,;:!?)\]’”'"]/u.test(after)) before = before.replace(/\s+$/, "");
      rest = before + (url ? "" : "(링크)") + after;
      if (url) own.push(url);
    }
    // 남은 글을 버튼 이름으로 쓰는 것은 ‘이름: 주소’·‘이름 → 주소’ 처럼 가름표 뒤의 주소가 줄 끝일 때뿐이다(‘자세한 내용은 주소.’ 는 글로 남김).
    const named = /[:：→]\s*$/u.test(rest) && line.trimEnd().endsWith(found.at(-1));
    rest = rest.replace(KAKAO_EMPTY_PAIR, "").replace(/\(\(링크\)\)/g, "(링크)").replace(/\s*[:：→-]\s*$/u, "")
      .replace(/\s+([.,;!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
    if (/^[\s.,;:!?'"’”…]*$/u.test(rest)) rest = "";
    let label = "";
    if (own.length === 1 && !rest) {
      const previous = String(lines.at(-1) || "").trim();
      if (previous && previous.length <= KAKAO_LINK_LABEL_MAX && !KAKAO_LINK_LABEL_SKIP.test(previous)) {
        label = previous;
        lines.pop();
      }
    } else if (own.length === 1 && named && rest.length <= KAKAO_LINK_LABEL_MAX && !KAKAO_LINK_LABEL_SKIP.test(rest)) {
      label = rest;
      rest = "";
    }
    for (const url of own) links.push(kakaoLinkButton(label || kakaoLinkDefaultLabel(url.pathname), url.href));
    if (rest) lines.push(rest);
  }
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), links };
}

function kakaoUniqueLinks(links = []) {
  const seen = new Set();
  return links.filter((button) => !seen.has(button.webLinkUrl) && seen.add(button.webLinkUrl)).slice(0, KAKAO_LINK_BUTTON_MAX);
}

// 카드 안의 주소는 그 카드의 남은 버튼 자리(5개까지)에 앞쪽으로 넣는다. ‘기록하기’(멘션)는 맨 아래. 있던 버튼은 밀어내지 않고,
// 자리가 모자란 링크(overflow)는 돌려줘 다른 자리에 붙인다. 링크를 넣으면 세로 배치로 둔다(가로는 2개까지만 보인다).
function kakaoLinkCardOutput(kind, card, origin) {
  const next = { ...card };
  const own = [];
  for (const field of ["title", "description"]) {
    if (typeof next[field] !== "string") continue;
    const result = kakaoTextLinks(next[field], origin);
    own.push(...result.links);
    if (result.text) next[field] = result.text;
    else delete next[field];
  }
  const buttons = Array.isArray(next.buttons) ? next.buttons : [];
  const links = kakaoUniqueLinks(own);
  const room = Math.max(0, 5 - buttons.length);
  if (links.length && room) {
    const mention = buttons.filter((button) => button?.action === "mention");
    next.buttons = [...links.slice(0, room), ...buttons.filter((button) => button?.action !== "mention"), ...mention];
    next.buttonLayout = "vertical";
  }
  if (!next.title && !next.description) next.title = "바로 열기";
  return { output: { [kind]: next }, overflow: links.slice(room) };
}

function kakaoLinkOutputs(outputs = [], origin = "") {
  const links = [];
  const result = [];
  for (const output of outputs) {
    if (typeof output?.simpleText?.text === "string") {
      const { text, links: found } = kakaoTextLinks(output.simpleText.text, origin);
      links.push(...found);
      if (text) result.push(text === output.simpleText.text ? output : { simpleText: { ...output.simpleText, text } });
      continue;
    }
    const kind = output?.textCard ? "textCard" : output?.basicCard ? "basicCard" : "";
    if (!kind) {
      result.push(output);
      continue;
    }
    const card = kakaoLinkCardOutput(kind, output[kind], origin);
    result.push(card.output);
    links.push(...card.overflow);
  }
  return { outputs: result, links: kakaoUniqueLinks(links) };
}

// 단톡방의 ‘웹가계부’ 메시지 버튼(설명서 카드·바꾼 바로가기 모두)은 누르면 웹 가계부가 바로 열리는 링크 버튼으로 바꾼다.
function kakaoWebLedgerLinkButtons(outputs = [], origin = "") {
  if (!origin) return outputs;
  return outputs.map((output) => {
    const kind = output?.textCard ? "textCard" : output?.basicCard ? "basicCard" : "";
    const buttons = kind && Array.isArray(output[kind].buttons) ? output[kind].buttons : null;
    if (!buttons?.some((button) => button?.action === "message" && KAKAO_WEB_LEDGER_COMMANDS.has(String(button.messageText || "").trim()))) return output;
    return { [kind]: { ...output[kind], buttons: buttons.map((button) => (button?.action === "message" && KAKAO_WEB_LEDGER_COMMANDS.has(String(button.messageText || "").trim())
      ? kakaoLinkButton(button.label, `${origin}/my`) : button)) } };
  });
}

// 1:1 은 바로가기(quickReplies)를 그대로 두고 글 속 주소만 링크 버튼으로 옮긴다. 글 말풍선은 그대로 두고(웹 연결 코드처럼 복사할
// 글이 있다) 버튼은 뒤의 ‘바로 열기’ 카드에 둔다. 말풍선이 이미 3개면 마지막 짧은 글에 붙인다.
async function kakaoDirectLinkResponse(response, origin = "") {
  try {
    const raw = await response.clone().text();
    if (!/https?:\/\//i.test(raw)) return response;
    const data = JSON.parse(raw || "{}");
    const template = data?.template && typeof data.template === "object" ? { ...data.template } : null;
    if (!template || !Array.isArray(template.outputs)) return response;
    const linked = kakaoLinkOutputs(template.outputs, origin);
    let outputs = linked.outputs.slice(0, 3);
    if (linked.links.length && outputs.length < 3) outputs.push({ textCard: { title: "바로 열기", buttons: linked.links, buttonLayout: "vertical" } });
    else if (linked.links.length) outputs = kakaoPlaceLeftLinks(outputs, linked.links, { convertText: false });
    if (!outputs.length) return response;
    const headers = new Headers(response.headers || {});
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ ...data, template: { ...template, outputs } }), { status: response.status, statusText: response.statusText, headers });
  } catch (_) {
    return response;
  }
}

// V22.9.88(Y-7): ‘웹가계부’ 답(단톡방). 주소 글 대신 웹 가계부를 여는 버튼 하나를 단다. V22.9.105 R-1: 이 방 가계부 구성원이 누르면 카카오가 붙인
// botUserKey·botGroupKey 로 로그인 화면 없이 바로 이 방 가계부 홈이 열린다. 구성원이 아니면 예전처럼 로그인(인앱은 자동 로그인 → 시작 팝업)이다.
// 이 방 가계부 번호(household_id)는 넣지 않는다. 단톡방 기록 계정과 웹 로그인 계정은 아직 이어지지 않아(챗봇에 앱이 연결되지 않아
// appUserId 가 없다), 웹 계정이 그 가계부 구성원이 아니면 /my?household_id= 는 ‘가계부를 찾을 수 없어요’(404)가 된다.
// V22.9.115: 방금 이 방 가계부에 들였으면(또는 첫 호출자로 준비했으면) 카드 앞에 한 줄(notice)로 알린다. 카드 글은 그대로 둔다.
function kakaoWebLedgerReply(origin = "", notice = "") {
  if (!origin) return kakaoText("웹 가계부는 말해가계부 웹사이트에서 로그인한 뒤 볼 수 있어요.");
  const lead = String(notice || "").trim();
  return jsonResponse({
    version: "2.0",
    template: {
      outputs: [...(lead ? [{ simpleText: { text: lead } }] : []), {
        textCard: {
          title: "웹 가계부",
          description: "전체 기록과 분석을 웹에서 크게 볼 수 있어요.\n아래 버튼을 누르면 이 방 가계부가 열려요.",
          buttons: [kakaoLinkButton("웹 가계부 열기", `${origin}/my`)],
          buttonLayout: "vertical",
        },
      }],
    },
  }, 200);
}

// V22.9.118 P-3(V95:E-1): 챗봇만 쓰는 사람은 약관·방침을 볼 기회 없이 사용자 행·가계부가 생겼다(V22.9.115 뒤로는 방에서 조회만 불러도 구성원).
// 처음 개인 가계부가 만들어지는 답(1:1 첫 기록)과 처음 그 방 가계부에 들어가는 답(방 첫 기록·첫 호출·참여)에만 한 줄 + 링크 단추 둘(이용약관·개인정보처리방침)을 단다.
// 그 자리(identity-chat-first·group-links-first-record)가 env.__AB_KAKAO_REQUEST.termsNoticeV229118 을 켜고, skill-handler 가 응답 마무리(글 속 주소 → 단추) 뒤의
// 최종 답(지연 답 포함)에 이 함수를 쓴다. 글에는 주소를 넣지 않고(V22.9.88 Y-7) 있던 단추는 건드리지 않는다: 답 맨 앞 말풍선이 참여 한 줄이면 그 말풍선을 한 줄과
// 단추를 단 카드로 바꾸고, 아니면 말풍선이 셋 미만일 때 끝에 카드를 하나 더한다. 셋이 다 찼으면 단추 없이 글 말풍선 끝에 한 줄만 붙인다. 저장소 호출은 없다.
// V22.9.118 독립 검토 P2: 단톡방에서 가장 흔한 첫 호출(봇만 부른 빈 멘션·설명서 첫 화면 = 시작·도움말·설명서·메뉴)은 답 뒤에 들이거나 상태가 답마다 달라
// 안내를 못 보고 구성원이 됐다(‘메뉴’·‘명령어’ 는 같은 첫 화면으로 답하지만 들이지는 않는다 — 안내는 똑같이 단다). 설명서 첫 화면 답(단톡방)에는 표시와 상관없이 늘 같은 한 줄 + 단추를 단다 — 답 카드의 제목으로 알아보며 상태·저장소를 읽지 않는다.
// 기존 카드의 글·단추는 그대로 두고 끝에 카드를 하나 더한다(말풍선이 하나라 늘 자리가 있다). 이미 안내가 있으면 두 번 달지 않는다.
// 빈 멘션 인사는 조정자 결정(2026-11-12)으로 카드 안에 짧은 줄과 ‘이용약관’ 단추를 담으므로(kakaoGroupEmptyMentionReply) 여기서는 아무것도 더하지 않는다.
const KAKAO_TERMS_NOTICE_LINE_V229118 = "말해가계부를 이용하면 이용약관에 동의한 것으로 봐요.";

// V22.9.118 독립 검토 P3: 첫 사용 답에 안내를 달지 못하고 지나가면(말풍선 셋이 다 차 자리가 없음·4초 뒤 지연 답·첫 사용 뒤 기록 저장 실패·답 뒤에 처음 들임)
// 다음 답은 첫 사용이 아니라 다시 오지 않는다. 동작은 그대로 두고 얼마나 자주인지 보려고 운영 이벤트를 요청마다 한 건만 남긴다(info, 이유 낱말만 — 사용자·방 정보 없음).
// 재검토 P3: 지연 답이 나간 요청은 버려지는 최종 답이 먼저 남긴 이유(no_room·not_saved)보다 늦은 답(deferred)이 실제 이유다 — 같은 이벤트의 이유만
// ‘deferred’ 로 고쳐 쓴다(요청마다 한 건은 그대로, 그 뒤 다른 이유는 무시).
function noteKakaoTermsNoticeDroppedV229118(env, reason = "") {
  const state = env?.__AB_KAKAO_REQUEST;
  const why = String(reason || "unknown");
  if (state?.termsNoticeDroppedV229118) {
    if (why === "deferred" && state.termsNoticeDroppedV229118 !== why) {
      state.termsNoticeDroppedV229118 = why;
      if (state.termsNoticeDroppedEventV229118) state.termsNoticeDroppedEventV229118.detail = why;
    }
    return;
  }
  const event = rememberOpsEvent({ kind: "kakao_terms_notice_dropped", severity: "info", path: "/skill", method: "POST", detail: why });
  if (state) {
    state.termsNoticeDroppedV229118 = why;
    state.termsNoticeDroppedEventV229118 = event || null;
  }
}

async function kakaoTermsNoticeResponseV229118(response, env = {}, origin = "", payload = {}) {
  const state = env?.__AB_KAKAO_REQUEST;
  const group = !!getKakaoBotGroupKey(payload);
  if ((!state?.termsNoticeV229118 && !group) || !origin || !response || response.status !== 200) return response;
  try {
    const data = JSON.parse(await response.clone().text() || "{}");
    const template = data?.template && typeof data.template === "object" ? data.template : null;
    const outputs = Array.isArray(template?.outputs) ? [...template.outputs] : [];
    if (!outputs.length) return response;
    // 빈 멘션 인사 카드는 안내를 자기 안에 담는다 — 첫 사용 표시가 켜진 경우(답 전에 들이는 실행)에도 말풍선을 늘리지 않는다.
    if (group && outputs.some((output) => output?.textCard?.title === KAKAO_GROUP_EMPTY_MENTION_TITLE)) return response;
    const always = group && outputs.some((output) => output?.textCard?.title === KAKAO_MANUAL_HOME_TITLE);
    if (!state?.termsNoticeV229118 && !always) return response;
    const line = KAKAO_TERMS_NOTICE_LINE_V229118;
    if (JSON.stringify(outputs).includes(line)) return response;
    const buttons = [kakaoLinkButton("이용약관", `${origin}/terms`), kakaoLinkButton("개인정보처리방침", `${origin}/privacy`)];
    const lead = String(state?.roomJoinNotice || state?.termsNoticeLeadV229118 || "").trim();
    const first = outputs[0]?.simpleText?.text;
    if (lead && typeof first === "string" && first.trim() === lead && lead.length + 1 + line.length <= KAKAO_GROUP_CARD_TEXT_MAX) {
      outputs[0] = { textCard: { description: `${lead}\n${line}`, buttons, buttonLayout: "vertical" } };
    } else if (outputs.length < 3) {
      outputs.push({ textCard: { description: line, buttons, buttonLayout: "vertical" } });
    } else {
      const at = outputs.findIndex((output) => typeof output?.simpleText?.text === "string" && output.simpleText.text.length + 2 + line.length <= KAKAO_SIMPLE_TEXT_SAFE_MAX);
      if (at < 0) {
        if (state?.termsNoticeV229118) noteKakaoTermsNoticeDroppedV229118(env, "no_room");
        return response;
      }
      outputs[at] = { simpleText: { ...outputs[at].simpleText, text: `${outputs[at].simpleText.text}\n\n${line}` } };
    }
    const headers = new Headers(response.headers || {});
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ ...data, template: { ...template, outputs } }), { status: response.status, statusText: response.statusText, headers });
  } catch (_) {
    return response;
  }
}

async function kakaoGroupCompatibleResponse(response, payload = {}, origin = "") {
  if (!getKakaoBotGroupKey(payload)) return kakaoDirectLinkResponse(response, origin);
  try {
    const raw = await response.clone().text();
    const data = JSON.parse(raw || "{}");
    const template = data?.template && typeof data.template === "object" ? { ...data.template } : {};
    const quickReplies = template.quickReplies;
    delete template.quickReplies;

    const supported = (Array.isArray(template.outputs) ? template.outputs : []).map((output) => {
      if (!output || typeof output !== "object") return null;
      const supportedKey = Object.keys(output).find((key) => KAKAO_GROUP_SUPPORTED_OUTPUTS.has(key));
      return supportedKey ? { [supportedKey]: output[supportedKey] } : null;
    }).filter(Boolean).slice(0, 3);

    if (!supported.length) return kakaoText(kakaoSkillSafeFallbackText(origin));
    const linked = kakaoLinkOutputs(supported, origin);
    const choice = kakaoGroupChoiceCards(quickReplies, linked.outputs, linked.links);
    const outputs = kakaoWebLedgerLinkButtons(choice.outputs, origin);
    const textChoices = kakaoGroupTextChoices(choice.rest);
    if (textChoices) {
      const simpleTextOutput = outputs.find((output) => output?.simpleText?.text);
      if (simpleTextOutput) {
        simpleTextOutput.simpleText = {
          ...simpleTextOutput.simpleText,
          text: kakaoSafeText(`${simpleTextOutput.simpleText.text}\n\n${textChoices}`),
        };
      } else if (outputs.length < 3) {
        outputs.push({ simpleText: { text: kakaoSafeText(textChoices) } });
      }
    }

    const headers = new Headers(response.headers || {});
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(JSON.stringify({ ...data, version: "2.0", template: { ...template, outputs } }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    return kakaoText(kakaoSkillSafeFallbackText(origin));
  }
}
// @build:exports-start
export {
  KAKAO_TERMS_NOTICE_LINE_V229118, dedupeQuickReplies, isDefiniteStorageFailure,
  isKakaoRequestUniqueConflictV229119, isUncertainStorageWrite, kakaoDefaultQuickReplies,
  kakaoEditSameTextTextV229119, kakaoGroupCompatibleResponse, kakaoGroupEmptyMentionReply,
  kakaoNextStepReply, kakaoQr, kakaoSameTextExistsTextV229119, kakaoSameTextLongV229119,
  kakaoSaveFailedText, kakaoSeparateSameTextTextV229119, kakaoTermsNoticeResponseV229118, kakaoText,
  kakaoWebLedgerReply, noteKakaoTermsNoticeDroppedV229118,
};
// @build:exports-end
