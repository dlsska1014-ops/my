// @build:imports-start
import { fetchAdminRows, fetchHouseholdMembers } from "../data/households-members-rows.js";
import { buildSettlementModel } from "../features/settlement-ops-pages.js";
import { detectKakaoNaturalIntent } from "./intent-nlu.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst } from "../nlu/date-payment.js";
import { numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function parseJoinCode(text) {
  const m = text.match(/(?:가계부\s*)?(?:참여|연결|join)\s+([A-Z0-9]{5,12})/i);
  return m ? m[1].toUpperCase() : null;
}

// V22.9.37 감사 H15: 승인 대기 중인 사람이 자기 참여 요청을 거두는 말. "취소" 한 마디는 수정 세션·단계 흐름 취소와 겹치므로 받지 않는다.
function isJoinCancelCommand(text = "") {
  return /^(?:가계부\s*)?(?:참여|가입|참여\s*요청|참여\s*신청|승인\s*대기|승인\s*요청)\s*(?:취소|철회)(?:해줘|해\s*주세요|할래|하기)?$/.test(normalizeText(text));
}

function isHelpCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "HELP" || /^(도움말|help|사용법|사용 방법|사용방법|사용법 알려줘|사용 방법 알려줘|어떻게 써|어떻게써|어떻게 사용해|어떻게사용해|명령어|명령어 알려줘|가이드|설명|처음|시작|시작하기|메뉴|웰컴|안내|무엇을|무엇을 할 수 있어|뭐해|뭐 할 수 있어|뭐할수있어|기능 알려줘|기능알려줘)$/i.test(normalizeText(text));
}

function isInviteCommand(text) {
  const t = normalizeText(text);
  const intent = detectKakaoNaturalIntent(t).intent;
  return ["INVITE_CODE_SHOW","INVITE_MEMBER"].includes(intent) || /(초대코드|초대 코드|가계부코드|가계부 코드|초대장|초대 링크|초대링크|구성원 초대|멤버 초대|가족 초대|사람 초대|친구 초대|초대 방법|초대방법|초대코드 알려줘|초대코드 보여줘|초대코드 어디|초대 코드 어디|초대해줘|초대)/.test(t);
}

function isLinkCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "WEB_LINK" || /^(링크|주소|홈페이지|웹페이지|웹|사이트|대시보드|홈|내가계부|내 가계부|웹가계부열기|웹 가계부 열기|가계부시작|가계부 시작|시작링크|시작 링크|안전링크|안전 링크|웹으로 보기|웹에서 보기|상세보기|상세 보기|관리화면|관리 화면|가계부 관리|설정 화면|설정화면)$/i.test(normalizeText(text));
}

function isSettlementCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "SETTLEMENT" || /^(정산|정산해줘|정산해 줘|정산하기|정산요약|정산 요약|정산현황|정산 현황|더치페이|더치 페이|1\/n정산|1\/n 정산|누가 얼마 보내|보낼 돈|받을 돈|내가 보낼 돈|내가 받을 돈)$/i.test(normalizeText(text));
}

async function kakaoSettlementText(env, household = {}) {
  const month = currentMonthKst();
  const members = await fetchHouseholdMembers(env, household.id);
  const rows = await fetchAdminRows(env, { month, householdId: household.id, type: "expense" });
  const model = buildSettlementModel(rows, members);
  if (!model.totalExpense || !model.people.length) {
    return [`📊 ${month} 정산`, `가계부: ${household.name || "가계부"}`, "", "정산할 지출 기록이 아직 없어요."].join("\n");
  }
  const people = model.people.slice(0, 8).map((p) => {
    if (p.balance > 0) return `• ${p.name}: ${numberWithCommas(p.balance)}원 받기`;
    if (p.balance < 0) return `• ${p.name}: ${numberWithCommas(Math.abs(p.balance))}원 보내기`;
    return `• ${p.name}: 정산 완료`;
  });
  const transfers = model.transfers.slice(0, 8).map((t) => `• ${t.from} → ${t.to}: ${numberWithCommas(t.amount)}원`);
  return [
    `📊 ${month} 정산`,
    `총 지출: ${numberWithCommas(model.totalExpense)}원`,
    `참여자: ${numberWithCommas(model.participantCount)}명`,
    `1인 기준: ${numberWithCommas(model.share)}원`,
    "",
    ...people,
    ...(transfers.length ? ["", "송금 제안", ...transfers] : []),
  ].join("\n");
}

function isSummaryCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "SUMMARY" || /^(요약|이번달|이번 달|월요약|월 요약|합계|현황|통계|분류별지출|분류별 지출|이번달요약|이번 달 요약)$/i.test(normalizeText(text));
}

function isBudgetCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "BUDGET_STATUS" || /^(남은예산|남은 예산|예산|예산확인|예산 확인|월예산|월 예산|이번달예산|이번 달 예산|예산현황|예산 현황|예산잔액|예산 잔액|사용금액|사용 금액|예산사용률|예산 사용률|예산 얼마나 남았어|예산얼마나남았어|얼마남았어|얼마 남았어|돈얼마남았어|돈 얼마 남았어|남은금액|남은 금액|남은돈|남은 돈|쓸수있는돈|쓸 수 있는 돈|쓸수있는금액|쓸 수 있는 금액|이번달 얼마 쓸 수 있어|이번 달 얼마 쓸 수 있어|잔여예산|잔여 예산|내예산|내 예산|내예산확인|내 예산 확인)$/i.test(normalizeText(text));
}

function isRecentCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "RECENT_RECORDS" || /^(최근|최근기록|최근 기록|최근내역|최근 내역|내기록|내 기록|내가쓴내역|내가 쓴 내역|내역|마지막|마지막내역|마지막 내역|방금기록|방금 기록|최근 5건|최근5건|오늘기록보기|오늘 기록 보기|오늘기록|오늘 기록|오늘내역|오늘 내역|오늘뭐썼어|오늘 뭐 썼어|오늘쓴거|오늘 쓴 거)$/i.test(normalizeText(text));
}

function isUndoCommand(text) {
  return /^(취소|방금취소|방금 취소|삭제|방금삭제|방금 삭제|마지막삭제|마지막 삭제|입력취소|입력 취소|잘못입력|잘못 입력|되돌리기|방금 거 삭제)$/i.test(normalizeText(text));
}

function isInputExampleCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "INPUT_EXAMPLE" || /^(\/?기록|기록방법|기록 방법|\/?입력|입력하기|지출입력|지출 입력|수입입력|수입 입력|입력예시|입력 예시|예시|예제|어떻게입력|어떻게 입력|카톡입력|카톡 입력)$/i.test(normalizeText(text));
}

function isKeywordGuideCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "KEYWORD_GUIDE" || /^(키워드|키워드안내|키워드 안내|분류|분류설정|분류 설정|자동분류|자동 분류)$/i.test(normalizeText(text));
}

function isEditGuideSimpleCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "EDIT_GUIDE" || /^(수정|수정방법|수정 방법|삭제방법|삭제 방법|번호수정|번호 수정|수정가이드|수정 가이드|방금수정|방금 수정)$/i.test(normalizeText(text));
}

function isReserveGuideCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "RESERVE_GUIDE" || /^(정기지출|정기 지출|자동차세|재산세|자동차보험|보험준비|보험 준비|준비금|알림|납부알림|납부 알림)$/i.test(normalizeText(text));
}

function isOpenBuilderGuideCommand(text) {
  return /^(오픈빌더|openbuilder|블록설정|블록 설정|카카오설정|카카오 설정|폴백|스킬연결|스킬 연결|발화목록|발화 목록|봇설정|봇 설정|심사|심사준비|심사 준비|챗봇점검|챗봇 점검|운영점검|운영 점검)$/i.test(normalizeText(text));
}

function isBrandGuideCommand(text) {
  return /^(브랜드|브랜드명|로고|말해가계부|똑똑한가계부|심사문구|심사 문구)$/i.test(normalizeText(text));
}

function isDataPolicyCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "DATA_POLICY" || /^(개인정보|개인정보처리|데이터보관|데이터 보관|보관기준|삭제기준|삭제 기준|프라이버시)$/i.test(normalizeText(text));
}

function isGroupLinkInfoCommand(text) {
  return /^(단톡방|단톡방정보|단톡방 정보|단톡방연결|단톡방 연결|단톡연결|단톡 연결|단체방연결|단체방 연결|그룹방연결|그룹방 연결|그룹연결|그룹 연결|이방연결|이 방 연결|방연결|방 연결|방정보|방 정보|그룹정보|그룹 정보)$/i.test(normalizeText(text));
}

function parseGroupBindCommand(text = "") {
  const m = String(text || "").trim().match(/^(?:단톡방\s*연결|그룹\s*연결|방\s*연결|이방\s*연결)\s+([A-Za-z0-9가-힣_-]{4,40})$/i);
  return m ? m[1].trim().toUpperCase() : "";
}
// @build:exports-start
export {
  isBrandGuideCommand, isBudgetCommand, isDataPolicyCommand, isEditGuideSimpleCommand,
  isGroupLinkInfoCommand, isHelpCommand, isInputExampleCommand, isInviteCommand,
  isJoinCancelCommand, isKeywordGuideCommand, isLinkCommand, isOpenBuilderGuideCommand,
  isRecentCommand, isReserveGuideCommand, isSettlementCommand, isSummaryCommand, isUndoCommand,
  kakaoSettlementText, parseGroupBindCommand, parseJoinCode,
};
// @build:exports-end
