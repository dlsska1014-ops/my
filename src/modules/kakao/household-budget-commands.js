// @build:imports-start
import { moneyTokenSpans } from "../client/shared-input-parsers.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { fetchCustomCategories } from "../settings/categories-keywords.js";
import { kakaoReserveAlert } from "../settings/reserve-plans.js";
import {
  fetchAdminRowsRange, fetchFormerSpenderMembers, fetchHouseholdMembers, householdPersonLabels,
  isRowLimitExceededError,
} from "../data/households-members-rows.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { fetchUserHouseholds } from "../data/users-household-create.js";
import { upsertMyBudgetRow, withBudgetPlanLease } from "../my/groups-budget-bulk.js";
import { shiftMonthString } from "../my/analysis-page.js";
import {
  fetchHouseholdMemberPolicy, memberPolicyDescription, memberPolicyLabel, saveHouseholdMemberPolicy,
} from "../my/access-control.js";
import { fetchBudgets, optionalSupabase } from "../domain/budgets.js";
import { DEFAULT_CATEGORIES } from "../admin/dashboard-fragments.js";
import { normalizeHouseholdNameText } from "./intent-nlu.js";
import { dedupeQuickReplies, kakaoQr } from "./response-builders.js";
import { normalizeKakaoEditAmountValue } from "./edit-state-machine.js";
import {
  isExplicitKakaoTopLevelCommandV2254, isKakaoFlowCancelCommand, isUnsafeKakaoNameInputV2254,
  kakaoStartQuickReplies, saveKakaoFlowState,
} from "./guided-flow-state.js";
import { bindKakaoGroupByInviteCode, kakaoRoomBindDoneText } from "./group-links-first-record.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText, parseAmountValue } from "../nlu/amount-parser.js";
import {
  addDays, currentMonthKst, formatDate, nowKstDate, validMonth,
} from "../nlu/date-payment.js";
import { numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

// -----------------------------------------------------------------------------
// V22.5.1 household context safety
// Direct chat uses an explicitly selected household. Group chat uses only the
// household linked to that room and never silently falls back to a personal one.
// -----------------------------------------------------------------------------
function kakaoSelectedHouseholdKey(userId = "") {
  return `kakao_selected_household_v2251:${String(userId || "anonymous").slice(0, 80)}`;
}

async function getKakaoSelectedHouseholdId(env, userId = "") {
  return String(await getSettingValueStrict(env, kakaoSelectedHouseholdKey(userId)) || "").trim();
}

async function setKakaoSelectedHousehold(env, userId = "", householdId = "") {
  if (!userId || !householdId) return;
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: kakaoSelectedHouseholdKey(userId), value: String(householdId) }),
  });
}

async function clearKakaoSelectedHousehold(env, userId = "") {
  if (!userId) return;
  await optionalSupabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: kakaoSelectedHouseholdKey(userId), value: "" }),
  }, null);
}

function kakaoActiveHouseholds(rows = []) {
  return safeArray(rows).filter((h) => !["pending", "blocked"].includes(String(h?.role || "member")));
}

function kakaoManageableHouseholds(rows = []) {
  return kakaoActiveHouseholds(rows).filter((h) => ["owner", "admin"].includes(String(h?.role || "member")));
}

function kakaoHouseholdChoiceQuickReplies(rows = [], prefix = "가계부 선택") {
  return dedupeQuickReplies(safeArray(rows).slice(0, 8).map((h, index) => [
    `${index + 1}. ${String(h?.name || "가계부").slice(0, 10)}`,
    `${prefix} ${index + 1}`,
  ]));
}

function kakaoHouseholdListLines(rows = [], { showCodes = false } = {}) {
  const list = safeArray(rows).slice(0, 10);
  // V22.9.76 감사 D-6: 이름이 같은 가계부는 역할만으로 구별되지 않을 수 있어 만든 날을 붙인다.
  const sameName = (h) => list.filter((other) => normalizeText(other?.name || "") === normalizeText(h?.name || "")).length > 1;
  return list.map((h, index) => {
    const role = userHouseholdRoleLabel(h?.role || "member");
    const code = showCodes && h?.invite_code ? ` · 코드 ${h.invite_code}` : "";
    const made = sameName(h) && h?.created_at ? ` · 만든 날 ${String(h.created_at).slice(0, 10)}` : "";
    return `${index + 1}. ${h?.name || "가계부"} · ${role}${made}${code}`;
  });
}

function parseKakaoHouseholdChoice(text = "", rows = []) {
  const t = normalizeText(text).trim();
  const m = t.match(/^(?:가계부\s*)?(?:선택\s*)?(\d{1,2})(?:번)?$/) || t.match(/^(\d{1,2})(?:번)?\s*(?:가계부)?$/);
  if (m) {
    const idx = Number(m[1]) - 1;
    return idx >= 0 && idx < rows.length ? rows[idx] : null;
  }
  const stripped = t.replace(/^(?:가계부\s*)?(?:선택|전환|바꾸기|연결)\s*/, "").trim();
  if (!stripped) return null;
  // V22.9.76 감사 D-6: 이름이 같은 가계부가 둘 이상이면 첫 번째를 고르지 않는다(남의 같은 이름 가계부에 기록이 저장될 수 있었다).
  // 부르는 쪽이 번호로 다시 묻는다.
  const matches = rows.filter((h) => normalizeText(h?.name || "") === stripped);
  if (matches.length > 1) return { ambiguous: true, name: matches[0].name, count: matches.length };
  return matches[0] || null;
}

async function beginKakaoHouseholdChoice(env, { user, payload, households = [], action = "select", origin = "", groupKey = "", forceChoice = false } = {}) {
  // V22.9.37 감사 H10: 초대코드는 웹 참여자 화면처럼 소유자·관리자만 본다. 참여만 한 가계부는 초대 후보에서 뺀다.
  const candidates = ["bind", "invite"].includes(action) ? kakaoManageableHouseholds(households) : kakaoActiveHouseholds(households);
  if (!candidates.length) {
    if (action === "bind") return {
      text: [
        "👥 이 단톡방에 연결할 수 있는 내 가계부가 없어요.",
        "가계부 소유자 또는 관리자가 새 가계부를 만들거나 초대코드로 연결해 주세요.",
      ].join("\n"),
      quickReplies: dedupeQuickReplies([["가계부만들기", "가계부만들기"], ["초대코드참여", "초대코드참여"]]),
    };
    if (action === "invite" && kakaoActiveHouseholds(households).length) return { text: kakaoInviteNotAllowedText(), quickReplies: [["도움말 보기", "도움말 보기"]] };
    return { text: kakaoStartText(false), quickReplies: kakaoStartQuickReplies(false) };
  }
  if (candidates.length === 1 && !forceChoice) {
    const chosen = candidates[0];
    if (action === "select") {
      await setKakaoSelectedHousehold(env, user.id, chosen.id);
      return { text: `✅ ‘${chosen.name}’ 가계부를 선택했어요.\n\n이후 기록·예산·요약은 이 가계부 기준으로 처리합니다.`, quickReplies: kakaoStartQuickReplies(true) };
    }
    if (action === "invite") return { text: kakaoInviteManagementText(chosen, origin), quickReplies: [["단톡방연결", "단톡방연결"], ["도움말 보기", "도움말 보기"]] };
    if (action === "bind") {
      const result = await bindKakaoGroupByInviteCode(env, user, groupKey, chosen.invite_code || "");
      if (result.ok) return { text: await kakaoRoomBindDoneText(env, chosen), quickReplies: [["기록방법", "기록방법"], ["이번달요약", "이번달요약"]] };
      return { text: "단톡방 연결을 완료하지 못했어요. 초대코드를 확인해 주세요.", quickReplies: [["단톡방연결", "단톡방연결"]] };
    }
  }
  await saveKakaoFlowState(env, user.id, payload, {
    flow: "household_choice",
    step: "choose",
    data: { action, household_ids: candidates.map((h) => h.id), group_key: groupKey || "" },
  });
  const title = action === "bind" ? "이 단톡방에 연결할 가계부를 선택해 주세요." : action === "invite" ? "초대코드를 확인할 가계부를 선택해 주세요." : "카카오 챗봇 계정에서 사용할 가계부를 선택해 주세요.";
  const guide = candidates.length === 1
    ? "확인하려면 1번 또는 가계부 이름을 입력해 주세요."
    : "번호 또는 가계부 이름을 입력해 주세요.";
  return {
    text: [title, "", ...kakaoHouseholdListLines(candidates), "", guide, action === "select" ? "선택 전에는 기록·예산·초대코드를 임의의 가계부로 처리하지 않습니다." : ""].filter(Boolean).join("\n"),
    quickReplies: [...kakaoHouseholdChoiceQuickReplies(candidates), kakaoQr("취소", "취소")].filter(Boolean),
  };
}

function kakaoUnlinkedGroupStartText(households = [], origin = "", options = {}) {
  const manageable = kakaoManageableHouseholds(households);
  const writeRejected = options?.writeRejected === true;
  // V22.9.67: 단톡방 안내는 짧게. 자세한 설명은 버튼형 사용 설명서에 둔다.
  // V22.9.68 감사(단톡방 2): 안내는 방의 실제 상태를 따른다. 해제·삭제된 방(retired)에는 자동 준비를 약속하지 않고, 기록이 아닌
  // 말(writeRejected 아님)에는 "방금 기록"이라고 하지 않는다.
  const retired = options?.retired === true;
  return [
    "이 단톡방에 연결된 가계부가 없습니다.",
    writeRejected ? "기존 연결 가계부가 삭제됐거나 연결이 해제된 방이라 방금 기록은 어디에도 저장하지 않았어요."
      : retired ? "기존 연결 가계부가 삭제됐거나 연결이 해제된 방이라 기록을 보내도 자동으로 다시 만들지 않아요."
      : "‘커피 4500원’처럼 기록하면 이 방 가계부가 바로 만들어져요.",
    "쓰던 가계부를 붙이려면 주인·관리자가 ‘단톡방연결 초대코드’를 보내 주세요.",
  ].filter(Boolean).join("\n");
}

function kakaoDirectStartText(current = null, households = []) {
  if (!current) return kakaoStartText(false);
  const lines = households.length > 1 ? ["", "카카오 챗봇 기준 내 가계부", ...kakaoHouseholdListLines(households)] : [];
  return [
    `📒 현재 선택 가계부: ${current.name}`,
    `내 권한: ${userHouseholdRoleLabel(current.role || "member")}`,
    ...lines,
    "",
    "기록·예산·요약 응답에는 처리된 가계부 이름을 함께 표시합니다.",
    households.length > 1 ? "다른 가계부를 쓰려면 ‘가계부전환’을 입력해 주세요." : "",
  ].filter(Boolean).join("\n");
}

function kakaoStartText(hasHousehold = false, householdName = "") {
  if (!hasHousehold) return [
    "친구와 함께 말 한마디로 기록하는 말해가계부입니다.",
    "‘커피 4500원’처럼 첫 기록을 보내면 바로 시작돼요.",
    "다른 가계부는 ‘가계부만들기’·‘초대코드참여’로 열어요.",
  ].join("\n");
  return [
    `📒 ${householdName || "가계부"}에서 무엇을 해볼까요?`,
    "",
    "말 한마디로 기록·예산·요약을 바로 사용할 수 있어요.",
    "단톡방 첫 기록은 공동 가계부를 준비합니다. 기존 가계부를 연결할 때는 소유자·관리자가 초대코드를 사용해요.",
  ].join("\n");
}

function parseKakaoCreateKind(text = "") {
  const t = normalizeText(text).replace(/^가계부 종류\s*/, "").replace(/[·ㆍ]/g, " ").replace(/\s+/g, " ").trim();
  const compact = t.replace(/\s+/g, "");
  const numbered = {
    "1": "가족 생활비", "1번": "가족 생활비", "첫번째": "가족 생활비", "첫째": "가족 생활비",
    "2": "부부·커플", "2번": "부부·커플", "두번째": "부부·커플", "둘째": "부부·커플",
    "3": "모임 회비", "3번": "모임 회비", "세번째": "모임 회비", "셋째": "모임 회비",
    "4": "여행 경비", "4번": "여행 경비", "네번째": "여행 경비", "넷째": "여행 경비",
    "5": "직접 입력", "5번": "직접 입력", "다섯번째": "직접 입력", "다섯째": "직접 입력",
  };
  if (numbered[compact]) return numbered[compact];
  const map = {
    "가족 생활비": "가족 생활비", "가족": "가족 생활비", "생활비": "가족 생활비", "우리집": "가족 생활비", "우리 집": "가족 생활비",
    "부부 커플": "부부·커플", "부부": "부부·커플", "커플": "부부·커플", "둘이": "부부·커플",
    "모임 회비": "모임 회비", "모임": "모임 회비", "회비": "모임 회비", "동호회": "모임 회비", "친목": "모임 회비",
    "여행 경비": "여행 경비", "여행": "여행 경비", "여행비": "여행 경비", "휴가": "여행 경비",
    "직접 입력": "직접 입력", "직접": "직접 입력", "일반": "직접 입력", "기타": "직접 입력", "개인": "직접 입력", "그냥": "직접 입력",
  };
  return map[t] || "";
}

function kakaoCreateKindPromptText(prefix = "") {
  return [
    prefix,
    "어떤 용도로 쓸 가계부인가요?",
    "",
    "1. 가족 생활비 — 우리집 생활비와 공동지출",
    "2. 부부·커플 — 둘이 함께 쓰는 가계부",
    "3. 모임 회비 — 동호회·친구 모임 비용",
    "4. 여행 경비 — 여행 기간의 공동 비용",
    "5. 직접 입력 — 개인·기타 목적",
    "",
    "종류를 고르기 어렵다면 원하는 가계부 이름을 바로 보내도 돼요.",
    "예: 우리집 가계부, 캠핑모임 회비",
  ].filter(Boolean).join("\n");
}

function isKakaoCreateKindOptionsRequest(text = "") {
  const t = normalizeText(text).replace(/\s+/g, " ").trim();
  return /^(선택|종류|목록|예시|선택지)$/.test(t) || /(어떤|무슨|뭐|무엇).*(선택|종류|가계부|있)/.test(t) || /(선택|종류).*(뭐|무엇|알려|보여|있)/.test(t) || /뭐가 있어|어떤 게 있어|어떤게 있어/.test(t);
}

function isKakaoCreateConfirmYes(text = "") {
  const t = normalizeText(text).replace(/[.!?~]+$/g, "").replace(/\s+/g, " ").trim();
  return /^(이 이름으로 만들기|이대로 만들기|이대로 해줘|이대로 진행|만들기|만들어줘|만들어 주세요|생성|생성해줘|생성해 주세요|확인|확인했어|진행|진행해줘|좋아|좋아요|그래|그래요|맞아|맞아요|네|넵|예|응|ㅇㅇ|오케이|ok|okay)$/i.test(t);
}

function isKakaoCreateConfirmNo(text = "") {
  const t = normalizeText(text).replace(/[.!?~]+$/g, "").replace(/\s+/g, " ").trim();
  return /^(아니|아니요|아냐|안돼|안 돼|다시|바꿀래|이름 바꿀래|다른 이름|이름 다시 입력|이름 바꾸기|이름 수정)$/i.test(t);
}

function isKakaoReservedCreateFlowReply(text = "") {
  const t = normalizeText(text).replace(/[.!?~]+$/g, "").replace(/\s+/g, " ").trim();
  return isKakaoCreateConfirmYes(t) || isKakaoCreateConfirmNo(t) || /^(선택|종류|목록|예시|선택지|종류 다시 선택|종류 선택|다시 선택|취소|그만|중단)$/.test(t);
}

function inferKakaoCreateKind(text = "") {
  const t = normalizeText(text).replace(/\s+/g, " ").trim();
  if (/(여행|휴가|캠핑|출장|제주|해외)/.test(t)) return "여행 경비";
  if (/(모임|회비|동호회|친목|계모임|동창|친구들)/.test(t)) return "모임 회비";
  if (/(부부|커플|신혼|우리 둘|둘이)/.test(t)) return "부부·커플";
  if (/(우리집|우리 집|가족|생활비|집안|육아|자녀)/.test(t)) return "가족 생활비";
  if (/(그냥|일반|개인|기타|내 가계부|나의 가계부)/.test(t)) return "직접 입력";
  return "";
}

// H13: 이름은 기호를 지우지 않되, 글자·숫자가 둘은 있어야 "의미 있는 2~40자"다(예전에는 기호를 지운 뒤 길이를 봤다).
function hasMeaningfulHouseholdName(text = "") {
  return String(text || "").replace(/[^\p{L}\p{N}]/gu, "").length >= 2;
}

function plausibleHouseholdNameAtKindStep(text = "") {
  const t = normalizeHouseholdNameText(text);
  if (!t || !hasMeaningfulHouseholdName(t) || isKakaoCreateKindOptionsRequest(t) || isKakaoReservedCreateFlowReply(t) || isUnsafeKakaoNameInputV2254(t)) return "";
  if (/^(선택|종류|가계부|그냥|아무거나|모르겠어|모름|다시|\d{1,2}\s*번?)$/.test(t)) return "";
  if (parseKakaoCreateKind(t)) return "";
  if (parseAmountValue(t) > 0 || isKakaoFlowCancelCommand(t)) return "";
  if (t.length < 2 || t.length > 40) return "";
  if (!/[가-힣A-Za-z0-9]/.test(t)) return "";
  return t.slice(0, 40);
}

function suggestedHouseholdName(kind = "", nickname = "") {
  if (kind === "가족 생활비") return "우리집 생활비";
  if (kind === "부부·커플") return "우리 둘 가계부";
  if (kind === "모임 회비") return "우리 모임 회비";
  if (kind === "여행 경비") return "우리 여행 경비";
  return `${nickname || "우리"} 가계부`;
}

function sanitizeHouseholdNameInput(text = "") {
  // V22.9.37 감사 H13: 이름은 거래 문장 정규화를 거치지 않는다("원정대"→"원대"). 판정 함수들은 스스로 정규화한다.
  const t = normalizeHouseholdNameText(text).replace(/^(가계부 이름|이름|제목)\s*/, "").trim();
  if (t.length < 2 || t.length > 40 || !hasMeaningfulHouseholdName(t)) return "";
  if (isExplicitKakaoTopLevelCommandV2254(t) || isKakaoReservedCreateFlowReply(t) || parseKakaoCreateKind(t) || isUnsafeKakaoNameInputV2254(t)) return "";
  if (/^\d{1,2}\s*번?$/.test(t)) return "";
  return t.slice(0, 40);
}

// 웹 폼 전용. `parseKakaoCreateKind`와 생성 흐름 예약어는 카카오 대화에서
// "가족"이 이름인지 종류 선택지인지 구분하기 위한 장치인데, 폼에는 그 모호함이
// 없다. 이 둘을 그대로 적용하면 `가족 생활비`, `생활비`, `모임`, `여행` 같은
// 가장 자연스러운 이름이 거부된다. 봇 명령어 충돌과 안전성 검사는 유지한다.
function sanitizeWebHouseholdNameInput(text = "") {
  const t = normalizeHouseholdNameText(text).replace(/^(가계부 이름|이름|제목)\s*/, "").trim();
  if (t.length < 2 || t.length > 40 || !hasMeaningfulHouseholdName(t)) return "";
  if (isExplicitKakaoTopLevelCommandV2254(t) || /https?:|[<>\r\n]/i.test(t)) return "";
  if (/^\d{1,2}\s*번?$/.test(t)) return "";
  return t.slice(0, 40);
}

function parseBareInviteCode(text = "") {
  const t = normalizeText(text).replace(/^(초대코드|코드)\s*/, "").trim();
  return /^[A-Z0-9]{5,12}$/i.test(t) ? t.toUpperCase() : "";
}

function normalizeBudgetCategoryInput(value = "") {
  // 이 함수는 두 번 거친다(명령 파서에서 한 번, 분류 해석에서 또 한 번).
  // 첫 번째가 내놓은 "__total"을 두 번째가 다시 정규화하면 밑줄이 지워져
  // "total"이 되고, 그러면 "전체 예산설정 300만원"이 분류를 못 찾는다.
  if (String(value || "") === "__total") return "__total";
  const raw = normalizeText(value)
    .replace(/^예산 카테고리\s*/, "")
    .replace(/\s*예산$/, "")
    .trim();
  if (/^(전체|전체 월|월 전체|총|총액)$/.test(raw)) return "__total";
  const aliases = {
    "교통비": "교통", "병원비": "의료/병원", "의료": "의료/병원", "교육비": "교육/학습",
    "문화 여가": "문화/여가", "여가": "문화/여가", "카페 간식": "카페/간식",
    "주거 월세": "주거/월세", "가족 용돈": "가족/용돈", "세금 수수료": "세금/수수료",
  };
  return aliases[raw] || raw;
}

function parseBudgetMonthHint(text = "") {
  const t = normalizeText(text);
  if (/다음달|다음 달/.test(t)) return shiftMonthString(currentMonthKst(), 1);
  if (/지난달|지난 달|저번달|저번 달/.test(t)) return shiftMonthString(currentMonthKst(), -1);
  const m = t.match(/(?:20(\d{2})년\s*)?(\d{1,2})월/);
  if (m) {
    // V22.9.76 감사 D-7: 연도 없이 쓴 달은 지금과 가장 가까운 해로 본다. 12월에 보낸 "1월 식비 예산"은 다음 해 1월이다
    // (예전: 지난 1월에 저장). 앞뒤 거리가 같으면(6개월) 앞날로 본다.
    let year = m[1] ? Number(`20${m[1]}`) : Number(currentMonthKst().slice(0, 4));
    const month = Number(m[2]);
    if (!m[1]) { const diff = month - Number(currentMonthKst().slice(5, 7)); if (diff <= -6) year += 1; else if (diff > 6) year -= 1; }
    if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}`;
  }
  return currentMonthKst();
}

function parseDirectBudgetSetCommand(text = "") {
  const t = normalizeText(text);
  const span = moneyTokenSpans(t)[0];
  if (span && /(?:^|\s)예산(?=\s|$)/.test(t)) {
    const withoutAmount = (t.slice(0,span.start) + " " + t.slice(span.end)).replace(/^(?:이번\s*달|다음\s*달|지난\s*달|저번\s*달|(?:20\d{2}년\s*)?\d{1,2}월)\s*/, "").replace(/(?:^|\s)(?:예산|설정|저장|등록|변경|수정)(?=\s|$)/g," ").replace(/\s+/g," ").trim();
    return {month:parseBudgetMonthHint(t), category:withoutAmount ? normalizeBudgetCategoryInput(withoutAmount) : "__total", amount:span.amount};
  }
  const monthHint = "(이번달|이번 달|다음달|다음 달|지난달|지난 달|저번달|저번 달|(?:20\\d{2}년\\s*)?\\d{1,2}월)";
  // V22.9.26: "예산 50만원", "예산 설정 50만원", "월 예산 50만원", "이번달 예산 50만원" 처럼
  // 분류 없이 말하면 전체 월 예산이다. 예전에는 거래 파서로 떨어져 50만원짜리 지출이 저장됐다.
  const bareTotal = t.match(new RegExp(`^(?:${monthHint}\\s*)?(?:월\\s*|전체\\s*|총\\s*)?예산\\s*(?:설정|저장|등록|변경|수정)?\\s*(?:은|을|를)?\\s+(.+)$`, "i"));
  if (bareTotal && normalizeKakaoEditAmountValue(bareTotal[2])) {
    const totalAmount = parseAmountValue(bareTotal[2]);
    if (totalAmount) return { month: parseBudgetMonthHint(bareTotal[1] || ""), category: "__total", amount: Math.round(totalAmount) };
  }
  const explicit = t.match(new RegExp(`^(?:${monthHint}\\s*)?(.{1,35}?)\\s*예산\\s*(?:설정|저장|등록)\\s+(.+)$`, "i"));
  // "식비 예산 30만원" 처럼 설정·저장·등록을 빼고 말하는 사람이 많다. 예전에는
  // 이것이 예산이 아니라 30만원짜리 지출로 기록됐다. 다만 "회사 예산 회의 5000"
  // 처럼 뒤에 다른 말이 붙으면 지출일 수 있으므로, 꼬리가 금액 하나뿐일 때만 받는다.
  const implicit = explicit ? null : t.match(new RegExp(`^(?:${monthHint}\\s*)?(.{1,35}?)\\s*예산\\s+(.+)$`, "i"));
  const m = explicit || implicit;
  if (!m) return null;
  if (implicit && !normalizeKakaoEditAmountValue(m[3])) return null;
  const amount = parseAmountValue(m[3]);
  if (!amount) return null;
  return {
    month: parseBudgetMonthHint(m[1] || ""),
    category: normalizeBudgetCategoryInput(m[2]),
    amount: Math.round(amount),
  };
}

async function resolveBudgetCategoryName(env, householdId = "", input = "") {
  const category = normalizeBudgetCategoryInput(input);
  if (!category || category === "직접 입력") return "";
  if (category === "__total") return category;
  const custom = await fetchCustomCategories(env, householdId);
  const options = [...DEFAULT_CATEGORIES.filter((x) => !["급여","상여/보너스","용돈수입","환급","이자배당","부업/매출"].includes(x)), ...custom.map((x) => x.name).filter(Boolean)];
  const found = options.find((x) => normalizeText(x) === normalizeText(category));
  return found || "";
}

async function saveKakaoBudget(env, householdId = "", month = currentMonthKst(), category = "", amount = 0) {
  return upsertMyBudgetRow(env, householdId, validMonth(month) || currentMonthKst(), category, amount);
}

async function copyKakaoBudgetsFromPreviousMonth(env, householdId = "", month = currentMonthKst()) {
  const previous = shiftMonthString(month, -1);
  // V22.9.34 감사 S6: 이번 달 예산을 못 읽었을 때 "없음"으로 보고 지난달 예산을 덮어쓰지 않는다.
  // 웹 일괄 저장과 같은 잠금 안에서 다시 읽고 복사한다.
  return withBudgetPlanLease(env, householdId, month, async ({ assertFresh }) => {
    const current = await fetchBudgets(env, householdId, month, { strict: true });
    if (current.some(row => Number(row.amount || 0) > 0)) throw new Error("budget_copy_current_configured");
    const rows = await fetchBudgets(env, householdId, previous, { strict: true });
    const copyRows = rows.filter((r) => Number(r.amount || 0) > 0);
    for (const row of copyRows) {
      assertFresh();
      await saveKakaoBudget(env, householdId, month, String(row.category || ""), Number(row.amount || 0));
    }
    // V22.9.76 카카오 감사 13: 개수에는 전체 예산(__total)과 수입 목표(__income:…)도 들어 있다. 답장이 무엇을 셌는지 나눠 말한다.
    const categoryOf = (row) => String(row.category || "");
    return {
      previous, count: copyRows.length,
      categoryCount: copyRows.filter((row) => !categoryOf(row).startsWith("__")).length,
      totalCount: copyRows.filter((row) => categoryOf(row) === "__total").length,
      incomeCount: copyRows.filter((row) => categoryOf(row).startsWith("__income")).length,
    };
  });
}

async function getHouseholdById(env, householdId = "") {
  if (!householdId) return null;
  const rows = await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(householdId)}&select=id,name,invite_code&limit=1`, { method: "GET" });
  if (!Array.isArray(rows) || rows.some(row => !row || String(row.id || "") !== String(householdId))) throw new Error("household_source_invalid");
  return rows[0] || null;
}

function parseKakaoSummaryRange(text = "") {
  let t = normalizeText(text);
  // V22.9.76 감사 A-13: ‘저번달’·‘전달’·‘저번주’는 지난달·지난주와 같은 말이다. 예전에는 기간을 못 읽어 이번 달로 답했다.
  t = t.replace(/^(?:저번\s*달|전달|전월)(?=\s|$|요약|수입|얼마)/, "지난달").replace(/^저번\s*주(?=\s|$|요약|수입|얼마)/, "지난주");
  // V22.9.76 카카오 감사 9: "이번달 수입"·"지난달 수입 얼마"·"수입 내역"·"월급 얼마 들어왔어"도 요약으로 답하고 수입 줄을
  // 함께 보인다. 예전에는 요약으로 알아듣지 못해 다른 안내가 나갔다. 금액이 있는 말은 기록이므로 여기 오지 않는다.
  let focus = "";
  const incomeAsk = t.match(/^(?:(오늘|어제|그제|그저께|이번주|이번 주|지난주|지난 주|이번달|이번 달|지난달|지난 달)\s*)?(?:수입|월급|급여)(?:\s*(?:은|는|이))?\s*(?:내역|현황|합계|요약|얼마|얼마야|얼마지|얼마\s*들어왔어|얼마\s*들어왔지|얼마\s*들어왔나|들어왔어|들어왔나|알려줘)$/)
    || t.match(/^(오늘|어제|그제|그저께|이번주|이번 주|지난주|지난 주|이번달|이번 달|지난달|지난 달)\s*수입$/);
  if (incomeAsk) { focus = "income"; t = `${incomeAsk[1] || "이번 달"} 요약`; }
  const natural = t.match(/^(오늘|어제|그제|그저께|이번주|이번 주|지난주|지난 주|이번달|이번 달|지난달|지난 달)\s*(?:얼마\s*썼어|얼마\s*썼지|얼마\s*썼나|지출\s*알려줘|쓴\s*돈|사용\s*금액|지출\s*현황)$/);
  if (natural) t = `${natural[1]} 요약`;
  if (!/(요약|현황|통계)$/.test(t) && !/^(오늘|어제|그제|그저께|이번주|이번 주|지난주|지난 주|이번달|이번 달|지난달|지난 달)$/.test(t)) return null;
  const now = nowKstDate();
  let start = null, end = null, label = "";
  if (/오늘/.test(t)) {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); end = addDays(start, 1); label = "오늘";
  } else if (/그제|그저께/.test(t)) {
    end = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -1); start = addDays(end, -1); label = "그제";
  } else if (/어제/.test(t)) {
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate()); start = addDays(end, -1); label = "어제";
  } else if (/지난\s*주/.test(t)) {
    const dow = (now.getDay() + 6) % 7; const thisMonday = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -dow);
    end = thisMonday; start = addDays(thisMonday, -7); label = "지난 주";
  } else if (/이번\s*주/.test(t)) {
    const dow = (now.getDay() + 6) % 7; start = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -dow); end = addDays(start, 7); label = "이번 주";
  } else if (/지난\s*달/.test(t)) {
    const month = shiftMonthString(currentMonthKst(), -1); start = new Date(Number(month.slice(0,4)), Number(month.slice(5,7))-1, 1); end = new Date(start.getFullYear(), start.getMonth()+1, 1); label = `${start.getFullYear() === now.getFullYear() ? "" : `${start.getFullYear()}년 `}${start.getMonth()+1}월`;
  } else {
    const dateMatch = t.match(/(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
    if (dateMatch) {
      // V22.9.76 감사 D-7: 연도 없이 쓴 날이 오늘보다 뒤면 작년으로 본다(1월에 보내는 "12월 25일 요약"). 올해가 아니면 제목에 연도를 붙인다.
      let y = Number(dateMatch[1] || now.getFullYear()); const m = Number(dateMatch[2]), d = Number(dateMatch[3]);
      if (!dateMatch[1] && new Date(y, m - 1, d) > now) y -= 1;
      start = new Date(y, m - 1, d); end = addDays(start, 1); label = `${y === now.getFullYear() ? "" : `${y}년 `}${m}월 ${d}일`;
    } else {
      // V22.9.76 감사 A-13: "9월 지출 현황"·"9월 수입 요약"도 그 달로 읽는다. 감사 D-7: 연도 없이 이번 달보다 뒤의 달이면 작년이다
      // (1월에 보낸 "12월 요약"이 올해 12월의 0원으로 답했다). 올해가 아니면 제목에 연도를 붙인다.
      const monthMatch = t.match(/(?:(20\d{2})년\s*)?(\d{1,2})월(?:\s*(?:지출|수입|가계부))?(?:\s*(?:요약|현황|통계))?$/);
      if (monthMatch && Number(monthMatch[2]) >= 1 && Number(monthMatch[2]) <= 12) {
        let y = Number(monthMatch[1] || now.getFullYear()); const m = Number(monthMatch[2]);
        if (!monthMatch[1] && m > now.getMonth() + 1) y -= 1;
        start = new Date(y, m - 1, 1); end = new Date(y, m, 1); label = `${y === now.getFullYear() ? "" : `${y}년 `}${m}월`;
      } else {
        // V22.9.76 감사 A-13: 기간 말을 읽지 못한 요약("저저번달 요약", "작년 요약", "13월 요약")에 이번 달로 답하지 않는다.
        const rest = t.replace(/\s*(?:요약|현황|통계)$/, "").replace(/이번\s*달|이달|금월|월간/g, "").trim();
        if (rest !== "월" && /[0-9]|년|해|분기|반기|주|달|월|일|그끄/.test(rest)) return { unreadable: true, text: rest.slice(0, 20) };
        start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth()+1, 1); label = "이번 달";
      }
    }
  }
  return { start: formatDate(start), end: formatDate(end), label, month: formatDate(start).slice(0,7), ...(focus ? { focus } : {}) };
}

async function maybeKakaoCta(env, userId = "", householdId = "", origin = "", kind = "analysis", href = "", label = "상세 분석 보기", cooldownHours = 24) {
  if (!origin || !userId || !householdId || !href) return "";
  const key = `kakao_cta_v215:${userId}:${householdId}:${kind}`;
  try {
    const raw = await getSettingValue(env, key);
    const last = Number(raw || 0);
    const cooldownMs = Math.max(0, Number(cooldownHours || 0)) * 60 * 60 * 1000;
    if (cooldownMs && last && Date.now() - last < cooldownMs) return "";
    await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value: String(Date.now()) }),
    });
    return `\n\n${String(label || "자세히 보기").trim()}\n${href}`;
  } catch (err) {
    return "";
  }
}

// V22.9.37 감사 H10: 일반 참여자·조회 전용에게는 초대코드를 보여 주지 않는다. 웹 참여자 화면과 같은 기준이다.
function kakaoInviteNotAllowedText(household = null) {
  return [
    "👥 초대코드는 가계부 소유자·관리자만 확인할 수 있어요.",
    household?.name ? `가계부: ${household.name}` : "",
    "",
    "구성원을 초대하려면 소유자나 관리자에게 초대코드를 요청해 주세요.",
  ].filter(Boolean).join("\n");
}

// V22.9.37 감사 NEW-8: 예산도 기록·수정과 같은 20억 상한을 둔다(웹 예산 일괄 저장과 같은 기준). "50억"이
// 예산으로 저장되면 예산 사용률과 알림이 통째로 어긋난다.
function kakaoBudgetAmountTooLargeText(amount = 0) {
  return `금액이 너무 커서 예산을 설정하지 않았어요.\n입력 금액: ${numberWithCommas(amount)}원\n최대 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원까지 설정할 수 있어요. 금액을 다시 보내 주세요.`;
}

function kakaoInviteManagementText(household = {}, origin = "") {
  const code = String(household?.invite_code || "-").trim() || "-";
  // P1-1: 초대 응답 메시지에는 내부 household_id(UUID)를 노출하지 않는다. 참여는 초대코드만으로 충분하며,
  // 관리 링크는 로그인 세션이 본인 가계부를 해석하는 /my/households 로만 연결한다.
  const href = origin ? `${origin}/my/households` : "";
  return [
    "👥 구성원 초대하기",
    `가계부: ${household?.name || "가계부"}`,
    `초대코드: ${code}`,
    "",
    "구성원에게 아래 문장을 보내세요.",
    `가계부 참여 ${code}`,
    "",
    href ? "참여자·초대 관리" : "",
    href,
  ].filter(Boolean).join("\n");
}

async function kakaoDateSummaryText(env, household = {}, user = {}, range = null, origin = "") {
  return (await kakaoDateSummaryParts(env, household, user, range, origin)).text;
}

// V22.9.72: 기간에 기록이 없으면 짧은 안내만 돌려주고(empty) 호출부가 ‘기록하기’ 버튼을 붙인다(2026-10-20 디자이너 피드백).
async function kakaoDateSummaryParts(env, household = {}, user = {}, range = null, origin = "") {
  let rows;
  try {
    rows = await fetchAdminRowsRange(env, { householdId: household.id, start: range.start, end: range.end, type: "all", limit: 6000 });
  } catch (err) {
    if (!isRowLimitExceededError(err)) throw err;
    // 일부 기록만으로 합계를 말하지 않는다(QA B05).
    return { empty: false, text: "이 기간에는 기록이 너무 많아 합계를 정확히 계산하지 못했어요. 기간을 줄여(예: 이번주, 9월) 다시 물어봐 주세요." };
  }
  if (!rows.length) {
    return { empty: true, text: [`📊 ${range.label} 요약`, `가계부: ${household.name || "가계부"}`, "", `아직 ${range.label} 기록이 없어요.`, "지금 내역을 기록해 보세요.", "예) @말해가계부 커피 4500원"].join("\n") };
  }
  // V22.9.76: 이번 달 요약에는 다가오는 정기 수입·지출(최대 3건)을 붙인다. 요약 요청은 이 함수가 먼저 받아서
  //   skill-handler 의 정기 알림 줄(kakaoReserveAlert)에 닿지 못했다 — 카카오에서는 정기 알림이 한 번도 나가지 않았다.
  //   알림을 못 읽어도 kakaoReserveAlert 가 빈 문자열을 돌려주므로 요약은 그대로 나간다.
  const [members, reserveLine] = await Promise.all([
    fetchHouseholdMembers(env, household.id),
    range.label === "이번 달" ? kakaoReserveAlert(env, household.id) : "",
  ]);
  const incomes = rows.filter((r) => r.type === "income");
  const income = incomes.reduce((a, r) => a + Number(r.amount || 0), 0);
  // V22.9.76 카카오 감사 9: 수입을 물었으면 수입 건수와 수입 분류를 함께 보인다.
  const incomeFocus = range.focus === "income";
  const byIncomeCategory = Object.create(null);
  for (const row of incomes) { const c = row.category || "기타수입"; byIncomeCategory[c] = (byIncomeCategory[c] || 0) + Number(row.amount || 0); }
  const incomeCategories = incomeFocus ? Object.entries(byIncomeCategory).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`• ${k}: ${numberWithCommas(v)}원`) : [];
  const expenses = rows.filter((r) => r.type !== "income");
  const expense = expenses.reduce((a, r) => a + Number(r.amount || 0), 0);
  const byCategory = Object.create(null);
  // V22.9.77 감사 B-5: 지출자별 합계는 사용자 id 로 모은다. 이름으로 모으면 이름이 같은 구성원(단톡방의 ‘카카오사용자’ 셋)이
  // "카카오사용자: 36,000원" 한 줄이 됐고, 나간 사람은 지출자 없는 기록과 함께 ‘미지정’으로 묶였다. 이름은 정산과 같은 규칙이다.
  const byUser = new Map();
  for (const row of expenses) {
    const c = row.category || "기타"; byCategory[c] = (byCategory[c] || 0) + Number(row.amount || 0);
    const uid = String(row.user_id ?? "").trim();
    byUser.set(uid, (byUser.get(uid) || 0) + Number(row.amount || 0));
  }
  const formerMembers = await fetchFormerSpenderMembers(env, expenses, members);
  const spenderLabels = householdPersonLabels(members, formerMembers, [...byUser.keys()]);
  const categories = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`• ${k}: ${numberWithCommas(v)}원`);
  const users = [...byUser].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([uid,v])=>`• ${uid ? spenderLabels.get(uid) || "이전 구성원" : "미지정"}: ${numberWithCommas(v)}원`);
  const cta = await maybeKakaoCta(env, user.id, household.id, origin, "analysis", `${origin}/my/analysis?household_id=${encodeURIComponent(household.id)}&month=${encodeURIComponent(range.month)}`);
  return { empty: false, text: [
    `📊 ${range.label} 요약`,
    `가계부: ${household.name || "가계부"}`,
    "",
    `지출: ${numberWithCommas(expense)}원 · ${expenses.length}건`,
    `수입: ${numberWithCommas(income)}원${incomeFocus ? ` · ${incomes.length}건` : ""}`,
    incomeCategories.length ? "수입 분류" : "", ...incomeCategories,
    incomeFocus && !incomes.length ? `아직 ${range.label} 수입 기록이 없어요.` : "",
    "",
    categories.length ? "카테고리" : "", ...categories,
    users.length ? "" : "", users.length ? "지출자" : "", ...users,
  ].filter(Boolean).join("\n") + reserveLine + cta };
}

// V22.9.37 감사 H7·H13: "같은 이름의 가계부"는 내가 소유한 가계부와만 비교한다. 참여만 한(조회 전용 포함) 가계부와
// 이름이 같다고 새로 만들지 않으면 같은 이름의 내 가계부를 만들 길이 없다. 비교는 공백·대소문자만 고른다.
async function findExistingKakaoHouseholdByNameV2254(env, userId = "", name = "") {
  const target = normalizeHouseholdNameText(name).toLowerCase();
  if (!target) return null;
  const rows = safeArray(await fetchUserHouseholds(env, userId)).filter((h) => String(h?.role || "") === "owner");
  return rows.find((h) => normalizeHouseholdNameText(h?.name || "").toLowerCase() === target) || null;
}
// V22.9.37 감사 D7: 분류별 예산이 있는 달에는 전체 예산이 계산에 쓰이지 않는다(기준은 분류별 합계). 설정 자체는 되지만 그 사실을 답장에 함께 적는다.
async function kakaoTotalBudgetNote(env, householdId, month) {
  try {
    const budgets = await fetchBudgets(env, householdId, month);
    const hasCategory = safeArray(budgets).some((row) => { const c = String(row.category || ""); return c && !c.startsWith("__"); });
    return hasCategory ? "\n\n분류별 예산이 있는 달에는 전체 예산을 계산에 쓰지 않아요. 분류별 예산 합계가 이번 달 예산이에요." : "";
  } catch (_) { return ""; }
}

// V22.9.43: "구성원 권한" 보기와 "구성원 권한 기록만/기록 수정" 바꾸기. 단톡방이면 그 방에 연결된 가계부, 1:1 이면 선택한 가계부가 대상이다.
// 바꾸기는 소유자만 한다. 저장 결과를 확인하지 못하면 바뀌었다고 말하지 않는다.
async function kakaoMemberPolicyReply(env, { household = {}, user = {}, role = "", command = {} } = {}) {
  const name = household.name || "가계부";
  const ownerOnly = `구성원 권한은 ‘${name}’ 소유자만 바꿀 수 있어요.`;
  if (command.mode) {
    if (String(role || "").toLowerCase() !== "owner") return ownerOnly;
    let result;
    try { result = await saveHouseholdMemberPolicy(env, household.id, user.id, command.mode); }
    catch (_) { return "구성원 권한을 저장하지 못했어요. 기존 권한은 그대로예요. 잠시 후 다시 보내 주세요."; }
    if (!result?.ok) return result?.error === "member_policy_owner_only" ? ownerOnly : "구성원 권한을 저장하지 못했어요. 기존 권한은 그대로예요.";
    return [`✅ ‘${name}’ 구성원 권한: ${memberPolicyLabel(result.mode)}`, memberPolicyDescription(result.mode)].join("\n");
  }
  let mode = "";
  try { mode = await fetchHouseholdMemberPolicy(env, household.id); }
  catch (_) { return "구성원 권한을 확인하지 못했어요. 잠시 후 다시 보내 주세요."; }
  return [
    `👥 ‘${name}’ 구성원 권한: ${memberPolicyLabel(mode)}`,
    memberPolicyDescription(mode),
    String(role || "").toLowerCase() === "owner" ? "바꾸려면 ‘구성원 권한 기록만’ 또는 ‘구성원 권한 기록 수정’이라고 보내 주세요." : "소유자만 바꿀 수 있어요.",
  ].join("\n");
}

// @build:exports-start
export {
  beginKakaoHouseholdChoice, clearKakaoSelectedHousehold, copyKakaoBudgetsFromPreviousMonth,
  findExistingKakaoHouseholdByNameV2254, getHouseholdById, getKakaoSelectedHouseholdId,
  inferKakaoCreateKind, isKakaoCreateConfirmNo, isKakaoCreateConfirmYes,
  isKakaoCreateKindOptionsRequest, isKakaoReservedCreateFlowReply, kakaoActiveHouseholds,
  kakaoBudgetAmountTooLargeText, kakaoCreateKindPromptText, kakaoDateSummaryParts,
  kakaoHouseholdChoiceQuickReplies, kakaoHouseholdListLines, kakaoInviteManagementText,
  kakaoInviteNotAllowedText, kakaoManageableHouseholds, kakaoMemberPolicyReply,
  kakaoSelectedHouseholdKey, kakaoStartText, kakaoTotalBudgetNote, kakaoUnlinkedGroupStartText,
  maybeKakaoCta, parseBareInviteCode, parseDirectBudgetSetCommand, parseKakaoCreateKind,
  parseKakaoHouseholdChoice, parseKakaoSummaryRange, plausibleHouseholdNameAtKindStep,
  resolveBudgetCategoryName, sanitizeHouseholdNameInput, sanitizeWebHouseholdNameInput,
  saveKakaoBudget, setKakaoSelectedHousehold, suggestedHouseholdName,
};
// @build:exports-end
