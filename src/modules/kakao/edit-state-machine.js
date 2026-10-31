// @build:imports-start
import { foldInputWidth } from "../client/shared-input-nlu.js";
import { KAKAO_EDIT_AMOUNT_V4, KAKAO_EDIT_VERB_V4 } from "./edit-vocabulary.js";
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
  payer:    ["지출자", "결제자", "결재자", "낸사람", "결제한사람", "지불자", "누가", "사람", "수입자", "받은사람"],
  delete:   ["삭제", "지우기", "지워", "삭제해줘"],
  // V22.9.77 감사 K-4: 수입↔지출 구분. 오타(퍼지) 매칭에서는 뺀다 — "기분"·"부분"·"구경"이 구분으로 읽히면 안 된다.
  type:     ["구분", "구분변경", "수입지출", "지출수입"],
};

// V22.9.77 감사 K-4: 8번은 맨 뒤에 붙인다. 1~7번의 뜻은 예전 그대로다(손에 익은 번호를 바꾸지 않는다).
const FIELD_BY_NUMBER = {
  1: "amount", 2: "category", 3: "method", 4: "content",
  5: "date", 6: "payer", 7: "delete", 8: "type",
};

const FIELD_LABEL = {
  amount: "금액", category: "분류", method: "결제수단",
  content: "내용", date: "날짜", payer: "지출자", delete: "삭제", type: "구분",
};

// V22.9.77 감사 K-4: 구분 값. "수입"·"지출"과 "수입으로"·"지출로 바꿔줘"·"수입 기록"을 같은 값으로 읽는다. 아니면 "".
function kakaoEditTypeValue(textRaw = "") {
  const c = compact(textRaw)
    .replace(/(?:바꿔줘|바꿔주세요|바꿔|바꾸기|변경해줘|변경|수정해줘|수정|해줘|해주세요)$/, "")
    .replace(/(?:으로|로)$/, "")
    .replace(/(?:기록|거래|내역)$/, "");
  if (c === "수입" || c === "income") return "수입";
  if (c === "지출" || c === "expense") return "지출";
  return "";
}

// V22.9.77 감사 K-4: 항목 이름 없이 온 구분 값. "수입으로"·"지출로 바꿔줘"처럼 방향이 있으면 바로 바꾸고, 낱말 하나("수입")는
// 확인을 받는다. 기록과 같은 구분의 낱말 하나("지출" 기록에 "지출")는 바꿀 것이 없으니 예전 해석(항목 이름 오타)에 맡긴다.
function inferKakaoEditTypeChange(textRaw = "", config = {}) {
  const value = kakaoEditTypeValue(textRaw);
  if (!value) return null;
  const bare = compact(textRaw) === value;
  if (bare && value === (config.rowType === "income" ? "수입" : "지출")) return null;
  return { field: "type", value, confidence: bare ? "low" : "high" };
}

function otherTypeWord(session = {}) { return session && session.rowType === "income" ? "지출" : "수입"; }

// V22.9.76 카카오 감사 8: 수입 기록의 사람 칸은 웹(수입자·지출자)과 같이 ‘수입자’라고 부른다. ‘지출자’라고 보내도
// 같은 칸으로 알아듣는다. session.rowType 은 수정 세션을 열 때 기록의 구분으로 정한다(예전 세션은 지출로 본다).
function payerWord(session = {}) { return session && session.rowType === "income" ? "수입자" : "지출자"; }
function fieldLabel(field, session = {}) { return field === "payer" ? payerWord(session) : FIELD_LABEL[field]; }

// V22.9.76 카카오 감사 2: 분류 목록의 기본값은 구분별 표준 분류 이름(CATEGORY_RULES 이름과 기타수입·기타지출)이다.
// 예전 기본 목록은 구분 없이 지출 이름뿐이었고 "의료"·"생활"처럼 표준이 아닌 이름이라 예산 집계에서 빠졌다.
const KAKAO_EDIT_DEFAULT_CATEGORIES = Object.freeze({
  expense: Object.freeze(["외식", "배달", "카페/간식", "장보기", "편의점", "교통", "생활용품", "쇼핑", "의료/병원", "문화/여가", "기타지출"]),
  income: Object.freeze(["급여", "용돈", "환급", "이자배당", "부업/매출", "기타수입"]),
});

const FILLER_TOKENS = new Set([
  "변경", "바꿔", "바꾸기", "바꿔줘", "수정", "수정해줘",
  "으로", "로", "을", "를", "해줘", "해", "좀", "제발",
]);

// [L4] 탈출 / [L5] 도움말 — 어느 단계에서든 최우선 처리
const CANCEL_WORDS = new Set(["취소", "그만", "됐어", "안해", "안할래", "나가기", "종료", "stop", "그만할래"]);
// V22.9.93 Q-37: ‘취소할게’·‘취소요’·‘1번 취소’ 도 세션을 끝내는 말이다. 예전에는 내용 칸의 값으로 저장됐다.
const KAKAO_EDIT_CANCEL_TALK = /^(?:\d{1,2}번)?(?:수정)?(?:취소|그만)(?:요|해요?|해줘|해주세요|할게요?|할래요?|합니다|하기)?$/;
const HELP_WORDS   = new Set(["도움말", "도움", "help", "?", "사용법", "어떻게"]);
const YES_WORDS    = new Set(["네", "응", "예", "맞아", "맞음", "ㅇㅇ", "ㅇ", "yes", "y", "그래", "웅"]);
const NO_WORDS     = new Set(["아니", "아니오", "아니요", "ㄴㄴ", "ㄴ", "no", "n", "노"]);

// [L2] 값 자동 추론용 사전
const DATE_WORDS = new Set(["오늘", "어제", "그제", "그저께", "엊그제", "내일", "모레"]);
const METHOD_WORDS = ["현금", "체크카드", "신용카드", "카드", "계좌이체", "이체", "페이", "카카오페이", "네이버페이", "삼성페이"];

const KAKAO_EDIT_ANSWER_END = new RegExp(String.raw`\s+(?:${KAKAO_EDIT_VERB_V4}|할게요?|할래요?|해요|합니다)$`);
const KAKAO_EDIT_ANSWER_JOSA_END = new RegExp(String.raw`(으로|로)\s*(?:${KAKAO_EDIT_VERB_V4}|할게요?|할래요?|해요|합니다)$`);
// ‘5000원으로’·‘5000원이요’·‘5천원입니다’·‘오천으로’·‘5000원 맞아요’·‘아니 5000원’: 금액만 보낸 답이다.
const KAKAO_AMOUNT_ANSWER_V4 = new RegExp(String.raw`^(?:(?:아니(?:요|오)?|아뇨|네|예|응|그럼|그냥|다시)[,\s]+)?(${KAKAO_EDIT_AMOUNT_V4}|[일이삼사오육칠팔구십백천만억\s]*[십백천만억])\s*(?:(?:으로|로)요?|이?요|입니다|이에요|예요|이야|야|임|이다|(?:이\s*)?맞(?:아요?|습니다|음))?$`);
// ‘커피 5000원으로 바꿔줘’: 세션의 기록을 되짚어 말한 금액 고치기다.
const KAKAO_NAMED_AMOUNT_ANSWER = new RegExp(String.raw`^\S.*\s(${KAKAO_EDIT_AMOUNT_V4})\s*(?:으로|로)$`);
// V22.9.93 Q-32: 칸 이름 뒤의 질문·불평·지우기 말은 바꿀 값이 아니다(‘아까 거 내용 뭐였지’ 가 메모를 ‘뭐였지’ 로 덮어썼다). ‘지우개’·‘맞춤’·‘이상형’ 은 값이라 낱말째로 본다.
const KAKAO_EDIT_COMPLAINT = String.raw`틀렸(?:어요?|네|음|다)?|틀려(?:요)?|틀림|잘못(?:됐어요?|됐네|됐음|됨|되었어요?)?|이상(?:해요?|함|한데|하네|합니다)|아니(?:야|에요|잖아|지)|아닌(?:데|듯|것\s*같아)`;
const KAKAO_EDIT_NOT_VALUE = new RegExp(String.raw`(?:^|\s)(?:뭐(?:야|예요|에요|임|냐|니|지|였지|였어요?|였더라|더라)?|얼마(?:야|예요|에요|임|냐|니|지|였지|였어요?)|언제(?:야|예요|에요|임|냐|니|지|였지|였어요?)|왜|어때요?|어떻게(?:\s*돼)?|확인(?:\s*해\s*(?:줘|주세요)?|\s*좀)?|맞(?:아요?|지|죠|나요?|니|냐|습니까|음)?|${KAKAO_EDIT_COMPLAINT}|지워(?:줘|주세요|요)?|지우기|삭제(?:해(?:줘|주세요)?)?|없애(?:줘|주세요)?|비워(?:줘|주세요)?|몰라(?:요)?)\s*[?？!]*$`);
const KAKAO_EDIT_COMPLAINT_REST = new RegExp(String.raw`^(\S+)\s+(?:${KAKAO_EDIT_COMPLAINT})\s*[?？!]*$`);

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
  if (/^[1-8]$/.test(token)) return FIELD_BY_NUMBER[Number(token)];
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
    if (field === "type") continue; // V22.9.77 감사 K-4: 구분은 정확히 쓴 말만 받는다(기분·부분 ≠ 구분).
    if (words.some((w) => w.length >= 2 && editDistance(c, w) <= 1)) return field;
  }
  return null;
}

// T6: 수정 세션 중 이 입력이 항목 이름(오타 포함)이나 1~7 번호로 시작하는지. 아니면서 금액과 내용을 갖춘
// 문장("점심 12000원 국민카드")은 수정 값이 아니라 새 기록이다.
// V22.9.76 감사 B-3: 끝난 수정 세션 뒤에 온 말이 수정 값 모양인지 본다("금액 13000", "지출자 엄마", "3", "6번 엄마").
// 새 기록의 첫 낱말이 우연히 필드 이름으로 시작하는 경우("사람들 회식 5만원")는 피하려고, 앞 낱말이 필드 이름이나
// 메뉴 번호와 똑같을 때만 맞다고 본다.
function isExactKakaoEditFieldStart(textRaw = "") {
  const token = (normalize(textRaw).split(" ")[0] || "").replace(/번$/, "");
  if (/^[1-8]$/.test(token)) return true;
  const c = compact(token);
  return !!c && Object.values(FIELD_SYNONYMS).some((words) => words.includes(c));
}

function startsWithKakaoEditField(textRaw = "") {
  const first = normalize(textRaw).split(" ")[0] || "";
  return !!(tokenToField(first) || tokenToFieldFuzzy(first));
}

// V22.9.93 Q-23: ‘결제수단 현금으로’·‘분류 외식으로’·‘날짜 어제로’·‘내용 점심으로’ 의 조사가 값으로 저장됐다(결제수단이 ‘현금으로’ 가 됐다). 칸이 정해진 값은 조사를 뗀다.
// V22.9.93 Q-34: 무조건 떼면 ‘종로’ 가 ‘종’, ‘현대카드 제로’ 가 ‘현대카드 제’ 가 됐다. ‘로’ 는 받침이 없거나 ㄹ 받침 뒤에, ‘으로’ 는 그 밖의 받침 뒤에 온다.
// 규칙에 어긋나거나 ‘로’ 앞이 한 글자이거나 낱말 자체면 이름의 일부다. 등록된 이름은 먼저 본다. 숫자 뒤의 조사는 뗀다(Q-43 ‘날짜 7/3으로’).
const KAKAO_EDIT_RO_WORD = /^(?:앞으로|뒤로|위로|새로|따로|바로|서로|그대로|제대로|을지로|퇴계로|충무로|세종로|청계로|테헤란로|.+대로)$/;

function stripKakaoEditDirection(field, value, config = {}) {
  const text = normalize(value);
  const known = field === "method" ? [...METHOD_WORDS, ...(config.methods || [])]
    : field === "category" ? config.categories || []
      : field === "payer" ? config.members || [] : [];
  if (known.some((name) => compact(name) === compact(text))) return text;
  const found = text.match(/^(.*?\S)\s*(으로|로)요?$/);
  if (!found) return text;
  const [, stem, particle] = found;
  if (known.some((name) => compact(name) === compact(stem)) || /\d$/.test(stem)) return stem;
  const code = stem.charCodeAt(stem.length - 1);
  const jong = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0;
  const word = stem.split(" ").pop();
  if ((particle === "로") !== (jong === 0 || jong === 8)) return text;
  if ((particle === "로" && word.length < 2) || KAKAO_EDIT_RO_WORD.test(word + particle)) return text;
  return stem;
}

// V22.9.93 Q-31: 세션 답의 앞뒤 말을 뗀다. ‘5000원으로 바꿔줘’·‘5000원이요’·‘5000원 맞아요’·‘아니 5000원’ 이 값으로 읽히지 않거나 메모에 그대로 남았다.
function kakaoEditAnswerText(textRaw = "") {
  const plain = normalize(textRaw).replace(/^(?:아니(?:요|오)?|아뇨)[,\s]+/, "");
  const amount = kakaoAmountAnswerValue(plain);
  if (amount) return amount;
  return normalize(plain.replace(KAKAO_EDIT_ANSWER_JOSA_END, "$1").replace(KAKAO_EDIT_ANSWER_END, "")) || plain;
}

function kakaoAmountAnswerValue(textRaw = "") {
  return (normalize(textRaw).match(KAKAO_AMOUNT_ANSWER_V4)?.[1] || "").trim();
}

// 금액 뒤나 앞에 다른 말이 붙은 답인지 본다. 금액만 있는 ‘5000원’ 은 기록으로 저장해 온 입력이라 들지 않는다.
function isKakaoAmountAnswer(textRaw = "") {
  const value = kakaoAmountAnswerValue(textRaw);
  return !!value && value !== normalize(textRaw);
}

function isKakaoEditNotValue(textRaw = "") {
  return KAKAO_EDIT_NOT_VALUE.test(normalize(textRaw));
}

// ‘방금 금액 틀렸어’ 처럼 칸을 짚은 불평이면 그 칸 이름을 준다. 값을 묻는 세션을 연다(안내만 하면 다음 말 ‘5000원’ 이 새 기록이 된다).
function kakaoEditComplaintField(textRaw = "") {
  const word = normalize(textRaw).match(KAKAO_EDIT_COMPLAINT_REST)?.[1] || "";
  return word && tokenToField(word) ? word : "";
}

function kakaoEditNamedAmount(textRaw = "") {
  const text = normalize(textRaw);
  if (startsWithKakaoEditField(text) || /^\d{1,2}\s*번(?:\s|$)/.test(text)) return "";
  return (text.match(KAKAO_NAMED_AMOUNT_ANSWER)?.[1] || "").trim();
}

// V22.9.93 Q-31: ‘금액은 5000원’·‘내용 점심으로 바꿔줘’ 의 칸 이름이 값으로 남았다. 묻고 있는 칸의 이름만 뗀다.
function stripKakaoEditFieldWord(field, textRaw = "") {
  const [first, ...rest] = normalize(textRaw).split(" ");
  const word = first.replace(/(?:을|를|은|는|이|가)$/, "");
  return rest.length && (FIELD_SYNONYMS[field] || []).some((name) => name === first || name === word) ? rest.join(" ") : normalize(textRaw);
}

// [L2] 값만 보고 필드 추론. config.members = 그룹 구성원 이름 배열
function inferFieldFromValue(textRaw, config = {}) {
  const c = compact(textRaw);
  if (!c) return null;
  // V22.9.93 Q-23: 조사를 뗀 값이 결제수단·날짜·구성원·분류·금액이면 그 칸이다(‘현금으로’·‘어제로’·‘외식으로’·‘5000원으로’). 숫자도 ‘원’ 도 없는 금액 꼴은 뺀다(‘일로’ 가 1원이 되면 안 된다).
  const stem = normalize(textRaw).replace(/\s*(?:으로|로)요?$/, "");
  if (stem && compact(stem) !== c) {
    const direct = inferFieldFromValue(stem, config);
    // V22.9.93 Q-36: ‘01번 2로 바꿔줘’ 가 2원이 됐다. 두 자리까지의 맨 숫자는 금액으로 보지 않는다.
    if (direct?.confidence === "high" && (direct.field !== "amount" || /\d{3}|[십백천만억]|원$/.test(stem))) return direct;
    if ((config.categories || []).includes(stem)) return { field: "category", value: stem, confidence: "high" };
  }
  // 숫자(+원) → 금액
  // V22.9.93 Q-33: 공백을 지운 값을 읽어 ‘5000 3000’ 이 50,003,000원이 됐다. 숫자 묶음이 둘이면 금액이 아니다.
  if (/^\d[\d,]*원?$/.test(c) && !KAKAO_EDIT_TWO_AMOUNTS.test(normalize(textRaw))) return { field: "amount", value: c.replace(/[원,]/g, ""), confidence: "high" };
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
    return { field: "content", value: stripKakaoEditDirection("content", textRaw, config), confidence: "low" };
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
const KAKAO_EDIT_TWO_AMOUNTS = /\d\s*원?\s+\d/;

function normalizeKakaoEditAmountValue(textRaw = "") {
  // V22.9.93 Q-21: ‘01번 금액 12.000원’ 이 12원으로 바뀌었다. 거래 문장과 같은 입구로 점 자릿수를 읽는다.
  const text = normalizeText(foldInputWidth(textRaw));
  if (!text || KAKAO_EDIT_TWO_AMOUNTS.test(text)) return null;
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
    if (value) value = stripKakaoEditDirection(field, value, config);
    if (field === "amount" && value) value = normalizeKakaoEditAmountValue(value);
    if (field === "delete") value = "confirm";
    if (field === "type") {
      // V22.9.77 감사 K-4: "구분 수입"·"구분을 지출로"·"구분수입"(붙여 씀)·"8 수입"을 같은 값으로 읽는다. 값이 없으면
      // null(반대 구분으로 바꿀지 묻는다), 알 수 없는 값이면 invalid 로 표시해 다시 묻는다.
      const head = compact(tokens[0]).replace(/번$/, "");
      const word = FIELD_SYNONYMS.type.filter((w) => head.startsWith(w)).sort((a, b) => b.length - a.length)[0] || "";
      const glued = word ? head.slice(word.length).replace(/^(?:을|를|은|는|이|가)/, "") : "";
      const raw = [glued, ...valueTokens].filter(Boolean).join(" ");
      const typed = raw ? kakaoEditTypeValue(raw) : "";
      return typed ? { field, value: typed, via: "field" } : { field, value: null, ...(raw ? { invalid: raw } : {}), via: "field" };
    }
    return { field, value, via: "field" };
  };

  // ① 정확 필드 매칭
  const exact = tokenToField(tokens[0]);
  if (exact) return buildFieldResult(exact);

  // ② 고신뢰 값 추론 (숫자/구성원명/날짜어/결제수단)
  const inferred = inferFieldFromValue(text, config);
  if (inferred && inferred.confidence === "high") return { ...inferred, via: "infer" };

  // ②-2 V22.9.77 감사 K-4: 구분 값("수입으로", "지출로 바꿔줘", "수입"). ③보다 앞이어야 "수입"이 ‘수입자’ 오타로 읽히지 않는다.
  const typeChange = inferKakaoEditTypeChange(text, config);
  if (typeChange) return { ...typeChange, via: "infer" };

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
    `🤔 무엇을 바꿀지 못 알아들었어요.\n항목 이름이나 번호를 보내주세요.\n예: ${payerWord(session)} 엄마 / 금액 13000 / 6`,
    // 2회차: 원문 echo + 근접 후보 + 복사용 완성 예시 [L9]
    (() => {
      const guess = nearestField(userText);
      let msg = `⚠️ '${userText}' 입력을 이해하지 못했어요.`;
      if (guess) msg += `\n혹시 ${fieldLabel(guess, session)} 변경이라면 이걸 그대로 복사해서 보내주세요:\n👉 ${exampleFor(guess, session)}`;
      msg += `\n번호만 보내도 돼요: 1 금액 / 2 분류 / 3 결제수단 / 4 내용 / 5 날짜 / 6 ${payerWord(session)} / 7 삭제 / 8 구분`;
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

function exampleFor(field, session = {}) {
  return {
    amount: "금액 13000", category: "분류 카페/간식", method: "결제수단 현금",
    content: "내용 점심", date: "날짜 어제", payer: `${payerWord(session)} 엄마`, delete: "삭제",
    type: `구분 ${otherTypeWord(session)}`,
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
    return { prompt: `${config.rowType === "income" ? "수입자" : "지출자"}를 누구로 바꿀까요? 번호로 골라주세요.\n${numbered(options)}`, options };
  }
  if (field === "method") {
    const options = [...new Set([...(config.methods || []), "현금", "체크카드", "신용카드", "계좌이체"])];
    return { prompt: `결제수단을 번호로 골라주세요.\n${numbered(options)}`, options };
  }
  if (field === "category") {
    const options = config.categories || [...KAKAO_EDIT_DEFAULT_CATEGORIES[config.rowType === "income" ? "income" : "expense"]];
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

const HELP_TEXT = (no, session = {}) =>
  `📖 수정 방법 안내\n` +
  `① 숫자로 차근차근 (가장 안전):\n` +
  `번호를 보내면 → 바꿀 값도 번호로 골라요\n` +
  `1 금액 / 2 분류 / 3 결제수단 / 4 내용 / 5 날짜 / 6 ${payerWord(session)} / 7 삭제 / 8 구분(수입↔지출)\n` +
  `② 한 줄로 바로 (가장 빠름):\n` +
  `👉 ${payerWord(session)} 엄마 / 금액 13000 / 날짜 어제 / 구분 ${otherTypeWord(session)}\n` +
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
      `다시 하려면 한 줄로 보내주세요:\n👉 수정 ${session.entryNo}번 ${payerWord(session)} 엄마`,
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
        `👉 수정 ${session.entryNo}번 ${payerWord(session)} 엄마\n` +
        `👉 수정 ${session.entryNo}번 금액 13000`,
      nextSession: null,
    };
  }

  const text = normalize(textRaw);
  const c = compact(text);

  const answer = kakaoEditAnswerText(text);

  // ---- [L4] 탈출 키워드: 어느 단계든 최우선 ----
  if (CANCEL_WORDS.has(c) || KAKAO_EDIT_CANCEL_TALK.test(c)) {
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
      reply: HELP_TEXT(session.entryNo, session),
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
        reply: `그럼 무엇을 바꿀까요?\n예: ${payerWord(session)} 엄마 / 금액 13000 / 번호(1~8)\n새로 기록하려면 '취소'를 먼저 보내주세요.`,
        nextSession: { ...session, step: "awaiting_field", pendingField: null, pendingValue: null, repeatCount: 0, updatedAt: now },
      });
    }
    // 예/아니오가 아닌 새 입력이면 확인을 버리고 새 입력으로 재파싱 (아래로 통과)
    session = { ...session, step: "awaiting_field", pendingField: null, pendingValue: null };
  }

  // ---- awaiting_value: 이번 입력 전체가 값 [V4: 숫자 옵션 우선] ----
  if (session.step === "awaiting_value") {
    const spoken = stripKakaoEditFieldWord(session.field, answer);
    let value = stripKakaoEditDirection(session.field, spoken, config);
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
      // V22.9.93 Q-31: ‘현금이요’·‘외식요’ 도 목록의 이름이다.
      const polite = value.replace(/(?:이요|요|입니다|이에요|예요)$/, "");
      const hit = opts.find((o) => compact(o) === c || compact(o) === compact(value) || compact(o) === compact(polite));
      if (hit) return applyResult(session, session.field, hit);
      // 선택형인데 목록 밖 텍스트 → 날짜처럼 자유 입력 허용 필드만 통과
      if (session.field !== "date") {
        return fail(session, now, text, `목록의 번호로 골라주세요.\n${opts.map((v, i) => `${i + 1}. ${v}`).join("  ")}`);
      }
    }
    // V22.9.93 Q-32·Q-37: 묻는 말과 다른 기록의 번호는 값이 아니다(‘뭐였지’·‘02번 점심’ 이 메모가 됐다).
    if (isKakaoEditNotValue(value)) return fail(session, now, text, `바꿀 값을 알아듣지 못했어요. 기록은 그대로예요.\n예: ${exampleFor(session.field, session)}\n(그만하려면: 취소)`);
    if (/^\d{1,2}\s*번(?:\s|$)/.test(value)) return fail(session, now, text, `지금은 ${session.entryNo}번 기록을 고치고 있어요. 번호 없이 바꿀 값만 보내 주세요.\n다른 기록을 고치려면 먼저 ‘취소’를 보내 주세요.`);
    if (session.field === "amount") {
      const num = normalizeKakaoEditAmountValue(kakaoEditNamedAmount(spoken) || value);
      if (!num) return fail(session, now, text, `금액을 알아듣지 못했어요. 13000 · 1만3천 · 1만3천원 처럼 보내주세요.`);
      value = num;
    }
    if (!value) return fail(session, now, text);
    return applyResult(session, session.field, value);
  }

  // ---- awaiting_field: 필드(+값) 파싱 [L1][L2] ----
  // V22.9.93 Q-42: 메뉴 번호(1~8)와 달리 ‘02번’ 은 기록 번호다. 예전에는 ‘수정 01번’ 뒤의 ‘02번 12000원으로 바꿔줘’ 가 01번의 금액을 바꿨다.
  if (/^0\d\s*번(?:\s|$)/.test(answer)) return fail(session, now, text, `지금은 ${session.entryNo}번 기록을 고치고 있어요. 번호 없이 바꿀 칸과 값을 보내 주세요. 예: 금액 13000\n다른 기록을 고치려면 먼저 ‘취소’를 보내 주세요.`);
  const namedAmount = kakaoEditNamedAmount(answer);
  const parsed = parseEditInput(namedAmount ? `금액 ${namedAmount}` : answer, { ...config, rowType: config.rowType || session.rowType });

  if (!parsed) return fail(session, now, text);

  if (parsed.field === "delete") {
    return finish(session, {
      action: "delete",
      reply: `🗑️ ${session.entryNo}번 ${session.rowType === "income" ? "수입" : "지출"}을 삭제했어요.\n되돌리려면: 복구 ${session.entryNo}번`,
      nextSession: null,
    });
  }

  // V22.9.77 감사 K-4: 구분(8번)을 값 없이 고르면 반대 구분으로 바꿀지 묻는다. 둘 중 하나라 목록이 필요 없고, 잘못 누른
  // 8번이 분류까지 바꾸지 않도록 ‘네’를 받은 뒤에만 반영한다. 알 수 없는 값("구분 뭐")은 바꾸지 않고 다시 묻는다.
  if (parsed.field === "type" && !parsed.value) {
    if (parsed.invalid) return fail(session, now, text, `구분은 ‘수입’이나 ‘지출’로 보내 주세요.\n예: ${exampleFor("type", session)}`);
    const from = session.rowType === "income" ? "수입" : "지출";
    const to = otherTypeWord(session);
    return finish(session, {
      action: "confirm",
      reply: `✏️ ${session.entryNo}번 기록을 ${from}에서 ${to}${josa(to, "으로로")} 바꿀까요? (네/아니오)\n분류는 ${to} 분류로 다시 정해요.\n(그만하려면: 취소)`,
      nextSession: { ...session, step: "awaiting_confirm", pendingField: "type", pendingValue: to, updatedAt: now },
    });
  }

  // [L3] 값 추론 confidence 낮음 → 확인 질문
  if (parsed.via === "infer" && parsed.confidence === "low") {
    return finish(session, {
      action: "confirm",
      reply: `혹시 ${fieldLabel(parsed.field, session)}${josa(fieldLabel(parsed.field, session), "을를")} ${editValueLabel(parsed.field, parsed.value)}${josa(editValueLabel(parsed.field, parsed.value).replace(/'$/, ""), "으로로")} 바꾸는 건가요? (네/아니오)`,
      // 주의: repeatCount를 리셋하지 않는다. 저신뢰 확인이 반복되며
      // 실패 카운트가 초기화되는 루프를 fuzz 테스트가 실제로 잡아냈다.
      nextSession: { ...session, step: "awaiting_confirm", pendingField: parsed.field, pendingValue: parsed.value, updatedAt: now },
    });
  }

  if (parsed.value) return applyResult(session, parsed.field, parsed.value);

  // 필드만 → 값 되묻기 [V4: 선택형은 숫자 옵션 제시]
  const vp = buildValuePrompt(parsed.field, { ...config, rowType: config.rowType || session.rowType });
  return finish(session, {
    action: "ask_value",
    reply: `✏️ ${vp.prompt}\n(그만하려면: 취소)`,
    nextSession: { ...session, step: "awaiting_value", field: parsed.field, valueOptions: vp.options, repeatCount: 0, updatedAt: now },
  });
}

// V22.9.17: 저장 응답은 "60,000원"인데 수정 응답만 '60000'이었다. 금액은 저장과 같은 표기로 보여 준다.
function editValueLabel(field, value) {
  if (field === "amount" && /^\d+$/.test(String(value ?? "").trim())) return `${numberWithCommas(Number(value))}원`;
  if (field === "type") return String(value ?? ""); // V22.9.77 감사 K-4: "구분을 수입으로"
  return `'${value}'`;
}

function applyResult(session, field, value) {
  const shown = editValueLabel(field, value);
  return finish(session, {
    action: "apply",
    field,
    value,
    reply: `✅ ${session.entryNo}번 ${fieldLabel(field, session)}${josa(fieldLabel(field, session), "을를")} ${shown}${josa(shown.replace(/'$/, ""), "으로로")} 변경했어요.`,
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
        `👉 수정 ${session.entryNo}번 ${payerWord(session)} 엄마\n` +
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
  { input: "수입자 엄마",      expect: { field: "payer", value: "엄마" } },   // V22.9.76 수입 기록 안내
  { input: "지츨자 엄마",      expect: { field: "payer", value: "엄마" } },   // fuzzy
  { input: "6",               expect: { field: "payer", value: null } },
  { input: "6번 엄마",         expect: { field: "payer", value: "엄마" } },
  { input: "삭제",             expect: { field: "delete", value: "confirm" } },
  { input: "엄마",             expect: { field: "payer", value: "엄마" } },   // 값 추론
  { input: "13000",           expect: { field: "amount", value: "13000" } }, // 값 추론
  { input: "어제",             expect: { field: "date", value: "어제" } },    // 값 추론
  { input: "체크카드",         expect: { field: "method", value: "체크카드" } },
  { input: "8",               expect: { field: "type", value: null } },      // V22.9.77 감사 K-4 구분
  { input: "구분 수입",        expect: { field: "type", value: "수입" } },
  { input: "구분 지출",        expect: { field: "type", value: "지출" } },
  { input: "수입으로",         expect: { field: "type", value: "수입" } },    // 값 추론
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
  FIELD_BY_NUMBER, FIELD_LABEL, FIELD_SYNONYMS, KAKAO_EDIT_DEFAULT_CATEGORIES, MAX_FAILS,
  MAX_TOTAL_TURNS, SESSION_TTL_MS, buildValuePrompt, compact, handleEditMessage,
  isExactKakaoEditFieldStart, isKakaoAmountAnswer, isKakaoEditNotValue, isSessionExpired, josa,
  kakaoEditComplaintField, kakaoEditTypeValue, loopFuzzTest, normalizeKakaoEditAmountValue,
  parseEditInput, selfTest, startsWithKakaoEditField,
};
// @build:exports-end
