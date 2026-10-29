// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError } from "../runtime/leases.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { saveMemberAlias } from "../data/households-members-rows.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import {
  createUserHousehold, fetchUserHouseholds, withHouseholdCreateLock,
} from "../data/users-household-create.js";
import { canManageMyHousehold } from "../my/access-control.js";
import { isHouseholdSwitchCommand } from "./intent-nlu.js";
import { dedupeQuickReplies, kakaoQr } from "./response-builders.js";
import { stripKakaoBotMention } from "./request-guards.js";
import {
  clearKakaoFlowState, completeKakaoFlowState, getKakaoFlowState,
  isExplicitKakaoFlowCancelCommandV2254, isKakaoGuidedCommand, isUnsafeKakaoNameInputV2254,
  kakaoBudgetAmountQuickReplies, kakaoBudgetCategoryQuickReplies, kakaoBudgetRootQuickReplies,
  kakaoCreateKindQuickReplies, kakaoStartQuickReplies, saveKakaoFlowState,
  shouldInterruptKakaoFlowV2254,
} from "./guided-flow-state.js";
import {
  copyKakaoBudgetsFromPreviousMonth, findExistingKakaoHouseholdByNameV2254, getHouseholdById,
  inferKakaoCreateKind, isKakaoCreateConfirmNo, isKakaoCreateConfirmYes,
  isKakaoCreateKindOptionsRequest, kakaoBudgetAmountTooLargeText, kakaoCreateKindPromptText,
  kakaoHouseholdChoiceQuickReplies, kakaoHouseholdLabelParts, kakaoHouseholdListLines,
  kakaoHouseholdReplyName, kakaoInviteManagementText, kakaoInviteNotAllowedText,
  kakaoManageableHouseholds, kakaoTotalBudgetNote, maybeKakaoCta, parseBareInviteCode,
  parseKakaoCreateKind, parseKakaoHouseholdChoice, plausibleHouseholdNameAtKindStep,
  resolveBudgetCategoryName, sanitizeHouseholdNameInput, saveKakaoBudget, setKakaoSelectedHousehold,
  suggestedHouseholdName,
} from "./household-budget-commands.js";
import {
  bindKakaoGroupByInviteCode, getKakaoBotGroupKey, getLinkedKakaoGroupHousehold,
  kakaoRoomBindConfirmLine, kakaoRoomBindDoneText,
} from "./group-links-first-record.js";
import {
  KAKAO_ROLE_CHECK_FAILED_TEXT, joinHouseholdByCode, readHouseholdRoleOrFailure, roleBlockedMessage,
} from "../domain/users-households.js";
import { isInviteCommand, parseJoinCode } from "./simple-commands.js";
import { normalizeText, parseAmountValue } from "../nlu/amount-parser.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

// V22.9.67: 같은 단계에서 알아듣지 못한 답이 두 번 이어지면 흐름을 끝내 같은 질문의 무한 반복을 막는다.
async function kakaoFlowRetryOrExit(env, user, payload, state, reply, exitReply) {
  const attempts = Number(state?.attempts || 0);
  if (attempts >= 1) {
    await clearKakaoFlowState(env, user.id, payload);
    return exitReply;
  }
  await saveKakaoFlowState(env, user.id, payload, { flow: state.flow, step: state.step, data: state.data || {}, attempts: attempts + 1 });
  return reply;
}

const KAKAO_BUDGET_FLOW_EXIT = Object.freeze({ text: "예산 설정을 멈췄어요. 다시 하려면 ‘예산설정’을 눌러 주세요.", quickReplies: [["예산설정", "예산설정"], ["남은예산", "남은예산"]] });

// V22.9.63: 단톡방에서 새 가계부를 만든 직후 이 방의 연결을 새 가계부로 바꿀지 묻는다. 현재 연결 가계부의 소유자·관리자가 아니면
// 바꿀 수 없으니 묻지 않는다. 질문 상태는 가계부 선택 흐름의 confirm_bind 와 같은 모양이라 답은 그 처리기가 받고, 실제 연결 변경은
// 예전과 같이 bindKakaoGroupByInviteCode(권한 재확인·방 잠금) 한 곳에서만 일어난다.
async function offerKakaoRoomRebindAfterCreate(env, { user, payload, groupKey = "", household = {}, linked = null }) {
  if (!groupKey || !household?.id) return null;
  if (linked?.id) {
    if (String(linked.id) === String(household.id)) return null;
    // V22.9.81 U-4: 지금 연결 가계부의 역할을 읽지 못하면 ‘그 가계부의 소유자·관리자가 바꿔야 해요’(권한 없음 안내)로 넘어가지 않는다.
    // 확인하지 못해 묻지 않았다고 알리고, 질문 상태는 만들지 않는다(연결은 그대로).
    const current = await readHouseholdRoleOrFailure(env, user.id, linked.id, { path: "/skill" });
    if (current.failed) {
      return {
        lines: [
          `이 단톡방의 기록은 아직 ‘${linked.name}’ 가계부에 저장돼요.`,
          `연결을 바꿀 권한을 확인하지 못해 바꿀지 묻지 않았어요. ‘${household.name}’ 가계부로 바꾸려면 잠시 뒤 ‘가계부전환’을 입력해 주세요.`,
        ],
        quickReplies: [["가계부전환", "가계부전환"]],
      };
    }
    if (!["owner", "admin"].includes(current.role)) return null;
  }
  await saveKakaoFlowState(env, user.id, payload, {
    flow: "household_choice",
    step: "confirm_bind",
    attempts: 0,
    data: {
      action: "bind",
      origin: "create",
      group_key: groupKey,
      target_household_id: household.id,
      target_household_name: String(household.name || ""),
      current_household_id: linked?.id || "",
      current_household_name: String(linked?.name || ""),
    },
  });
  return {
    lines: [
      linked?.id ? `이 단톡방의 기록은 아직 ‘${linked.name}’ 가계부에 저장돼요.` : "이 단톡방은 아직 어떤 가계부에도 연결되지 않았어요.",
      `이 단톡방을 ‘${household.name}’ 가계부로 ${linked?.id ? "바꿀까요" : "연결할까요"}?`,
      kakaoRoomBindConfirmLine(household.name),
      `${linked?.id ? "바꾸려면" : "연결하려면"} ‘연결하기’, ${linked?.id ? `계속 ‘${linked.name}’에 기록하려면` : "나중에 연결하려면"} ‘아니요’를 입력해 주세요.`,
    ],
    quickReplies: [["연결하기", "연결하기"], ["아니요", "아니요"]],
  };
}

async function handlePreHouseholdGuidedFlow(env, { utterance, user, payload, nickname, origin }) {
  let state = await getKakaoFlowState(env, user.id, payload);
  if (!state || !["create_household", "join_household", "household_choice"].includes(state.flow)) return null;
  if (isExplicitKakaoFlowCancelCommandV2254(utterance)) {
    await clearKakaoFlowState(env, user.id, payload);
    return { text: "진행 중인 설정을 취소했어요.", quickReplies: kakaoStartQuickReplies(false) };
  }
  if (state.flow === "household_choice") {
    if (state.step === "confirm_bind") {
      const t = normalizeText(utterance);
      // V22.9.63: 새 가계부를 만든 직후의 질문(origin=create)은 ‘아니요’가 취소가 아니라 "현재 가계부 유지"다. 답하기 전에 보낸
      // 다른 말(기록 포함)은 저장하지 않고 같은 질문을 다시 보여 준다 — 어느 가계부에 쌓일지 정해지기 전에는 쓰지 않는다.
      const fromCreate = String(state.data?.origin || "") === "create";
      const targetName = String(state.data?.target_household_name || "").trim();
      const currentName = String(state.data?.current_household_name || "").trim();
      if (isKakaoCreateConfirmNo(t)) {
        await clearKakaoFlowState(env, user.id, payload);
        if (fromCreate) {
          return {
            text: [
              `알겠어요. ‘${targetName || "새"}’ 가계부는 만들어졌고, 이 단톡방의 기록은 ${currentName ? `계속 ‘${currentName}’ 가계부에 저장돼요.` : "연결 전이라 저장되지 않아요."}`,
              `나중에 이 단톡방을 ‘${targetName || "새"}’ 가계부로 ${currentName ? "바꾸려면" : "연결하려면"} ‘가계부전환’을 입력해 주세요.`,
            ].join("\n"),
            quickReplies: [["가계부전환", "가계부전환"], ["기록방법", "기록방법"]],
          };
        }
        return { text: "단톡방 연결 변경을 취소했어요.", quickReplies: [["시작", "시작"]] };
      }
      if (!isKakaoCreateConfirmYes(t) && !/^(연결하기|연결)$/i.test(t)) {
        // V22.9.68 감사: 새 가계부를 만든 직후의 질문은 답하기 전 보낸 말(기록 포함)을 저장하지 않고 질문을 되풀이한다. V22.9.67 의
        // 반복 방지(두 번 못 알아들으면 흐름 종료)는 그대로 따르되, 종료 안내에 기록이 어디로 가는지와 다시 바꾸는 길을 적는다.
        if (fromCreate) {
          return kakaoFlowRetryOrExit(env, user, payload, state, {
            text: [
              `아직 이 단톡방을 ‘${targetName || "새"}’ 가계부로 ${currentName ? "바꿀지" : "연결할지"} 답하지 않았어요. 방금 보낸 내용은 저장하지 않았어요.`,
              `${currentName ? "바꾸려면" : "연결하려면"} ‘연결하기’, ${currentName ? `계속 ‘${currentName}’에 기록하려면` : "나중에 연결하려면"} ‘아니요’를 눌러 주세요.`,
            ].join("\n"),
            quickReplies: [["연결하기", "연결하기"], ["아니요", "아니요"]],
          }, {
            text: [
              `연결 질문을 닫았어요. 이 단톡방의 기록은 ${currentName ? `계속 ‘${currentName}’ 가계부에 저장돼요.` : "연결 전이라 저장되지 않아요."}`,
              `‘${targetName || "새"}’ 가계부로 ${currentName ? "바꾸려면" : "연결하려면"} ‘가계부전환’을 눌러 주세요.`,
            ].join("\n"),
            quickReplies: [["가계부전환", "가계부전환"], ["기록방법", "기록방법"]],
          });
        }
        return kakaoFlowRetryOrExit(env, user, payload, state, { text: "연결하려면 ‘연결하기’를 눌러 주세요.", quickReplies: [["연결하기", "연결하기"], ["취소", "취소"]] }, { text: "단톡방 연결을 멈췄어요. 다시 하려면 ‘단톡방연결’을 눌러 주세요.", quickReplies: [["단톡방연결", "단톡방연결"]] });
      }
      const targetId = String(state.data?.target_household_id || "");
      const all = kakaoManageableHouseholds(await fetchUserHouseholds(env, user.id));
      const target = all.find((h) => String(h.id) === targetId);
      if (!target) {
        await clearKakaoFlowState(env, user.id, payload);
        return { text: "연결할 가계부가 삭제되었거나 관리 권한이 없어졌어요. ‘단톡방연결’을 다시 진행해 주세요.", quickReplies: [["단톡방연결", "단톡방연결"]] };
      }
      const groupKey = String(state.data?.group_key || getKakaoBotGroupKey(payload) || "");
      const result = await bindKakaoGroupByInviteCode(env, user, groupKey, target.invite_code || "", { allowReplace: true });
      if (result.ok) {
        const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
        return { text: (await kakaoRoomBindDoneText(env, target)) + cleanupNotice, quickReplies: [["기록방법", "기록방법"], ["이번달요약", "이번달요약"]] };
      }
      // V22.9.81 U-4: 역할 조회가 실패했으면 ‘소유자·관리자 계정에서 진행해 주세요’(권한 없음)가 아니다. 연결은 그대로이고 질문 상태도 그대로 두어 ‘연결하기’를 다시 보내면 이어진다.
      if (result.error === "household_role_check_failed") return { text: KAKAO_ROLE_CHECK_FAILED_TEXT, quickReplies: [["연결하기", "연결하기"], ["취소", "취소"]] };
      await clearKakaoFlowState(env, user.id, payload);
      return { text: "단톡방 연결 권한을 확인하지 못했어요. 가계부 소유자 또는 관리자로 등록된 카카오 계정에서 진행해 주세요.", quickReplies: [["단톡방연결", "단톡방연결"]] };
    }
    const all = await fetchUserHouseholds(env, user.id);
    const ids = safeArray(state.data?.household_ids).map(String);
    const candidates = all.filter((h) => ids.includes(String(h.id)) && !["pending", "blocked"].includes(String(h.role || "member")));
    if (!candidates.length) {
      await clearKakaoFlowState(env, user.id, payload);
      return { text: "선택하려던 가계부가 삭제되었거나 권한이 변경됐어요. ‘시작’을 입력해 현재 목록을 다시 확인해 주세요.", quickReplies: [["시작", "시작"]] };
    }
    const chosen = parseKakaoHouseholdChoice(utterance, candidates);
    // V22.9.76 감사 D-6: 같은 이름의 가계부가 여럿이면 묻지 않고 첫 번째를 고르던 것을, 역할·만든 날을 붙인 목록에서 번호로 고르게 한다.
    if (chosen?.ambiguous) {
      return {
        text: [`‘${chosen.name}’ 이름의 가계부가 ${chosen.count}개예요. 어느 가계부인지 번호로 골라 주세요.`, "", ...kakaoHouseholdListLines(candidates)].join("\n"),
        quickReplies: [...kakaoHouseholdChoiceQuickReplies(candidates), kakaoQr("취소", "취소")].filter(Boolean),
      };
    }
    if (!chosen && isInviteCommand(utterance)) {
      const nextState = { ...state, data: { ...safeObject(state.data), action: "invite" } };
      await saveKakaoFlowState(env, user.id, payload, nextState);
      return {
        text: ["초대코드를 확인할 가계부를 먼저 선택해 주세요.", "", ...kakaoHouseholdListLines(candidates), "", "번호 또는 가계부 이름을 입력해 주세요."].join("\n"),
        quickReplies: [...kakaoHouseholdChoiceQuickReplies(candidates), kakaoQr("취소", "취소")].filter(Boolean),
      };
    }
    if (!chosen && isHouseholdSwitchCommand(utterance)) {
      // V22.9.63 감사(단톡방 1): 단톡방에서 시작한 연결 선택이 "가계부 바꾸기" 같은 말에 1:1 선택으로 바뀌어, 방에서 고른 가계부가
      // 개인 대화의 선택 가계부가 되고 "이후 기록은 이 가계부 기준"이라는 틀린 안내가 나갔다. 방에서는 연결(bind)만 있다(V22.9.37 H2).
      const roomChoice = !!(state.data?.group_key || getKakaoBotGroupKey(payload));
      const nextState = { ...state, data: { ...safeObject(state.data), action: roomChoice ? "bind" : "select" } };
      await saveKakaoFlowState(env, user.id, payload, nextState);
      return {
        text: [roomChoice ? "이 단톡방에 연결할 가계부를 선택해 주세요." : "사용할 가계부를 선택해 주세요.", "", ...kakaoHouseholdListLines(candidates), "", "번호 또는 가계부 이름을 입력해 주세요."].join("\n"),
        quickReplies: [...kakaoHouseholdChoiceQuickReplies(candidates), kakaoQr("취소", "취소")].filter(Boolean),
      };
    }
    if (!chosen) {
      return kakaoFlowRetryOrExit(env, user, payload, state, {
        text: "가계부를 찾지 못했어요. 아래에서 눌러 골라 주세요.",
        quickReplies: [...kakaoHouseholdChoiceQuickReplies(candidates), kakaoQr("취소", "취소")].filter(Boolean),
      }, { text: "가계부 선택을 멈췄어요. 다시 하려면 ‘가계부전환’을 눌러 주세요.", quickReplies: [["가계부전환", "가계부전환"]] });
    }
    const storedAction = String(state.data?.action || "select");
    // 단톡방 안에서는 어떤 경로로 왔든 1:1 선택을 바꾸지 않는다. 방의 가계부는 연결로만 정해진다.
    const action = storedAction === "select" && (state.data?.group_key || getKakaoBotGroupKey(payload)) ? "bind" : storedAction;
    if (action === "select") {
      await setKakaoSelectedHousehold(env, user.id, chosen.id);
      const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
      // V22.9.79 감사 N-5: 이름이 같은 가계부 중 역할도 같으면 역할만으로는 어느 쪽인지 몰라 만든 날·시각까지 적는다(역할만 다르면 예전처럼 역할).
      const twinParts = kakaoHouseholdLabelParts(chosen, candidates, { roleOnlyWhenUnique: true });
      const roleNote = twinParts ? `(${twinParts})` : "";
      return { text: `✅ ‘${chosen.name}’${roleNote} 가계부를 선택했어요.\n\n이후 기록·예산·요약은 이 가계부 기준으로 처리합니다.` + cleanupNotice, quickReplies: kakaoStartQuickReplies(true) };
    }
    await clearKakaoFlowState(env, user.id, payload);
    // V22.9.37 감사 H10: 고른 가계부에서 소유자·관리자가 아니면 초대코드를 보여 주지 않는다.
    if (action === "invite") return canManageMyHousehold(chosen.role) ? { text: kakaoInviteManagementText(chosen, origin), quickReplies: [["단톡방연결", "단톡방연결"], ["도움말 보기", "도움말 보기"]] } : { text: kakaoInviteNotAllowedText(chosen), quickReplies: [["도움말 보기", "도움말 보기"]] };
    if (action === "bind") {
      const groupKey = String(state.data?.group_key || getKakaoBotGroupKey(payload) || "");
      const current = await getLinkedKakaoGroupHousehold(env, groupKey);
      if (current?.id && String(current.id) === String(chosen.id)) return { text: `이 단톡방은 이미 ‘${chosen.name}’ 가계부에 연결되어 있어요.`, quickReplies: kakaoStartQuickReplies(true) };
      await saveKakaoFlowState(env, user.id, payload, { flow: "household_choice", step: "confirm_bind", data: { action: "bind", group_key: groupKey, target_household_id: chosen.id, current_household_id: current?.id || "" } });
      // V22.9.79 감사 N-5: 현재 연결과 바꿀 가계부의 이름이 같으면 "현재: 우리집 생활비 / 변경: 우리집 생활비"로는 무엇이 바뀌는지 알 수 없다.
      // 둘이 같은 이름일 때만 역할·만든 날(·시각)을 붙여 구별한다.
      const currentRow = current?.id ? { ...current, role: all.find((h) => String(h.id) === String(current.id))?.role } : null;
      const currentLabel = currentRow ? kakaoHouseholdReplyName(currentRow, [chosen]) : "";
      return { text: ["단톡방 연결을 변경할까요?", current?.name ? `현재: ${currentLabel || current.name}` : "현재: 연결되지 않음", `변경: ${currentRow ? kakaoHouseholdReplyName(chosen, [currentRow]) : chosen.name}`, kakaoRoomBindConfirmLine(chosen.name), "", "연결하려면 ‘응’ 또는 ‘연결하기’를 입력해 주세요."].join("\n"), quickReplies: [["연결하기", "연결하기"], ["취소", "취소"]] };
    }
  }
  if (state.flow === "create_household") {
    const finishCreate = async (name, kind = "직접 입력") => {
      const result = await withHouseholdCreateLock(env, user.id, name, async (lifecycleOptions) => {
        const existing = await findExistingKakaoHouseholdByNameV2254(env, user.id, name);
        if (existing) return { household: existing, existed: true };
        return { household: await createUserHousehold(env, user.id, name, nickname, lifecycleOptions), existed: false };
      });
      const existing = result.existed ? result.household : null;
      const groupKey = getKakaoBotGroupKey(payload);
      if (existing) {
        if (!groupKey) await setKakaoSelectedHousehold(env, user.id, existing.id);
        const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
        return {
          text: [`같은 이름의 가계부가 이미 있어 새로 만들지 않았어요.`, `가계부: ${existing.name}`, groupKey ? "현재 단톡방 연결은 자동으로 바뀌지 않습니다." : "기존 가계부를 현재 가계부로 선택했어요."].join("\n") + cleanupNotice,
          quickReplies: groupKey ? [["단톡방연결", "단톡방연결"], ["가계부전환", "가계부전환"]] : kakaoStartQuickReplies(true),
        };
      }
      const household = result.household;
      if (!groupKey) await setKakaoSelectedHousehold(env, user.id, household.id);
      const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
      const linked = groupKey ? await getLinkedKakaoGroupHousehold(env, groupKey) : null;
      // V22.9.88(Y-7): 버튼 이름이 연결하는 화면과 맞게(예전 기본값 ‘상세 분석 보기’ 로 가계부 관리가 열렸다).
      const cta = await maybeKakaoCta(env, user.id, household.id, origin, "household", `${origin}/my/households`, "가계부 관리");
      const headLines = [
        `✅ ‘${household.name}’ 가계부를 만들었어요.`,
        kind && kind !== "직접 입력" ? `용도: ${kind}` : "",
        "",
        `초대코드: ${household.invite_code}`,
        "구성원에게 초대코드를 보내면 같은 가계부에 참여할 수 있어요.",
      ];
      // V22.9.63: 단톡방에서 새 가계부를 만든 사람은 거의 늘 이 방의 기록을 새 가계부에 쌓으려는 것이다. 예전에는 방 연결이
      // 그대로라 다음 기록부터 옛 가계부에 계속 쌓였고, 안내한 ‘단톡방연결’은 안내문만 보여 줘 바꿀 길이 없었다(2026-10-19 운영 보고).
      // 연결을 바꿀 권한이 있으면 바로 묻는다. 답하기 전에는 연결도 바꾸지 않고 이 방의 기록도 저장하지 않는다(V22.9.37 H2 유지).
      const rebind = groupKey ? await offerKakaoRoomRebindAfterCreate(env, { user, payload, groupKey, household, linked }) : null;
      if (rebind) {
        return { text: [...headLines, ...rebind.lines].filter(Boolean).join("\n") + cta + cleanupNotice, quickReplies: rebind.quickReplies };
      }
      return {
        text: [
          ...headLines,
          groupKey
            ? (linked?.id
              ? `이 단톡방의 기록은 계속 ‘${linked.name}’ 가계부에 저장돼요. 새 가계부로 바꾸려면 ‘${linked.name}’의 소유자·관리자가 ‘가계부전환’을 입력해야 해요.`
              : "새 가계부가 이 단톡방에 자동 연결되지는 않아요. 연결하려면 ‘가계부전환’을 입력해 주세요.")
            : "단톡방에서는 소유자 또는 관리자가 한 번 연결해 주세요.",
        ].filter(Boolean).join("\n") + cta + cleanupNotice,
        quickReplies: dedupeQuickReplies([["초대코드", "초대코드"], ["단톡방연결", "단톡방연결"], ["기록방법", "기록방법"]]),
      };
    };

    if (state.step === "kind") {
      if (isKakaoCreateKindOptionsRequest(utterance)) {
        await saveKakaoFlowState(env, user.id, payload, { ...state, attempts: 0 });
        return { text: kakaoCreateKindPromptText("선택할 수 있는 가계부 종류를 알려드릴게요."), quickReplies: kakaoCreateKindQuickReplies() };
      }
      const explicitKind = parseKakaoCreateKind(utterance);
      const inferredKind = explicitKind || inferKakaoCreateKind(utterance);
      const possibleName = plausibleHouseholdNameAtKindStep(utterance);

      if (explicitKind || (inferredKind && !possibleName)) {
        const kind = explicitKind || inferredKind;
        await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "name", data: { kind }, attempts: 0 });
        const suggestion = suggestedHouseholdName(kind, nickname);
        return {
          text: [`좋아요! ${kind} 가계부를 만들게요.`, "", "가계부 이름을 정해 주세요.", `예: ${suggestion}`].join("\n"),
          quickReplies: dedupeQuickReplies([[suggestion.slice(0,14), suggestion], ["종류 다시 선택", "종류 다시 선택"], ["취소", "취소"]]),
        };
      }

      if (possibleName) {
        const kind = inferredKind || "직접 입력";
        await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "confirm_name", data: { kind, name: possibleName }, attempts: 0 });
        return {
          text: [`가계부 이름을 ‘${possibleName}’으로 이해했어요.`, kind !== "직접 입력" ? `용도는 ${kind}로 분류할게요.` : "일반 가계부로 만들 수 있어요.", "", "이 이름으로 만들까요?"].filter(Boolean).join("\n"),
          quickReplies: dedupeQuickReplies([["이 이름으로 만들기", "이 이름으로 만들기"], ["이름 다시 입력", "이름 다시 입력"], ["종류 다시 선택", "종류 다시 선택"], ["취소", "취소"]]),
        };
      }

      const attempts = Math.min(3, Number(state.attempts || 0) + 1);
      await saveKakaoFlowState(env, user.id, payload, { ...state, attempts });
      return { text: kakaoCreateKindPromptText(attempts >= 2 ? "종류를 고르지 않아도 괜찮아요. 원하는 가계부 이름을 바로 보내주세요." : "입력하신 내용을 종류나 이름으로 구분하기 어려웠어요."), quickReplies: kakaoCreateKindQuickReplies() };
    }

    if (state.step === "confirm_name") {
      const t = normalizeText(utterance);
      const name = String(state.data?.name || "").trim();
      const kind = String(state.data?.kind || "직접 입력").trim() || "직접 입력";
      if (isKakaoCreateConfirmYes(t) && name) return finishCreate(name, kind);
      if (isKakaoCreateConfirmNo(t) || /^(이름 다시 입력|이름 바꾸기|다른 이름|이름 수정)$/.test(t)) {
        await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "name", data: { kind }, attempts: 0 });
        return { text: "새 가계부 이름을 입력해 주세요.\n예: 우리집 생활비", quickReplies: dedupeQuickReplies([[suggestedHouseholdName(kind, nickname).slice(0,14), suggestedHouseholdName(kind, nickname)], ["취소", "취소"]]) };
      }
      if (/^(종류 다시 선택|종류 선택|다시 선택)$/.test(t) || isKakaoCreateKindOptionsRequest(t)) {
        await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "kind", data: {}, attempts: 0 });
        return { text: kakaoCreateKindPromptText(), quickReplies: kakaoCreateKindQuickReplies() };
      }
      const changedName = plausibleHouseholdNameAtKindStep(utterance) || sanitizeHouseholdNameInput(utterance);
      if (changedName) {
        const changedKind = inferKakaoCreateKind(changedName) || kind;
        await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "confirm_name", data: { kind: changedKind, name: changedName }, attempts: 0 });
        return { text: `가계부 이름을 ‘${changedName}’으로 바꿔서 만들까요?`, quickReplies: dedupeQuickReplies([["이 이름으로 만들기", "이 이름으로 만들기"], ["이름 다시 입력", "이름 다시 입력"], ["종류 다시 선택", "종류 다시 선택"], ["취소", "취소"]]) };
      }
      return { text: `‘${name}’으로 만들려면 “응” 또는 “만들어줘”라고 입력해 주세요. 이름을 바꾸려면 “아니”라고 입력해 주세요.`, quickReplies: dedupeQuickReplies([["이 이름으로 만들기", "이 이름으로 만들기"], ["이름 다시 입력", "이름 다시 입력"], ["종류 다시 선택", "종류 다시 선택"], ["취소", "취소"]]) };
    }

    if (state.step === "name") {
      if (/^(종류 다시 선택|종류 선택|다시 선택)$/.test(normalizeText(utterance)) || isKakaoCreateKindOptionsRequest(utterance)) {
        await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "kind", data: {}, attempts: 0 });
        return { text: kakaoCreateKindPromptText(), quickReplies: kakaoCreateKindQuickReplies() };
      }
      const name = sanitizeHouseholdNameInput(utterance);
      if (!name) return { text: "가계부 이름을 2~40자로 입력해 주세요.\n예: 우리집 생활비\n\n종류를 다시 고르려면 ‘종류 다시 선택’이라고 입력해 주세요.", quickReplies: [["종류 다시 선택", "종류 다시 선택"], ["취소", "취소"]] };
      const kind = String(state.data?.kind || "직접 입력").trim() || "직접 입력";
      await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "confirm_name", data: { kind, name }, attempts: 0 });
      return {
        text: [`가계부 이름: ${name}`, kind !== "직접 입력" ? `용도: ${kind}` : "", "", "이 이름으로 만들까요?"].filter(Boolean).join("\n"),
        quickReplies: dedupeQuickReplies([["이 이름으로 만들기", "이 이름으로 만들기"], ["이름 다시 입력", "이름 다시 입력"], ["종류 다시 선택", "종류 다시 선택"], ["취소", "취소"]]),
      };
    }
  }
  if (state.flow === "join_household") {
    const code = parseBareInviteCode(utterance) || parseJoinCode(utterance);
    if (!code) return kakaoFlowRetryOrExit(env, user, payload, state, { text: "초대코드를 입력해 주세요.\n예: ABC123", quickReplies: [["취소", "취소"]] }, { text: "참여를 멈췄어요. 다시 하려면 ‘초대코드참여’를 눌러 주세요.", quickReplies: [["초대코드참여", "초대코드참여"]] });
    const joined = await joinHouseholdByCode(env, user.id, code);
    if (!joined) return kakaoFlowRetryOrExit(env, user, payload, state, { text: `초대코드 ${code}를 찾지 못했어요. 다시 확인해 주세요.`, quickReplies: [["취소", "취소"]] }, { text: "초대코드를 찾지 못해 참여를 멈췄어요. 코드를 확인한 뒤 ‘초대코드참여’를 다시 눌러 주세요.", quickReplies: [["초대코드참여", "초대코드참여"]] });
    const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
    // V22.9.37 감사 H2: 단톡방에서 보낸 참여는 1:1 개인 가계부 선택을 바꾸지 않는다. 방의 가계부는 연결로만 정해진다.
    if (!getKakaoBotGroupKey(payload) && !["pending","blocked"].includes(joined.join_role)) await setKakaoSelectedHousehold(env, user.id, joined.id);
    if (["pending","blocked","viewer"].includes(joined.join_role)) return { text: (roleBlockedMessage(joined.join_role, joined.name) || `🕒 ‘${joined.name}’ 참여 요청을 보냈어요.`) + cleanupNotice, quickReplies: [["도움말 보기", "도움말 보기"]] };
    return { text: `✅ ‘${joined.name}’ 가계부에 참여했어요.\n\n이제 ‘점심 12000원 국민카드’처럼 바로 기록할 수 있어요.` + cleanupNotice, quickReplies: kakaoStartQuickReplies(true) };
  }
  return null;
}

async function handleHouseholdGuidedFlow(env, { utterance, user, payload, household, nickname, origin }) {
  let state = await getKakaoFlowState(env, user.id, payload);
  if (!state || !["budget_setup", "member_alias"].includes(state.flow)) return null;
  if (isExplicitKakaoFlowCancelCommandV2254(utterance)) {
    await clearKakaoFlowState(env, user.id, payload);
    return { text: "진행 중인 설정을 취소했어요.", quickReplies: kakaoStartQuickReplies(true) };
  }
  if (shouldInterruptKakaoFlowV2254(state, utterance, stripKakaoBotMention(payload?.userRequest?.utterance || payload?.utterance || utterance))) {
    await clearKakaoFlowState(env, user.id, payload);
    return null;
  }
  if (state.data?.household_id && state.data.household_id !== household.id) {
    const savedHousehold = await getHouseholdById(env, state.data.household_id);
    if (!savedHousehold) {
      await clearKakaoFlowState(env, user.id, payload);
      return { text: "설정하던 가계부를 찾을 수 없어 설정을 중단했어요. 변경 사항은 저장하지 않았어요. ‘시작’을 입력해 가계부를 다시 선택해 주세요.", quickReplies: [["시작", "시작"]] };
    }
    household = savedHousehold;
  }
  if (state.flow === "member_alias") {
    const alias = normalizeText(utterance).replace(/^(내 이름|이름)\s*/, "").trim().slice(0, 20);
    // V22.9.81 U-4: 역할 조회가 실패하면 ‘활성 구성원이 아니어서’라고 하지 않는다. 확인하지 못했다고 알리고 이름도 흐름 상태도 바꾸지 않는다(같은 이름을 다시 보내면 이어진다).
    const aliasLookup = await readHouseholdRoleOrFailure(env, user.id, household.id, { path: "/skill" });
    if (aliasLookup.failed) return { text: KAKAO_ROLE_CHECK_FAILED_TEXT, quickReplies: [["취소", "취소"]] };
    const aliasRole = aliasLookup.role;
    if (!aliasRole || ["pending", "blocked"].includes(aliasRole)) {
      await clearKakaoFlowState(env, user.id, payload);
      return { text: "이 가계부의 활성 구성원이 아니어서 이름을 변경할 수 없어요. ‘시작’을 입력해 현재 가계부를 다시 확인해 주세요.", quickReplies: [["시작", "시작"]] };
    }
    // V22.9.79 통합 검토(T-44): 조회 전용은 이름을 바꾸지 못한다. 이름 입력 중에 조회 전용이 됐으면 흐름만 닫고 이 말은 조회로 넘긴다
    // (조회 말이 아니면 skill-handler 의 조회 전용 판정이 이미 막았다). 전에는 ‘정산담당’·‘요약 민지’가 그 판정을 지나 이름으로 저장됐다.
    if (aliasRole === "viewer") {
      await clearKakaoFlowState(env, user.id, payload);
      return null;
    }
    if (!alias || alias.length < 2 || isKakaoGuidedCommand(alias) || isUnsafeKakaoNameInputV2254(alias)) return kakaoFlowRetryOrExit(env, user, payload, state, { text: "이름을 2~20자로 입력해 주세요.\n예: 민지, 엄마, 아빠", quickReplies: nickname ? [[nickname.slice(0,14), nickname], ["취소", "취소"]] : [["취소", "취소"]] }, { text: "이름 설정을 멈췄어요. 다시 하려면 ‘이름설정’을 눌러 주세요.", quickReplies: [["이름설정", "이름설정"]] });
    await saveMemberAlias(env, household.id, user.id, alias);
    const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
    return { text: `✅ 이 가계부에서 내 이름을 ‘${alias}’로 설정했어요.\n\n앞으로 내가 기록한 수입·지출은 ‘${alias}’ 이름으로 집계됩니다.` + cleanupNotice, quickReplies: [["기록방법", "기록방법"], ["이번달요약", "이번달요약"]] };
  }
  if (state.flow === "budget_setup") {
    // V22.9.81 U-4: 역할 조회가 실패하면 ‘예산은 주인·관리자만’이라 거절하고 흐름을 닫지 않는다(권한이 있는 사람에게 없다고 말했다). V22.9.80 T-35(웹)와 같다:
    // 확인하지 못했다고 알리고 예산도 흐름 상태도 바꾸지 않아, 같은 답을 다시 보내면 그 단계에서 이어진다. 조회는 예전처럼 한 번이다.
    const { role, failed } = await readHouseholdRoleOrFailure(env, user.id, household.id, { path: "/skill" });
    if (failed) return { text: KAKAO_ROLE_CHECK_FAILED_TEXT, quickReplies: [["취소", "취소"]] };
    if (!["owner","admin"].includes(role)) {
      await clearKakaoFlowState(env, user.id, payload);
      return { text: "예산은 가계부 주인·관리자만 정할 수 있어요.", quickReplies: [["남은예산", "남은예산"]] };
    }
    const month = validMonth(state.data?.month) || currentMonthKst();
    if (state.step === "root") {
      const t = normalizeText(utterance);
      if (t === "전체 월 예산") {
        await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "amount", data: { household_id: household.id, month, category: "__total" } });
        return { text: "전체 월 예산을 얼마로 설정할까요?", quickReplies: kakaoBudgetAmountQuickReplies() };
      }
      if (t === "카테고리별 예산") {
        await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "category", data: { household_id: household.id, month } });
        return { text: "예산을 설정할 카테고리를 선택해 주세요.", quickReplies: kakaoBudgetCategoryQuickReplies() };
      }
      if (t === "지난달 예산 복사") {
        let copied;
        try {
          copied = await copyKakaoBudgetsFromPreviousMonth(env, household.id, month);
        } catch (err) {
          // V22.9.34 감사 S6: 이미 정한 이번 달 예산은 덮어쓰지 않고, 확인하지 못했을 때도 복사하지 않는다.
          const configured = /budget_copy_current_configured/.test(safeError(err));
          if (!configured) rememberOpsEvent({ kind: "kakao_budget_copy_failed", severity: "warn", path: "/skill", method: "POST", detail: safeError(err) });
          return {
            text: configured
              ? `${month} 예산이 이미 있어 지난달 예산을 복사하지 않았어요. 바꾸려면 웹의 예산 화면에서 고쳐 주세요.`
              : "지금 예산을 확인하지 못해 복사하지 않았어요. 잠시 뒤 다시 시도해 주세요.",
            quickReplies: kakaoBudgetRootQuickReplies(),
          };
        }
        const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
        return { text: (copied.count ? `✅ ${copied.previous} 예산 ${copied.count}개를 ${month}로 복사했어요.\n${[copied.categoryCount ? `분류별 예산 ${copied.categoryCount}개` : "", copied.totalCount ? "전체 예산" : "", copied.incomeCount ? `수입 목표 ${copied.incomeCount}개` : ""].filter(Boolean).join(" · ")}` : `${copied.previous}에 복사할 예산이 없어요.`) + cleanupNotice, quickReplies: [["남은예산", "남은예산"], ["예산설정", "예산설정"]] };
      }
      return kakaoFlowRetryOrExit(env, user, payload, state, { text: "아래 버튼 중 하나를 눌러 주세요.", quickReplies: kakaoBudgetRootQuickReplies() }, KAKAO_BUDGET_FLOW_EXIT);
    }
    if (state.step === "category") {
      let rawCategory = normalizeText(utterance).replace(/^예산 카테고리\s*/, "");
      if (rawCategory === "직접 입력") {
        await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "category_custom", data: { household_id: household.id, month } });
        return { text: "예산을 설정할 카테고리 이름을 입력해 주세요.\n예: 육아/자녀", quickReplies: [["취소", "취소"]] };
      }
      const category = await resolveBudgetCategoryName(env, household.id, rawCategory);
      if (!category) return kakaoFlowRetryOrExit(env, user, payload, state, { text: "카테고리를 찾지 못했어요. 버튼에서 골라 주세요.", quickReplies: kakaoBudgetCategoryQuickReplies() }, KAKAO_BUDGET_FLOW_EXIT);
      await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "amount", data: { household_id: household.id, month, category } });
      return { text: `${category} 예산을 얼마로 설정할까요?`, quickReplies: kakaoBudgetAmountQuickReplies() };
    }
    if (state.step === "category_custom") {
      const category = await resolveBudgetCategoryName(env, household.id, utterance);
      if (!category) return kakaoFlowRetryOrExit(env, user, payload, state, { text: "카테고리 이름을 다시 입력해 주세요.\n예: 외식, 육아/자녀", quickReplies: [["취소", "취소"]] }, KAKAO_BUDGET_FLOW_EXIT);
      await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "amount", data: { household_id: household.id, month, category } });
      return { text: `${category} 예산을 얼마로 설정할까요?`, quickReplies: kakaoBudgetAmountQuickReplies() };
    }
    if (state.step === "amount") {
      if (normalizeText(utterance) === "직접 입력") return { text: "금액을 직접 입력해 주세요.\n예: 80만원", quickReplies: [["취소", "취소"]] };
      const amount = parseAmountValue(utterance);
      if (!amount) return kakaoFlowRetryOrExit(env, user, payload, state, { text: "금액을 확인하지 못했어요.\n예: 50만원", quickReplies: kakaoBudgetAmountQuickReplies() }, KAKAO_BUDGET_FLOW_EXIT);
      // V22.9.37 감사 NEW-8: "50억"은 예산으로 저장하지 않고 상한을 알리고 다시 묻는다(웹 예산 저장과 같은 20억 상한).
      if (amount > MAX_TRANSACTION_AMOUNT) return { text: kakaoBudgetAmountTooLargeText(amount), quickReplies: kakaoBudgetAmountQuickReplies() };
      const category = state.data?.category || "__total";
      await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "confirm", data: { household_id: household.id, month, category, amount } });
      return { text: `${month} ${category === "__total" ? "전체 월" : category} 예산을\n${numberWithCommas(amount)}원으로 설정할까요?`, quickReplies: [["설정하기", "설정하기"], ["다시 입력", "다시 입력"], ["취소", "취소"]] };
    }
    if (state.step === "confirm") {
      const t = normalizeText(utterance);
      if (t === "다시 입력") {
        await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "amount", data: state.data });
        return { text: "금액을 다시 입력해 주세요.", quickReplies: kakaoBudgetAmountQuickReplies() };
      }
      if (isKakaoCreateConfirmNo(t)) {
        await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "amount", data: state.data });
        return { text: "금액을 다시 입력해 주세요.", quickReplies: kakaoBudgetAmountQuickReplies() };
      }
      if (t !== "설정하기" && !isKakaoCreateConfirmYes(t)) return kakaoFlowRetryOrExit(env, user, payload, state, { text: "‘설정하기’를 눌러 주세요.", quickReplies: [["설정하기", "설정하기"], ["다시 입력", "다시 입력"], ["취소", "취소"]] }, KAKAO_BUDGET_FLOW_EXIT);
      const category = state.data?.category || "__total";
      const amount = Number(state.data?.amount || 0);
      if (amount > MAX_TRANSACTION_AMOUNT) {
        await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "amount", data: { household_id: household.id, month, category } });
        return { text: kakaoBudgetAmountTooLargeText(amount), quickReplies: kakaoBudgetAmountQuickReplies() };
      }
      await saveKakaoBudget(env, household.id, month, category, amount);
      const totalNote = category === "__total" ? await kakaoTotalBudgetNote(env, household.id, month) : "";
      const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
      // V22.9.88(Y-7): 버튼 이름이 연결하는 화면과 맞게(예전 기본값 ‘상세 분석 보기’ 로 설정이 열렸다).
      const cta = await maybeKakaoCta(env, user.id, household.id, origin, "budget", `${origin}/my/settings?household_id=${encodeURIComponent(household.id)}&month=${encodeURIComponent(month)}`, "예산 설정 열기");
      return {
        text: [`✅ ${category === "__total" ? "전체 월" : category} 예산을 설정했어요.`, "", `설정 금액: ${numberWithCommas(amount)}원`].join("\n") + totalNote + cta + cleanupNotice,
        quickReplies: [["예산설정", "예산설정"], ["남은예산", "남은예산"]],
      };
    }
  }
  return null;
}

const KAKAO_SKILL_MAX_BODY_BYTES = 256 * 1024;

async function readRequestTextBounded(request, maxBytes = KAKAO_SKILL_MAX_BODY_BYTES) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("skill_request_too_large");
  if (!request.body || typeof request.body.getReader !== "function") return request.text();
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    if (!part.value) continue;
    total += part.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("skill_request_too_large");
      throw new Error("skill_request_too_large");
    }
    chunks.push(part.value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
// @build:exports-start
export {
  KAKAO_SKILL_MAX_BODY_BYTES, handleHouseholdGuidedFlow, handlePreHouseholdGuidedFlow,
  readRequestTextBounded,
};
// @build:exports-end
