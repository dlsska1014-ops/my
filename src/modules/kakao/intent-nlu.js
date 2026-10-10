// @build:imports-start
import { boundedRuntimeNumber, nluOpsConfig } from "../runtime/ops-telemetry.js";
import {
  KAKAO_REPRESENTATIVE_COMMANDS, KAKAO_SECONDARY_COMMANDS, memeCardsEnabled,
} from "../public/site-config.js";
import { safeObject } from "../admin/backup-compare.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { fetchUserHouseholds } from "../data/users-household-create.js";
import {
  kakaoBrandGuideText, kakaoDataPolicyText, kakaoEditSimpleGuideText, kakaoInputExampleText,
  kakaoKeywordGuideText, kakaoOpenBuilderGuideText, kakaoReserveSimpleGuideText,
} from "./reply-texts.js";
import { stripKakaoBotMention } from "./request-guards.js";
import {
  isBrandGuideCommand, isDataPolicyCommand, isEditGuideSimpleCommand, isHelpCommand,
  isInputExampleCommand, isKeywordGuideCommand, isLinkCommand, isOpenBuilderGuideCommand,
  isReserveGuideCommand,
} from "./simple-commands.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { helpText, linkText } from "../domain/transactions-core.js";
// @build:imports-end

// V22.1: 외부 LLM 호출 없이 동작하는 저비용 한국어 의도 정규화·명확화 계층.
// OpenBuilder는 대표 명령 라우팅만 담당하고, 롱테일 자연어와 모호한 표현은 이 Registry/명확화 엔진에서 판별합니다.
const KAKAO_INTENT_REGISTRY = Object.freeze({
  START: { risk: "read", targets: ["시작","처음","처음 사용","온보딩","가계부 시작"], actions: ["하기","도와줘","안내","시작"] },
  HOUSEHOLD_CREATE: { risk: "settings", targets: ["새 가계부","가계부","장부"], actions: ["만들기","생성","추가","새로 만들기"] },
  HOUSEHOLD_JOIN: { risk: "settings", targets: ["가계부","장부","초대코드","참여코드"], actions: ["참여","가입","들어가기","연결"] },
  HOUSEHOLD_SWITCH: { risk: "settings", targets: ["가계부","장부"], actions: ["전환","바꾸기","변경","선택","목록","이동"] },
  MEMBER_ALIAS_CHANGE: { risk: "settings", targets: ["닉네임","닉넴","닉내임","별명","표시명","표시 이름","내 이름","사용자 이름","사용자명","결제자 이름","지출자 이름","가계부 이름표"], actions: ["변경","수정","바꾸기","바꿔","고치기","고쳐","다시 설정","새로 설정","정정"] },
  INVITE_CODE_SHOW: { risk: "read", targets: ["초대코드","초대 코드","참여코드","참여 코드","가계부 코드"], actions: ["보여줘","알려줘","확인","보기","어디","뭐야","발급","공유"] },
  INVITE_MEMBER: { risk: "read", targets: ["구성원","멤버","가족","친구","사람","참여자"], actions: ["초대","초대하기","부르기","추가"] },
  BUDGET_SETUP: { risk: "money_setting", targets: ["예산"], actions: ["설정","변경","수정","바꾸기","잡기","정하기","복사"] },
  BUDGET_STATUS: { risk: "read", targets: ["예산","남은 돈","잔여 금액","쓸 수 있는 돈"], actions: ["확인","조회","현황","얼마 남았","얼마나 남았","사용률","잔액","남은","보여줘","알려줘"] },
  GROUP_LINK: { risk: "settings", targets: ["단톡방","단톡","단체방","그룹방","그룹","이 방"], actions: ["연결","연동","등록","묶기","상태"] },
  SETTLEMENT: { risk: "read", targets: ["정산","더치페이","1/n","보낼 돈","받을 돈"], actions: ["해줘","하기","현황","요약","계산","알려줘"] },
  SUMMARY: { risk: "read", targets: ["요약","사용 금액","지출 합계","얼마 썼","쓴 돈"], actions: ["오늘","어제","이번 주","지난 주","이번 달","지난 달","보여줘","알려줘"] },
  RECENT_RECORDS: { risk: "read", targets: ["오늘 기록","최근 기록","최근 내역","오늘 내역","방금 기록","오늘 뭐 썼","뭐 썼"], actions: ["보여줘","확인","조회","뭐 썼","목록"] },
  INPUT_EXAMPLE: { risk: "read", targets: ["기록 예시","입력 예시","입력 방법","기록 방법","어떻게 입력","기록하는 법","입력하는 법"], actions: ["보여줘","알려줘","보기","설명"] },
  EDIT_GUIDE: { risk: "read", targets: ["수정 방법","삭제 방법","수정가이드","기록 수정","거래 수정","기록 삭제","거래 기록 삭제","기록 고치","수정","삭제"], actions: ["알려줘","보기","설명","어떻게","방법"] },
  KEYWORD_GUIDE: { risk: "read", targets: ["키워드","자동 분류","분류 키워드","분류 설정"], actions: ["안내","설정","알려줘","보기"] },
  RESERVE_GUIDE: { risk: "read", targets: ["정기지출","준비금","자동차세","재산세","자동차보험"], actions: ["안내","설정","준비","알림"] },
  DATA_POLICY: { risk: "read", targets: ["개인정보","데이터 보관","삭제 기준","프라이버시","내 정보 보관","내 정보"], actions: ["안내","알려줘","확인","보기"] },
  CANCEL: { risk: "settings", targets: ["취소","그만","중단","처음으로","처음부터 다시","메뉴로"], actions: ["취소","중단","이동"] },
  HELP: { risk: "read", targets: ["도움말","사용법","사용 방법","명령어","기능","메뉴","뭐 할 수"], actions: ["알려줘","보기","설명","뭐 할 수"] },
  WEB_LINK: { risk: "read", targets: ["링크","홈페이지","웹페이지","웹 가계부","대시보드","관리 화면"], actions: ["보내줘","알려줘","열기","보기","주소"] },
});

function normalizeKakaoIntentText(text = "") {
  return stripKakaoBotMention(String(text || ""))
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/닉내임|닉넴|닉냄|닉내미/g, "닉네임")
    .replace(/예싼|예산느|예산은요/g, "예산")
    .replace(/초데|초대콛|초대코드드/g, "초대코드")
    .replace(/정싼|정산좀요/g, "정산")
    .replace(/요악|요약좀요/g, "요약")
    .replace(/가게부|가계뿌/g, "가계부")
    .replace(/단톡빵|단체톡방/g, "단톡방")
    .replace(/받은\s*코드/g, "초대코드")
    .replace(/초대\s*코드/g, "초대코드")
    .replace(/참여\s*코드/g, "참여코드")
    .replace(/만들어\s*줘|만들어\s*주세요/g, "만들기")
    .replace(/골라\s*줘|골라\s*주세요/g, "선택")
    .replace(/표시\s*이름/g, "표시명")
    .replace(/사용자\s*명/g, "사용자명")
    .replace(/바꿔\s*줘|바꿔\s*주세요|바꾸고\s*싶어(?:요)?|바꿀래(?:요)?/g, "바꾸기")
    .replace(/변경\s*해\s*줘|변경\s*해주세요|변경\s*하고\s*싶어(?:요)?|변경할래(?:요)?/g, "변경")
    .replace(/수정\s*해\s*줘|수정\s*해주세요|수정\s*하고\s*싶어(?:요)?|수정할래(?:요)?/g, "수정")
    .replace(/고쳐\s*줘|고쳐\s*주세요/g, "고치기")
    .replace(/알려\s*줘|알려\s*주세요|알려주라/g, "알려줘")
    .replace(/보여\s*줘|보여\s*주세요|보여주라/g, "보여줘")
    .replace(/해\s*줘|해\s*주세요/g, "해줘")
    .replace(/\b(?:좀|제발|혹시|저기|근데|그런데)\b/g, " ")
    .replace(/[~!@#$%^&*_=+`|\\{}\[\]:;"'<>?，,.]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactKakaoIntentText(text = "") {
  return normalizeKakaoIntentText(text).replace(/\s+/g, "");
}

function containsIntentTerm(normalized = "", compact = "", term = "") {
  const t = String(term || "").trim().toLowerCase();
  if (!t) return false;
  return normalized.includes(t) || compact.includes(t.replace(/\s+/g, ""));
}

function detectKakaoNaturalIntent(text = "") {
  const normalized = normalizeKakaoIntentText(text);
  const compact = normalized.replace(/\s+/g, "");
  if (!normalized) return { intent: "EMPTY", confidence: 1, normalized, reason: "empty" };

  const hits = (key) => {
    const cfg = KAKAO_INTENT_REGISTRY[key];
    if (!cfg) return { targetHits: 0, actionHits: 0, score: 0 };
    const targetHits = cfg.targets.filter((v) => containsIntentTerm(normalized, compact, v)).length;
    const actionHits = cfg.actions.filter((v) => containsIntentTerm(normalized, compact, v)).length;
    return { targetHits, actionHits, score: targetHits * 2 + actionHits };
  };
  const result = (intent, confidence, reason) => ({ intent, confidence, normalized, reason });

  // 취소는 시작/처음 표현보다 우선합니다.
  if (/^(취소|그만|중단|처음으로|메뉴로|처음부터다시)$/.test(compact) || hits("CANCEL").targetHits > 0) {
    return result("CANCEL", 0.99, "cancel");
  }
  if (/^(시작|처음|처음사용|온보딩|가계부시작)$/.test(compact) || (hits("START").targetHits > 0 && hits("START").actionHits > 0)) {
    return result("START", 0.98, "start");
  }
  if (/^(새가계부만들기|가계부만들기|새장부만들기)$/.test(compact) || /(?:새\s*)?(?:가계부|장부).*(?:만들기|생성|추가)/.test(normalized)) {
    return result("HOUSEHOLD_CREATE", 0.98, "household-create");
  }

  const alias = hits("MEMBER_ALIAS_CHANGE");
  if (/^(닉네임|별명|표시명|내이름|사용자명)$/.test(compact) || (alias.targetHits > 0 && alias.actionHits > 0)) {
    return result("MEMBER_ALIAS_CHANGE", alias.score >= 4 ? 0.99 : 0.95, `alias=${alias.score}`);
  }

  const inviteCode = hits("INVITE_CODE_SHOW");
  if (/^(초대코드|초대코드보기|초대코드확인|참여코드|가계부코드)$/.test(compact) ||
      (inviteCode.targetHits > 0 && (inviteCode.actionHits > 0 || /(보여줘|알려줘|확인|보기|어디|뭐야|공유)/.test(normalized)))) {
    return result("INVITE_CODE_SHOW", 0.98, "invite-code");
  }

  const inviteMember = hits("INVITE_MEMBER");
  if (inviteMember.targetHits > 0 && inviteMember.actionHits > 0) return result("INVITE_MEMBER", 0.97, "member-invite");

  if (/^(초대코드로참여|가계부참여|참여코드입력)$/.test(compact) ||
      /(?:초대코드|참여코드|가계부|장부).*(?:참여|가입|들어가기|연결)/.test(normalized)) {
    return result("HOUSEHOLD_JOIN", 0.97, "household-join");
  }
  if (/(?:가계부|장부).*(?:전환|바꾸기|변경|선택|목록|이동)/.test(normalized)) {
    return result("HOUSEHOLD_SWITCH", 0.96, "household-switch");
  }

  const budgetSetup = hits("BUDGET_SETUP");
  if (budgetSetup.targetHits > 0 && budgetSetup.actionHits > 0) return result("BUDGET_SETUP", 0.98, "budget-setup");
  const budgetStatus = hits("BUDGET_STATUS");
  if (/^(내예산|남은예산|예산현황|예산잔액)$/.test(compact) || (budgetStatus.targetHits > 0 && budgetStatus.actionHits > 0)) {
    return result("BUDGET_STATUS", 0.97, "budget-status");
  }

  const groupLink = hits("GROUP_LINK");
  if (groupLink.targetHits > 0 && groupLink.actionHits > 0) return result("GROUP_LINK", 0.98, "group-link");

  const settlement = hits("SETTLEMENT");
  if (/^(정산|더치페이)$/.test(compact) || settlement.targetHits > 0) return result("SETTLEMENT", 0.97, "settlement");

  const recent = hits("RECENT_RECORDS");
  if (recent.targetHits > 0) return result("RECENT_RECORDS", 0.96, "recent-records");

  const summary = hits("SUMMARY");
  if (summary.targetHits > 0 && (summary.actionHits > 0 || /(요약|얼마\s*썼|사용\s*금액|지출\s*합계|쓴\s*돈)/.test(normalized))) {
    return result("SUMMARY", 0.95, "summary");
  }

  const inputExample = hits("INPUT_EXAMPLE");
  if (/^(기록예시|입력예시|어떻게입력)$/.test(compact) || inputExample.targetHits > 0) return result("INPUT_EXAMPLE", 0.96, "input-example");
  const dataPolicy = hits("DATA_POLICY");
  if (/^(개인정보|데이터보관|프라이버시)$/.test(compact) || dataPolicy.targetHits > 0) return result("DATA_POLICY", 0.96, "data-policy");
  const editGuide = hits("EDIT_GUIDE");
  if (/^(수정가이드|수정방법|삭제방법)$/.test(compact) || (editGuide.targetHits > 0 && editGuide.actionHits > 0) || /(?:기록|거래).*(?:고치|수정|삭제).*(?:방법|어떻게)?/.test(normalized)) return result("EDIT_GUIDE", 0.96, "edit-guide");
  const keywordGuide = hits("KEYWORD_GUIDE");
  if (/^(키워드안내|자동분류|분류키워드)$/.test(compact) || keywordGuide.targetHits > 0) return result("KEYWORD_GUIDE", 0.95, "keyword-guide");
  const reserveGuide = hits("RESERVE_GUIDE");
  if (/^(정기지출|준비금)$/.test(compact) || reserveGuide.targetHits > 0) return result("RESERVE_GUIDE", 0.95, "reserve-guide");
  const help = hits("HELP");
  if (/^(도움말|사용법|명령어|메뉴|뭐할수있어)$/.test(compact) || help.targetHits > 0) return result("HELP", 0.96, "help");
  const webLink = hits("WEB_LINK");
  if (webLink.targetHits > 0 && (webLink.actionHits > 0 || /(주소|링크|홈페이지|웹페이지|대시보드|관리\s*화면)/.test(normalized))) {
    return result("WEB_LINK", 0.94, "web-link");
  }
  return result("UNKNOWN", 0, "no-rule");
}
function kakaoNluRuntimeConfig(env = {}) {
  return {
    engine: "deterministic-registry",
    external_ai: false,
    persistent_success_log_sample_rate: boundedRuntimeNumber(env.NLU_SUCCESS_LOG_SAMPLE_RATE, 0, 0, 1),
    persistent_fallback_logs: String(env.NLU_PERSIST_FALLBACK_LOGS || "0") === "1",
    raw_utterance_storage: false,
    registry_intents: Object.keys(KAKAO_INTENT_REGISTRY).length,
    ops: nluOpsConfig(env),
  };
}

function kakaoNluRegistrySummary() {
  return Object.entries(KAKAO_INTENT_REGISTRY).map(([intent, cfg]) => ({ intent, risk: cfg.risk, target_count: cfg.targets.length, action_count: cfg.actions.length }));
}

function isCommandMenuCommand(text = "") {
  const raw = String(text || "").trim().toLowerCase();
  const n = normalizeText(text);
  return raw === "/" || /^(\/메뉴|\/help|\/도움말|\/명령어)$/i.test(raw) || /^(메뉴|전체메뉴|명령어|명령어목록|명령어 목록|바로가기|빠른메뉴|빠른 메뉴|사용가능명령|사용 가능 명령)$/i.test(n);
}

function isMemeCommand(text = "") {
  return /^(밈|밈카드|소비몬|소비밈|웃긴카드|카드밈|오늘의밈|오늘의 밈)$/i.test(normalizeText(text));
}

function isHouseholdSwitchCommand(text = "") {
  const intent = detectKakaoNaturalIntent(text).intent;
  return intent === "HOUSEHOLD_SWITCH" || /^(가계부전환|가계부 전환|가계부바꾸기|가계부 바꾸기|가계부선택|가계부 선택|다른가계부|다른 가계부|가계부목록|가계부 목록|내가계부목록|내 가계부 목록|장부전환|장부 전환)$/i.test(normalizeText(text));
}

// V22.9.37 감사 H13: 가계부 이름은 거래 문장이 아니다. 금액 표기용 normalizeText 는 "원정"을 "원"으로 바꾸고 기호를
// 지워 "원정대"가 "원대"로 저장됐다. 이름은 공백만 고르고 길이만 제한한다. 명령어·안전성 판정 함수는 스스로 정규화한다.
function normalizeHouseholdNameText(text = "") {
  return String(text || "").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
}

function parseCreateHouseholdCommand(text = "") {
  const raw = normalizeHouseholdNameText(text);
  const m = raw.match(/^(?:새\s*)?(?:가계부|장부)\s*(?:만들기|생성|추가)\s+(.{2,40})$/i) || raw.match(/^(?:만들기|생성)\s+(.{2,40})\s*(?:가계부|장부)$/i);
  if (!m) return "";
  return String(m[1] || "").replace(/^(이름|제목)\s*/, "").trim().slice(0, 40);
}

function kakaoCommandMenuText(_origin = "") {
  return [
    "대표 명령어",
    "",
    ...KAKAO_REPRESENTATIVE_COMMANDS.map((item) => item.description ? `• ${item.command}: ${item.description}` : `• ${item.command}`),
    "",
    "거래는 슬래시 없이 바로 입력해도 됩니다.",
    "예: 점심 12000원 국민카드",
    "",
    "추가 명령어",
    ...KAKAO_SECONDARY_COMMANDS.map((item) => `• ${item.command}: ${item.description}`),
    "",
  ].filter(Boolean).join("\n");
}

function kakaoMemeGuideText(origin = "") {
  return [
    "😼 소비밈 카드",
    "",
    "지출 기록이 쌓이면 예산, 카드값, 모임비, 절약 상황에 맞춰 피식할 수 있는 밈카드를 볼 수 있어요.",
    "",
    "전체이용가 기준으로만 운영합니다.",
    "• 부적절한 단어 사용 안 함",
    "• 과한 표현보다 가벼운 피식 포인트",
    "• 가족/모임 단톡방에서 보기 편한 문구",
    "",
    origin ? `밈카드 보기\n${origin}/meme-card-content\n\n밈연구소\n${origin}/meme-lab` : "",
  ].filter(Boolean).join("\n");
}

function kakaoMemeUnavailableText(origin = "") {
  return [
    "소비 카드 기능은 아직 완성도 점검 중이라 잠시 숨겨두었어요.",
    "현재 가계부 기록에는 영향이 없고, 입력·예산·분석·정산 기능은 그대로 사용할 수 있습니다.",
    "",
    "지출을 확인하려면 ‘이번 달 요약’ 또는 ‘오늘 기록 보기’를 보내주세요.",
    origin ? `가계부 열기\n${origin}/app` : "",
  ].filter(Boolean).join("\n");
}

function kakaoImageNotSupportedText(origin = "") {
  return [
    "📷 사진은 봇이 읽을 수 없어요.",
    "",
    "금액과 내용을 글로 보내주세요.",
    "예: 점심 12000원, 커피 4500원 카드",
    origin ? `가계부 열기\n${origin}/app` : "",
  ].filter(Boolean).join("\n");
}

function hasKakaoImageAttachment(payload = {}) {
  const params = {
    ...safeObject(payload?.userRequest?.params),
    ...safeObject(payload?.action?.params),
    ...safeObject(payload?.action?.detailParams),
  };
  return Object.entries(params).some(([key, value]) => {
    if (!/(?:image|photo|media|사진)/i.test(String(key || ""))) return false;
    let sample = "";
    try { sample = typeof value === "string" ? value : JSON.stringify(value); } catch (error) { sample = ""; }
    return /https?:\/\//i.test(sample) || /(?:image|photo|media)/i.test(sample);
  });
}

async function kakaoHouseholdSwitchText(env, user = {}, origin = "") {
  const households = await fetchUserHouseholds(env, user.id);
  if (!households.length) {
    return [
      "📒 아직 연결된 가계부가 없어요.",
      "",
      "아래처럼 새 가계부를 만들 수 있어요.",
      "새 가계부 만들기",
      "",
      "초대코드가 있으면 이렇게 보내주세요.",
      "초대코드로 참여",
      "",
      origin ? `웹에서 만들기/참여\n${origin}/my/households` : "",
    ].filter(Boolean).join("\n");
  }
  const lines = households.slice(0, 8).map((h, i) => `${i + 1}. ${h.name || "가계부"} · ${userHouseholdRoleLabel(h.role || "member")} · 초대코드 ${h.invite_code || "-"}`);
  return [
    "📒 내 가계부 목록",
    "",
    ...lines,
    "",
    "단톡방에 연결하려면 그룹방에서 이렇게 입력하세요.",
    "단톡방 연결 초대코드",
    "",
    "새 가계부는 이렇게 만들 수 있어요.",
    "새 가계부 만들기",
    "",
    origin ? `가계부 전환·추가\n${origin}/my/households` : "",
  ].filter(Boolean).join("\n");
}

function kakaoPublicCommandReply(utterance = "", origin = "", env = {}) {
  if (isCommandMenuCommand(utterance)) return kakaoCommandMenuText(origin);
  if (isLinkCommand(utterance)) return linkText(origin, "");
  if (isOpenBuilderGuideCommand(utterance)) return kakaoOpenBuilderGuideText(origin);
  if (isBrandGuideCommand(utterance)) return kakaoBrandGuideText(origin, env);
  if (isDataPolicyCommand(utterance)) return kakaoDataPolicyText(origin);
  if (isInputExampleCommand(utterance)) return kakaoInputExampleText(origin);
  if (isKeywordGuideCommand(utterance)) return kakaoKeywordGuideText(origin);
  if (isEditGuideSimpleCommand(utterance)) return kakaoEditSimpleGuideText(origin);
  if (isReserveGuideCommand(utterance)) return kakaoReserveSimpleGuideText(origin);
  if (isMemeCommand(utterance)) return memeCardsEnabled(env) ? kakaoMemeGuideText(origin) : kakaoMemeUnavailableText(origin);
  if (isHelpCommand(utterance)) return helpText("", origin);
  return "";
}

function kakaoSaveDelayText(origin = "") {
  return [
    "입력 내용은 확인했어요 😊",
    "",
    "지금은 저장 확인이 지연되고 있어요.",
    "중복될 수 있으니 같은 내용을 다시 보내지 말고 잠시 후 ‘오늘 기록 보기’로 확인해 주세요.",
  ].join("\n");
}
// @build:exports-start
export {
  detectKakaoNaturalIntent, hasKakaoImageAttachment, isCommandMenuCommand, isHouseholdSwitchCommand,
  kakaoCommandMenuText, kakaoImageNotSupportedText, kakaoNluRegistrySummary, kakaoNluRuntimeConfig,
  kakaoPublicCommandReply, kakaoSaveDelayText, normalizeHouseholdNameText, normalizeKakaoIntentText,
  parseCreateHouseholdCommand,
};
// @build:exports-end
