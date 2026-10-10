// @build:imports-start
import { extractAmount, normalizeText } from "../nlu/amount-parser.js";
import { numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

// =====================================================================
// 말해가계부 — 수정(edit) 파서 V4 (동봉 모듈 edit-parser-v4.js 이식본)
// "무한루프 원천 차단 + 이탈율 최소화" 전면 강화판
// ---------------------------------------------------------------------
// 방어선
//  [L1] 오타 허용 fuzzy 매칭 (편집거리 1까지: "지츨자", "금엑" 인식)
//  [L2] 값 자동 추론: 필드 없이 값만 와도 처리 (숫자→금액, 구성원명→지출자,
//       날짜어→날짜, 카드/현금→결제수단)
//  [L3] 추론이 애매하면 예/아니오 확인 단계 (awaiting_confirm)
//  [L4] 탈출 키워드 상시 인식: 취소/그만/됐어/나가기 → 즉시 세션 종료
//  [L5] 도움말 상시 인식: 도움말/도움/? → 전체 사용법
//  [L6] 실패 문구 회전(rotation): 같은 실패 문구 2회 연속 전송 물리적 차단
//  [L7] 전역 동일응답 가드: 어떤 경로든 직전 봇 메시지와 동일하면 변형 강제
//  [L8] 세션 TTL 만료 감지 + 만료 시 친절한 재시작 안내
//  [L9] 실패 시 항상 "복사해서 그대로 보낼 수 있는" 완성 예시 제공 (번호 포함)
//  [L10] 미인식 입력 텔레메트리 반환 → Supabase 적재 → 동의어 사전 지속 개선
// =====================================================================

// ------------------------- 사전 -------------------------
const FIELD_SYNONYMS = {
  amount:   ["금액", "가격", "얼마", "액수", "돈", "값"],
  category: ["분류", "카테고리", "항목", "분류변경"],
  method:   ["결제수단", "결재수단", "수단", "지불수단", "지불방법", "결제방법", "카드변경"],
  content:  ["내용", "이름", "품목", "제목", "메모"],
  date:     ["날짜", "일자", "날자"],
  payer:    ["지출자", "결제자", "결재자", "낸사람", "결제한사람", "지불자", "누가", "사람"],
  delete:   ["삭제", "지우기", "지워", "삭제해줘"],
};

const FIELD_BY_NUMBER = {
  1: "amount", 2: "category", 3: "method", 4: "content",
  5: "date", 6: "payer", 7: "delete",
};

const FIELD_LABEL = {
  amount: "금액", category: "분류", method: "결제수단",
  content: "내용", date: "날짜", payer: "지출자", delete: "삭제",
};

const FILLER_TOKENS = new Set([
  "변경", "바꿔", "바꾸기", "바꿔줘", "수정", "수정해줘",
  "으로", "로", "을", "를", "해줘", "해", "좀", "제발",
]);

// [L4] 탈출 / [L5] 도움말 — 어느 단계에서든 최우선 처리
const CANCEL_WORDS = new Set(["취소", "그만", "됐어", "안해", "안할래", "나가기", "종료", "stop", "그만할래"]);
const HELP_WORDS   = new Set(["도움말", "도움", "help", "?", "사용법", "어떻게"]);
const YES_WORDS    = new Set(["네", "응", "예", "맞아", "맞음", "ㅇㅇ", "ㅇ", "yes", "y", "그래", "웅"]);
const NO_WORDS     = new Set(["아니", "아니오", "아니요", "ㄴㄴ", "ㄴ", "no", "n", "노"]);

// [L2] 값 자동 추론용 사전
const DATE_WORDS = new Set(["오늘", "어제", "그제", "그저께", "엊그제", "내일", "모레"]);
const METHOD_WORDS = ["현금", "체크카드", "신용카드", "카드", "계좌이체", "이체", "페이", "카카오페이", "네이버페이", "삼성페이"];

// ------------------------- 유틸 -------------------------
function normalize(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function compact(s) {
  return normalize(s).replace(/\s/g, "").toLowerCase();
}

// 받침 유무에 따라 을/를, 으로/로 조사만 반환 — "지출자을(를)" 같은 어색함 제거
// 숫자로 끝나면 읽는 소리 기준 (0,3,6,7,8→받침 있음 / 1→ㄹ받침 / 2,4,5,9→받침 없음)
function josa(word, pair) {
  const last = String(word).trim().slice(-1);
  let hasBatchim = false, isRieul = false;
  if (/[0-9]/.test(last)) {
    hasBatchim = "013678".includes(last);
    isRieul = last === "1"; // 일, 칠·팔은 ㄹ 아님 — 1만 ㄹ
  } else {
    const code = last.charCodeAt(0);
    const isHangul = code >= 0xac00 && code <= 0xd7a3;
    const jong = isHangul ? (code - 0xac00) % 28 : 0;
    hasBatchim = isHangul && jong !== 0;
    isRieul = jong === 8;
  }
  if (pair === "을를") return hasBatchim ? "을" : "를";
  if (pair === "으로로") return hasBatchim && !isRieul ? "으로" : "로";
  return "";
}

// [L1] 편집거리 (레벤슈타인) — 짧은 한글 단어 오타 허용용
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

// 토큰 → 필드: 정확일치 단계 (번호 → 완전일치 → 접두일치)
function tokenToField(tokenRaw) {
  const token = normalize(tokenRaw).replace(/번$/, "");
  if (/^[1-7]$/.test(token)) return FIELD_BY_NUMBER[Number(token)];
  const c = compact(token);
  if (!c) return null;
  for (const [field, words] of Object.entries(FIELD_SYNONYMS)) {
    // 한 글자 동의어(돈·값)는 접두로 보지 않는다. "돈까스 12000원"이 금액 변경이 되면 안 된다.
    if (words.some((w) => c === w || (w.length >= 2 && c.startsWith(w)))) return field;
  }
  return null;
}

// [L1] fuzzy 단계 — 반드시 "고신뢰 값 추론" 검사 이후에만 호출할 것.
//      (안 그러면 "엄마"→"얼마(금액)", "어제"→"삭제" 같은 오인 발생)
function tokenToFieldFuzzy(tokenRaw) {
  const c = compact(normalize(tokenRaw).replace(/번$/, ""));
  if (!c || c.length < 2) return null;
  for (const [field, words] of Object.entries(FIELD_SYNONYMS)) {
    if (words.some((w) => w.length >= 2 && editDistance(c, w) <= 1)) return field;
  }
  return null;
}

// T6: 수정 세션 중 이 입력이 항목 이름(오타 포함)이나 1~7 번호로 시작하는지. 아니면서 금액과 내용을 갖춘
// 문장("점심 12000원 국민카드")은 수정 값이 아니라 새 기록이다.
function startsWithKakaoEditField(textRaw = "") {
  const first = normalize(textRaw).split(" ")[0] || "";
  return !!(tokenToField(first) || tokenToFieldFuzzy(first));
}

// [L2] 값만 보고 필드 추론. config.members = 그룹 구성원 이름 배열
function inferFieldFromValue(textRaw, config = {}) {
  const c = compact(textRaw);
  if (!c) return null;
  // 숫자(+원) → 금액
  if (/^\d[\d,]*원?$/.test(c)) return { field: "amount", value: c.replace(/[원,]/g, ""), confidence: "high" };
  // 날짜 표현 → 날짜
  if (DATE_WORDS.has(c) || /^\d{1,2}월\d{1,2}일$/.test(c) || /^\d{1,2}[\/.]\d{1,2}$/.test(c)) {
    return { field: "date", value: normalize(textRaw), confidence: "high" };
  }
  // V22.9.37 감사 NEW-8: "50억"·"1만3천원"처럼 단위가 붙은 금액 표기도 금액이다. 내용으로 넘기면 "내용을 '50억'으로
  // 바꾸는 건가요?"라고 되묻게 된다. 20억 상한은 반영 단계가 새 기록·한 줄 수정과 같은 문구로 거절한다.
  if (/[\d일이삼사오육칠팔구십백천만억]/.test(c) && !/^\d+$/.test(c)) {
    const unitAmount = normalizeKakaoEditAmountValue(textRaw);
    if (unitAmount) return { field: "amount", value: unitAmount, confidence: "high" };
  }
  // 구성원 이름 → 지출자
  const members = (config.members || ["엄마", "아빠", "아들", "딸"]).map(compact);
  if (members.includes(c)) return { field: "payer", value: normalize(textRaw), confidence: "high" };
  // 결제수단 어휘 → 결제수단 (등록 카드명 포함 가능: config.methods)
  const methods = [...METHOD_WORDS, ...(config.methods || [])];
  // 숫자가 섞인 문장("12000원 국민카드")은 결제수단 이름이 아니다.
  if (!/\d/.test(c) && methods.some((w) => c === compact(w) || c.endsWith("카드") || c.endsWith("페이"))) {
    return { field: "method", value: normalize(textRaw), confidence: "high" };
  }
  // 그 외 짧은 텍스트 → 내용일 가능성. 확신 낮음 → [L3] 확인 단계로
  // 단, 자모 나열(ㅁㄴㅇㄹ/ㅋㅋㅋ)이나 특수문자 나열은 의미 없는 입력으로 간주해 제외
  const meaningless = /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(c) || /^[^가-힣a-z0-9]+$/.test(c);
  if (!meaningless && c.length <= 10) {
    return { field: "content", value: normalize(textRaw), confidence: "low" };
  }
  return null;
}

// ------------------------- 파서 -------------------------
// 우선순위: ①정확 필드 매칭 → ②고신뢰 값 추론 → ③fuzzy 필드 매칭 → ④저신뢰 값 추론
// ②가 ③보다 앞이어야 "엄마"(지출자 값)가 "얼마"(금액 필드)로 오인되지 않음
// 처음 기록할 때 쓴 표기를 수정에도 그대로 쓸 수 있어야 한다. `점심 6만원`은 받아 주면서
// `수정 01번 금액 6만원`은 "숫자만 보내주세요"로 되돌리면, 앱이 아는 말을 사용자가
// 다시 배워야 한다. 입력 경로와 같은 추출기를 쓰되 금액처럼 생긴 문구만 통과시킨다.
const KAKAO_EDIT_AMOUNT_SHAPE = /^[0-9.,\s원억만천백십일이삼사오육칠팔구영공하나둘셋넷다섯여섯일곱여덟아홉]+$/;

function normalizeKakaoEditAmountValue(textRaw = "") {
  const text = normalizeText(textRaw);
  if (!text) return null;
  const plain = text.replace(/[원,\s]/g, "");
  if (/^\d+$/.test(plain)) return plain;
  if (!KAKAO_EDIT_AMOUNT_SHAPE.test(text)) return null;
  const found = extractAmount(text);
  return found && found.amount > 0 ? String(Math.round(found.amount)) : null;
}

function parseEditInput(textRaw, config = {}) {
  const text = normalize(textRaw);
  if (!text) return null;

  const tokens = text.split(" ");

  const buildFieldResult = (field) => {
    const valueTokens = tokens.slice(1).filter((t) => {
      const clean = t.replace(/[,.!?]/g, "");
      return clean && !FILLER_TOKENS.has(clean) && tokenToField(clean) !== field;
    });
    let value = valueTokens.join(" ") || null;
    if (field === "amount" && value) value = normalizeKakaoEditAmountValue(value);
    if (field === "delete") value = "confirm";
    return { field, value, via: "field" };
  };

  // ① 정확 필드 매칭
  const exact = tokenToField(tokens[0]);
  if (exact) return buildFieldResult(exact);

  // ② 고신뢰 값 추론 (숫자/구성원명/날짜어/결제수단)
  const inferred = inferFieldFromValue(text, config);
  if (inferred && inferred.confidence === "high") return { ...inferred, via: "infer" };

  // ③ fuzzy 필드 매칭 (오타: "지츨자")
  const fuzzy = tokenToFieldFuzzy(tokens[0]);
  if (fuzzy) return buildFieldResult(fuzzy);

  // ④ 저신뢰 값 추론 (확인 질문으로 이어짐)
  if (inferred) return { ...inferred, via: "infer" };
  return null;
}

// ------------------------- 응답 문구 (회전) -------------------------
// [L6] 같은 실패 문구가 2회 연속 나갈 수 없도록 회차별 상이한 문구
function failMessage(session, userText) {
  const n = session.repeatCount || 0; // 이번이 n+1회차
  const no = session.entryNo;
  const variants = [
    // 1회차: 짧은 재안내
    `🤔 무엇을 바꿀지 못 알아들었어요.\n항목 이름이나 번호를 보내주세요.\n예: 지출자 엄마 / 금액 13000 / 6`,
    // 2회차: 원문 echo + 근접 후보 + 복사용 완성 예시 [L9]
    (() => {
      const guess = nearestField(userText);
      let msg = `⚠️ '${userText}' 입력을 이해하지 못했어요.`;
      if (guess) msg += `\n혹시 ${FIELD_LABEL[guess]} 변경이라면 이걸 그대로 복사해서 보내주세요:\n👉 ${exampleFor(guess)}`;
      msg += `\n번호만 보내도 돼요: 1 금액 / 2 분류 / 3 결제수단 / 4 내용 / 5 날짜 / 6 지출자 / 7 삭제`;
      return msg;
    })(),
    // 3회차: 세션 종료 직전 최후 안내는 cancel 쪽에서 처리
  ];
  return variants[Math.min(n, variants.length - 1)];
}

function nearestField(text) {
  const c = compact(text);
  if (!c) return null;
  let best = null, bestDist = 99;
  for (const [field, words] of Object.entries(FIELD_SYNONYMS)) {
    for (const w of words) {
      const d = editDistance(c, w);
      if (d < bestDist) { bestDist = d; best = field; }
      if (c.includes(w.slice(0, 2)) && bestDist > 1) { bestDist = 1; best = field; }
    }
  }
  return bestDist <= 2 ? best : null;
}

function exampleFor(field) {
  return {
    amount: "금액 13000", category: "분류 카페/간식", method: "결제수단 현금",
    content: "내용 점심", date: "날짜 어제", payer: "지출자 엄마", delete: "삭제",
  }[field];
}

// [V4 핵심] 값 단계도 숫자 우선.
// 선택형(지출자/결제수단/분류/날짜)은 숫자 옵션 리스트를 제시하고,
// 입력형(금액/내용)만 자연어·숫자 직접 입력을 받는다.
// → 오타가 날 수 있는 모든 선택 지점이 숫자로 대체됨.
function buildValuePrompt(field, config = {}) {
  const numbered = (arr) => arr.map((v, i) => `${i + 1}. ${v}`).join("  ");

  if (field === "payer") {
    const options = config.members || ["아빠", "엄마"];
    return { prompt: `지출자를 누구로 바꿀까요? 번호로 골라주세요.\n${numbered(options)}`, options };
  }
  if (field === "method") {
    const options = [...new Set([...(config.methods || []), "현금", "체크카드", "신용카드", "계좌이체"])];
    return { prompt: `결제수단을 번호로 골라주세요.\n${numbered(options)}`, options };
  }
  if (field === "category") {
    const options = config.categories || ["식비", "카페/간식", "교통", "생활", "의료", "교육", "문화", "기타"];
    return { prompt: `분류를 번호로 골라주세요.\n${numbered(options)}`, options };
  }
  if (field === "date") {
    const options = ["오늘", "어제", "그제"];
    return { prompt: `날짜를 번호로 고르거나 직접 입력해주세요.\n${numbered(options)}  (직접 입력 예: 7월 20일)`, options, allowFreeText: true };
  }
  if (field === "amount") {
    return { prompt: "얼마로 바꿀까요? 예: 13000 · 1만3천원", options: null };
  }
  // content — 유일한 완전 자유 입력란
  return { prompt: "내용을 무엇으로 바꿀까요? 예: 점심", options: null };
}

const HELP_TEXT = (no) =>
  `📖 수정 방법 안내\n` +
  `① 숫자로 차근차근 (가장 안전):\n` +
  `번호를 보내면 → 바꿀 값도 번호로 골라요\n` +
  `1 금액 / 2 분류 / 3 결제수단 / 4 내용 / 5 날짜 / 6 지출자 / 7 삭제\n` +
  `② 한 줄로 바로 (가장 빠름):\n` +
  `👉 지출자 엄마 / 금액 13000 / 날짜 어제\n` +
  `그만하려면: 취소`;

// ------------------------- 세션 상태머신 -------------------------
// session = { entryNo, step: "awaiting_field"|"awaiting_value"|"awaiting_confirm",
//             field, pendingField, pendingValue, repeatCount, lastBotMsg, updatedAt }
// 세션 키: `${roomId}:${userId}` / [L8] TTL 5분

const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_FAILS = 3;
// 상태와 무관한 최종 안전장치: 한 수정 세션의 총 턴 수 상한.
// 확인 질문·필드 재선택이 뒤섞여도 이 상한에서 반드시 종료된다.
const MAX_TOTAL_TURNS = 8;

function isSessionExpired(session, nowMs = Date.now()) {
  return !session || !session.updatedAt || nowMs - session.updatedAt > SESSION_TTL_MS;
}

// [L8] 만료 세션의 메시지 처리 — 오래된 세션에 조용히 무반응하면 그것도 이탈 요인
function expiredReply(session) {
  return {
    action: "cancel",
    reply:
      `⏰ 수정 시간이 지나 ${session.entryNo}번 수정을 종료했어요.\n` +
      `다시 하려면 한 줄로 보내주세요:\n👉 수정 ${session.entryNo}번 지출자 엄마`,
    nextSession: null,
  };
}

function handleEditMessage(session, textRaw, config = {}) {
  const now = config.now || Date.now();
  if (isSessionExpired(session, now)) return expiredReply(session);

  // ---- [최종 안전장치] 총 턴 수 상한: 어떤 상태 조합이든 여기서 끊긴다 ----
  const totalTurns = (session.totalTurns || 0) + 1;
  session = { ...session, totalTurns };
  if (totalTurns > MAX_TOTAL_TURNS) {
    return {
      action: "cancel",
      log: { type: "turn_limit_cancel", entryNo: session.entryNo },
      reply:
        `😅 대화가 길어져 ${session.entryNo}번 수정을 종료했어요.\n` +
        `한 줄로 다시 보내주시면 바로 돼요:\n` +
        `👉 수정 ${session.entryNo}번 지출자 엄마\n` +
        `👉 수정 ${session.entryNo}번 금액 13000`,
      nextSession: null,
    };
  }

  const text = normalize(textRaw);
  const c = compact(text);

  // ---- [L4] 탈출 키워드: 어느 단계든 최우선 ----
  if (CANCEL_WORDS.has(c)) {
    return {
      action: "cancel",
      reply: `👌 ${session.entryNo}번 수정을 취소했어요. 언제든 다시 불러주세요!`,
      nextSession: null,
    };
  }

  // ---- [L5] 도움말: 어느 단계든 ----
  if (HELP_WORDS.has(c)) {
    return finish(session, {
      action: "reprompt",
      reply: HELP_TEXT(session.entryNo),
      nextSession: { ...session, updatedAt: now }, // 도움말은 실패 카운트 증가 없음
    });
  }

  // ---- [L3] awaiting_confirm: 예/아니오 ----
  if (session.step === "awaiting_confirm") {
    if (YES_WORDS.has(c)) {
      return applyResult(session, session.pendingField, session.pendingValue);
    }
    if (NO_WORDS.has(c)) {
      return finish(session, {
        action: "reprompt",
        // 여기서 탈출 안내를 빼면, 수정 세션인 줄 모르고 새 지출을 보낸 사람이
        // 계속 같은 확인 질문만 받으며 아무것도 저장하지 못한 채 갇힌다.
        reply: `그럼 무엇을 바꿀까요?\n예: 지출자 엄마 / 금액 13000 / 번호(1~7)\n새로 기록하려면 '취소'를 먼저 보내주세요.`,
        nextSession: { ...session, step: "awaiting_field", pendingField: null, pendingValue: null, repeatCount: 0, updatedAt: now },
      });
    }
    // 예/아니오가 아닌 새 입력이면 확인을 버리고 새 입력으로 재파싱 (아래로 통과)
    session = { ...session, step: "awaiting_field", pendingField: null, pendingValue: null };
  }

  // ---- awaiting_value: 이번 입력 전체가 값 [V4: 숫자 옵션 우선] ----
  if (session.step === "awaiting_value") {
    let value = text;
    const opts = session.valueOptions;

    // 숫자 선택 (선택형 필드)
    if (opts && /^\d+번?$/.test(c)) {
      const idx = Number(c.replace(/번$/, "")) - 1;
      if (idx >= 0 && idx < opts.length) {
        return applyResult(session, session.field, opts[idx]);
      }
      return fail(session, now, text, `1~${opts.length} 사이의 번호로 골라주세요.`);
    }
    // 옵션 이름 직접 입력도 허용 (예: "엄마") — 공백 무시 비교
    if (opts) {
      const hit = opts.find((o) => compact(o) === c);
      if (hit) return applyResult(session, session.field, hit);
      // 선택형인데 목록 밖 텍스트 → 날짜처럼 자유 입력 허용 필드만 통과
      if (session.field !== "date") {
        return fail(session, now, text, `목록의 번호로 골라주세요.\n${opts.map((v, i) => `${i + 1}. ${v}`).join("  ")}`);
      }
    }
    if (session.field === "amount") {
      const num = normalizeKakaoEditAmountValue(text);
      if (!num) return fail(session, now, text, `금액을 알아듣지 못했어요. 13000 · 1만3천 · 1만3천원 처럼 보내주세요.`);
      value = num;
    }
    if (!value) return fail(session, now, text);
    return applyResult(session, session.field, value);
  }

  // ---- awaiting_field: 필드(+값) 파싱 [L1][L2] ----
  const parsed = parseEditInput(text, config);

  if (!parsed) return fail(session, now, text);

  if (parsed.field === "delete") {
    return finish(session, {
      action: "delete",
      reply: `🗑️ ${session.entryNo}번 지출을 삭제했어요.\n되돌리려면: 복구 ${session.entryNo}번`,
      nextSession: null,
    });
  }

  // [L3] 값 추론 confidence 낮음 → 확인 질문
  if (parsed.via === "infer" && parsed.confidence === "low") {
    return finish(session, {
      action: "confirm",
      reply: `혹시 ${FIELD_LABEL[parsed.field]}${josa(FIELD_LABEL[parsed.field], "을를")} ${editValueLabel(parsed.field, parsed.value)}${josa(editValueLabel(parsed.field, parsed.value).replace(/'$/, ""), "으로로")} 바꾸는 건가요? (네/아니오)`,
      // 주의: repeatCount를 리셋하지 않는다. 저신뢰 확인이 반복되며
      // 실패 카운트가 초기화되는 루프를 fuzz 테스트가 실제로 잡아냈다.
      nextSession: { ...session, step: "awaiting_confirm", pendingField: parsed.field, pendingValue: parsed.value, updatedAt: now },
    });
  }

  if (parsed.value) return applyResult(session, parsed.field, parsed.value);

  // 필드만 → 값 되묻기 [V4: 선택형은 숫자 옵션 제시]
  const vp = buildValuePrompt(parsed.field, config);
  return finish(session, {
    action: "ask_value",
    reply: `✏️ ${vp.prompt}\n(그만하려면: 취소)`,
    nextSession: { ...session, step: "awaiting_value", field: parsed.field, valueOptions: vp.options, repeatCount: 0, updatedAt: now },
  });
}

// V22.9.17: 저장 응답은 "60,000원"인데 수정 응답만 '60000'이었다. 금액은 저장과 같은 표기로 보여 준다.
function editValueLabel(field, value) {
  if (field === "amount" && /^\d+$/.test(String(value ?? "").trim())) return `${numberWithCommas(Number(value))}원`;
  return `'${value}'`;
}

function applyResult(session, field, value) {
  const shown = editValueLabel(field, value);
  return finish(session, {
    action: "apply",
    field,
    value,
    reply: `✅ ${session.entryNo}번 ${FIELD_LABEL[field]}${josa(FIELD_LABEL[field], "을를")} ${shown}${josa(shown.replace(/'$/, ""), "으로로")} 변경했어요.`,
    nextSession: null,
  });
}

// ---- 실패 처리: 회차별 문구 회전 [L6] + 상한 도달 시 종료 + 텔레메트리 [L10] ----
function fail(session, now, userText, customMsg) {
  const count = (session.repeatCount || 0) + 1;

  if (count >= MAX_FAILS) {
    return {
      action: "cancel",
      log: { type: "unrecognized_final", entryNo: session.entryNo, input: userText },
      reply:
        `😅 계속 이해하지 못해서 ${session.entryNo}번 수정을 취소했어요.\n` +
        `아래 예시를 그대로 복사해서 한 줄로 보내면 바로 돼요:\n` +
        `👉 수정 ${session.entryNo}번 지출자 엄마\n` +
        `👉 수정 ${session.entryNo}번 금액 13000\n` +
        `👉 수정 ${session.entryNo}번 날짜 어제`,
      nextSession: null,
    };
  }

  const reply = customMsg ? `⚠️ ${customMsg}` : failMessage({ ...session, repeatCount: count - 1 }, userText);
  return finish(session, {
    action: "reprompt",
    log: { type: "unrecognized", entryNo: session.entryNo, input: userText, attempt: count },
    reply,
    nextSession: { ...session, repeatCount: count, updatedAt: now },
  });
}

// ---- [L7] 전역 동일응답 가드: 직전 봇 메시지와 같으면 변형 강제 ----
function finish(session, result) {
  if (result.nextSession && result.reply === session.lastBotMsg) {
    result.reply += `\n(입력이 계속 인식되지 않으면 '취소' 또는 '도움말'을 보내보세요)`;
  }
  if (result.nextSession) result.nextSession.lastBotMsg = result.reply;
  return result;
}

// ------------------------- [자동 검증] 예시문 = 테스트 -------------------------
// 규칙(I7): 봇 안내문에 등장하는 모든 예시 입력은 이 목록에 반드시 존재해야 한다.
const MENU_EXAMPLES = [
  { input: "금액 13000원",     expect: { field: "amount", value: "13000" } },
  { input: "금액 13000",       expect: { field: "amount", value: "13000" } },
  { input: "분류 카페/간식",   expect: { field: "category", value: "카페/간식" } },
  { input: "결제수단 현금",    expect: { field: "method", value: "현금" } },
  { input: "내용 점심",        expect: { field: "content", value: "점심" } },
  { input: "날짜 어제",        expect: { field: "date", value: "어제" } },
  { input: "지출자 변경",      expect: { field: "payer", value: null } },
  { input: "지출자 변경 엄마", expect: { field: "payer", value: "엄마" } },
  { input: "지출자 엄마",      expect: { field: "payer", value: "엄마" } },
  { input: "결재자 엄마",      expect: { field: "payer", value: "엄마" } },
  { input: "결제자 엄마",      expect: { field: "payer", value: "엄마" } },
  { input: "지츨자 엄마",      expect: { field: "payer", value: "엄마" } },   // fuzzy
  { input: "6",               expect: { field: "payer", value: null } },
  { input: "6번 엄마",         expect: { field: "payer", value: "엄마" } },
  { input: "삭제",             expect: { field: "delete", value: "confirm" } },
  { input: "엄마",             expect: { field: "payer", value: "엄마" } },   // 값 추론
  { input: "13000",           expect: { field: "amount", value: "13000" } }, // 값 추론
  { input: "어제",             expect: { field: "date", value: "어제" } },    // 값 추론
  { input: "체크카드",         expect: { field: "method", value: "체크카드" } },
];

function selfTest(config = {}) {
  const failures = [];
  for (const { input, expect } of MENU_EXAMPLES) {
    const got = parseEditInput(input, config);
    const ok = got && got.field === expect.field && got.value === expect.value;
    if (!ok) failures.push({ input, expect, got });
  }
  if (failures.length) {
    throw new Error("안내문 예시 파싱 실패:\n" + JSON.stringify(failures, null, 2));
  }
  return `selfTest OK — ${MENU_EXAMPLES.length}건 전부 통과`;
}

// ------------------------- [자동 검증 2] 루프 fuzz 테스트 -------------------------
// 랜덤·비정상 입력을 연속 투입해도 ① 동일 응답 2연속 없음 ② MAX_FAILS 이내 세션 종료
// ③ 예외 0건 임을 보장. 배포 스크립트에서 selfTest()와 함께 호출할 것.
function loopFuzzTest(config = {}, rounds = 200) {
  const garbagePool = [
    "ㅁㄴㅇㄹ", "ㅋㅋㅋㅋㅋ", "!@#$%^", "……", "🤔🤔🤔", "asdfgh", "12345678901234567890",
    "지출자변경변경", "수정수정", "ㅇ", "?", "....", "금액금액", "@봇아", "왜안돼",
    "아니그게아니고", "ㅏㅏㅏㅏ", "~~~", "번", "0", "99", "-1", "지출", "결", "엄",
  ];
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  let failures = [];

  for (let r = 0; r < rounds; r++) {
    let session = {
      entryNo: "03", step: "awaiting_field", repeatCount: 0,
      lastBotMsg: "", updatedAt: Date.now(),
    };
    let prevReply = null;
    let turns = 0;
    try {
      while (session && turns < MAX_TOTAL_TURNS + 3) {
        turns++;
        const input = rand(garbagePool);
        const res = handleEditMessage(session, input, config);
        if (res.reply === prevReply) {
          failures.push({ round: r, turn: turns, input, reason: "duplicate consecutive reply", reply: res.reply });
          break;
        }
        prevReply = res.reply;
        session = res.nextSession;
        if (!session) break; // cancel/apply — 정상 종료
      }
      if (session && turns >= MAX_TOTAL_TURNS + 3) {
        failures.push({ round: r, reason: `session not terminated within ${MAX_TOTAL_TURNS + 3} turns` });
      }
    } catch (e) {
      failures.push({ round: r, reason: "exception", message: String(e) });
    }
  }
  if (failures.length) {
    throw new Error(`loopFuzzTest 실패 ${failures.length}건:\n` + JSON.stringify(failures.slice(0, 5), null, 2));
  }
  return `loopFuzzTest OK — ${rounds}회 시퀀스에서 중복응답 0건, 미종료 세션 0건, 예외 0건`;
}
// @build:exports-start
export {
  FIELD_BY_NUMBER, FIELD_LABEL, FIELD_SYNONYMS, MAX_FAILS, MAX_TOTAL_TURNS, SESSION_TTL_MS,
  buildValuePrompt, compact, handleEditMessage, isSessionExpired, josa, loopFuzzTest,
  normalizeKakaoEditAmountValue, parseEditInput, selfTest, startsWithKakaoEditField,
};
// @build:exports-end
