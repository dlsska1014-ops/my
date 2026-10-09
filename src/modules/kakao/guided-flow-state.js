// @build:imports-start
import { KAKAO_REPRESENTATIVE_COMMANDS } from "../public/site-config.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeObject } from "../admin/backup-compare.js";
import {
  detectKakaoNaturalIntent, isCommandMenuCommand, isHouseholdSwitchCommand,
} from "./intent-nlu.js";
import { dedupeQuickReplies } from "./response-builders.js";
import {
  isKakaoEditGuideCommand, isKakaoTransactionSpenderChangeCommand,
} from "./edit-session-v4.js";
import {
  isKakaoCreateConfirmNo, isKakaoCreateConfirmYes, isKakaoCreateKindOptionsRequest,
  isKakaoReservedCreateFlowReply, parseBareInviteCode, parseKakaoCreateKind, parseKakaoSummaryRange,
  plausibleHouseholdNameAtKindStep, sanitizeHouseholdNameInput,
} from "./household-budget-commands.js";
import { getKakaoBotGroupKey } from "./group-links-first-record.js";
import { stableShortHash } from "./identity-chat-first.js";
import { supabase } from "../data/supabase-client.js";
import {
  isBudgetCommand, isGroupLinkInfoCommand, isHelpCommand, isInputExampleCommand, isInviteCommand,
  isLinkCommand, isRecentCommand, isSettlementCommand, isSummaryCommand, isUndoCommand,
  parseGroupBindCommand, parseJoinCode,
} from "./simple-commands.js";
import { normalizeText, parseAmountValue } from "../nlu/amount-parser.js";
// @build:imports-end

// -----------------------------------------------------------------------------
// V21.5 guided onboarding / budget setup / date summary
// OpenBuilder routes only; Worker owns the flow and accountbook_settings stores state.
// -----------------------------------------------------------------------------
function isKakaoStartCommand(text = "") {
  return detectKakaoNaturalIntent(text).intent === "START" || /^(시작|시작하기|처음|처음사용|처음 사용|가계부 시작|가계부시작|온보딩)$/i.test(normalizeText(text));
}

function isKakaoCreateFlowCommand(text = "") {
  return detectKakaoNaturalIntent(text).intent === "HOUSEHOLD_CREATE" || /^(새가계부만들기|새 가계부 만들기|가계부만들기|가계부 만들기|새장부만들기|새 장부 만들기)$/i.test(normalizeText(text));
}

function isKakaoJoinFlowCommand(text = "") {
  return detectKakaoNaturalIntent(text).intent === "HOUSEHOLD_JOIN" || /^(초대코드로참여|초대코드로 참여|초대코드 참여|가계부참여|가계부 참여|참여하기)$/i.test(normalizeText(text));
}

function isKakaoBudgetSetupCommand(text = "") {
  return /^(예산설정|예산 설정|예산변경|예산 변경|예산수정|예산 수정|예산바꾸기|예산 바꾸기|예산잡기|예산 잡기|카테고리예산설정|카테고리 예산 설정|카테고리예산변경|카테고리 예산 변경|월예산설정|월 예산 설정|월예산변경|월 예산 변경)$/i.test(normalizeText(text));
}

function isKakaoMemberAliasCommand(text = "") {
  const t = normalizeText(text);
  const nlu = detectKakaoNaturalIntent(t);
  return nlu.intent === "MEMBER_ALIAS_CHANGE" || /^(내이름설정|내 이름 설정|내이름수정|내 이름 수정|내이름변경|내 이름 변경|내이름바꾸기|내 이름 바꾸기|사용자이름설정|사용자 이름 설정|사용자이름수정|사용자 이름 수정|사용자이름변경|사용자 이름 변경|닉네임|닉네임설정|닉네임 설정|닉네임수정|닉네임 수정|닉네임변경|닉네임 변경|닉네임바꾸기|닉네임 바꾸기|별명|별명설정|별명 설정|별명수정|별명 수정|별명변경|별명 변경|표시명|표시명설정|표시명 설정|표시명수정|표시명 수정|표시명변경|표시명 변경|프로필이름변경|프로필 이름 변경)$/i.test(t);
}

function parseDirectMemberAliasCommand(text = "") {
  const t = normalizeText(text);
  const patterns = [
    /^(?:내\s*)?(?:닉네임|별명|표시명|이름)\s*(?:을|를)?\s*([가-힣A-Za-z0-9._-]{2,30}?)\s*(?:으로|로)?\s*(?:설정|수정|변경|바꿔|바꾸기|해줘|해주세요)$/i,
    /^(?:닉네임|별명|표시명|내\s*이름)\s*(?:설정|수정|변경|바꾸기)?\s+([가-힣A-Za-z0-9._-]{2,30})$/i,
    /^([가-힣A-Za-z0-9._-]{2,30}?)\s*(?:으로|로)\s*(?:닉네임|별명|표시명|내\s*이름)\s*(?:설정|수정|변경|바꿔|바꾸기|해줘|해주세요)$/i,
    /^(?:나를|저를|나는|저는)\s*([가-힣A-Za-z0-9._-]{2,30}?)\s*(?:이라고|라고|으로|로)\s*(?:불러|불러줘|표시해|표시해줘|해줘|해주세요)$/i,
    /^(?:가계부에서\s*)?(?:내\s*)?(?:이름|닉네임|별명|표시명)(?:은|는)?\s*([가-힣A-Za-z0-9._-]{2,30})$/i,
    /^(?:가계부에서\s*)?([가-힣A-Za-z0-9._-]{2,30}?)\s*(?:으로|로)\s*(?:보이게|표시|저장|불러)(?:해줘|해주세요|해)?$/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const alias = String(m[1] || "").trim().slice(0, 20);
    if (alias && !/^(설정|수정|변경|바꾸기|해줘|해주세요)$/.test(alias)) return alias;
  }
  return "";
}

function isKakaoFlowCancelCommand(text = "") {
  return detectKakaoNaturalIntent(text).intent === "CANCEL" || /^(취소|그만|중단|처음으로|메뉴로)$/i.test(normalizeText(text));
}

function isExplicitKakaoFlowCancelCommandV2254(text = "") {
  return /^(취소|그만|중단|처음으로|메뉴로)$/i.test(normalizeText(text));
}

function isKakaoGuidedCommand(text = "") {
  const t = normalizeText(text);
  return isKakaoStartCommand(t) || isKakaoCreateFlowCommand(t) || isKakaoJoinFlowCommand(t) ||
    isKakaoBudgetSetupCommand(t) || isKakaoMemberAliasCommand(t) || isKakaoFlowCancelCommand(t) ||
    /^(가족 생활비|부부 커플|모임 회비|여행 경비|직접 입력|전체 월 예산|카테고리별 예산|지난달 예산 복사|설정하기|다시 입력|다른 카테고리|예산 현황 보기|첫 기록 남기기|단톡방 연결|단톡방 연결하기)$/.test(t) ||
    /^\d+(?:\.\d+)?\s*(?:억원|억|만원|만|천원|천|백만원|백만|원)$/.test(t) ||
    /^[일이삼사오육칠팔구십백천만억한두세네다섯여섯일곱여덟아홉]+\s*(?:원|만원|천원)$/.test(t);
}

function kakaoStartQuickReplies(hasHousehold = false) {
  if (!hasHousehold) return dedupeQuickReplies([
    ["새 가계부 만들기", "새 가계부 만들기"],
    ["초대코드로 참여", "초대코드로 참여"],
    ["도움말", "도움말"],
  ]);
  return dedupeQuickReplies([
    ["기록 방법", "기록 방법"],
    ["예산 설정", "예산 설정"],
    ["이번 달 요약", "이번 달 요약"],
    ["단톡방 연결", "단톡방 연결"],
    ["내 이름 설정", "내 이름 설정"],
  ]);
}

function kakaoCreateKindQuickReplies() {
  return dedupeQuickReplies([
    ["가족 생활비", "가계부 종류 가족 생활비"],
    ["부부·커플", "가계부 종류 부부 커플"],
    ["모임 회비", "가계부 종류 모임 회비"],
    ["여행 경비", "가계부 종류 여행 경비"],
    ["직접 입력", "가계부 종류 직접 입력"],
    ["취소", "취소"],
  ]);
}

function kakaoBudgetRootQuickReplies() {
  return dedupeQuickReplies([
    ["전체 월 예산", "전체 월 예산"],
    ["카테고리별", "카테고리별 예산"],
    ["지난달 복사", "지난달 예산 복사"],
    ["예산 현황", "남은 예산"],
    ["취소", "취소"],
  ]);
}

function kakaoBudgetCategoryQuickReplies() {
  return dedupeQuickReplies([
    ["식비", "예산 카테고리 식비"],
    ["교통", "예산 카테고리 교통"],
    ["생활용품", "예산 카테고리 생활용품"],
    ["의료·병원", "예산 카테고리 의료/병원"],
    ["교육·학습", "예산 카테고리 교육/학습"],
    ["문화·여가", "예산 카테고리 문화/여가"],
    ["직접 입력", "예산 카테고리 직접 입력"],
    ["취소", "취소"],
  ]);
}

function kakaoBudgetAmountQuickReplies() {
  return dedupeQuickReplies([
    ["30만원", "30만원"],
    ["50만원", "50만원"],
    ["100만원", "100만원"],
    ["직접 입력", "직접 입력"],
    ["취소", "취소"],
  ]);
}

const KAKAO_FLOW_STEPS_V2254 = Object.freeze({
  create_household: Object.freeze(["kind", "name", "confirm_name"]),
  join_household: Object.freeze(["code"]),
  household_choice: Object.freeze(["choose", "confirm_bind"]),
  budget_setup: Object.freeze(["root", "category", "category_custom", "amount", "confirm"]),
  member_alias: Object.freeze(["name"]),
});

function normalizeKakaoFlowStateV2254(value = null) {
  const obj = safeObject(value);
  const flow = String(obj.flow || "").trim();
  const step = String(obj.step || "").trim();
  if (!flow || !KAKAO_FLOW_STEPS_V2254[flow]?.includes(step)) return null;
  const expiresAt = Number(obj.expires_at || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {
    flow,
    step,
    data: safeObject(obj.data),
    attempts: Math.max(0, Math.min(5, Number(obj.attempts || 0))),
    expires_at: expiresAt,
    state_version: "v2254",
  };
}

function isKakaoTopLevelCommandV2254(text = "") {
  const t = normalizeText(text);
  return isKakaoStartCommand(t) || isCommandMenuCommand(t) || isHelpCommand(t) ||
    isKakaoCreateFlowCommand(t) || isKakaoJoinFlowCommand(t) || isHouseholdSwitchCommand(t) ||
    isKakaoBudgetSetupCommand(t) || isBudgetCommand(t) || isSummaryCommand(t) ||
    !!parseKakaoSummaryRange(t) || isRecentCommand(t) || isSettlementCommand(t) ||
    isInviteCommand(t) || isGroupLinkInfoCommand(t) || !!parseGroupBindCommand(t) ||
    isInputExampleCommand(t) || isKakaoMemberAliasCommand(t) || isKakaoEditGuideCommand(t) ||
    isKakaoTransactionSpenderChangeCommand(t) || isUndoCommand(t) || isLinkCommand(t);
}

function isExplicitKakaoTopLevelCommandV2254(text = "") {
  const t = normalizeText(text).trim();
  const compact = t.replace(/\s+/g, "");
  if (!t) return false;
  if (KAKAO_REPRESENTATIVE_COMMANDS.some((item) => normalizeText(item.messageText || item.command).replace(/\s+/g, "") === compact)) return true;
  if (/^(?:\/?)(시작하기|처음사용|온보딩|메뉴|전체메뉴|명령어|도움말|새가계부만들기|가계부만들기|초대코드로참여|가계부참여|단톡방연결|단톡방연결상태|기록방법|입력예시|오늘기록보기|오늘기록|최근기록|예산설정|남은예산|이번달요약|요약|정산|가계부전환|초대코드|내이름설정|닉네임설정|수정가이드)$/.test(compact)) return true;
  if (/^(?:단톡방\s*연결|가계부\s*참여)\s+[A-Z0-9]{5,12}$/i.test(t)) return true;
  if (/^(?:\d{1,2}\s*번|방금|최근|마지막).*(?:수정|변경|삭제|지출자|결제자)/.test(t)) return true;
  if (/^(?:수정|삭제|복구)\s*\d{1,2}\s*번/.test(t)) return true;
  if (/^(?:취소|수정취소|선택취소|방금삭제|입력취소|삭제확인|삭제 확인)$/.test(t)) return true;
  return false;
}

function isKakaoFlowLocalReplyV2254(state = null, text = "") {
  if (!state?.flow) return false;
  const t = normalizeText(text).trim();
  if (isKakaoFlowCancelCommand(t)) return true;
  if (state.flow === "create_household") {
    if (state.step === "kind") return !!parseKakaoCreateKind(t) || isKakaoCreateKindOptionsRequest(t) || !!plausibleHouseholdNameAtKindStep(t);
    if (state.step === "name") return /^(종류 다시 선택|종류 선택|다시 선택)$/.test(t) || !!sanitizeHouseholdNameInput(t);
    if (state.step === "confirm_name") return isKakaoCreateConfirmYes(t) || isKakaoCreateConfirmNo(t) || /^(종류 다시 선택|종류 선택|다시 선택)$/.test(t) || !!sanitizeHouseholdNameInput(t);
  }
  if (state.flow === "join_household") return !!parseBareInviteCode(t) || !!parseJoinCode(t);
  if (state.flow === "household_choice") {
    if (state.step === "confirm_bind") return isKakaoCreateConfirmYes(t) || isKakaoCreateConfirmNo(t) || /^(연결하기|연결)$/i.test(t);
    if (isExplicitKakaoTopLevelCommandV2254(t)) return false;
    return /^(?:가계부\s*)?(?:선택\s*)?\d{1,2}(?:번)?$/.test(t) || (t.length >= 2 && t.length <= 40);
  }
  if (state.flow === "budget_setup") {
    if (state.step === "root") return /^(전체 월 예산|카테고리별 예산|지난달 예산 복사)$/.test(t);
    if (state.step === "category") return t === "직접 입력" || t.length >= 1;
    if (state.step === "category_custom") return t.length >= 1;
    if (state.step === "amount") return t === "직접 입력" || parseAmountValue(t) > 0;
    if (state.step === "confirm") return /^(설정하기|다시 입력)$/.test(t) || isKakaoCreateConfirmYes(t) || isKakaoCreateConfirmNo(t);
  }
  if (state.flow === "member_alias") return !isKakaoTopLevelCommandV2254(t);
  return false;
}

function shouldInterruptKakaoFlowV2254(state = null, text = "") {
  return !!state?.flow && isExplicitKakaoTopLevelCommandV2254(text) && !isKakaoFlowLocalReplyV2254(state, text);
}

// 이름 자체의 안전성만 본다. 링크·이메일·전화번호·초대코드 형태·금액만 있는
// 이름을 거른다. 대화 흐름의 모호함(종류 선택지·예약 응답)은 포함하지 않으므로
// 웹 폼과 카카오 양쪽에서 함께 쓸 수 있다.
function isUnsafeHouseholdNameContent(text = "") {
  const t = normalizeText(text).trim();
  if (!t) return true;
  if (/https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i.test(t)) return true;
  if (/^(?:\+?82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}$/.test(t)) return true;
  if (/^[A-Z0-9]{5,12}$/i.test(t) || /^\d{1,3}(?:,\d{3})*(?:원|만원|만|천원|천)?$/.test(t)) return true;
  if (!/[\p{L}\p{N}]/u.test(t) || /^\d{1,2}\s*번?$/.test(t)) return true;
  if (parseAmountValue(t) > 0 && !/[가-힣A-Za-z]{2,}/.test(t.replace(/[억만천백십원\d,.\s]/g, ""))) return true;
  return false;
}

function isUnsafeKakaoNameInputV2254(text = "") {
  const t = normalizeText(text).trim();
  if (!t) return true;
  if (isExplicitKakaoTopLevelCommandV2254(t) || isKakaoReservedCreateFlowReply(t) || parseKakaoCreateKind(t)) return true;
  return isUnsafeHouseholdNameContent(t);
}

function kakaoFlowStateKey(userId = "", payload = {}) {
  const group = getKakaoBotGroupKey(payload) || "direct";
  return `kakao_flow_v215:${String(userId || "anonymous").slice(0, 80)}:${stableShortHash(group)}`;
}

async function getKakaoFlowState(env, userId = "", payload = {}) {
  const raw = await getSettingValueStrict(env, kakaoFlowStateKey(userId, payload));
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    const valid = normalizeKakaoFlowStateV2254(obj);
    if (!valid) {
      // V22.9.16: 지운 상태는 "{}" 로 남는다. 그것을 다시 "유효하지 않다"고 보고 매 발화마다
      // 또 지우고 있었다 — 한 번이라도 흐름을 탄 사용자는 이후 모든 메시지에 쓰기 한 번씩이
      // 붙었다. 흐름 이름이 남아 있는(만료·손상된) 상태만 지운다. 빈 상태는 그대로 둔다.
      if (String(safeObject(obj).flow || "").trim()) await clearKakaoFlowState(env, userId, payload);
      return null;
    }
    return valid;
  } catch (err) {
    await clearKakaoFlowState(env, userId, payload);
    return null;
  }
}

async function saveKakaoFlowState(env, userId = "", payload = {}, state = {}) {
  const flow = String(state?.flow || "").trim();
  const step = String(state?.step || "").trim();
  if (!KAKAO_FLOW_STEPS_V2254[flow]?.includes(step)) throw new Error(`invalid_kakao_flow_state:${flow}:${step}`);
  const value = {
    flow,
    step,
    data: safeObject(state?.data),
    attempts: Math.max(0, Math.min(5, Number(state?.attempts || 0))),
    state_version: "v2254",
    expires_at: Date.now() + 30 * 60 * 1000,
  };
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: kakaoFlowStateKey(userId, payload), value: JSON.stringify(value) }),
  });
  return value;
}

async function clearKakaoFlowState(env, userId = "", payload = {}) {
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: kakaoFlowStateKey(userId, payload), value: "{}" }),
  });
}

async function completeKakaoFlowState(env, userId = "", payload = {}) {
  try {
    await clearKakaoFlowState(env, userId, payload);
    return "";
  } catch (_) {
    return "\n\n진행 상태 정리가 지연됐어요. 변경 사항을 다시 입력하지 말고 ‘시작’을 입력해 상태를 확인해 주세요.";
  }
}
// @build:exports-start
export {
  clearKakaoFlowState, completeKakaoFlowState, getKakaoFlowState,
  isExplicitKakaoFlowCancelCommandV2254, isExplicitKakaoTopLevelCommandV2254,
  isKakaoBudgetSetupCommand, isKakaoCreateFlowCommand, isKakaoFlowCancelCommand,
  isKakaoGuidedCommand, isKakaoJoinFlowCommand, isKakaoMemberAliasCommand, isKakaoStartCommand,
  isUnsafeKakaoNameInputV2254, kakaoBudgetAmountQuickReplies, kakaoBudgetCategoryQuickReplies,
  kakaoBudgetRootQuickReplies, kakaoCreateKindQuickReplies, kakaoStartQuickReplies,
  parseDirectMemberAliasCommand, saveKakaoFlowState, shouldInterruptKakaoFlowV2254,
};
// @build:exports-end
