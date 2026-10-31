// @build:imports-start
import {
  fetchAdminRows, fetchFormerSpenderMembers, fetchHouseholdMembers,
} from "../data/households-members-rows.js";
import { buildSettlementModel } from "../features/settlement-ops-pages.js";
import { refundLinksEnabled } from "../domain/refund-links.js";
import {
  kakaoRefundSettlementLines, kakaoRefundSurplusLine, loadRefundLinkMonthState,
  refundSettlementSpenderRows,
} from "../features/settlement-refund-links.js";
import { detectKakaoNaturalIntent } from "./intent-nlu.js";
import { extractAmount, normalizeText } from "../nlu/amount-parser.js";
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

// V22.9.43: 소유자가 구성원 권한을 보고 정하는 말. "구성원 권한"은 보기, "구성원 권한 기록만"·"구성원 권한 기록 수정"은 바꾸기.
// 금액이 없는 짧은 고정 문장만 받는다. 알아듣지 못한 뒷말은 바꾸지 않고 보기로 돌린다.
function parseKakaoMemberPolicyCommand(text = "") {
  const m = normalizeText(text).trim().match(/^(?:구성원|참여자|멤버)\s*권한(?:\s*(?:설정|변경|보기|확인))?(?:\s+(.+))?$/);
  if (!m) return null;
  const rest = String(m[1] || "").replace(/[\s·.,!~]+/g, "");
  if (!rest) return { show: true };
  if (/^(?:기록만|기록전용|기록만허용|기록만가능)(?:으로|로)?(?:해줘|해주세요|바꿔줘|변경)?$/.test(rest)) return { mode: "record_only" };
  if (/^(?:기록수정|기록과수정|기록및수정|수정허용|수정가능|수정까지|수정까지허용|기록수정허용|기록수정가능)(?:으로|로)?(?:해줘|해주세요|바꿔줘|변경)?$/.test(rest)) return { mode: "record_edit" };
  return { show: true, unknown: true };
}

// V22.9.76 감사 A-04: 자연어 판정은 ‘메뉴’·‘기능’을 부분 문자열로 찾아서 "스타벅스 신메뉴 6500"·"건강기능식품 35000"·
// "점심 메뉴 12000" 같은 기록이 도움말로 바뀌고 저장되지 않았다. 자연어 판정은 금액이 없는 말에만 쓰고,
// 아래의 짧은 도움말 명령은 그대로 받는다.
function isHelpCommand(text) {
  if (detectKakaoNaturalIntent(text).intent === "HELP" && !extractAmount(text)) return true;
  return /^(도움말|help|사용법|사용 방법|사용방법|사용법 알려줘|사용 방법 알려줘|어떻게 써|어떻게써|어떻게 사용해|어떻게사용해|명령어|명령어 알려줘|가이드|설명|처음|시작|시작하기|메뉴|웰컴|안내|무엇을|무엇을 할 수 있어|뭐해|뭐 할 수 있어|뭐할수있어|기능 알려줘|기능알려줘)$/i.test(normalizeText(text));
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

// V22.9.63 감사(1:1 4): 정산 모델의 1인 기준은 반올림이라(V57 동결 계약) 배분된 몫(내림, 나머지는 마지막 참여자)과 맞지 않았다.
// 모델은 그대로 두고 챗봇 안내만 배분과 같은 값으로 적는다.
function kakaoSettlementShareLine(model = {}) {
  const total = Math.max(0, Math.round(Number(model.totalExpense || 0)));
  const count = Math.max(1, Math.round(Number(model.participantCount || 1)));
  const perHead = Math.floor(total / count);
  const remainder = total - perHead * count;
  return `1인 기준: ${numberWithCommas(perHead)}원${remainder ? ` (나머지 ${numberWithCommas(remainder)}원은 마지막 참여자 몫)` : ""}`;
}

async function kakaoSettlementText(env, household = {}) {
  return (await kakaoSettlementParts(env, household)).text;
}

// V22.9.72: 정산할 지출이 없으면 짧은 안내만 돌려주고(empty) 호출부가 ‘기록하기’ 버튼을 붙인다(2026-10-20 디자이너 피드백).
async function kakaoSettlementParts(env, household = {}) {
  const month = currentMonthKst();
  const members = await fetchHouseholdMembers(env, household.id);
  // V22.9.79 D-5: 환불 연결 플래그가 켜지면 같은 달 환급 행까지 한 번에 읽고 연결한 환불을 정산에서 뺀다(꺼지면 예전 그대로).
  // 표가 없으면(DDL 적용 전) 연결 없이 예전 답장과 같다. 원래 지출 고르기는 웹 정산 화면에서만 한다.
  const refundOn = refundLinksEnabled(env);
  const monthRows = await fetchAdminRows(env, { month, householdId: household.id, type: refundOn ? "all" : "expense" });
  const rows = refundOn ? monthRows.filter((row) => row.type === "expense") : monthRows;
  const refund = refundOn ? await loadRefundLinkMonthState(env, { householdId: household.id, monthRows }) : null;
  // V22.9.77 감사 B-5: 웹 정산과 같이 나간 사람의 이름을 읽어 ‘별명(나간 구성원)’으로 구분한다(명단에 없는 지출자가 없으면 읽지 않는다).
  const formerMembers = await fetchFormerSpenderMembers(env, refund ? refundSettlementSpenderRows(rows, refund) : rows, members);
  const model = buildSettlementModel(rows, members, { formerMembers, ...(refund?.netting ? { refundNetting: refund.netting } : {}) });
  // V22.9.76 카카오 감사 14: 이 답장에는 환급 계산이 없다. 정산은 지출만 나누고 환급(돌려받은 돈)을 빼지 않으며, 환급 연결
  // 미리보기는 웹 정산 화면(소유자·관리자)에만 있다. 예전 문장은 여기서 환급을 미리 계산해 주는 것처럼 읽혔다.
  const refundNotice = "환급(돌려받은 돈)은 이 정산에서 빼지 않아요. 환급 미리보기는 웹 정산 화면에서 볼 수 있고, 일반 정산 금액과 완료 이력에는 반영하지 않습니다.";
  const refundLines = refund?.available ? kakaoRefundSettlementLines(refund, model) : [refundNotice];
  if (!model.people.length || (!model.totalExpense && !model.refundTotal)) {
    // D3(V22.9.58): 환급 미리보기 한계 문장은 빈 정산에도 남긴다(validate-d3-refund-guidance).
    return { empty: true, text: [`📊 ${month} 정산`, `가계부: ${household.name || "가계부"}`, "", "아직 정산할 지출이 없어요.", "기록이 쌓이면 1/n 정산을 바로 계산해 드려요.", "", ...refundLines].join("\n") };
  }
  const people = model.people.slice(0, 8).map((p) => {
    if (p.balance > 0) return `• ${p.name}: ${numberWithCommas(p.balance)}원 받기`;
    if (p.balance < 0) return `• ${p.name}: ${numberWithCommas(Math.abs(p.balance))}원 보내기`;
    return `• ${p.name}: 정산 차액 없음`;
  });
  const transfers = model.transfers.slice(0, 8).map((t) => `• ${t.from} → ${t.to}: ${numberWithCommas(t.amount)}원`);
  // V22.9.44 감사 D-21: 8명·8건을 넘으면 말없이 잘렸다. 남은 수를 한 줄로 알린다.
  const morePeople = model.people.length > 8 ? [`외 ${numberWithCommas(model.people.length - 8)}명은 웹 정산 화면에서 볼 수 있어요.`] : [];
  const moreTransfers = model.transfers.length > 8 ? [`외 ${numberWithCommas(model.transfers.length - 8)}건은 웹 정산 화면에서 볼 수 있어요.`] : [];
  return { empty: false, text: [
    `📊 ${month} 정산`,
    ...refundLines,
    `총 지출: ${numberWithCommas(model.totalExpense)}원${model.refundTotal ? ` (환불 ${numberWithCommas(model.refundTotal)}원 뺌)` : ""}`,
    `참여자: ${numberWithCommas(model.participantCount)}명`,
    model.totalExpense < 0 ? kakaoRefundSurplusLine(model) : kakaoSettlementShareLine(model),
    "",
    ...people,
    ...morePeople,
    ...(transfers.length ? ["", "송금 제안", ...transfers, ...moreTransfers] : []),
  ].join("\n") };
}

// V22.9.80 T-39: ‘얼마나 썼어’·‘얼마 나갔어’·‘돈 얼마나 나갔지’도 ‘얼마 썼어’와 같은 이번 달 요약 물음이다. 예전에는 요약 낱말(‘얼마 썼’)만 보아
// 이런 말이 "무슨 뜻인지 이해하지 못했어요"로 답했다. 문장 전체가 이 물음 꼴이고 금액이 없을 때만 읽는다(‘얼마나 썼는지 몰라 커피 4500’은 기록이다).
// 기간 말이 앞에 있는 물음(‘지난달 얼마나 썼지’·‘저저번달 얼마나 썼어’)은 parseKakaoSummaryRange 가 먼저 그 기간(읽지 못한 기간은 그 안내)으로 답한다.
function isKakaoSpentQuestion(text = "") {
  const t = normalizeText(text);
  return /^(?:\S.*?\s)?(?:돈\s*)?얼마(?:나)?\s*(?:썼|나갔)(?:어|지|죠|나|니|냐|는지|더라)?요?(?:\s*(?:알려줘|보여줘))?$/.test(t) && !extractAmount(t);
}

function isSummaryCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "SUMMARY" || /^(요약|이번달|이번 달|월요약|월 요약|합계|현황|통계|분류별지출|분류별 지출|이번달요약|이번 달 요약)$/i.test(normalizeText(text)) || isKakaoSpentQuestion(text);
}

function isBudgetCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "BUDGET_STATUS" || /^(남은예산|남은 예산|예산|예산확인|예산 확인|월예산|월 예산|이번달예산|이번 달 예산|예산현황|예산 현황|예산잔액|예산 잔액|사용금액|사용 금액|예산사용률|예산 사용률|예산 얼마나 남았어|예산얼마나남았어|얼마남았어|얼마 남았어|돈얼마남았어|돈 얼마 남았어|남은금액|남은 금액|남은돈|남은 돈|쓸수있는돈|쓸 수 있는 돈|쓸수있는금액|쓸 수 있는 금액|이번달 얼마 쓸 수 있어|이번 달 얼마 쓸 수 있어|잔여예산|잔여 예산|내예산|내 예산|내예산확인|내 예산 확인)$/i.test(normalizeText(text));
}

function isRecentCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "RECENT_RECORDS" || /^(최근|최근기록|최근 기록|최근내역|최근 내역|내기록|내 기록|내가쓴내역|내가 쓴 내역|내역|마지막|마지막내역|마지막 내역|방금기록|방금 기록|최근 5건|최근5건|오늘기록보기|오늘 기록 보기|오늘기록|오늘 기록|오늘내역|오늘 내역|오늘뭐썼어|오늘 뭐 썼어|오늘쓴거|오늘 쓴 거)$/i.test(normalizeText(text));
}

function isUndoCommand(text) {
  const t = normalizeText(text);
  // V22.9.93 Q-25: ‘방금 거 취소’·‘방금 입력 취소’·‘잘못 입력했어’ 가 ‘무슨 뜻인지 이해하지 못했어요’ 였다. ‘취소’ 와 같은 안내를 받는다(지우지는 않는다).
  return /^(취소|방금취소|방금 취소|삭제|방금삭제|방금 삭제|마지막삭제|마지막 삭제|입력취소|입력 취소|잘못입력|잘못 입력|되돌리기|방금 거 삭제)$/i.test(t)
    || /^취소(?:요|\s*해\s*(?:줘요?|주세요)|\s*할게요?)$/.test(t)
    || /^(?:방금|아까|마지막)\s*(?:거|것|건|꺼|기록|입력)?\s*취소(?:요|\s*해\s*(?:줘요?|주세요)?|\s*할게요?)?$/.test(t)
    || /^잘못\s*(?:입력|기록|적|썼|쓴|저장)(?:했어요?|했어|했네|했다|었어요?|어요?)?$/.test(t);
}

function isInputExampleCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "INPUT_EXAMPLE" || /^(\/?기록|기록방법|기록 방법|\/?입력|입력하기|지출입력|지출 입력|수입입력|수입 입력|입력예시|입력 예시|예시|예제|어떻게입력|어떻게 입력|카톡입력|카톡 입력)$/i.test(normalizeText(text));
}

function isKeywordGuideCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "KEYWORD_GUIDE" || /^(키워드|키워드안내|키워드 안내|분류|분류설정|분류 설정|자동분류|자동 분류)$/i.test(normalizeText(text));
}

function isEditGuideSimpleCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "EDIT_GUIDE" || /^(수정|수정방법|수정 방법|삭제방법|삭제 방법|번호수정|번호 수정|수정가이드|수정 가이드|방금수정|방금 수정|수정할래|수정할게|수정하고 싶어|고칠래|고칠게|고치고 싶어)$/i.test(normalizeText(text));
}

function isReserveGuideCommand(text) {
  return detectKakaoNaturalIntent(text).intent === "RESERVE_GUIDE" || /^(정기지출|정기 지출|자동차세|재산세|자동차보험|보험준비|보험 준비|준비금|알림|납부알림|납부 알림)$/i.test(normalizeText(text));
}

// V22.9.76: 운영자용 오픈빌더 설정 안내(Skill URL·블록 연결)는 운영자 낱말로만 연다. 예전에는 사용자가 칠 만한
// '카카오 설정'·'봇 설정'·'심사'·'운영 점검'·'챗봇 점검'·'블록 설정'에도 이 안내가 나갔다.
function isOpenBuilderGuideCommand(text) {
  return /^(오픈빌더|openbuilder|폴백|스킬연결|스킬 연결|발화목록|발화 목록)$/i.test(normalizeText(text));
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
  kakaoSettlementParts, parseGroupBindCommand, parseJoinCode, parseKakaoMemberPolicyCommand,
};
// @build:exports-end
