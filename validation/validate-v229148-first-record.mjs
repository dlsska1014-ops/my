// V22.9.148 첫 기록 판 검사.
//   1. 관제가 못 알아들은 답을 따로 센다 — 출시 뒤 ‘무슨 뜻인지 이해하지 못했어요’·‘내용과 금액을 한 문장으로…’ 답이 ‘ok’ 로 세어져
//      못 알아들음을 셀 수 없었다(관제가 옛 문장 ‘정확히 이해하지 못했’ 만 찾았다). 답을 만든 곳이 이름·결과를 직접 적는다(markKakaoNluOutcomeV229148):
//      못 알아들음 NO_MATCH/fallback, 금액 없음 NO_AMOUNT/fallback, 단추 이름만 BUTTON_LABEL/fallback, 이름·초대·예산·가계부 안내 NO_MATCH/clarify,
//      인사 GREETING/ok, 가계부 없는 사람의 첫 안내 FIRST_CONTACT/clarify(아직 기록 전의 안내 단계), 저장한 답 TRANSACTION/ok.
//      저장하는 관제 줄(record_nlu_metric)에도 그 이름이 간다(글은 없다). 낱말 없는 말(‘?’ — 판별 EMPTY)도 못 알아들음 답이면 NO_MATCH.
//   2. 관제가 답의 모든 말풍선 글을 읽는다 — 단톡방 답(단추가 붙으면 카드)과 1:1 답의 둘째 말풍선은 예전에 늘 ‘ok’ 였다(저장 확인 지연·
//      고치기 실패까지). 문구 판정은 봇이 쓴 말만 본다 — 기록 줄의 메모·이름 줄(‘가계부: 서버 오류 대응팀’)·따옴표 안의 원래 문장
//      (‘서버 오류 수리비’·‘잠시 후 다시 갈 커피’)은 뺀다. 저장한 답의 표시는 지금 답 꼴에서 결과를 바꾸지 않는 대비다(그런 줄을 모두 빼므로).
//   3. 못 알아들은 뒤의 바로답은 [기록방법]·[도움말 보기](예전 [오늘기록] 은 첫 기록 전엔 ‘아직 기록이 없어요’ 만 보였다), 1:1 도움말·기록하는 법의
//      예시에는 ‘@말해가계부’ 가 없다(단톡방은 그대로). 답 글의 첫 줄은 예전과 같다.
//   4. 웹 정산 소수 몫(추적표 V147:G-2): 90,000원 0.7 : 0.3 = 63,000 / 27,000(예전 62,999 / 27,001), 0.1 셋에 30,000원 = 10,000원씩.
//      무작위 소수 몫은 BigInt 정답과, 정수 몫·동일·품목별은 예전 식과 같은지 본다(바뀌는 것은 소수 몫뿐).
//   5. 2026-11-27 운영 DB 권한 정리의 기록 파일(실행 금지 가드, 프로젝트 식별자 없음)과 SQL_HISTORY 줄.
//   6. Codex 검토(2026-11-27, 병합 뒤·승격 전)에서 나온 것: 실패 사례 저장이 꺼져 있으면 메모리의 최근 사건에도 문장을 남기지 않는다, 시작·도움말
//      카드의 이름 줄(‘이 방 가계부:’·‘지금 가계부:’·‘가계부 이름:’ 등)과 겹친 따옴표(바깥 짝까지)도 문구 판정에서 뺀다, 표시는 한 줄 전체로만 대조한다,
//      카드의 머리말·목록도 읽는다, 가계부 없는 사람의 ‘다른 가계부’ 도 첫 안내로 센다, 0.001 단위 반올림의 실수 오차(0.5005), 비율·인원수 지문의
//      계산식 표지(이 판 전에 연 화면의 완료를 거절), 기록 파일의 적용문은 주석(가드만 실행되는 문)과 그 검사의 대조 사례.
//      2차 검토(고친 부분만): 스킬 사건(관리자 /ops-snapshot.json 의 skill.recent)에도 문장을 남기지 않는다(스냅샷의 두 목록을 읽는다), 0.001 단위 반올림은
//      십진 글자로 한 번만(0.5004999999 = 500 단위), 배포 경계의 같은 완료(이 판 전 지문 + 같은 몫)는 ‘이미 완료’, 이름 안의 짝 없는 따옴표와 목록 줄
//      (가계부 고르기·내 가계부 목록·상위 지출·예산 현황·고를 값)의 이름은 뺀다(후보가 둘인 실제 고르기 답), 기록 파일은 정해 둔 세 줄과 그대로 비교(CR·블록
//      주석 없음), 이름 꼬리표는 Acorn 으로 템플릿 조각을 읽어 모은다, 환불 연결 v3 지문의 계산식 표지.
//      3차 검토(고친 부분만): 잘못된 JSON 본문은 스킬 사건의 detail 에도 남기지 않는다(고정 이름·글자 수·위치), 상위 지출·예산 현황 줄은 만드는 꼴 그대로
//      (분류 이름이 ‘1. 점심: 5000원’ 인 예산 물음은 되묻기), 단톡방의 번호 예시가 붙은 알리는 줄, 짝이 어긋난 따옴표는 방향별로(판정 낱말이 든 답 글 줄마다
//      보간식에 짝 없는 따옴표 값을 넣어 본다), 예시 줄(‘예: ’ — 별명이 든 이름 제안)은 뺀다(그 줄들에 판정 낱말이 없음을 본다), 꼬리표는 변수 이름과 상관없이
//      모두 모아 빼거나 사람이 확인한 표와 대조, 이 판 전 지문은 비교할 이력이 있을 때만(저장 길의 지문 계산 수를 센다), 몫 칸이 빠진 이력은 같은 완료가
//      아니다, 환불 연결이 실제로 있는 달의 배포 경계, 0.1 단위 1만 가지는 20억 원으로(한 단위 차이가 몫에 나타난다).
//      3차 고침 중 찾은 것(V148:C-33): 운영·스킬·NLU 사건의 오류 글에서 DB 가 옮겨 적은 행·받은 값과 JSON.parse 가 옮겨 적은 글을 뺀다(이 런타임의 실제 문구,
//      DB 가 기록 저장을 거절한 카카오 답의 관리자 스냅샷).
//      4차 검토(3차 고침만): 끊긴 받은 값(안쪽 따옴표)·DB 오류 본문은 구조로 읽어 값을 뺀다(띄어 쓴·여러 줄 JSON, PGRST100, 처음 보는 열쇠, JSON 이 아닌 본문),
//      잘못된 JSON 본문의 위치는 V8 문구 끝의 위치만, 중복으로 건너뛴 기록의 상세는 지문만, 글머리표 금액 줄·정산 사람별 줄의 이름은 뺀다, 예산 금액 물음은
//      만든 곳이 결과를 적는다, 곧은 따옴표가 셋 넘는 값, 맨 앞 요청 번호는 남긴다(NLU 사건과 잇는다), JSON.parse 문구는 V8 머리와 함께, 확인한 식 표는 식 전체로.
//      4차 고침 중 찾은 것: 따옴표를 먼저 빼고 줄의 꼴을 본다(기록 줄을 흉내 낸 되풀이 값), 별도 구매 답의 결과 표시, 비밀 낱말 가리기(‘$1’·Bearer 뒤의 값).
import { readdirSync, readFileSync } from "node:fs";
import { parse as parseAcorn } from "../tools/vendor/acorn.mjs";
import { app, BASE, counter, fixture, formFields, intercept, page, post, putSetting, withClock } from "./lib-audit-v22934.mjs";
import { buildSettlementModel, settlementConditionPairs, settlementDuplicateCompletionV229148, settlementPreviewDigest } from "../src/modules/features/settlement-ops-pages.js";
import { settlementRefundDigest } from "../src/modules/features/settlement-refund-links.js";
import {
  getNluOpsSnapshot, getSkillOpsSnapshot, kakaoNluMarkV229148, markKakaoNluOutcomeV229148, nluOutcomeFromKakaoResponse, rememberNluRuntimeEvent, rememberOpsEvent,
  rememberDuplicateEvent, rememberSkillEvent,
} from "../src/modules/runtime/ops-telemetry.js";
import { kakaoGroupCompatibleResponse, kakaoText } from "../src/modules/kakao/response-builders.js";
import { sha256Hex } from "../src/modules/auth/crypto-admin-session.js";

const t = counter("V22.9.148 첫 기록(관제의 못 알아들음·카드 답 분류, 못 알아들은 뒤 단추, 1:1 도움말 예시, 웹 정산 소수 몫 G-2, DB 권한 정리 기록) 검사 통과");
const json = (value) => JSON.stringify(value);

// ── 2. 관제 분류 함수(단위) ──
const simple = (text, quick = []) => json({ version: "2.0", template: { outputs: [{ simpleText: { text } }], ...(quick.length ? { quickReplies: quick.map((label) => ({ label, action: "message", messageText: label })) } : {}) } });
const card = (description, buttons = []) => ({ textCard: { description, buttons } });
const message = (label) => ({ label, action: "message", messageText: label });
const link = (label) => ({ label, action: "webLink", webLinkUrl: `${BASE}/kakao-guide` });
const cards = (...outputs) => json({ version: "2.0", template: { outputs } });
const outcome = (raw, mark = null) => { const o = nluOutcomeFromKakaoResponse(raw, mark); return `${o.result}/${o.reason}`; };
// 저장 실패(kakaoSaveFailedText)는 단추가 없어 단톡방에서도 말풍선 하나다 — 예전에도 error 였다.
t.eq(outcome(simple("저장하지 못했어요 😢\n\n가계부 저장소가 요청을 거절해 이번 내용은 기록되지 않았어요.")), "error/save_failed", "2 저장 실패는 예전처럼 error");
// 단톡방 카드가 된 고치기 실패(edit-flow-v4.js — 단추가 붙는다)는 예전에 카드를 읽지 않아 ok 였다.
t.eq(outcome(cards(card("01번 기록을 바꾸지 못했어요. 기록은 그대로예요.\n잠시 후 다시 보내 주세요.", [message("오늘기록")]))), "error/safe_error_response", "2 단톡방 카드의 고치기 실패 = error(예전 ok)");
t.eq(outcome(cards({ simpleText: { text: "이 방 가계부 ‘우리 집’에 참여했어요." } }, card("지금은 저장 확인이 지연되고 있어요. 중복될 수 있으니 기다려 주세요."))), "error/save_uncertain", "2 둘째 말풍선의 저장 지연도 읽는다");
t.eq(outcome(cards(card("어떤 기록인가요? 골라 주세요.", [message("지출"), message("수입")]))), "clarify/guided_clarification", "2 카드의 메시지 단추는 바로답처럼 고를 것으로 센다");
t.eq(outcome(cards(card("어떤 기록인가요? 골라 주세요.", [link("입력 예시 보기")]))), "ok/handled", "2 링크 단추만 있으면 고를 것이 아니다");
t.eq(outcome(simple("어떤 기록인가요? 선택해 주세요.", ["지출", "수입"])), "clarify/guided_clarification", "2 1:1 바로답 되묻기는 예전처럼 clarify");
t.eq(outcome(simple("01번 - 커피 / 4,500원 💸 지출 저장했어요.")), "ok/handled", "2 저장 답은 예전처럼 ok");
t.eq(outcome(simple("무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요.\n예) 점심 12000원 국민카드")), "fallback/generic_fallback", "2 표시가 없어도 지금의 못 알아들음 문장은 fallback(예전 ok)");
const noMatchMark = { intent: "NO_MATCH", result: "fallback", reason: "no_match", signature: "무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요." };
t.eq(outcome(cards(card("무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요.\n예) @말해가계부 점심 12000원", [link("입력 예시 보기"), message("기록방법")])), noMatchMark), "fallback/no_match", "2 표시의 첫 줄이 마지막 답에 있으면 표시를 쓴다");
t.eq(nluOutcomeFromKakaoResponse(simple("01번 - 커피 / 4,500원 💸 지출 저장했어요."), noMatchMark).marked, undefined, "2 마지막 답에 표시의 첫 줄이 없으면(다른 답으로 바뀜) 표시를 쓰지 않는다");
t.eq(outcome(simple("01번 - 커피 / 4,500원 💸 지출 저장했어요."), noMatchMark), "ok/handled", "2 그때는 예전처럼 글로 읽는다");
// 독립 검토(V22.9.148): 답에 되풀이된 사용자의 글이 오류·되묻기 문구로 읽혔다 — 기록 줄의 메모와 따옴표 안의 원래 문장은 문구 판정에서 뺀다.
t.eq(outcome(cards(card("01번 - 서버 오류 수리비 / 30,000원 / 현금 / 기타 · 💸 지출 저장했어요. (2026-11-30)\n가계부: 우리 집\n지출자: 나", [message("지난주 요약")]))), "ok/handled", "2 기록 줄의 메모 ‘서버 오류 …’ 는 오류가 아니다(단톡방 카드 — 표시 없이도)");
t.eq(outcome(simple("🧾 2026-11-30 기록\n01번 - 잠시 후 다시 갈 커피 / 4,500원 / 현금 / 카페\n02번 - 어떤 커피 / 수입 3,000원 / 계좌 / 수입", ["수정"])), "ok/handled", "2 목록의 메모 ‘잠시 후 다시 …’·‘어떤 …’ 은 오류·되묻기가 아니다");
t.eq(outcome(simple("🧾 최근 입력 내역\n• 2026-11-30 지출 30,000원 · 서버 오류 수리비\n\n오늘 번호로 수정하려면 '오늘기록'을 보내세요.")), "ok/handled", "2 최근 입력 목록의 메모도 뺀다");
t.eq(outcome(simple("🧾 2026-11-27 기록\n가계부: 서버 오류 대응팀\n\n01번 - 커피 / 4,500원 / 현금 / 카페\n지출자: 어떤 사람", ["수정"])), "ok/handled", "2 이름 줄(가계부·지출자 — 사용자가 정한 이름)도 뺀다");
t.eq(outcome(simple("🛍️ 지출 중복 저장 안 함 😊\n서로 다른 구매라면 ‘별도 구매 추가 잠시 후 다시 갈 커피 4500원’라고 원래 기록 문장을 보내 후보를 확인해 주세요.")), "ok/handled", "2 따옴표 안의 원래 문장도 뺀다");
t.eq(outcome(simple("01번 - 커피 / 4,500원 / 현금 / 카페\n이 기록을 바꾸지 못했어요. 잠시 후 다시 보내 주세요.")), "error/safe_error_response", "2 기록 줄 밖의 봇 문장은 그대로 오류로 읽는다");
t.eq(outcome(simple("두 건으로 읽었어요.\n1) 커피 / 4,500원 / 현금\n2) 택시 / 8,000원 / 카드\n이대로 저장할까요?", ["네", "아니요"])), "clarify/guided_clarification", "2 기록 줄을 보여 주고 묻는 답은 그대로 되묻기");

// ── 6. Codex 검토(단위) ──
// 6-a 이름 줄: 시작·도움말 카드의 ‘이 방 가계부: 이름’·1:1 시작의 ‘지금 가계부: 이름’·만들기 확인의 ‘가계부 이름: 이름’ 과 그 밖의 꼬리표(이름·메모·분류).
const NAME_LABELS = ["이 방 가계부", "지금 가계부", "가계부 이름", "연결 가계부", "📒 현재 선택 가계부", "현재 연결", "현재", "변경", "✅ 가계부", "📒 가계부", "분류", "기록", "복구하려던 기록", "마지막에 바뀐 기록", "마지막에 저장한 기록"];
for (const label of NAME_LABELS) t.eq(outcome(cards(card(`말해가계부 사용 설명서\n${label}: 서버 오류 대응팀\n내 권한: 소유자`, [message("기록하기")]))), "ok/handled", `6-a 꼬리표 줄 ‘${label}: 서버 오류 대응팀’ 은 뺀다(예전 error)`);
// 만들기 확인(guided-flows.js·skill-handler.js 의 글 그대로) — ‘만들까요’ 는 되묻기 낱말이 아니라 예전부터 ok 다. 이름 줄 때문에 error 가 되던 것만 고친다.
t.eq(outcome(simple("가계부 이름: 잠시 후 다시 모임\n용도: 모임\n\n이 이름으로 만들까요?", ["이 이름으로 만들기", "이름 다시 입력", "종류 다시 선택", "취소"])), "ok/handled", "6-a 만들기 확인의 ‘가계부 이름: 잠시 후 다시 모임’ 은 뺀다(예전 error)");
t.eq(outcome(simple("오늘 가계부: 서버 오류 대응팀")), "error/safe_error_response", "6-a 정해 둔 꼬리표가 아니면 빼지 않는다(줄 첫머리의 꼬리표만)");
t.eq(outcome(simple("가계부를 저장하지 못했어요. 잠시 후 다시 보내 주세요.")), "error/save_failed", "6-a 꼬리표 낱말로 시작해도 ‘: ’ 가 없는 봇 문장은 그대로 읽는다");
{
  // 답 글에 ‘꼬리표: ${식}’ 으로 적는 줄을 src/modules/kakao 에서 모아, 사용자가 정한 값이면 관제가 그 줄을 빼는지 본다(새 꼬리표가 생기면 여기서 떨어진다).
  // V22.9.148(Codex 2차 검토): 글자 정규식([^}]{0,120})은 긴 보간식·겹친 중괄호(skill-handler.js 의 ‘현재 연결: ${…}’)를 놓쳤다. 이제 Acorn 으로
  // 템플릿 글의 고정 조각(quasi)을 읽는다 — 줄 첫머리(템플릿 시작 또는 \n 뒤)의 ‘꼬리표: ’ 바로 뒤 보간식을 모은다. 문자열 더하기(‘"꼬리표: " + 이름’)도 본다.
  // V22.9.148(Codex 3차 검토): 후보를 변수 철자(name·memo …)로 고르면 따로 만든 값(guided-flows.js 의 ‘예: ${suggestion}’ — suggestion =
  // suggestedHouseholdName(종류, 카카오 별명))을 놓쳤다. 이제 변수 이름과 상관없이 모든 꼬리표를 모으고, 각 꼬리표는 (가) 관제가 빼는 꼬리표이거나
  // (나) 아래 표에서 사람이 ‘사용자 글이 아님’ 을 확인한 식과 같아야 한다 — 새 꼬리표나 식이 바뀐 꼬리표는 여기서 떨어진다(표에 넣기 전에 그 값을 본다).
  // V22.9.148(Codex 4차 검토 — V148:C-44): 표는 식 전체로 대조한다(글자 그대로 같은 식). 앞 표의 정규식 몇은 식의 앞만 보아(/^numberWithCommas\(/)
  // ‘numberWithCommas(amount) + memo’ 같은 식도 받았다. 표에만 남은 식(코드에서 없어진 식)도 떨어뜨린다.
  const NOT_USER_VALUES = new Map([
    ["구성원 권한", ["memberPolicyLabel(policy)"]], // 정해 둔 권한 문구
    ["날짜", ["saved.transaction_date"]], // YYYY-MM-DD
    ["내 권한", ["userHouseholdRoleLabel(role)", 'userHouseholdRoleLabel(current.role || "member")', "userHouseholdRoleLabel(joined.role)", "userHouseholdRoleLabel(myRole)"]], // 소유자·관리자·구성원·조회전용(서버가 정한 권한 값)
    ["되돌리려면", ['numbered ? `복구 ${twoDigitSeq(seq)}번` : "복구"']], // 복구 01번 · 복구
    ["설정 금액", ["numberWithCommas(amount)", "numberWithCommas(directBudget.amount)"]], ["수입", ["numberWithCommas(income)"]], ["지출", ["numberWithCommas(expense)"]], // 숫자
    ["입력 금액", ["numberWithCommas(amount)", "numberWithCommas(tooLarge.amount)"]], ["한 사람 몫", ["numberWithCommas(perHead)"]], // 숫자
    ["용도", ["kind"]], // 정해 둔 다섯 종류(household-budget-commands.js parseKakaoCreateKind·inferKakaoCreateKind)
    ["초대코드", ["household.invite_code", "code"]], // 만든 초대코드
    ["한 줄로도 돼요", ["person"]], // ‘지출자’·‘수입자’(edit-session-v4.js)
  ]);
  const dir = new URL("../src/modules/kakao/", import.meta.url);
  const found = new Map();
  const LABEL_AT_END = (first) => new RegExp(`(?:${first ? "^|" : ""}\\n)((?:📒 |✅ )?[가-힣][가-힣 ]{0,12}): $`, "u");
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".js"))) {
    const source = readFileSync(new URL(name, dir), "utf8");
    const take = (cooked, first, expression) => {
      const label = LABEL_AT_END(first).exec(String(cooked ?? ""));
      if (!label) return;
      const key = label[1].trim();
      if (!found.has(key)) found.set(key, []);
      found.get(key).push({ where: `${name}:${source.slice(0, expression.start).split("\n").length}`, expression: source.slice(expression.start, expression.end).replace(/\s+/g, " ") });
    };
    const visit = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "TemplateLiteral") node.expressions.forEach((expression, index) => take(node.quasis[index].value.cooked, index === 0, expression));
      if (node.type === "BinaryExpression" && node.operator === "+" && node.left.type === "Literal" && typeof node.left.value === "string") take(node.left.value, true, node.right);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object" && typeof value.type === "string") visit(value);
      }
    };
    visit(parseAcorn(source, { ecmaVersion: "latest", sourceType: "module" }));
  }
  const removed = (label) => outcome(simple(`${label}: 서버 오류 대응팀`)) === "ok/handled";
  const unreviewed = [...found].flatMap(([label, uses]) => (removed(label) ? [] : uses.filter((use) => !NOT_USER_VALUES.get(label)?.includes(use.expression)).map((use) => `${label}@${use.where} ${use.expression.slice(0, 60)}`)));
  const stale = [...NOT_USER_VALUES.keys()].filter((label) => !found.has(label) || removed(label));
  const staleExpressions = [...NOT_USER_VALUES].flatMap(([label, list]) => list.filter((expression) => !(found.get(label) || []).some((use) => use.expression === expression)).map((expression) => `${label}=${expression}`));
  const uses = [...found.values()].reduce((sum, list) => sum + list.length, 0);
  t.ok(found.size >= 30 && found.has("현재 연결") && found.has("예") && removed("예") && !unreviewed.length && !stale.length && !staleExpressions.length,
    `6-a 답 글의 꼬리표 ${found.size}개(${uses}곳) = 관제가 빼는 ${[...found.keys()].filter(removed).length}개 + 사용자 글이 아님을 확인한 ${NOT_USER_VALUES.size}개 (‘현재 연결’ = ${found.get("현재 연결")?.[0].where || "못 찾음"} · ‘예’ ${found.get("예")?.length || 0}곳) (확인하지 않은 것: ${unreviewed.join(", ") || "없음"} · 표에만 남은 것: ${[...stale, ...staleExpressions].join(", ") || "없음"})`);
}
// 6-a′ 이름·분류가 목록 줄로 되풀이되는 답(Codex 2차 검토 — 가계부 고르기의 ‘1. 서버 오류 대응팀 · 소유자’ 가 오류로 셌다). 답을 만드는 코드의 글 그대로.
t.eq(outcome(simple("카카오 챗봇 계정에서 사용할 가계부를 선택해 주세요.\n\n1. 서버 오류 대응팀 · 소유자\n2. 우리집 생활비 · 구성원 · 만든 날 2026-11-02\n\n번호 또는 가계부 이름을 입력해 주세요.", ["1. 서버 오류 대응팀", "2. 우리집 생활비", "취소"])), "clarify/guided_clarification", "6-a′ 가계부 고르기 목록의 이름은 뺀다(예전 error)");
t.eq(outcome(simple("📒 내 가계부 목록\n\n1. 서버 오류 대응팀 · 소유자 · 초대코드 ABCD1234\n2. 잠시 후 다시 모임 · 관리자 · 초대코드 -")), "ok/handled", "6-a′ 내 가계부 목록(초대코드 줄)의 이름도 뺀다(예전 error)");
t.eq(outcome(simple("📊 2026-11 요약\n수입: 0원\n지출: 30,000원\n잔액: -30,000원\n\n상위 지출:\n1. 서버 오류 수리: 30,000원")), "ok/handled", "6-a′ 이번 달 요약 상위 지출의 분류 이름은 뺀다(예전 error)");
t.eq(outcome(simple("💰 2026-11 예산 현황\n\n• 서버 오류 수리: 30,000원 사용 / 70,000원 남음 · 30%")), "ok/handled", "6-a′ 예산 현황 분류 줄의 이름은 뺀다(예전 error)");
t.eq(outcome(simple("지출자를 누구로 바꿀까요? 번호로 골라주세요.\n1. 서버팀  2. 오류왕", ["1", "2", "취소"])), "ok/handled", "6-a′ 기록 고치기의 고를 값 줄(‘1. 서버팀  2. 오류왕’ 이 ‘서버.*오류’ 에 걸리던 것)은 뺀다 — 이 묻는 글은 되묻기 낱말 목록 밖이라 예전처럼 ok(예전 error)");
t.eq(outcome(simple("1. 가계부를 저장하지 못했어요. 잠시 후 다시 보내 주세요.")), "error/save_failed", "6-a′ 목록 줄 꼴이 아닌 번호 줄의 봇 문장은 그대로 읽는다");
// 6-a′ 목록을 알리는 줄 다음의 번호 줄(2차 고침 뒤 확인하다 더 찾음 — 고를 값이 하나인 줄, 참여 취소의 승인 대기 목록). 이름만 바꾼 같은 답과 결과가 같아야 한다.
t.eq(outcome(simple("지출자를 누구로 바꿀까요? 번호로 골라주세요.\n1. 오류왕", ["1", "취소"])), "ok/handled", "6-a′ 고를 값이 하나인 줄(‘1. 오류왕’)도 뺀다(예전 error)");
for (const [label, named, plain] of [
  ["구성원을 못 찾은 고치기 답", "⚠️ '오류왕'을 구성원 목록에서 찾지 못했어요.\n번호로 골라주세요.\n1. 서버팀  2. 오류왕", "⚠️ '민지'를 구성원 목록에서 찾지 못했어요.\n번호로 골라주세요.\n1. 철수  2. 민지"],
  ["분류 고르기", "✏️ 3번 기록\n지출 분류를 번호로 골라 주세요.\n1. 서버 오류 수리  2. 식비  3. 잠시 후 다시", "✏️ 3번 기록\n지출 분류를 번호로 골라 주세요.\n1. 수리  2. 식비  3. 카페"],
  ["목록의 번호로 다시 고르기", "목록의 번호로 골라주세요.\n1. 서버 오류  2. 어떤 모임", "목록의 번호로 골라주세요.\n1. 우리집  2. 모임"],
  ["참여 취소의 승인 대기 목록", "승인 대기 중인 가계부가 2개예요.\n1. 서버 오류 대응팀\n2. 잠시 후 다시 모임\n\n취소할 가계부는 웹 가계부 관리에서 골라 주세요.", "승인 대기 중인 가계부가 2개예요.\n1. 우리집\n2. 주말 모임\n\n취소할 가계부는 웹 가계부 관리에서 골라 주세요."],
]) t.eq(outcome(simple(named)), outcome(simple(plain)), `6-a′ ${label}: 목록의 이름이 오류·되묻기 문구와 겹쳐도 결과가 같다(${outcome(simple(plain))})`);
t.eq(outcome(simple("지출자를 누구로 바꿀까요? 번호로 골라주세요.\n1. 서버팀  2. 오류왕\n가계부를 저장하지 못했어요. 잠시 후 다시 보내 주세요.")), "error/save_failed", "6-a′ 번호 줄이 끊기면 그 뒤 봇 문장은 다시 읽는다");
t.eq(outcome(simple("승인 대기 중인 가계부가 2개예요.\n1. 우리집\n\n1. 가계부를 저장하지 못했어요.")), "error/save_failed", "6-a′ 빈 줄로 끊긴 뒤의 번호 줄은 목록이 아니다");
// 6-b 겹친 따옴표는 바깥 짝까지 뺀다. 짝 사이의 봇 문장·닫히지 않은 따옴표 뒤의 문장은 그대로 읽는다.
t.eq(outcome(simple("이 방 가계부 ‘모임 ‘개발’ 서버 오류 대응팀’에 참여했어요.")), "ok/handled", "6-b 겹친 따옴표 ‘모임 ‘개발’ 서버 오류 대응팀’ 은 바깥 짝까지 뺀다(예전 error)");
t.eq(outcome(simple("‘커피’ 기록은 처리하지 못했어요. ‘택시’는 그대로예요.")), "error/safe_error_response", "6-b 두 따옴표 말 사이의 봇 문장은 그대로 읽는다");
t.eq(outcome(simple("‘커피 기록은 처리하지 못했어요.")), "error/safe_error_response", "6-b 닫히지 않은 따옴표는 그 줄 뒤를 지우지 않는다");
t.eq(outcome(simple("‘커피\n이 기록은 처리하지 못했어요.")), "error/safe_error_response", "6-b 따옴표 짝은 줄을 넘지 않는다");
// 6-b′ 이름·메모 안의 짝 없는 따옴표(Codex 2차 검토): 답 글의 따옴표는 짝이 맞으니, 사용자 글의 여는 따옴표 하나·닫는 따옴표 하나가 답 글의 짝을 가져가도 그 이름까지만 뺀다.
t.eq(outcome(simple("이 방 가계부 ‘서버 오류 ‘개발’에 참여했어요.")), "ok/handled", "6-b′ 이름 ‘서버 오류 ‘개발’(여는 따옴표만)의 참여 안내 = ok(앞 고침 error, 그 앞 판 ok)");
t.eq(outcome(simple("이 방 가계부 ‘개발’ 서버 오류’에 참여했어요.")), "ok/handled", "6-b′ 이름 ‘개발’ 서버 오류’(닫는 따옴표만)의 참여 안내 = ok(예전부터 error)");
t.eq(outcome(simple("“서버 오류 “개발” 가계부를 선택했어요.")), "ok/handled", "6-b′ 큰따옴표도 같다");
t.eq(outcome(simple("‘커피 ‘라떼’ 기록은 처리하지 못했어요.")), "error/safe_error_response", "6-b′ 메모에 여는 따옴표만 있어도 그 뒤 봇의 실패 문장은 읽는다");
t.eq(outcome(simple("‘커피’ 라떼’ 기록은 처리하지 못했어요.")), "error/safe_error_response", "6-b′ 메모에 닫는 따옴표만 있어도 그 뒤 봇의 실패 문장은 읽는다");
t.eq(outcome(simple("‘커피’ 기록은 처리하지 못했어요. ‘택시’’ 는 그대로예요.")), "error/safe_error_response", "6-b′ 뒤 이름의 짝 없는 닫는 따옴표는 가장 가까운 앞 짝만 늘린다(사이의 봇 문장은 읽는다)");
t.eq(outcome(simple("‘a’ 가 ‘b 기록은 처리하지 못했어요.")), "error/safe_error_response", "6-b′ 뒤에 같은 종류 짝이 없는 여는 따옴표는 늘리지 않는다");
{
  // 닫히지 않은 여는 따옴표가 줄에 많아도 한 번만 훑는다(예전 정규식은 여는 따옴표마다 줄 끝까지 되짚어 4만 자에 수백 ms).
  // Codex 2차 검토 뒤: 짝 없는 따옴표를 늘리는 두 단계도 줄 길이에 비례한다.
  for (const [label, body] of [["닫히지 않은 따옴표 2만 개", "‘a".repeat(20000)], ["짝 없는 닫는 따옴표 1만 개", "‘a’’".repeat(10000)], ["짝 없는 여는 따옴표 1만 개", "‘‘a’".repeat(10000)], ["두 종류가 섞인 줄", "‘a“b’”’“".repeat(5000)]]) {
    const longLine = simple(body);
    outcome(longLine);
    let best = Infinity;
    for (let round = 0; round < 3; round += 1) { const started = performance.now(); outcome(longLine); best = Math.min(best, performance.now() - started); }
    t.ok(best < 150, `6-b ${label} 줄(${body.length.toLocaleString("en-US")}자)도 줄 길이에 비례해 훑는다 (${best.toFixed(1)} ms)`);
  }
}
// 6-c 표시는 그 첫 줄이 답의 한 줄 전체일 때만 쓴다(앞에 붙는 방 참여 안내 줄은 상관없다).
{
  const savedMark = { intent: "TRANSACTION", result: "ok", reason: "handled", signature: "01번 - 커피 / 4,500원 💸 지출 저장했어요." };
  t.eq(outcome(simple("저장하지 못했어요 😢\n메모 ‘01번 - 커피 / 4,500원 💸 지출 저장했어요.’ 는 기록되지 않았어요."), savedMark), "error/save_failed", "6-c 바뀐 답의 메모에 표시의 첫 줄이 인용되기만 하면 표시를 쓰지 않는다(예전 ok)");
  t.eq(nluOutcomeFromKakaoResponse(cards({ simpleText: { text: "이 방 가계부 ‘우리 집’에 참여했어요." } }, card("01번 - 커피 / 4,500원 💸 지출 저장했어요. \n가계부: 우리 집")), savedMark).marked, true, "6-c 참여 안내 줄 뒤의 한 줄 전체(앞뒤 공백만 다름)는 표시를 쓴다");
}
// 6-d 카드의 머리말·목록도 읽는다(지금 답은 쓰지 않지만 단톡방이 받는 카드).
t.eq(outcome(cards({ carousel: { type: "basicCard", header: { title: "저장 확인이 지연되고 있어요." }, items: [{ title: "기록 확인", description: "" }] } })), "error/save_uncertain", "6-d carousel 머리말(header)을 읽는다(예전 ok)");
t.eq(outcome(cards({ listCard: { header: { title: "최근 기록" }, items: [{ title: "이 기록을 처리하지 못했어요", description: "잠시 뒤 다시" }] } })), "error/safe_error_response", "6-d listCard 목록을 읽는다");
t.eq(outcome(cards({ itemCard: { head: { title: "저장하지 못했어요" }, itemList: [{ title: "금액", description: "1,000원" }] } })), "error/save_failed", "6-d itemCard 머리(head)를 읽는다");
t.eq(outcome(cards({ carousel: { type: "basicCard", items: [{ title: "어떤 기록인가요?", buttons: [message("지출"), message("수입")] }] } })), "clarify/guided_clarification", "6-d carousel 항목의 메시지 단추도 고를 것으로 센다");
{
  const env = { __AB_KAKAO_REQUEST: {} };
  const savedText = "01번 - 커피 / 4,500원 / 현금 / 카페 · 💸 지출 저장했어요. (2026-11-30)\n가계부: 우리 집";
  markKakaoNluOutcomeV229148(env, "saved", savedText);
  t.eq(json(kakaoNluMarkV229148(env)), json({ intent: "TRANSACTION", result: "ok", reason: "handled", kind: "saved", signature: "01번 - 커피 / 4,500원 / 현금 / 카페 · 💸 지출 저장했어요. (2026-11-30)" }), "2 저장한 답의 표시 = TRANSACTION/ok");
  t.eq(nluOutcomeFromKakaoResponse(simple(`${savedText}\n잠시 후 다시 확인해 주세요.`), kakaoNluMarkV229148(env)).result, "ok", "2 저장한 답은 표시가 먼저다(글로 짐작하지 않는다)");
  markKakaoNluOutcomeV229148(env, "first_contact", "친구와 함께 말 한마디로 기록하는 말해가계부입니다.\n‘커피 4500원’처럼 첫 기록을 보내면 바로 시작돼요.");
  t.eq(`${kakaoNluMarkV229148(env).intent}/${kakaoNluMarkV229148(env).result}`, "FIRST_CONTACT/clarify", "2 첫 안내의 표시 = FIRST_CONTACT/clarify(아직 기록 전)");
}
{
  const env = { __AB_KAKAO_REQUEST: {} };
  markKakaoNluOutcomeV229148(env, "toString", "아무 글");
  markKakaoNluOutcomeV229148(env, "no_match", "");
  t.eq(kakaoNluMarkV229148(env), null, "2 정해 둔 갈래가 아니거나 첫 줄이 비면 표시하지 않는다");
  // V22.9.148(Codex 검토): 쓰기와 읽기에 같은 env 를 쓴다(예전에는 서로 다른 {} 라 표식 함수가 요청 표식을 새로 만들어도 몰랐다).
  const bare = {};
  markKakaoNluOutcomeV229148(bare, "no_match", "무슨 뜻인지");
  t.ok(kakaoNluMarkV229148(bare) === null && !Object.keys(bare).length, "2 요청 표식이 없는 env 에는 적지 않는다(카카오 요청에서만 — env 에 아무것도 생기지 않는다)");
  markKakaoNluOutcomeV229148(env, "no_amount", "내용과 금액을 한 문장으로 보내면 바로 기록돼요.\n예) 점심 12000원");
  t.eq(json(kakaoNluMarkV229148(env)), json({ intent: "NO_AMOUNT", result: "fallback", reason: "no_amount", kind: "no_amount", signature: "내용과 금액을 한 문장으로 보내면 바로 기록돼요." }), "2 표시 = 이름·결과·까닭·갈래와 답의 첫 줄뿐");
}

// 6-a‴ Codex 3차 검토(관제 분류). 상위 지출·예산 현황 줄은 만드는 꼴 그대로 뺀다(transactions-core.js formatSummary·budgets.js) — ‘원’ 뒤에 무엇이 와도
// 빼던 규칙은 분류 이름이 ‘1. 점심: 5000원’ 인 예산 물음(guided-flows.js ‘${category} 예산을 얼마로 설정할까요?’)까지 빼 되묻기를 ok 로 셌다.
{
  const amounts = ["30만원", "50만원", "100만원", "직접 입력", "취소"];
  const plain = outcome(simple("점심 예산을 얼마로 설정할까요?", amounts));
  const listed = [outcome(simple("1. 점심: 5000원 예산을 얼마로 설정할까요?", amounts)), outcome(simple("• 점심: 5000원 예산을 얼마로 설정할까요?", amounts))];
  t.ok(plain === "clarify/guided_clarification" && listed.every((got) => got === plain), `6-a‴ 분류 이름 ‘1. 점심: 5000원’·‘• 점심: 5000원’ 의 예산 물음 = 이름 ‘점심’ 과 같은 되묻기 (${listed.join(" · ")} — 앞 고침 ok)`);
  t.eq(outcome(simple("1. 점심: 5000원 기록을 저장하지 못했어요.")), "error/save_failed", "6-a‴ ‘…원’ 뒤에 봇 문장이 이어지는 줄은 목록 줄이 아니다");
  t.eq(outcome(simple("💰 2026-11 예산 현황\n\n• 서버 오류 수리: 130,000원 사용 / 30,000원 초과 · 130%")), "ok/handled", "6-a‴ 예산 현황의 초과 줄도 만드는 꼴 그대로 뺀다");
  t.eq(outcome(simple("💰 2026-11 예산 현황\n\n• 잠시 후 다시: 30,000원 사용 / 40,000원 남음 · 42.9%")), "ok/handled", "6-a‴ 예산 현황의 소수 사용률 줄도 뺀다");
}
// 단톡방 답은 공용 변환(response-builders.js kakaoGroupCompatibleResponse)이 ‘…번호로 골라주세요.’ 끝에 번호 예시(‘ 예: @말해가계부 1’)를 붙인 뒤 관제가
// 읽는다 — 알리는 줄은 그 예시를 떼고 본다. 앞 고침은 단톡방에서만 고를 값(구성원 이름 ‘서버팀’·‘오류왕’)을 봇 말로 남겨 오류로 셌다(1:1 은 ok).
{
  const roomPayload = { userRequest: { chat: { id: "room-v229148-r3", type: "botGroupKey", properties: { botGroupKey: "room-v229148-r3" } }, user: { id: "u-v229148-r3", properties: { botUserKey: "u-v229148-r3" } } } };
  const room = async (text) => {
    const raw = await (await kakaoGroupCompatibleResponse(kakaoText(text, [["1", "1"], ["2", "2"], ["취소", "취소"]]), roomPayload, BASE)).text();
    const outputs = JSON.parse(raw).template?.outputs || [];
    return { outcome: outcome(raw), first: outputs.map((o) => o.simpleText?.text || o.textCard?.description || "").join("\n").split("\n")[0] };
  };
  const direct = outcome(simple("지출자를 누구로 바꿀까요? 번호로 골라주세요.\n1. 민지  2. 철수", ["1", "2", "취소"]));
  for (const names of [["민지", "철수"], ["서버팀", "오류왕"]]) {
    const got = await room(`지출자를 누구로 바꿀까요? 번호로 골라주세요.\n1. ${names[0]}  2. ${names[1]}`);
    t.ok(got.first.endsWith(" 예: @말해가계부 1") && got.outcome === direct,
      `6-a‴ 단톡방 지출자 고르기(${names.join("·")}) = 번호 예시가 붙은 뒤에도 1:1 과 같은 ${got.outcome} (첫 줄 ${json(got.first)})`);
  }
}
// 6-b″ 짝이 어긋난 따옴표는 방향별로 늘린다 — 짝 없는 여는 따옴표는 그 뒤 같은 종류의 마지막 닫는 따옴표까지, 짝 없는 닫는(곧은 따옴표는 남는 하나)
// 따옴표는 그 앞 같은 종류의 가장 가까운 여는 따옴표부터. 앞 고침은 짝 없는 여는 따옴표를 뒤의 첫 조각까지만 이어 이름 가운데 ‘서버 오류’ 가 봇 말로 남았다.
for (const [label, named, plain] of [
  ["가계부 이름 ‘모임 ‘분점’ 서버 오류 ‘개발’", "이 방 가계부 ‘모임 ‘분점’ 서버 오류 ‘개발’에 참여했어요.", "이 방 가계부 ‘모임’에 참여했어요."],
  ["가계부 이름 “모임 “분점” 서버 오류 “개발”", "“모임 “분점” 서버 오류 “개발” 가계부를 선택했어요.", "“모임” 가계부를 선택했어요."],
  ["구성원 값 'O'Brien 서버 오류'", "⚠️ 'O'Brien 서버 오류'를 구성원 목록에서 찾지 못했어요.\n번호로 골라주세요.\n1. 민지  2. 철수", "⚠️ 'zzz'를 구성원 목록에서 찾지 못했어요.\n번호로 골라주세요.\n1. 민지  2. 철수"],
  ["구성원 값 \"O\"Brien 서버 오류\"", "⚠️ \"O\"Brien 서버 오류\"를 구성원 목록에서 찾지 못했어요.\n번호로 골라주세요.\n1. 민지  2. 철수", "⚠️ \"zzz\"를 구성원 목록에서 찾지 못했어요.\n번호로 골라주세요.\n1. 민지  2. 철수"],
]) t.ok(outcome(simple(plain)) === "ok/handled" && outcome(simple(named)) === outcome(simple(plain)), `6-b″ ${label}: 짝이 어긋난 따옴표가 든 값도 결과가 같다 (${outcome(simple(named))} — 앞 고침 error)`);
t.eq(outcome(simple("‘커피 ‘라떼’ 서버 ‘택시’ 기록은 처리하지 못했어요.")), "error/safe_error_response", "6-b″ 여는 따옴표가 남아도 마지막 닫는 따옴표 뒤의 봇 문장은 읽는다");
t.eq(outcome(simple("'O'Brien' 기록은 처리하지 못했어요.")), "error/safe_error_response", "6-b″ 곧은 따옴표가 홀수여도 마지막 따옴표 뒤의 봇 문장은 읽는다");
{
  // 판정 낱말(nluOutcomeFromKakaoResponse 의 정규식 그대로)이 든 답 글 템플릿 줄(src/modules/kakao·domain·nlu)마다, 보간식 하나에 짝 없는 따옴표가 든 값
  // 여섯 가지를 넣어도 판정이 같아야 한다 — 사용자 값의 따옴표 하나가 봇의 실패·되묻기 문장을 삼키는 답 글이 생기면 여기서 떨어진다.
  // 예시 줄(‘예: …’)은 관제가 통째로 뺀다(가계부 만들기의 이름 제안에 카카오 별명이 든다) — 그 줄의 고정 글에 판정 낱말이 없어야 하고(있으면 봇의
  // 안내를 놓친다), 보간식은 사람이 확인한 것만 온다(새 보간식이 생기면 그 값이 판정 낱말을 실을 수 있는지 보고 표에 넣는다).
  const judged = [];
  const collect = (node, inside) => {
    if (!node || typeof node.type !== "string") return;
    const here = inside || (node.type === "FunctionDeclaration" && node.id?.name === "nluOutcomeFromKakaoResponse");
    if (here && node.type === "Literal" && node.regex) judged.push(new RegExp(node.regex.pattern, node.regex.flags.replace("g", "")));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => collect(child, here));
      else if (value && typeof value === "object" && typeof value.type === "string") collect(value, here);
    }
  };
  collect(parseAcorn(readFileSync(new URL("../src/modules/runtime/ops-telemetry.js", import.meta.url), "utf8"), { ecmaVersion: "latest", sourceType: "module" }), false);
  const STRAY = ["가‘나", "가’나", "가“나", "가”나", "가'나", "가\"나"];
  // V22.9.148(Codex 4차 검토 — V148:C-41·C-45, 고치며 넓힘): 짝 없는 따옴표뿐 아니라 줄의 꼴을 흉내 내는 값(예시 줄·꼬리표 줄·목록 줄·최근 기록 줄·기록
  // 줄)과 곧은 따옴표가 셋 넘는 값도 넣는다 — 3차 고침 뒤에도 ‘'점심 / 5,000원 / 카드'’ 를 되풀이한 못 알아들음 답(edit-state-machine.js)이 ok 로, 곧은
  // 따옴표 셋인 값(O'서버 오류'Brien's)이 든 되묻기가 오류로 셌다. 보간식이 사용자 글을 실을 수 없는 자리는 그 값만 넣는다: 숫자(numberWithCommas)는 넣지
  // 않고, 갈래를 고르는 조건식은 갈래를 그대로 넣는다(갈래가 템플릿이면 그 안 보간식에 같은 값들을 넣는다). 답을 만든 곳이 결과를 적는 함수(MARKED — 관제가
  // 그 답을 글로 읽지 않는다)와, 부르는 곳이 모두 false 를 넘겨 쓰이지 않는 갈래가 있는 함수(UNUSED_BRANCH)의 줄은 건너뛰고 그 전제를 아래에서 확인한다.
  const LOOKALIKE = ["예: 점심", "가계부: 점심", "지출자: 점심", "1. 점심: 5000원", "• 점심: 5000원", "1. 점심 · 소유자", "• 2026-11-27 지출 5,000원 · 점심", "점심 / 5,000원 / 카드", "가'나'다", "가'나'다'라", "‘가’나‘다", "“가”나“다"];
  const VALUES = [...STRAY, ...LOOKALIKE];
  const MARKED = new Map([["kakaoBudgetAmountQuestionV229148", "flow_question"]]);
  const UNUSED_BRANCH = new Map([["kakaoStartText", 0]]); // 함수 이름 → 늘 false 여야 하는 인자의 자리(hasHousehold)
  // V22.9.148(Codex 4차 검토 — V148:C-44): 예시 줄의 보간식도 확인한 식 전체와 글자 그대로 같아야 한다(/^exampleFor\(/ 는 식의 앞만 보았다).
  const EXAMPLE_VALUES = ["session.entryNo", 'fromType === "income" ? "지출" : "수입"', "payerWord(session)", "exampleFor(session.field, session)", 'exampleFor("type", session)', "suggestion"];
  const choices = ["네", "아니요"];
  const QUOTE_MARKS = /['‘’“”"]/g;
  let judgedLines = 0, judgedAll = 0, fixedSlots = 0;
  const swallowed = [], examples = [], skipped = [], marks = [], unusedCalls = [], dropped = [], quoteSwallowed = [];
  const isNumberSlot = (node) => node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "numberWithCommas";
  const branchValues = (node) => {
    if (node.type === "Literal" && typeof node.value === "string") return [node.value];
    if (node.type === "TemplateLiteral") {
      const quasis = node.quasis.map((q) => q.value.cooked ?? "");
      return node.expressions.length ? VALUES.map((value) => quasis.reduce((out, piece, i) => out + (i ? value : "") + piece, "")) : [quasis.join("")];
    }
    if (node.type === "ConditionalExpression") return [...branchValues(node.consequent), ...branchValues(node.alternate)];
    return VALUES;
  };
  const slotValues = (node) => (isNumberSlot(node) ? [] : node.type === "ConditionalExpression" ? branchValues(node) : VALUES);
  // 실제와 같은 꼴로 채운 줄(숫자 자리는 숫자, 조건식은 첫 갈래) — 아래 (가)·(나) 가 쓴다.
  const representative = (node) => {
    if (isNumberSlot(node)) return "1,234";
    if (node.type === "Literal" && typeof node.value === "string") return node.value;
    if (node.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked ?? "").join("민지");
    if (node.type === "ConditionalExpression") return representative(node.consequent);
    return "민지";
  };
  for (const dirName of ["kakao", "domain", "nlu"]) {
    const dir = new URL(`../src/modules/${dirName}/`, import.meta.url);
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".js"))) {
      const source = readFileSync(new URL(name, dir), "utf8");
      const visit = (node, fn) => {
        if (!node || typeof node.type !== "string") return;
        const inFn = node.type === "FunctionDeclaration" && node.id ? node.id.name : fn;
        if (node.type === "CallExpression" && node.callee.type === "Identifier") {
          if (MARKED.has(inFn) && node.callee.name === "markKakaoNluOutcomeV229148") marks.push(`${inFn}:${node.arguments[1]?.type === "Literal" ? node.arguments[1].value : "?"}`);
          if (UNUSED_BRANCH.has(node.callee.name)) {
            const arg = node.arguments[UNUSED_BRANCH.get(node.callee.name)];
            unusedCalls.push(arg?.type === "Literal" && arg.value === false);
          }
        }
        const pieces = node.type === "TemplateLiteral" ? node.quasis.map((q) => q.value.cooked ?? "") : node.type === "Literal" && typeof node.value === "string" ? [node.value] : null;
        if (pieces) {
          const where = `${dirName}/${name}:${source.slice(0, node.start).split("\n").length}`;
          let slot = 0;
          for (const line of pieces.join("\u0001").split("\n")) {
            const count = line.split("\u0001").length - 1;
            const nodes = (node.expressions || []).slice(slot, slot + count);
            const expressions = nodes.map((e) => source.slice(e.start, e.end).replace(/\s+/g, " "));
            slot += count;
            if (/^(?:(?:📒|✅) )?예: /.test(line)) examples.push({ where, line, expressions });
            // (가)·(나) 보간식이 없는 줄까지 판정 낱말이 든 모든 줄(실제와 같은 꼴로 채운 줄): 그 줄 하나만으로도 판정 낱말을 읽고(고를 값이 있으면 되묻기 —
            // 목록·기록·이름·예시 줄 빼기가 봇의 문장을 통째로 빼지 않는다), 따옴표 글자를 지운 줄과 판정이 같다(따옴표 빼기가 두 따옴표 값 사이의 봇 문장이나
            // 따옴표로 감싼 고정 낱말을 삼키지 않는다 — C-41 의 ‘곧은 따옴표가 셋 넘으면 첫 따옴표부터 마지막 따옴표까지’ 가 기댄 전제).
            const real = line.split("\u0001").reduce((out, piece, i) => out + (i ? representative(nodes[i - 1]) : "") + piece, "");
            if (judged.some((re) => re.test(real))) {
              judgedAll += 1;
              const read = outcome(simple(real, choices));
              if (read === "ok/handled") dropped.push(where);
              if (real.replace(QUOTE_MARKS, "") !== real && read !== outcome(simple(real.replace(QUOTE_MARKS, ""), choices))) quoteSwallowed.push(where);
            }
            if (!count || !judged.some((re) => re.test(line.replaceAll("\u0001", "민지")))) continue;
            if (MARKED.has(inFn) || UNUSED_BRANCH.has(inFn)) { skipped.push(`${where}(${inFn})`); continue; }
            judgedLines += 1;
            const fill = (index, value) => line.split("\u0001").reduce((out, piece, i) => out + (i ? (i - 1 === index ? value : "민지") : "") + piece, "");
            const base = outcome(simple(fill(-1, ""), choices));
            for (let index = 0; index < count; index += 1) {
              const values = slotValues(nodes[index]);
              if (values !== VALUES) fixedSlots += 1;
              for (const value of values) {
                const got = outcome(simple(fill(index, value), choices));
                if (got !== base) swallowed.push(`${where} 값${index + 1}=${value}: ${got} ≠ ${base}`);
              }
            }
          }
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach((child) => visit(child, inFn));
          else if (value && typeof value === "object" && typeof value.type === "string") visit(value, inFn);
        }
      };
      visit(parseAcorn(source, { ecmaVersion: "latest", sourceType: "module" }), "");
    }
  }
  t.ok(judged.length >= 5 && judgedLines >= 5 && !swallowed.length,
    `6-b″ 판정 낱말이 든 답 글 템플릿 줄 ${judgedLines}개 모두 보간식에 짝 없는 따옴표·줄의 꼴을 흉내 낸 값(${VALUES.length}가지 — 숫자·정해 둔 갈래 자리 ${fixedSlots}곳은 그 값만)을 넣어도 판정이 같다 (판정 정규식 ${judged.length}개) (${swallowed.slice(0, 3).join(" / ") || "다른 것 없음"})`);
  const unmarked = [...MARKED].filter(([fn, kind]) => !marks.includes(`${fn}:${kind}`)).map(([fn]) => fn);
  t.ok(skipped.length === 2 && !unmarked.length && unusedCalls.length >= 3 && unusedCalls.every(Boolean),
    `6-b″ 건너뛴 줄 ${skipped.length}개(${skipped.join(", ")}): 결과를 적는 함수는 표시를 남기고(${marks.join(", ") || "없음"}${unmarked.length ? ` — 표시 없음 ${unmarked.join(", ")}` : ""}), kakaoStartText 를 부르는 곳 ${unusedCalls.length}곳 모두 false(${unusedCalls.join(",")})`);
  t.ok(judgedAll >= 100 && !dropped.length && !quoteSwallowed.length,
    `6-i 판정 낱말이 든 답 글 줄 ${judgedAll}개(보간식 없는 줄 포함): 그 줄 하나만으로도 판정 낱말을 읽고(줄 빼기가 봇 문장을 통째로 뺀 줄 ${dropped.join(", ") || "없음"}), 따옴표 글자를 지운 줄과 판정이 같다(${quoteSwallowed.join(", ") || "다른 줄 없음"})`);
  const exampleWords = examples.filter(({ line }) => judged.some((re) => re.test(line.replaceAll("\u0001", " "))));
  const exampleValues = examples.flatMap(({ where, expressions }) => expressions.filter((e) => !EXAMPLE_VALUES.includes(e)).map((e) => `${where} ${e.slice(0, 50)}`));
  const staleExamples = EXAMPLE_VALUES.filter((value) => !examples.some(({ expressions }) => expressions.includes(value)));
  t.ok(examples.length >= 30 && examples.some(({ expressions }) => expressions.includes("suggestion")) && !exampleWords.length && !exampleValues.length && !staleExamples.length,
    `6-a‴ 관제가 빼는 예시 줄 ${examples.length}개: 판정 낱말 없음(${exampleWords.map(({ where }) => where).join(", ") || "있는 줄 없음"}) · 보간식은 확인한 식 그대로만(${exampleValues.join(", ") || "모두 확인함"} · 표에만 남은 식 ${staleExamples.join(", ") || "없음"})`);
  t.eq(outcome(simple("좋아요! 직접 입력 가계부를 만들게요.\n\n가계부 이름을 정해 주세요.\n예: 서버 오류 대응팀 가계부", ["서버 오류 대응팀 가계부", "종류 다시 선택", "취소"])),
    outcome(simple("좋아요! 직접 입력 가계부를 만들게요.\n\n가계부 이름을 정해 주세요.\n예: 민지 가계부", ["민지 가계부", "종류 다시 선택", "취소"])), "6-a‴ 이름 제안 줄의 별명이 ‘서버 오류 대응팀’ 이어도 ‘민지’ 와 같다(앞 고침 error)");
}

// 6-h 오류 글의 값(V148:C-33 — Codex 3차 검토를 고치며 찾음): 운영·스킬·트래픽 사건의 상세와 최근 NLU 사건의 까닭은 오류 글 그대로라(safeError),
// DB(PostgREST) 오류의 details(막힌 행 전체 — 카카오 기록이면 메모·원문)·형식/범위 오류가 옮겨 적은 값·JSON.parse 오류가 옮겨 적은 글이 실패 사례 저장
// 설정과 상관없이 관리자 /ops-snapshot.json 에 남았다. 이 런타임(V8)이 실제로 내는 JSON.parse 문구와 PostgREST 꼴 본문으로, 세 목록 어디에도 값이 없고
// 오류 번호·제약·열·표 이름과 요청 번호·걸린 시간은 남는지 본다.
{
  const secret = "시험 병원 진료비";
  const leakWords = /시험|병원|진료비|따옴표|꼬리|인용|둘째/;
  const v8 = (text) => { try { JSON.parse(text); return "parsed"; } catch (err) { return err.message; } };
  const pg = (status, body) => `Supabase ${status}: ${JSON.stringify(body).slice(0, 500)}`;
  const cases = [
    ["JSON.parse 짧은 글", v8(secret), []],
    ["JSON.parse 긴 글(V8 이 줄여 적는다)", v8(`${secret} `.repeat(30)), []],
    ["JSON.parse 따옴표 든 글", v8(`${secret} "따옴표" 끝`), []],
    ["JSON.parse 객체 꼴", v8(`{"memo":${secret}}`), []],
    ["JSON.parse 줄바꿈 든 글", v8(`${secret}\n둘째 줄`), []],
    ["JSON.parse 문구보다 64자 넘게 앞의 따옴표 진단", `kind="state_read"; ${"x".repeat(80)}; ${v8(secret)}`, ['kind="state_read"', "x".repeat(80)]],
    ["23502 not null(막힌 행)", pg(400, { code: "23502", details: `Failing row contains (t-1, house, 2026-11-27, expense, 12000, 식비, ${secret}, null, kakao, ${secret} 12000원).`, hint: null, message: 'null value in column "category" of relation "transactions" violates not-null constraint' }), ['"code":"23502"', 'column \\"category\\"', 'relation \\"transactions\\"']],
    ["23514 check(막힌 행·따옴표 든 값)", pg(400, { code: "23514", details: `Failing row contains (${secret}, "인용 ${secret}").`, hint: null, message: 'new row for relation "transactions" violates check constraint "transactions_amount_check"' }), ['"code":"23514"', "transactions_amount_check"]],
    ["23505 unique(키 값)", pg(409, { code: "23505", details: `Key (household_id, memo)=(house, ${secret}) already exists.`, hint: null, message: 'duplicate key value violates unique constraint "transactions_memo_key"' }), ["Supabase 409", '"code":"23505"', "transactions_memo_key"]],
    ["22P02 형식(받은 값)", pg(400, { code: "22P02", details: null, hint: null, message: `invalid input syntax for type uuid: "${secret}"` }), ['"code":"22P02"', "for type uuid"]],
    ["22P02 따옴표 든 받은 값", pg(400, { code: "22P02", details: null, hint: null, message: `invalid input syntax for type uuid: "${secret}" "꼬리"` }), ["for type uuid"]],
    ["22P02 enum", pg(400, { code: "22P02", details: null, hint: null, message: `invalid input value for enum tx_type: "${secret}"` }), ["enum tx_type"]],
    ["22003 범위(받은 값)", pg(400, { code: "22003", details: null, hint: null, message: `value "${secret}" is out of range for type integer` }), ['"code":"22003"', "is out of range for type integer"]],
    ["22P02 줄 바꿈 문자(U+2028)가 든 받은 값", pg(400, { code: "22P02", details: null, hint: null, message: `invalid input syntax for type uuid: "${secret.replace(" ", " ")}"` }), ['"code":"22P02"', "for type uuid"]],
    ["끊긴 details(500자에서 잘림)", `Supabase 400: {"code":"23502","details":"Failing row contains (${secret}`, ['"code":"23502"']],
    ["끊긴 받은 값(닫는 따옴표가 잘림)", `Supabase 400: {"code":"22P02","details":null,"hint":null,"message":"invalid input syntax for type uuid: \\"${secret}`, ['"code":"22P02"', "for type uuid"]],
    ["끊긴 details(이스케이프 사이에서 잘림)", `Supabase 400: {"code":"23514","details":"Failing row contains (\\"${secret}\\`, ['"code":"23514"']],
    ["끊긴 범위 값", `Supabase 400: {"code":"22003","details":null,"hint":null,"message":"value \\"${secret}`, ['"code":"22003"']],
    ["감싼 오류의 끊긴 받은 값", `kakao_unsent: Supabase 400: {"code":"22P02","details":null,"hint":null,"message":"invalid input value for enum tx_type: \\"${secret} 꼬리`, ["kakao_unsent", "enum tx_type"]],
    ["감싼 오류(kakao_unsent: …)", `kakao_unsent: ${pg(400, { code: "23514", details: `Failing row contains (${secret}).`, hint: null, message: 'new row for relation "transactions" violates check constraint "transactions_amount_check"' })}`, ["kakao_unsent", "transactions_amount_check"]],
  ];
  t.ok(cases.filter(([label]) => label.startsWith("JSON.parse")).every(([, message]) => message.includes(secret.slice(0, 2))), "6-h 이 런타임의 JSON.parse 문구는 읽던 글을 옮겨 적는다(대조의 전제)");
  const leaked = [];
  for (const [label, message, keep] of cases) {
    globalThis.__AB_OPS_EVENTS.length = 0;
    globalThis.__AB_SKILL_EVENTS.length = 0;
    globalThis.__AB_NLU_RUNTIME_EVENTS.length = 0;
    const opsDetail = rememberOpsEvent({ kind: "kakao_save_failed", severity: "error", path: "/skill", method: "POST", detail: message })?.detail || "";
    rememberSkillEvent({ kind: "error", user_key: "u", utterance: secret, detail: `request_id=r1; intent=TRANSACTION; ${message}; latency_ms=5` }, {});
    const skillDetail = getSkillOpsSnapshot().recent[0]?.detail || "";
    rememberNluRuntimeEvent({ at: new Date().toISOString(), request_id: "r1", intent: "TRANSACTION", result: "error", reason: message, latency_ms: 5, utterance: secret }, {});
    const nluReason = getNluOpsSnapshot({}).recent[0]?.reason || "";
    const kept = keep.every((part) => opsDetail.includes(part)) && skillDetail.startsWith("request_id=r1; intent=TRANSACTION; ") && (label.includes("끊긴") || skillDetail.endsWith("; latency_ms=5"));
    if ([opsDetail, skillDetail, nluReason].some((text) => leakWords.test(text)) || !kept) leaked.push([label, opsDetail, skillDetail, nluReason]);
  }
  const jsonCount = cases.filter(([label]) => label.startsWith("JSON.parse")).length;
  t.deepEq(leaked, [], `6-h 오류 글 ${cases.length}꼴(JSON.parse ${jsonCount}·DB 오류 ${cases.length - jsonCount} — 500자에서 잘린 글 포함): 운영 사건 상세·스킬 사건 상세·NLU 사건 까닭에 값이 없고 오류 번호·제약·열·표 이름과 요청 번호·걸린 시간은 남는다`);
  // 따옴표·받은 값·영문자 꼴로만 된 4만 자 상세도 하나하나 Workers 요청 하나의 CPU 한도(10ms) 안에 끝난다(값 지우기와 이메일 찾기는 시작할 수 있는 자리마다 뒤를 훑는다 — 길이를 먼저
  // 1,000자로 자르고 되짚기를 묶었다. 묶기 전에는 따옴표 4만 자에 700ms 넘게 걸렸다). 입력마다 다섯 번씩 세 묶음을 재어 가장 빠른 묶음을 본다(기계가 잠깐
  // 느려지는 것을 거른다). 처음 한 번은 데우기로 버린다.
  {
    const heavy = ['"'.repeat(40000), ': \\"'.repeat(10000), `${': \\"가'.repeat(8000)} is out of range`, '"가'.repeat(20000), `"details":"${'가\\"'.repeat(13000)}`, '"가" is not valid JSON '.repeat(1800), "a".repeat(40000)];
    for (const detail of heavy) rememberOpsEvent({ kind: "x", detail });
    const timings = heavy.map((detail) => {
      let best = Infinity;
      for (let round = 0; round < 3; round += 1) {
        const started = performance.now();
        for (let i = 0; i < 5; i += 1) rememberOpsEvent({ kind: "x", detail });
        best = Math.min(best, (performance.now() - started) / 5);
      }
      return best;
    });
    const slowest = Math.max(...timings);
    t.ok(slowest < 10, `6-h 따옴표·받은 값·영문자 꼴로만 된 4만 자 상세 ${heavy.length}개가 하나하나 한 번에 10ms 안 (가장 느린 것 ${slowest.toFixed(3)}ms — 이 기계에서)`);
    globalThis.__AB_OPS_EVENTS.length = 0;
  }
  // 값이 없는 오류 글과 정해 둔 까닭 이름은 그대로다.
  const plain = [
    "request_id=r1; intent=TRANSACTION; supabase_read_timeout; latency_ms=5",
    'Supabase 503: {"code":"PGRST002","details":null,"hint":null,"message":"Could not query the database for the schema cache. Retrying."}',
    "Unexpected end of JSON input",
    "Unterminated string in JSON at position 18 (line 1 column 19)",
    "invalid_kakao_flow_state:budget:amount",
  ];
  t.deepEq(plain.map((detail) => rememberOpsEvent({ kind: "x", detail })?.detail), plain, "6-h 값이 없는 오류 글은 운영 사건 상세에 그대로 남는다");
  globalThis.__AB_NLU_RUNTIME_EVENTS.length = 0;
  for (const reason of ["no_match", "safe_error_response", "edit_unrecognized:attempt_1"]) rememberNluRuntimeEvent({ at: new Date().toISOString(), intent: "UNKNOWN", result: "fallback", reason, utterance: "" }, {});
  t.deepEq(getNluOpsSnapshot({}).recent.map((e) => e.reason).reverse(), ["no_match", "safe_error_response", "edit_unrecognized:attempt_1"], "6-h 정해 둔 NLU 까닭 이름은 그대로다");
  globalThis.__AB_OPS_EVENTS.length = 0;
  globalThis.__AB_SKILL_EVENTS.length = 0;
  globalThis.__AB_NLU_RUNTIME_EVENTS.length = 0;
}

// 6-i Codex 4차 검토(3차 고침 50353a41 만 다시 본 리포트 10건 + 고치며 더 찾은 것) — 단위. 운영 사건 상세(rememberOpsEvent)·스킬 사건 상세
// (rememberSkillEvent)·NLU 사건 까닭(rememberNluRuntimeEvent)에 남는 오류 글, 중복 사건(rememberDuplicateEvent)의 상세, 관제 분류(nluOutcomeFromKakaoResponse).
{
  const secret = "검토값";
  const leakWords = /검토값|병원|진료비|SECRET|hunter2/;
  const opsOf = (detail) => { globalThis.__AB_OPS_EVENTS.length = 0; return rememberOpsEvent({ kind: "kakao_save_failed", severity: "error", path: "/skill", method: "POST", detail })?.detail || ""; };
  const skillOf = (detail) => { globalThis.__AB_SKILL_EVENTS.length = 0; rememberSkillEvent({ kind: "error", user_key: "u", utterance: "", detail }, {}); return getSkillOpsSnapshot().recent[0]?.detail || ""; };
  const nluOf = (reason) => { globalThis.__AB_NLU_RUNTIME_EVENTS.length = 0; rememberNluRuntimeEvent({ at: new Date().toISOString(), request_id: "r1", intent: "TRANSACTION", result: "error", reason, latency_ms: 5, utterance: "" }, {}); return getNluOpsSnapshot({}).recent[0]?.reason || ""; };
  const v8 = (text) => { try { JSON.parse(text); } catch (err) { return err.message; } return ""; };
  const pgText = (status, body) => `Supabase ${status}: ${JSON.stringify(body)}`;
  const checkBody = { code: "23514", details: `Failing row contains (${secret}).`, hint: null, message: 'new row for relation "transactions" violates check constraint "transactions_amount_check"' };
  const checkKept = pgText(400, { ...checkBody, details: "[값 생략]" });
  const dupBody = { code: "23505", details: `Key (id)=(${secret}) already exists.`, hint: null, message: 'duplicate key value violates unique constraint "transactions_pkey"' };
  const cases = [
    // C-35: 안쪽 따옴표가 든 받은 값의 바깥 닫는 따옴표가 잘린 글(DB 오류 글은 500자에서 잘려 온다 — data/supabase-client.js).
    ["C-35 끊긴 받은 값(안쪽 따옴표 — DB 본문)", pgText(400, { code: "22P02", details: null, hint: null, message: `invalid input syntax for type uuid: "${secret} "A" 꼬리"` }).slice(0, -4),
      pgText(400, { code: "22P02", details: null, hint: null, message: "invalid input syntax for type uuid: [값 생략]", truncated: true })],
    ["C-35 끊긴 받은 값(안쪽 따옴표 — 머리 없는 글)", `invalid input syntax for type uuid: \\"${secret} \\"A\\" 꼬리`, "invalid input syntax for type uuid: [값 생략]"],
    // C-36: DB 오류 본문은 구조로 읽는다 — 띄어 쓴 JSON·여러 줄 JSON·PGRST100(필터 값을 옮긴 message)·처음 보는 열쇠·정해 두지 않은 message·JSON 이 아닌 본문.
    ["C-36 콜론 뒤 공백", `Supabase 400: ${JSON.stringify(checkBody).replaceAll('":', '": ').replaceAll(',"', ', "')}`, checkKept],
    ["C-36 여러 줄 JSON", `Supabase 400: ${JSON.stringify(dupBody, null, 2)}`, pgText(400, { ...dupBody, details: "[값 생략]" })],
    ["C-36 PGRST100", pgText(400, { code: "PGRST100", details: 'unexpected "시" expecting "not" or operator (eq, gt, ...)', hint: null, message: `"failed to parse filter (eq.${secret} 병원)" (line 1, column 4)` }),
      pgText(400, { code: "PGRST100", details: "[값 생략]", hint: null, message: "failed to parse filter [값 생략]" })],
    ["C-36 처음 보는 열쇠·정해 두지 않은 message", pgText(400, { code: "XX000", error: secret, message: `internal error ${secret}` }), pgText(400, { code: "XX000", error: "[값 생략]", message: "[메시지 생략]" })],
    ["C-36 정해 둔 raise 낱말은 남긴다", pgText(400, { code: "P0001", details: null, hint: null, message: "household_not_found" }), pgText(400, { code: "P0001", details: null, hint: null, message: "household_not_found" })],
    ["C-36 JSON 이 아닌 본문", `Supabase 502: <html>${secret}</html>`, "Supabase 502: [본문 생략]"],
    // 열쇠는 본문(바깥 글)에서 온다 — ‘constructor’·‘__proto__’ 도 보통 칸으로 읽고 값은 뺀다(프로토타입 없는 객체에 담는다 — 아래에서 Object.prototype 이 그대로인지 본다).
    ["C-36 열쇠 constructor·__proto__", `Supabase 400: {"constructor":"${secret}","__proto__":null,"code":"23514"}`, 'Supabase 400: {"constructor":"[값 생략]","__proto__":null,"code":"23514"}'],
    ["C-36 열쇠 __proto__ 의 값이 객체", 'Supabase 400: {"__proto__":{"polluted":"검토값"},"code":"23514"}', 'Supabase 400: {"__proto__":"[값 생략]","truncated":true}'],
    // C-43: JSON.parse 가 옮긴 글은 V8 머리(‘Unexpected token '…', ’)와 함께 찾는다 — 바로 앞의 다른 따옴표 진단(kind="…")은 남는다.
    ["C-43 앞의 따옴표 진단", `kind="state_read"; ${v8(`${secret} 병원 진료비`)}`, 'kind="state_read"; [JSON 이 아닌 글] is not valid JSON'],
    // C-47(고치며 찾음): 비밀 낱말은 낱말을 남기고 값을 가린다(‘$1’ 이 글자 그대로 남았다), 방식 낱말(Bearer·KakaoAK) 뒤의 값도 가린다.
    ["C-47 비밀 낱말", "kakao_api_failed: authorization: Bearer abcdefSECRET123; password=hunter2xyz; apikey: KakaoAK zzzSECRET999", "kakao_api_failed: authorization=[보호됨]; password=[보호됨]; apikey=[보호됨]"],
  ];
  for (const [label, message, expected] of cases) {
    const got = [opsOf(message), skillOf(message), nluOf(message)];
    t.ok(got[0] === expected && got[1] === expected && got[2] === expected.slice(0, 100) && !got.some((text) => leakWords.test(text)) && !got[0].includes("$1"),
      `6-i ${label}: 운영·스킬 사건 상세 = ${json(expected).slice(0, 110)} · NLU 까닭 = 그 앞 100자 (운영 ${json(got[0]).slice(0, 110)})`);
  }
  t.ok(Object.getPrototypeOf({}) === Object.prototype && ({}).polluted === undefined && !Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"),
    "6-i C-36 열쇠가 __proto__ 인 DB 오류 본문을 읽은 뒤에도 Object.prototype 은 그대로다");
  // C-42: 맨 앞의 서버 요청 번호(UUID)는 남긴다 — 마지막 열두 자가 모두 숫자인 번호도(‘긴 숫자’ 규칙에 넘기지 않는다). 머리가 28자 길어진 만큼 스킬 사건
  // 길이 몫을 늘려 흔한 DB 거절 오류에도 latency_ms 가 남는다. 맨 앞이 아닌 UUID(오류 글 속 식별자·가운데의 ‘request_id=’)는 가린다.
  const ids = ["2254cfc2-b008-4ab4-9e82-4ce70c01cc04", "2254cfc2-b008-4ab4-9e82-123456789012"];
  t.deepEq(ids.map((id) => skillOf(`request_id=${id}; intent=TRANSACTION; ${pgText(400, checkBody)}; latency_ms=1234`)), ids.map((id) => `request_id=${id}; intent=TRANSACTION; ${checkKept}; latency_ms=1234`),
    "6-i C-42 맨 앞 요청 번호(마지막 열두 자가 모두 숫자인 번호 포함)는 그대로, 흔한 DB 거절 오류의 스킬 사건에도 latency_ms 가 남는다");
  t.deepEq([opsOf(`request_id=${ids[0]}; household 9f0e2c1a-1b2c-4d3e-8f90-123456789abc failed`), opsOf(`intent=TRANSACTION; request_id=${ids[0]}; failed`)],
    [`request_id=${ids[0]}; household [사용자식별자] failed`, "intent=TRANSACTION; request_id=[사용자식별자]; failed"], "6-i C-42 맨 앞이 아닌 UUID(오류 글 속 식별자, 가운데의 request_id=)는 가린다");
  // C-38: 중복으로 건너뛴 기록(웹 domain/transactions-core.js·카카오 kakao/transaction-save.js)의 상세는 같은 글인지 알아볼 지문만 남는다(실패 사례 저장과 상관없이).
  {
    globalThis.__AB_DUPLICATE_EVENTS.length = 0;
    globalThis.__AB_OPS_EVENTS.length = 0;
    for (const [kind, source, detail] of [["duplicate_skipped", "web", `${secret} 병원 진료비`], ["duplicate_skipped", "kakao_skill", `${secret} 병원 진료비`], ["kakao_repeat", "kakao_skill", `${secret} 병원 진료비`], ["bulk_limited", "kakao_skill", "5 requested, 3 processed"], ["duplicate_skipped", "web", ""]]) {
      rememberDuplicateEvent({ kind, source, household_id: "house-home", user_id: "user-bin", amount: 12000, transaction_date: "2026-11-27", detail, path: "/x", method: "POST" });
    }
    const stored = globalThis.__AB_DUPLICATE_EVENTS.map((e) => e.detail);
    const ops = globalThis.__AB_OPS_EVENTS.map((e) => e.detail);
    t.ok(/^text_hash=nlu_[0-9a-f]{8}$/.test(stored[0]) && stored[1] === stored[0] && /^utterance_hash=nlu_[0-9a-f]{8}$/.test(stored[2]) && stored[3] === "5 requested, 3 processed" && stored[4] === "" && ops.length === 5 && !leakWords.test(json([stored, ops])),
      `6-i C-38 중복으로 건너뛴 기록(웹·카카오)의 상세는 지문만 — 중복 사건 ${json(stored)} · 운영 사건 ${json(ops)}`);
    globalThis.__AB_DUPLICATE_EVENTS.length = 0;
    globalThis.__AB_OPS_EVENTS.length = 0;
  }
  // C-41: 곧은 따옴표가 셋 넘으면 첫 따옴표부터 마지막 따옴표까지를 값으로 본다(홀수·짝수 모두) — 앞 고침은 홀수일 때 마지막 앞의 따옴표부터만 뺐다.
  const missing = (value) => outcome(simple(`⚠️ '${value}'를 구성원 목록에서 찾지 못했어요.\n번호로 골라주세요.\n1. 민지  2. 철수`));
  t.deepEq(["O'서버 오류'Brien's", "O'서버 오류'Brien", "가'나'서버 오류'라"].map(missing), Array(3).fill(missing("zzz")), "6-i C-41 곧은 따옴표가 든 값(셋·둘·셋)의 되묻기 = 값 zzz 와 같다(앞 고침은 앞 둘에 error)");
  t.eq(outcome(simple("'가'나'다' 기록은 처리하지 못했어요.")), "error/safe_error_response", "6-i C-41 곧은 따옴표 넷 뒤의 봇 문장은 읽는다");
  // C-45(고치며 찾음): 따옴표를 먼저 빼고 줄의 꼴을 본다 — 따옴표로 되풀이한 값이 기록 줄·최근 기록 줄·목록 줄·이름 줄·예시 줄을 흉내 내도 봇 문장이 남는다.
  const unread = (value) => outcome(simple(`⚠️ '${value}' 입력을 이해하지 못했어요.`));
  t.deepEq(["점심 / 5,000원 / 카드", "• 2026-11-27 지출 5,000원 · 점심", "1. 점심: 5000원", "가계부: 점심", "예: 점심"].map(unread), Array(5).fill(unread("민지")),
    `6-i C-45 따옴표로 되풀이한 값이 줄의 꼴을 흉내 내도 못 알아들음 답 = 값 ‘민지’ 와 같은 ${unread("민지")}(앞 고침은 기록 줄 꼴에 ok)`);
  // C-39: 기간 요약의 카테고리·지출자 줄(‘• 이름: N원’)과 정산의 보낼 돈 줄(‘• 보내는 사람 → 받는 사람: N원’)·사람별 줄(‘• 이름: 낸 돈 … → …’)은 만드는
  // 꼴 그대로 뺀다(transactions-core.js formatSummary·simple-commands.js kakaoSettlementPersonLineV229134) — 그 줄의 이름은 사용자가 정한 글이다.
  for (const [label, line] of [
    ["요약 지출자 줄", "• 서버 오류 대응팀: 30,000원"], ["요약 카테고리 줄(음수)", "• 서버 오류 수리: -3,000원"], ["정산 보낼 돈 줄", "• 서버 오류 대응팀 → 잠시 후 다시 모임: 12,750원"],
    ["정산 사람별 줄(받아요)", "• 서버 오류 대응팀: 낸 돈 30,000원 → 12,750원 받아요"], ["정산 사람별 줄(보내요)", "• 잠시 후 다시 모임: 낸 돈 0원 → 12,750원 보내요"],
    ["정산 사람별 줄(없어요)", "• 서버 오류 대응팀: 낸 돈 1,000원 → 주고받을 돈 없어요"], ["정산 사람별 줄(환불이 많아요)", "• 서버 오류 대응팀: 낸 돈보다 환불이 2,000원 많아요 → 5,000원 받아요"],
  ]) t.eq(outcome(simple(`📊 이번 주 요약\n가계부: 우리집\n지출: 30,000원 · 1건\n\n${line}`)), "ok/handled", `6-i C-39 ${label} 의 이름은 뺀다 (${line} — 앞 고침 error)`);
  t.eq(outcome(simple("• 서버 오류 대응팀: 저장하지 못했어요 30,000원")), outcome(simple("저장하지 못했어요 30,000원")), "6-i C-39 ‘• 이름: ’ 뒤가 금액 하나가 아니면 목록 줄이 아니다(봇 문장을 읽는다)");
  globalThis.__AB_OPS_EVENTS.length = 0;
  globalThis.__AB_SKILL_EVENTS.length = 0;
  globalThis.__AB_NLU_RUNTIME_EVENTS.length = 0;
}

// ── 1·3. 카카오 답(픽스처, 운영과 같은 코드) ──
const SKILL_SECRET = "synthetic-v229148-skill-secret";
async function kakao(fx, utterance, { user = "kakao_login:2265", room = "", nickname = "" } = {}) {
  for (const name of ["__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
  globalThis.__AB_QA_FIXED_NOW_MS += 31 * 1000;
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user, ...(nickname ? { nickname } : {}) } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  const rpcBefore = fx.db.__rpc_calls.length;
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    // 운영처럼 인증된 스킬 요청으로 보낸다(인증 없는 요청은 새 사람을 만들지 않는다 — skill_identity_untrusted).
    headers: { "content-type": "application/json", "x-kakao-skill-secret": SKILL_SECRET },
    body: json({ intent: { id: "i1", name: "폴백 블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, { waitUntil(job) { jobs.push(job); } });
  const body = await response.json();
  for (let round = 0; round < 8 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  const requestId = response.headers.get("x-accountbook-request-id");
  const event = (globalThis.__AB_NLU_RUNTIME_EVENTS || []).filter((item) => item && item.request_id === requestId).at(-1) || {};
  const outputs = body?.template?.outputs || [];
  const cardOf = (o) => o.textCard || o.basicCard || null;
  const text = outputs.map((o) => o.simpleText?.text || [cardOf(o)?.title, cardOf(o)?.description].filter(Boolean).join("\n") || "").join("\n");
  const buttons = outputs.flatMap((o) => cardOf(o)?.buttons || []);
  return {
    seen: `${response.headers.get("x-accountbook-intent")}/${response.headers.get("x-accountbook-nlu-result")}/${event.reason || "-"}`,
    stored: fx.db.__rpc_calls.slice(rpcBefore).filter((call) => call.name === "record_nlu_metric").map((call) => `${call.data.p_intent}/${call.data.p_result}`).join(","),
    text, first: text.split("\n")[0], buttons, labels: buttons.map((b) => b.label), quick: (body?.template?.quickReplies || []).map((q) => q.label),
    // Worker 메모리의 최근 사건(관리자 /nlu-ops 의 ‘최근 문제’)에 남은 문장 — 실패 사례 저장이 꺼져 있으면 비어야 한다(Codex 검토).
    sample: typeof event.sample === "string" ? event.sample : null, eventResult: event.result || "",
    requestId, quickMessages: (body?.template?.quickReplies || []).map((q) => q.messageText || ""),
  };
}

await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  // 1:1 — 가계부가 있는 사람.
  const expectDirect = [
    ["안녕", "GREETING/ok/handled", "안녕하세요 😊 무엇을 도와드릴까요?"],
    ["고마워", "GREETING/ok/handled", "저도 고마워요 😊 오늘 쓴 돈이 있으면 바로 적어 주세요."],
    ["이거 어떻게 써?", "NO_MATCH/fallback/no_match", "무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요."],
    ["커피 사먹음", "NO_AMOUNT/fallback/no_amount", "내용과 금액을 한 문장으로 보내면 바로 기록돼요."],
    ["지출로 기록", "BUTTON_LABEL/fallback/button_label", "이 단추만으로는 어떤 기록인지 알 수 없어요."],
    ["가계부 보여줘", "NO_MATCH/clarify/guided_clarification", "가계부를 새로 만들거나, 초대코드로 참여하거나, 다른 가계부로 전환할 수 있어요."],
  ];
  for (const [utterance, seen, first] of expectDirect) {
    const r = await kakao(fx, utterance);
    t.eq(r.seen, seen, `1 1:1 ‘${utterance}’ 관제 이름/결과/까닭`);
    t.eq(r.stored, seen.split("/").slice(0, 2).join("/"), `1 1:1 ‘${utterance}’ 저장하는 관제 줄(record_nlu_metric)도 같은 이름`);
    t.eq(r.first, first, `1 1:1 ‘${utterance}’ 답 첫 줄은 예전과 같다`);
    t.eq(r.sample, "", `6 1:1 ‘${utterance}’ 메모리의 최근 사건에 문장이 없다(실패 사례 저장 꺼짐 — 결과 ${r.eventResult})`);
  }
  {
    // Codex 검토의 사례: 금액 없는 말은 기록되지 않는데, 예전에는 가린 문장이 메모리에 남아 관리자 화면에 보였다.
    const r = await kakao(fx, "민지 병원 다녀옴");
    t.ok(r.seen === "NO_AMOUNT/fallback/no_amount" && r.eventResult === "fallback" && r.sample === "", `6 1:1 ‘민지 병원 다녀옴’ = 금액 없음이고 메모리에 문장이 없다 (${r.seen} · ${JSON.stringify(r.sample)})`);
  }
  {
    // Codex 2차 검토: 처리 중 오류·짧은 말 되묻기의 스킬 사건(관리자 /ops-snapshot.json 의 skill.recent·스킬 운영 화면)에도 문장이 남지 않는다 —
    // 앞 고침은 NLU 사건(nlu.recent)만 막았다. 두 목록을 관리자 스냅샷 그대로 읽는다(목록을 비우고 시작).
    globalThis.__AB_SKILL_EVENTS.length = 0;
    globalThis.__AB_NLU_RUNTIME_EVENTS.length = 0;
    Object.assign(fx.env, { ADMIN_PASSWORD: "qa-v229148-admin", ADMIN_SESSION_SECRET: "qa-v229148-admin-session", ADMIN_API_TOKEN: "qa-v229148-admin-token" });
    const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD, return_to: "/admin-view" }, { cookie: "" });
    const admin = (login.setCookie.match(/ab_admin=[^;,]+/) || [""])[0];
    const snapshot = async () => {
      const res = await app.fetch(new Request(`${BASE}/ops-snapshot.json`, { headers: { cookie: admin, accept: "application/json" } }), fx.env, { waitUntil() {} });
      const body = await res.json();
      return { status: res.status, skill: body.snapshot?.skill?.recent || [], nlu: body.snapshot?.nlu?.recent || [] };
    };
    for (const utterance of ["이름변경", "민지 병원 다녀옴", "이거 어떻게 써?"]) await kakao(fx, utterance);
    const off = await snapshot();
    const clarifyOff = off.skill.filter((e) => e.kind === "clarify");
    t.ok(off.status === 200 && clarifyOff.length === 1 && off.nlu.filter((e) => e.result !== "ok").length === 3 && off.skill.every((e) => e.utterance === "") && off.nlu.every((e) => e.sample === ""),
      `6 실패 사례 저장이 꺼져 있으면 관리자 /ops-snapshot.json 의 스킬 사건 ${off.skill.length}건(되묻기 ${clarifyOff.length})·NLU 사건 ${off.nlu.length}건 모두 문장이 없다 (${JSON.stringify(off.skill.map((e) => [e.kind, e.utterance]))})`);
    // Codex 3차 검토: 인증된 스킬 요청의 본문이 JSON 이 아니면(bad_json) 해석 오류 문구에 본문 일부가 그대로 든다(V8 — Unexpected token '시', "…" is not
    // valid JSON). 스킬 사건의 detail 에는 고정 이름과 글자 수·위치(숫자)만 남는다(앞 고침은 그 문구를 그대로 남겼다 — 실패 사례 저장을 꺼도).
    globalThis.__AB_SKILL_EVENTS.length = 0;
    // V148:C-37(Codex 4차 검토): 위치는 V8 문구 끝의 위치(‘ at position N (line L column C)’)만 읽는다 — 본문 ‘position 1234567’ 의 숫자는 위치가 아니다(앞
    // 고침은 문구의 어디서든 찾아 그 숫자를 남겼다).
    const badBodies = ["시험 병원 진료비", '{"userRequest":{"utterance":"시험 병원 진료비"},}', "position 1234567"];
    const badStatus = [];
    for (const body of badBodies) badStatus.push((await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SKILL_SECRET }, body }), fx.env, { waitUntil() {} })).status);
    const badEvents = (await snapshot()).skill.filter((e) => e.kind === "bad_json").map((e) => [e.utterance, e.detail]);
    t.ok(badStatus.every((status) => status === 200) && badEvents.length === 3 && badEvents.every(([utterance, detail]) => utterance === "" && /^invalid_json; chars=\d+(?:; position=\d+)?$/.test(detail))
      && badEvents.some(([, detail]) => detail === `invalid_json; chars=${badBodies[0].length}`) && badEvents.some(([, detail]) => /; position=\d+$/.test(detail)) && !json(badEvents).includes("병원") && badEvents.some(([, detail]) => detail === "invalid_json; chars=16") && !json(badEvents).includes("1234567"),
      `6 잘못된 JSON 본문의 스킬 사건(관리자 /ops-snapshot.json) = 문장 없이 ${json(badEvents)} (응답 ${badStatus.join("·")})`);
    // V148:C-33(Codex 3차 검토를 고치며 찾음): DB 가 카카오 기록 저장을 거절하면(검사 제약 — PostgREST 가 막힌 행 전체를 details 에 담는다) 그 오류 글이
    // 운영 사건(kakao_save_failed)의 상세로 남아, 관리자 /ops-snapshot.json 에 기록의 원문·메모가 보였다(실패 사례 저장을 꺼도). 세 목록 어디에도 원문이 없고
    // 오류 번호·제약 이름은 남는지 본다(설정 꺼짐·켜짐 모두 — 켜면 사용자 문장은 예전처럼 가린 표본 칸에만 남는다).
    for (const samples of ["0", "1"]) {
      fx.env.NLU_PERSIST_FAILURE_SAMPLES = samples;
      globalThis.__AB_OPS_EVENTS.length = 0;
      globalThis.__AB_SKILL_EVENTS.length = 0;
      globalThis.__AB_NLU_RUNTIME_EVENTS.length = 0;
      const memo = "시험 병원 진료비";
      let rejected = 0;
      const stop = intercept(({ url, method }) => {
        if (url.hostname !== "mock.supabase.co" || url.pathname !== "/rest/v1/transactions" || method !== "POST") return undefined;
        rejected += 1;
        return new Response(JSON.stringify({ code: "23514", details: `Failing row contains (t-v229148-c33, house-home, user-bin, 2026-07-15, expense, 12000, 의료, ${memo}, null, kakao, ${memo} 12000원).`, hint: null, message: 'new row for relation "transactions" violates check constraint "transactions_amount_check"' }), { status: 400, headers: { "content-type": "application/json" } });
      });
      let reply;
      try { reply = await kakao(fx, `${memo} 12000원`); } finally { stop(); }
      const res = await app.fetch(new Request(`${BASE}/ops-snapshot.json`, { headers: { cookie: admin, accept: "application/json" } }), fx.env, { waitUntil() {} });
      const snap = (await res.json()).snapshot || {};
      const saveFailed = (snap.events?.recent || []).filter((e) => e.kind === "kakao_save_failed").map((e) => e.detail);
      const shown = json([(snap.events?.recent || []).map((e) => e.detail), (snap.skill?.recent || []).map((e) => e.detail), (snap.nlu?.recent || []).map((e) => e.reason)]);
      t.ok(res.status === 200 && rejected >= 1 && saveFailed.length >= 1 && saveFailed.every((detail) => detail.includes('"code":"23514"') && detail.includes("transactions_amount_check") && detail.includes('"details":"[값 생략]"')) && !/병원|진료비/.test(shown),
        `6 V148:C-33 DB 가 거절한 카카오 기록의 오류 글(막힌 행 = 원문·메모)은 관리자 /ops-snapshot.json 에 남지 않는다 — 실패 사례 저장 ${samples === "1" ? "켜짐" : "꺼짐"} (저장 실패 ${json(saveFailed)} · 답 ${json(reply?.first)})`);
    }
    fx.env.NLU_PERSIST_FAILURE_SAMPLES = "0";
    fx.env.NLU_PERSIST_FAILURE_SAMPLES = "1";
    await kakao(fx, "이름변경");
    const on = await snapshot();
    fx.env.NLU_PERSIST_FAILURE_SAMPLES = "0";
    t.ok(on.skill.find((e) => e.kind === "clarify")?.utterance === "이름변경" && on.nlu[0]?.result === "clarify" && on.nlu[0]?.sample === "이름변경",
      `6 설정을 켜면 예전처럼 가린 문장을 남긴다(스킬 ${JSON.stringify(on.skill.find((e) => e.kind === "clarify")?.utterance)} · NLU ${JSON.stringify(on.nlu[0]?.sample)})`);
  }
  for (const utterance of ["이거 어떻게 써?", "커피 사먹음"]) {
    const r = await kakao(fx, utterance);
    t.eq(json(r.quick), json(["기록방법", "도움말 보기"]), `3 1:1 ‘${utterance}’ 바로답 = 기록방법·도움말 보기(예전 오늘기록 없음)`);
    t.ok(r.buttons.some((b) => b.label === "입력 예시 보기" && b.action === "webLink" && /\/kakao-guide$/.test(b.webLinkUrl || "")), `3 1:1 ‘${utterance}’ 입력 예시 보기 링크 단추는 그대로`);
  }
  // 낱말 없는 말(판별 EMPTY)도 못 알아들음 답이면 NO_MATCH 로 센다(독립 검토 — 단톡방의 빈 부름 EMPTY/ok 와 섞이지 않게).
  for (const utterance of ["?", "…"]) {
    const r = await kakao(fx, utterance);
    t.eq(r.seen, "NO_MATCH/fallback/no_match", `1 1:1 ‘${utterance}’ = 못 알아들음(NO_MATCH — 예전 EMPTY)`);
    t.eq(r.stored, "NO_MATCH/fallback", `1 1:1 ‘${utterance}’ 저장하는 관제 줄`);
  }
  // 1:1 의 ‘기록 없음’ 답(그날·이번 달·기간 요약)의 예시에도 ‘@말해가계부’ 가 없다(독립 검토 — 도움말만 고쳤었다).
  for (const utterance of ["어제 기록 보기", "이번달요약", "2025년 1월 요약"]) {
    const r = await kakao(fx, utterance);
    t.ok(r.text.includes("아직") && r.text.split("\n").includes("예) 커피 4500원") && !r.text.includes("@말해가계부"), `3 1:1 ‘${utterance}’ 기록 없음 답의 예시 = ‘예) 커피 4500원’ (${r.text.replace(/\n/g, " / ").slice(0, 90)})`);
  }
  const saved = await kakao(fx, "커피 4500원");
  t.ok(saved.seen.startsWith("TRANSACTION/ok/") && saved.text.includes("저장했어요"), `1 1:1 기록 글은 예전처럼 TRANSACTION/ok (${saved.seen})`);
  // 메모가 오류·되묻기 문구와 겹쳐도 저장 성공이고, 그 메모가 보이는 목록도 오류가 아니다(독립 검토 — 1:1 은 예전부터 오류로 셌다).
  for (const utterance of ["잠시 후 다시 갈 택시 8000원", "서버 오류 수리비 30000원"]) {
    const r = await kakao(fx, utterance);
    t.eq(r.seen, "TRANSACTION/ok/handled", `1 1:1 ‘${utterance}’ 저장 = TRANSACTION/ok (${r.first})`);
    t.eq(r.stored, "TRANSACTION/ok", `1 1:1 ‘${utterance}’ 저장하는 관제 줄`);
  }
  const again = await kakao(fx, "서버 오류 수리비 30000원");
  t.ok(again.text.includes("중복 저장 안 함") && again.text.includes("‘별도 구매 추가 서버 오류 수리비 30000원’") && again.seen === "TRANSACTION/ok/handled", `1 1:1 같은 기록을 다시 보낸 답(원래 문장을 따옴표로 되풀이) = TRANSACTION/ok (${again.seen})`);
  const today = await kakao(fx, "오늘기록");
  t.ok(today.text.includes("01번 - 커피 / 4,500원") && today.text.includes("서버 오류 수리비 / 30,000원") && today.seen.split("/")[1] === "ok", `1 1:1 그 메모가 보이는 오늘기록 = ok (${today.seen})`);
  const help = await kakao(fx, "도움말");
  t.ok(help.seen.startsWith("HELP/ok/") && help.text.includes("기록은 ‘점심 12000원’처럼 보내면 돼요.") && !help.text.includes("@말해가계부"), `3 1:1 도움말 예시에 @말해가계부 없음 (${help.text.replace(/\n/g, " / ").slice(0, 120)})`);
  const record = await kakao(fx, "기록하기");
  t.ok(record.text.includes("‘점심 12000원’처럼 보내면 바로 기록돼요.") && !record.text.includes("@말해가계부"), `3 1:1 기록하는 법 예시에 @말해가계부 없음 (${record.text.replace(/\n/g, " / ").slice(0, 120)})`);

  // 1:1 — 가계부가 없는 새 사람.
  for (const utterance of ["안녕", "점심 먹음"]) {
    const r = await kakao(fx, utterance, { user: "v229148-new-direct-user" });
    t.eq(r.seen, "FIRST_CONTACT/clarify/guided_clarification", `1 가계부 없는 새 사람 ‘${utterance}’ = 첫 안내(FIRST_CONTACT 되묻기 — 예전 UNKNOWN/ok)`);
    t.eq(r.stored, "FIRST_CONTACT/clarify", `1 새 사람 ‘${utterance}’ 저장하는 관제 줄`);
    t.eq(r.first, "친구와 함께 말 한마디로 기록하는 말해가계부입니다.", `1 새 사람 ‘${utterance}’ 첫 안내 글은 그대로`);
  }
  // Codex 검토: 가계부가 없는 사람의 ‘다른 가계부’(가계부 전환)도 같은 첫 안내를 낸다 — 예전에는 그 길만 표시가 없어 결과가 ok 였다.
  // 이름은 명령 이름(HOUSEHOLD_SWITCH) 그대로다 — 표시의 이름은 낱말 판별이 ‘알 수 없음’(UNKNOWN·EMPTY)일 때만 쓴다(skill-handler.js metricIntent).
  // ‘다른 가계부’ 는 낱말 판별이 UNKNOWN 이고 전환 명령의 낱말 목록(intent-nlu.js isHouseholdSwitchCommand)이 받는다 — 예전 UNKNOWN/ok(Codex 의 사례),
  // 이제 FIRST_CONTACT/clarify. ‘가계부 전환’ 은 낱말 판별이 HOUSEHOLD_SWITCH 라 이름은 그대로, 결과만 예전 ok → clarify.
  for (const [index, [utterance, name]] of [["다른 가계부", "FIRST_CONTACT"], ["가계부 전환", "HOUSEHOLD_SWITCH"]].entries()) {
    const r = await kakao(fx, utterance, { user: `v229148-new-switch-user-${index}` });
    t.eq(r.first, "친구와 함께 말 한마디로 기록하는 말해가계부입니다.", `6 새 사람 ‘${utterance}’ 은 첫 안내 글`);
    t.eq(`${r.seen} ${r.stored}`, `${name}/clarify/guided_clarification ${name}/clarify`, `6 새 사람 ‘${utterance}’ = 첫 안내의 되묻기(예전 ok) (${r.seen})`);
  }

  // 단톡방 — 새 방의 첫 호출자.
  const room = "v229148-first-record-room", owner = "v229148-room-owner";
  const empty = await kakao(fx, "@말해가계부", { user: owner, room });
  t.eq(empty.seen.split("/").slice(0, 2).join("/"), "EMPTY/ok", "1 단톡방 빈 멘션은 예전처럼 EMPTY/ok");
  const expectRoom = [
    ["@말해가계부 안녕", "GREETING/ok/handled", "안녕하세요 😊 무엇을 도와드릴까요?"],
    ["@말해가계부 이거 어떻게 써?", "NO_MATCH/fallback/no_match", "무슨 뜻인지 이해하지 못했어요. 아래처럼 보내 주세요."],
    ["@말해가계부 커피 사먹음", "NO_AMOUNT/fallback/no_amount", "내용과 금액을 한 문장으로 보내면 바로 기록돼요."],
    ["@말해가계부 수입으로 기록", "BUTTON_LABEL/fallback/button_label", "이 단추만으로는 어떤 기록인지 알 수 없어요."],
  ];
  for (const [utterance, seen, first] of expectRoom) {
    const r = await kakao(fx, utterance, { user: owner, room });
    t.eq(r.seen, seen, `1 단톡방 ‘${utterance}’ 관제 이름/결과/까닭(예전 UNKNOWN/ok)`);
    t.eq(r.stored, seen.split("/").slice(0, 2).join("/"), `1 단톡방 ‘${utterance}’ 저장하는 관제 줄`);
    // Codex 검토: 답의 첫 줄을 그대로 대조한다(예전에는 글 어디든 들어 있으면 통과 — 앞에 다른 줄이 붙거나 둘째 말풍선으로 밀려도 몰랐다).
    t.eq(r.first, first, `1 단톡방 ‘${utterance}’ 답 첫 줄은 예전과 같다`);
    t.eq(r.sample, "", `6 단톡방 ‘${utterance}’ 메모리의 최근 사건에 문장이 없다`);
  }
  const roomNoMatch = await kakao(fx, "@말해가계부 이거 어떻게 써?", { user: owner, room });
  t.eq(json(roomNoMatch.labels), json(["입력 예시 보기", "기록방법", "도움말 보기"]), "3 단톡방 못 알아들음 단추 = 입력 예시 보기(링크)·기록방법·도움말 보기");
  t.eq(roomNoMatch.buttons[0].action, "webLink", "3 단톡방 첫 단추는 링크");
  t.ok(roomNoMatch.text.includes("예) @말해가계부 점심 12000원"), "3 단톡방 예시에는 봇 부르기가 그대로 붙는다(V22.9.134 M-1)");
  const roomHelp = await kakao(fx, "@말해가계부 도움말 보기", { user: owner, room });
  t.ok(roomHelp.text.includes("기록은 @말해가계부 점심 12000원 처럼 보내면 돼요."), "3 단톡방 도움말 예시는 그대로(@말해가계부)");
  const roomQuestion = await kakao(fx, "@말해가계부 ?", { user: owner, room });
  t.eq(`${roomQuestion.seen} ${roomQuestion.stored}`, "NO_MATCH/fallback/no_match NO_MATCH/fallback", "1 단톡방 ‘@말해가계부 ?’ = 못 알아들음(빈 부름 EMPTY/ok 와 따로)");
  const roomEmptyDay = await kakao(fx, "@말해가계부 어제 기록 보기", { user: owner, room });
  t.ok(roomEmptyDay.text.split("\n").includes("예) @말해가계부 커피 4500원"), "3 단톡방 기록 없음 답의 예시는 그대로(@말해가계부 커피 4500원)");
  const create = await kakao(fx, "@말해가계부 가계부만들기", { user: owner, room });
  // 머리의 이름은 낱말 판별 이름(HOUSEHOLD_CREATE)이고 저장 줄은 CREATE_HOUSEHOLD 다(ops-telemetry.js nluDiagnosticFields).
  t.ok(create.seen.endsWith("/clarify/guided_clarification") && create.stored === "CREATE_HOUSEHOLD/clarify", `2 단톡방 흐름을 여는 물음은 1:1 처럼 clarify (${create.seen} · ${create.stored})`);
  await kakao(fx, "@말해가계부 취소", { user: owner, room });
  const roomSaved = await kakao(fx, "@말해가계부 커피 4500원", { user: owner, room });
  t.ok(roomSaved.seen.startsWith("TRANSACTION/ok/") && roomSaved.text.includes("저장했어요"), `1 단톡방 기록은 예전처럼 TRANSACTION/ok (${roomSaved.seen})`);
}));

// 단톡방 — 월요일의 그날 첫 기록은 답에 [지난주 요약] 단추가 붙어 카드가 된다(V22.9.123). 이 판이 카드를 읽게 되면서 메모가 오류·되묻기
// 문구로 읽혔다(독립 검토 — 2026-11-30 월요일 픽스처). 저장한 답은 표시가, 그 메모가 보이는 목록은 기록 줄 빼기가 막는다.
for (const [index, memo] of ["서버 오류 수리비 30000원", "잠시 후 다시 갈 커피 4500원", "어떤 커피 4500원"].entries()) {
  await withClock("2026-11-29", () => fixture(async (fx) => {
    Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
    const room = `v229148-monday-room-${index}`, owner = `v229148-monday-owner-${index}`;
    await kakao(fx, "@말해가계부", { user: owner, room });
    await kakao(fx, "@말해가계부 우유 2000원", { user: owner, room }); // 일요일 — 이 방의 첫 기록(첫 답의 길)
    globalThis.__AB_QA_FIXED_NOW_MS += 24 * 3600 * 1000; // 2026-11-30 월요일
    const r = await kakao(fx, `@말해가계부 ${memo}`, { user: owner, room });
    t.ok(r.labels.includes("지난주 요약") && r.text.includes("저장했어요"), `1 단톡방 월요일 첫 기록 ‘${memo}’ 답은 [지난주 요약] 단추가 붙은 카드 (${r.labels.join(",")})`);
    t.eq(`${r.seen} ${r.stored}`, "TRANSACTION/ok/handled TRANSACTION/ok", `1 단톡방 월요일 첫 기록 ‘${memo}’ = 저장 성공(메모가 오류·되묻기 문구와 겹쳐도)`);
    const list = await kakao(fx, "@말해가계부 오늘기록", { user: owner, room });
    t.ok(list.text.includes(memo.replace(/ [0-9]+원$/, "")) && list.seen.split("/")[1] === "ok", `1 단톡방 그 메모가 보이는 오늘기록 = ok (${list.seen})`);
  }));
}
// 가계부 이름도 사용자가 정한 글이다 — ‘가계부: 서버 오류 대응팀’ 줄은 기록 줄이 아니라 문구 판정에 남는다. 저장한 답은 표시가 지킨다
// (transaction-save.js kakaoSavedReplyV229148 — 한 건·중복·여러 건 세 길).
await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  fx.db.households.find((row) => row.id === "house-home").name = "서버 오류 대응팀";
  for (const [label, utterance, says] of [["한 건", "커피 4500원", "저장했어요"], ["같은 기록 다시", "커피 4500원", "중복 저장 안 함"], ["여러 건", "택시 8000원\n점심 12000원", "새로 저장 2건"]]) {
    const r = await kakao(fx, utterance);
    t.ok(r.text.includes("서버 오류 대응팀") && r.text.includes(says), `1 가계부 이름 ‘서버 오류 대응팀’ 이 저장 답(${label})에 보인다 (${r.first})`);
    t.eq(`${r.seen} ${r.stored}`, "TRANSACTION/ok/handled TRANSACTION/ok", `1 가계부 이름이 오류 문구와 겹쳐도 저장(${label}) = TRANSACTION/ok`);
  }
  // 저장한 답이 아닌 목록(표시 없음)은 이름 줄 빼기가 지킨다.
  const list = await kakao(fx, "오늘기록");
  t.ok(list.text.includes("가계부: 서버 오류 대응팀") && list.seen.split("/")[1] === "ok", `1 가계부 이름 ‘서버 오류 대응팀’ 이 보이는 오늘기록 = ok (${list.seen})`);
  // Codex 검토: 1:1 시작 카드의 ‘지금 가계부: 이름’ 줄도 뺀다(예전 error).
  const start = await kakao(fx, "시작");
  t.ok(start.text.includes("지금 가계부: 서버 오류 대응팀") && start.seen.split("/")[1] === "ok", `6 1:1 시작 카드의 ‘지금 가계부: 서버 오류 대응팀’ = ok (${start.seen})`);
}));
// Codex 검토: 단톡방 가계부 이름이 오류 문구와 겹치고 따옴표까지 품은 때 — 참여 안내(‘이 방 가계부 ‘…’에 참여했어요.’)·도움말·시작 카드의 이름 줄.
await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
  const room = "v229148-codex-name-room", owner = "v229148-codex-room-owner";
  const before = new Set(fx.db.households.map((row) => row.id));
  await kakao(fx, "@말해가계부", { user: owner, room });
  const created = fx.db.households.filter((row) => !before.has(row.id));
  const name = "모임 ‘개발’ 서버 오류 대응팀";
  for (const row of created) row.name = name;
  t.eq(created.length, 1, "6 새 방의 첫 호출로 방 가계부 하나가 생긴다");
  const linkJoin = await kakao(fx, "@말해가계부 웹가계부", { user: "v229148-codex-room-second", room });
  t.ok(linkJoin.text.includes(`이 방 가계부 ‘${name}’에 참여했어요.`) && linkJoin.seen.split("/")[1] === "ok", `6 단톡방 참여 안내의 겹친 따옴표 이름 = ok (${linkJoin.seen} · ${linkJoin.first})`);
  const help = await kakao(fx, "@말해가계부 도움말 보기", { user: "v229148-codex-room-third", room });
  t.ok(help.text.includes(`이 방 가계부: ${name}`) && help.seen.split("/")[1] === "ok", `6 단톡방 도움말 카드의 ‘이 방 가계부: ${name}’ = ok (${help.seen})`);
  const start = await kakao(fx, "@말해가계부 시작", { user: owner, room });
  t.ok(start.text.includes(`이 방 가계부: ${name}`) && start.seen.split("/")[1] === "ok", `6 단톡방 시작 카드의 ‘이 방 가계부: ${name}’ = ok (${start.seen})`);
}));
// Codex 검토: 실패 사례 저장을 켠 때만 메모리의 최근 사건에 가린 문장이 남는다(꺼진 때는 위에서 본다).
await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "1", NLU_STORE_REDACTED_TEXT: "0" });
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  const failed = await kakao(fx, "이거 어떻게 써?");
  t.ok(failed.eventResult === "fallback" && failed.sample === "이거 어떻게 써?", `6 실패 사례 저장을 켜면 못 알아들은 문장이 메모리의 최근 사건에 남는다 (${JSON.stringify(failed.sample)})`);
  const saved = await kakao(fx, "커피 4500원");
  t.ok(saved.eventResult === "ok" && saved.sample === "", "6 저장한 말은 켜져 있어도 남기지 않는다(예전과 같다)");
}));

// 6-a″ 후보가 둘인 실제 가계부 고르기 답(Codex 2차 검토): 가계부 이름 ‘서버 오류 대응팀’ 이 목록 줄(‘1. 서버 오류 대응팀 · 소유자’)로 되풀이돼도
// 오류가 아니라 고르기(clarify)다 — 예전 error/safe_error_response. 운영과 같은 코드로 보낸 답 그대로.
await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  fx.db.households.find((h) => h.id === "house-trip").name = "서버 오류 대응팀";
  for (const [utterance, seen] of [["다른 가계부", "UNKNOWN/clarify/guided_clarification"], ["가계부 전환", "HOUSEHOLD_SWITCH/clarify/guided_clarification"]]) {
    const r = await kakao(fx, utterance);
    t.ok(r.text.split("\n").includes("1. 서버 오류 대응팀 · 소유자") && r.quick.length === 3 && r.seen === seen && r.stored === seen.split("/").slice(0, 2).join("/"),
      `6-a″ 후보 둘의 가계부 고르기 ‘${utterance}’ = ${seen}(예전 error/safe_error_response) (${r.seen} · ${r.text.split("\n").slice(0, 2).join(" / ")})`);
  }
}));
// 6-a″ 참여 취소의 승인 대기 목록(skill-handler.js — 2차 고침 뒤 확인하다 더 찾음): 승인 대기 가계부 둘 가운데 하나의 이름이 ‘서버 오류 대응팀’ 이어도
// CANCEL/ok(운영 V22.9.147 과 앞 고침은 CANCEL/error). 고르기 흐름이 열려 있지 않은 새 픽스처에서 보낸다.
await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  for (const [id, name] of [["house-v229148-pending-1", "서버 오류 대응팀"], ["house-v229148-pending-2", "주말 모임"]]) {
    fx.db.households.push({ ...fx.db.households.find((h) => h.id === "house-trip"), id, name, invite_code: `P${id.slice(-1)}V229148` });
    fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "pending", created_at: "2026-11-27T00:00:00.000Z" });
  }
  const cancel = await kakao(fx, "참여 취소");
  t.ok(cancel.text.split("\n").slice(0, 3).join("|") === "승인 대기 중인 가계부가 2개예요.|1. 서버 오류 대응팀|2. 주말 모임" && cancel.seen === "CANCEL/ok/handled" && cancel.stored === "CANCEL/ok",
    `6-a″ 참여 취소의 승인 대기 목록(이름 ‘서버 오류 대응팀’) = CANCEL/ok (${cancel.seen} · 저장 ${cancel.stored} · ${json(cancel.text.split("\n").slice(0, 3))})`);
}));

// 6-a‴ 가계부 만들기의 이름 제안(Codex 3차 검토 — guided-flows.js ‘예: ${suggestion}’, suggestion = suggestedHouseholdName(종류, 카카오 별명)): 별명이
// ‘서버 오류 대응팀’ 이어도 ‘민지’ 와 같은 결과다(앞 고침 UNKNOWN/error). 가계부가 없는 새 사람이 ‘가계부 만들기’ → ‘5’(직접 입력)를 보낸다.
await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" });
  const results = [];
  for (const [index, nickname] of ["민지", "서버 오류 대응팀"].entries()) {
    const user = `v229148-r3-nickname-${index}`;
    await kakao(fx, "가계부 만들기", { user, nickname });
    results.push(await kakao(fx, "5", { user, nickname }));
  }
  const [plain, named] = results;
  t.ok(plain.text.includes("예: 민지 가계부") && named.text.includes("예: 서버 오류 대응팀 가계부") && named.seen === plain.seen && named.stored === plain.stored && !/error/.test(named.seen + named.stored),
    `6-a‴ 이름 제안의 별명 ‘서버 오류 대응팀’ = 별명 ‘민지’ 와 같은 ${named.seen} · 저장 ${named.stored} (민지 ${plain.seen} · ${plain.stored})`);
}));

// 6-i Codex 4차 검토(실제 흐름 — 픽스처, 운영과 같은 코드). 관리자 /ops-snapshot.json 을 그대로 읽는다.
await withClock("2026-11-27", () => fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: SKILL_SECRET, NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0",
    ADMIN_PASSWORD: "qa-v229148-r4-admin", ADMIN_SESSION_SECRET: "qa-v229148-r4-admin-session", ADMIN_API_TOKEN: "qa-v229148-r4-admin-token" });
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD, return_to: "/admin-view" }, { cookie: "" });
  const admin = (login.setCookie.match(/ab_admin=[^;,]+/) || [""])[0];
  const snapshot = async () => {
    const res = await app.fetch(new Request(`${BASE}/ops-snapshot.json`, { headers: { cookie: admin, accept: "application/json" } }), fx.env, { waitUntil() {} });
    return { status: res.status, ...((await res.json()).snapshot || {}) };
  };
  // C-42: 스킬 사건 상세의 요청 번호(서버가 만든 UUID)는 가리지 않아 NLU 사건의 request_id 칸과 이을 수 있다(앞 고침은 ‘[사용자식별자]’ 로 가렸다).
  {
    for (const name of ["__AB_SKILL_EVENTS", "__AB_NLU_RUNTIME_EVENTS"]) globalThis[name].length = 0;
    const r = await kakao(fx, "안녕");
    const snap = await snapshot();
    const kinds = (snap.skill?.recent || []).filter((e) => e.detail.startsWith(`request_id=${r.requestId}; `)).map((e) => e.kind);
    t.ok(snap.status === 200 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(r.requestId) && kinds.includes("received") && kinds.includes("ok") && (snap.nlu?.recent || []).some((e) => e.request_id === r.requestId),
      `6-i C-42 요청 번호 ${r.requestId} 로 스킬 사건(${kinds.join("·") || "없음"})과 NLU 사건을 잇는다`);
  }
  // C-38: 중복으로 건너뛴 기록과 저장 거절이 한 요청에 섞여도(실패 사례 저장 꺼짐) 관리자 스냅샷 어디에도 메모가 없다 — 중복 사건의 상세는 지문만.
  {
    const memo = "시험 병원 진료비";
    await kakao(fx, `${memo} 12000원`);
    for (const name of ["__AB_OPS_EVENTS", "__AB_SKILL_EVENTS", "__AB_NLU_RUNTIME_EVENTS", "__AB_DUPLICATE_EVENTS"]) globalThis[name].length = 0;
    let rejected = 0;
    const stop = intercept(({ url, method }) => {
      if (url.hostname !== "mock.supabase.co" || url.pathname !== "/rest/v1/transactions" || method !== "POST") return undefined;
      rejected += 1;
      return new Response(JSON.stringify({ code: "23514", details: "Failing row contains (t-x, 커피 4500원).", hint: null, message: 'new row for relation "transactions" violates check constraint "transactions_amount_check"' }), { status: 400, headers: { "content-type": "application/json" } });
    });
    let mixed;
    try { mixed = await kakao(fx, `${memo} 12000원\n커피 4500원`); } finally { stop(); }
    const snap = await snapshot();
    const duplicates = (snap.duplicates?.recent || []).map((e) => [e.kind, e.detail]);
    t.ok(snap.status === 200 && rejected >= 1 && duplicates.length >= 1 && duplicates.every(([kind, detail]) => kind === "duplicate_skipped" && /^text_hash=nlu_[0-9a-f]{8}$/.test(detail)) && !/병원|진료비/.test(json(snap)),
      `6-i C-38 중복 + 저장 거절 요청(답 ${json(mixed.first)}) 뒤 관리자 스냅샷 전체에 메모가 없다 — 중복 사건 ${json(duplicates)}`);
  }
  // C-40: 분류 이름이 ‘예: 점심’ 이어도 예산 금액 물음은 되묻기다 — 이름 ‘식비’ 와 같은 결과(앞 고침은 그 줄을 예시 줄로 빼 ok 로 셌다). 결과는 물음을 만든 곳이 적는다.
  {
    // 분류 표가 있으면 표에서, 없으면(운영과 같은 부재 모드) 설정 custom_categories:<가계부> 에서 읽는다(settings/categories-keywords.js fetchCustomCategories).
    fx.db.accountbook_categories.push({ id: "cat-v229148-r4", household_id: "house-home", name: "예: 점심", type: "expense", sort_order: 90, created_at: "2026-11-01T00:00:00Z" });
    const stored = fx.db.accountbook_settings.find((row) => row.key === "custom_categories:house-home")?.value;
    const storedList = typeof stored === "string" ? JSON.parse(stored || "[]") : Array.isArray(stored) ? stored : [];
    putSetting(fx, "custom_categories:house-home", JSON.stringify([...storedList, { id: "cat-v229148-r4", name: "예: 점심", type: "expense" }]));
    const ask = async (category) => {
      await kakao(fx, "예산설정");
      await kakao(fx, "카테고리별 예산");
      const asked = await kakao(fx, category);
      await kakao(fx, "취소");
      return asked;
    };
    const plain = await ask("식비"), example = await ask("예: 점심");
    t.ok(plain.first === "식비 예산을 얼마로 설정할까요?" && example.first === "예: 점심 예산을 얼마로 설정할까요?" && plain.seen.split("/")[1] === "clarify" && example.seen === plain.seen && example.stored === plain.stored,
      `6-i C-40 분류 ‘예: 점심’ 의 예산 금액 물음 = ‘식비’ 와 같은 ${example.seen} · 저장 ${example.stored}`);
  }
  // C-46(고치며 찾음): 별도 구매의 후보·조회·저장 답은 기록의 분류·메모·결제수단을 따옴표 없이 되풀이한다 — 메모 ‘서버 오류 수리비’ 여도 ‘동네 커피’ 와
  // 같은 결과다(앞 고침은 오류로 셌다). 결과는 답을 만든 곳이 적는다(separate-purchase.js kakaoSeparateHandledTextV229148).
  {
    const separate = async (memo) => {
      await kakao(fx, `${memo} 30000원`);
      await kakao(fx, `${memo} 30000원`);
      const candidate = await kakao(fx, `별도 구매 추가 ${memo} 30000원`);
      const confirm = candidate.quickMessages.find((text) => /^별도 구매 확인 [a-f0-9]{16}$/.test(text)) || "";
      const status = await kakao(fx, `별도 구매 조회 ${confirm.split(" ").at(-1)}`);
      const saved = await kakao(fx, confirm);
      return [candidate, status, saved];
    };
    const plain = await separate("동네 커피"), named = await separate("서버 오류 수리비");
    const firsts = ["같은 내용의 별도 구매 후보입니다. 아직 추가하지 않았어요.", "아직 추가하지 않은 별도 구매 후보입니다.", "별도 구매 한 건을 저장했어요."];
    t.ok(named.every((r, i) => r.first === firsts[i] && plain[i].first === firsts[i] && r.text.includes("서버 오류 수리비") && r.seen === plain[i].seen && r.stored === plain[i].stored && r.seen.split("/")[1] === "ok"),
      `6-i C-46 메모 ‘서버 오류 수리비’ 의 별도 구매 후보·조회·저장 답 = ‘동네 커피’ 와 같은 ${named.map((r) => r.seen).join(" · ")} (동네 커피 ${plain.map((r) => r.seen).join(" · ")})`);
  }
  // C-39: 기간 요약의 카테고리·지출자 줄과 정산의 보낼 돈·사람별 줄(글머리표 금액 줄)에 구성원·분류 이름이 오류 문구와 겹쳐도 이름 ‘민지’·‘철수’ 와 같은 결과.
  {
    fx.db.transactions.push({ id: "t-v229148-r4-wifi", household_id: "house-home", user_id: "user-wifi", transaction_date: "2026-11-26", type: "expense", amount: 30000, category: "수리", memo: "부품", payment_method: "카드", source: "web", raw_text: "", created_at: "2026-11-26T01:00:00Z" });
    const results = [];
    for (const [bin, wifi, category] of [["민지", "철수", "수리"], ["서버 오류 대응팀", "잠시 후 다시 모임", "서버 오류 수리"]]) {
      putSetting(fx, "member_aliases:house-home", JSON.stringify({ "user-bin": bin, "user-wifi": wifi }));
      fx.db.transactions.find((row) => row.id === "t-v229148-r4-wifi").category = category;
      results.push([await kakao(fx, "이번 주 요약"), await kakao(fx, "정산")]);
    }
    const [plain, named] = results;
    t.ok(named[0].text.includes("• 서버 오류 대응팀: ") && named[0].text.includes("• 서버 오류 수리: 30,000원") && named[0].text.includes("• 잠시 후 다시 모임: 30,000원")
      && named[1].text.includes("• 서버 오류 대응팀: 낸 돈 ") && named[1].text.includes("• 잠시 후 다시 모임: 낸 돈 30,000원 → ") && /• (?:서버 오류 대응팀|잠시 후 다시 모임) → (?:서버 오류 대응팀|잠시 후 다시 모임): [\d,]+원/.test(named[1].text)
      && named.every((r, i) => r.seen === plain[i].seen && r.stored === plain[i].stored && r.seen.split("/")[1] === "ok"),
      `6-i C-39 기간 요약·정산의 이름 줄(‘서버 오류 대응팀’·‘잠시 후 다시 모임’·분류 ‘서버 오류 수리’) = 이름 ‘민지’·‘철수’ 와 같은 ${named.map((r) => r.seen).join(" · ")} (민지·철수 ${plain.map((r) => r.seen).join(" · ")})`);
  }
}));

// ── 4. 웹 정산 소수 몫(추적표 V147:G-2) ──
const people = (n) => Array.from({ length: n }, (_, i) => ({ user_id: `u${i}`, nickname: `사람${i}`, role: i ? "member" : "owner" }));
const sharesOf = (model, n) => { const byId = Object.fromEntries(model.people.map((p) => [p.user_id, p.share])); return Array.from({ length: n }, (_, i) => byId[`u${i}`]); };
const settle = (amount, weights, mode = "ratio") => buildSettlementModel([{ id: "r1", type: "expense", amount, user_id: "u0" }], people(weights.length), { mode, weights: Object.fromEntries(weights.map((w, i) => [`u${i}`, w])) });
{
  const m = settle(90000, [0.7, 0.3]);
  t.eq(json(sharesOf(m, 2)), json([63000, 27000]), "4 90,000원 0.7 : 0.3 = 63,000 / 27,000(예전 62,999 / 27,001)");
  t.eq(json(m.transfers.map((x) => x.amount)), json([27000]), "4 송금 제안도 27,000원");
  t.eq(json(sharesOf(settle(30000, [0.1, 0.1, 0.1]), 3)), json([10000, 10000, 10000]), "4 0.1 셋에 30,000원 = 10,000원씩(예전 9,999 / 9,999 / 10,002)");
  t.eq(json(sharesOf(settle(100000, [1.5, 1], "headcount"), 2)), json([60000, 40000]), "4 인원수 1.5 : 1 = 60,000 / 40,000");
  t.eq(json(sharesOf(settle(100000, [1, 1, 1]), 3)), json([33333, 33333, 33334]), "4 나누어떨어지지 않으면 예전처럼 내림, 남는 원은 마지막 사람");
}
let seed = 0x9148;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const pick = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const floorDiv = (a, b) => { const q = a / b; return a % b < 0n ? q - 1n : q; };
// 예전 식(V22.9.147 까지): 몫을 실수로 곱해 내림, 남는 원은 마지막 사람. 정수 몫·같은 몫에서는 정확했다.
const oldAllocate = (amount, weights) => { const sum = weights.reduce((s, w) => s + w, 0); let given = 0; return weights.map((w, i) => { const v = i === weights.length - 1 ? amount - given : Math.floor(amount * w / sum); given += v; return v; }); };
let decimalMismatch = 0, decimalWrongBefore = 0, integerMismatch = 0;
for (let n = 0; n < 1500; n += 1) {
  const size = pick(2, 8);
  const tenths = Array.from({ length: size }, () => (rand() < 0.5 ? pick(1, 30) : pick(1, 10000)));
  const amount = rand() < 0.5 ? pick(1, 999) * 1000 : pick(1, 20000000);
  const sumTenths = tenths.reduce((s, k) => s + BigInt(k), 0n);
  let given = 0n;
  const expected = tenths.map((k, i) => { const v = i === size - 1 ? BigInt(amount) - given : floorDiv(BigInt(amount) * BigInt(k), sumTenths); given += v; return Number(v); });
  const got = sharesOf(settle(amount, tenths.map((k) => k / 10)), size);
  if (json(got) !== json(expected)) { decimalMismatch += 1; t.eq(json(got), json(expected), `4 무작위 소수 몫 ${tenths.map((k) => k / 10).join(":")} · ${amount}원 = BigInt 정답`); }
  if (json(oldAllocate(amount, tenths.map((k) => k / 10))) !== json(expected)) decimalWrongBefore += 1;
}
t.eq(decimalMismatch, 0, `4 무작위 소수 몫 1,500건 모두 BigInt 정답과 같다(예전 식은 ${decimalWrongBefore}건 틀림)`);
t.ok(decimalWrongBefore > 0, "4 예전 식이 틀리는 소수 몫이 표본에 있다(검사가 결함을 볼 수 있다)");
for (let n = 0; n < 1500; n += 1) {
  const size = pick(2, 8);
  const mode = ["ratio", "headcount", "equal"][n % 3];
  const weights = Array.from({ length: size }, () => (mode === "equal" ? 1 : pick(1, 1000)));
  const amount = pick(1, 50000000);
  const got = sharesOf(settle(amount, weights, mode), size);
  const before = oldAllocate(amount, mode === "equal" ? weights.map(() => 1) : weights);
  if (json(got) !== json(before)) { integerMismatch += 1; t.eq(json(got), json(before), `4 정수 몫(${mode}) ${weights.join(":")} · ${amount}원은 예전 식과 같다`); }
}
t.eq(integerMismatch, 0, "4 정수 몫·동일 분배 1,500건은 예전 식과 같다");
{
  // 품목별: 품목마다 고른 사람끼리 같은 몫(마지막으로 고른 사람이 남는 원). 예전 식과 같아야 한다.
  let itemMismatch = 0;
  for (let n = 0; n < 300; n += 1) {
    const size = pick(2, 6);
    const rows = Array.from({ length: pick(1, 6) }, (_, i) => ({ id: `r${i}`, type: "expense", amount: pick(1, 3000000), user_id: `u${pick(0, size - 1)}` }));
    const itemParticipants = Object.fromEntries(rows.map((row) => [row.id, Array.from({ length: size }, (_, i) => `u${i}`).filter(() => rand() < 0.6)]));
    const model = buildSettlementModel(rows, people(size), { mode: "item", itemParticipants });
    const owed = Object.fromEntries(Array.from({ length: size }, (_, i) => [`u${i}`, 0]));
    for (const row of rows) {
      const chosen = itemParticipants[row.id].length ? itemParticipants[row.id] : Object.keys(owed);
      oldAllocate(row.amount, chosen.map(() => 1)).forEach((value, i) => { owed[chosen[i]] += value; });
    }
    const got = sharesOf(model, size), before = Object.values(owed);
    if (json(got) !== json(before)) { itemMismatch += 1; t.eq(json(got), json(before), `4 품목별 ${json(itemParticipants)} 은 예전 식과 같다`); }
  }
  t.eq(itemMismatch, 0, "4 품목별 300건은 예전 식과 같다");
}
{
  // 환불 차감(V22.9.79 D-5): 지난달 지출의 환불은 음수 금액으로 모두에게 똑같이 나눠 빼고, 비율 방식은 환불을 뺀 합계(음수일 수 있다)를 나눈다.
  // 음수의 내림(아래 방향)과 ‘남는 원은 마지막 사람’ 이 예전 식·BigInt 정답과 같아야 한다.
  let refundMismatch = 0;
  for (let n = 0; n < 400; n += 1) {
    const size = pick(2, 6);
    const amount = pick(1000, 3000000), refund = pick(1, 4000000);
    const refundNetting = { total: refund, received: new Map([["u1", refund]]), byExpense: new Map([["old-expense", refund]]) };
    const rows = [{ id: "r1", type: "expense", amount, user_id: "u0" }];
    const item = buildSettlementModel(rows, people(size), { mode: "item", itemParticipants: {}, refundNetting });
    const equalShares = Array.from({ length: size }, () => 1);
    const before = oldAllocate(amount, equalShares).map((value, i) => value + oldAllocate(-refund, equalShares)[i]);
    if (json(sharesOf(item, size)) !== json(before)) refundMismatch += 1, t.eq(json(sharesOf(item, size)), json(before), `4 품목별 + 지난달 환불 ${refund}원(${size}명, 지출 ${amount}원)은 예전 식과 같다`);
    const tenths = Array.from({ length: size }, () => pick(1, 10000));
    const ratio = buildSettlementModel(rows, people(size), { mode: "ratio", weights: Object.fromEntries(tenths.map((k, i) => [`u${i}`, k / 10])), refundNetting });
    const net = BigInt(amount - refund), sumTenths = tenths.reduce((s, k) => s + BigInt(k), 0n);
    let given = 0n;
    const expected = tenths.map((k, i) => { const v = i === size - 1 ? net - given : floorDiv(net * BigInt(k), sumTenths); given += v; return Number(v); });
    if (json(sharesOf(ratio, size)) !== json(expected)) refundMismatch += 1, t.eq(json(sharesOf(ratio, size)), json(expected), `4 비율 ${tenths.map((k) => k / 10).join(":")} · 환불 뺀 합계 ${amount - refund}원 = BigInt 정답`);
  }
  t.eq(refundMismatch, 0, "4 환불 차감(음수 금액) 400건 — 품목별은 예전 식과, 비율은 BigInt 정답과 같다");
}
await withClock("2026-07-15", () => fixture(async (fx) => {
  fx.db.transactions = fx.db.transactions.filter((row) => !(row.household_id === "house-home" && String(row.transaction_date || "").startsWith("2026-07")));
  fx.db.transactions.push({ id: "t-v229148-g2", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-10", type: "expense", amount: 90000, category: "식비", memo: "모임 저녁", payment_method: "카드", source: "web", raw_text: "모임 저녁 90000원", created_at: "2026-07-10T12:00:00.000Z" });
  const r = await page(fx, "/settlement-summary?month=2026-07&household_id=house-home&mode=ratio&weight_user-bin=0.7&weight_user-wifi=0.3");
  const plain = r.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  t.eq(r.status, 200, "4 로그인 뒤 웹 정산 화면(비율 0.7 : 0.3)이 열린다");
  t.ok(plain.includes("63,000원") && plain.includes("27,000원") && !plain.includes("62,999원") && !plain.includes("27,001원"), `4 웹 정산 화면 = 63,000원 / 27,000원 (${(plain.match(/[0-9]{2},[0-9]{3}원/g) || []).slice(0, 8).join(" ")})`);
}));

// ── 6. Codex 검토(웹 정산) ──
// 6-e 0.001 단위 반올림의 실수 오차: 0.5005 × 1000 = 500.49999999999994 라 500 단위가 되던 것을 501 로(십진 반올림).
t.eq(json(sharesOf(settle(1501, [0.5005, 1]), 2)), json([501, 1000]), "6-e 1,501원 0.5005 : 1 = 501 / 1,000(예전 500 / 1,001)");
{
  // 무작위 몫(소수 넷째 자리까지, 주소로만 들어오는 값 포함)을 문자열 십진 반올림(0.001 단위, 반 올림)의 BigInt 정답과 대조한다.
  const milli = (digits) => { const [whole, frac = ""] = digits.split("."); const padded = `${frac}0000`; return BigInt(whole) * 1000n + BigInt(padded.slice(0, 3)) + (Number(padded[3]) >= 5 ? 1n : 0n); };
  let fineMismatch = 0;
  for (let n = 0; n < 1500; n += 1) {
    const size = pick(2, 6);
    const digits = Array.from({ length: size }, () => { const whole = pick(0, 20), frac = String(pick(0, 9999)).padStart(4, "0"); return whole === 0 && Number(frac) < 1000 ? `0.${String(pick(1000, 9999))}` : `${whole}.${frac}`; });
    const amount = rand() < 0.5 ? pick(1, 999) * 1000 + 1 : pick(1, 20000000);
    const units = digits.map(milli), sumUnits = units.reduce((s, k) => s + k, 0n);
    let given = 0n;
    const expected = units.map((k, i) => { const v = i === size - 1 ? BigInt(amount) - given : floorDiv(BigInt(amount) * k, sumUnits); given += v; return Number(v); });
    const got = sharesOf(settle(amount, digits.map(Number)), size);
    if (json(got) !== json(expected)) { fineMismatch += 1; t.eq(json(got), json(expected), `6-e 몫 ${digits.join(":")} · ${amount}원 = 십진 반올림 정답`); }
  }
  t.eq(fineMismatch, 0, "6-e 소수 넷째 자리 몫 1,500건 모두 십진 반올림(0.001 단위)의 BigInt 정답과 같다");
  // 6-e′ Codex 2차 검토: 반올림은 십진 글자로 한 번만. 앞 고침(곱을 소수 여섯째 자리에서 끊은 뒤 반올림)은 0.5004999999 를 501 단위로 만들었다(정답 500).
  t.eq(json(sharesOf(settle(1501, [0.5004999999, 1]), 2)), json([500, 1001]), "6-e′ 1,501원 0.5004999999 : 1 = 500 / 1,001(앞 고침 501 / 1,000)");
  t.eq(json(sharesOf(settle(1501, [0.50049, 1]), 2)), json([500, 1001]), "6-e′ 0.50049 : 1 = 500 / 1,001");
  t.eq(json(sharesOf(settle(1501, [0.5005000001, 1]), 2)), json([501, 1000]), "6-e′ 0.5005000001 : 1 = 501 / 1,000");
  // 경계 바로 위·아래(넷째 자리 4 뒤의 9 들, 5 뒤의 0 들)를 많이 섞은 소수 열째 자리까지의 몫 1,500건.
  let longMismatch = 0;
  for (let n = 0; n < 1500; n += 1) {
    const size = pick(2, 5);
    const digits = Array.from({ length: size }, () => {
      const whole = pick(0, 30), tailLength = pick(1, 7), head = String(pick(0, 999)).padStart(3, "0");
      const roll = rand();
      const tail = roll < 0.35 ? `4${"9".repeat(tailLength - 1)}`
        : roll < 0.7 ? (tailLength === 1 ? "5" : `5${"0".repeat(tailLength - 2)}${pick(0, 1)}`)
        : Array.from({ length: tailLength }, () => pick(0, 9)).join("");
      const text = `${whole}.${head}${tail}`;
      return Number(text) >= 0.1 ? text : `0.1${head}`;
    });
    const amount = rand() < 0.5 ? pick(1, 999) * 1000 + 1 : pick(1, 20000000);
    const units = digits.map(milli), sumUnits = units.reduce((s, k) => s + k, 0n);
    let given = 0n;
    const expected = units.map((k, i) => { const v = i === size - 1 ? BigInt(amount) - given : floorDiv(BigInt(amount) * k, sumUnits); given += v; return Number(v); });
    const got = sharesOf(settle(amount, digits.map(Number)), size);
    if (json(got) !== json(expected)) { longMismatch += 1; t.eq(json(got), json(expected), `6-e′ 몫 ${digits.join(":")} · ${amount}원 = 십진 반올림 정답`); }
  }
  t.eq(longMismatch, 0, "6-e′ 경계를 섞은 소수 열째 자리까지의 몫 1,500건 모두 십진 반올림 정답과 같다");
  // 몫 칸의 값(0.1 단위 0.1~1000, 1만 가지)은 모두 PR #205 의 식(몫 × 1000 반올림)과 같은 단위다.
  // V22.9.148(Codex 3차 검토): 1,000,003원으로는 999.9 의 999,900 단위를 999,901 로 잘못 바꿔도 첫 사람 몫이 같았다(둘 다 999,003원) — 단위를 가르지
  // 못했다. 20억 원이면 한 단위 차이가 언제나 몫에 나타난다(가장 큰 1000 : 1 에서도 20억 × 1000 ÷ (1,001,000 × 1,001,001) ≈ 2원). 그 점도 함께 본다.
  const TENTH_AMOUNT = 2000000000n;
  const tenthShare = (units) => Number((TENTH_AMOUNT * units) / (units + 1000n));
  let tenthMismatch = 0, tenthBlind = 0;
  for (let k = 1; k <= 10000; k += 1) {
    const units = BigInt(Math.round((k / 10) * 1000));
    const expectedShare = tenthShare(units);
    if (tenthShare(units + 1n) === expectedShare || tenthShare(units - 1n) === expectedShare) tenthBlind += 1;
    const got = sharesOf(settle(Number(TENTH_AMOUNT), [k / 10, 1]), 2)[0];
    if (got !== expectedShare) { tenthMismatch += 1; if (tenthMismatch < 4) t.eq(got, expectedShare, `6-e′ 몫 ${k / 10} : 1 · 20억 원 = PR #205 와 같음`); }
  }
  t.eq(tenthBlind, 0, "6-e′ 20억 원이면 0.1 단위 몫 1만 가지 모두 한 단위(0.001) 차이가 첫 사람 몫을 바꾼다(아래 대조가 단위를 가른다)");
  t.eq(tenthMismatch, 0, "6-e′ 0.1 단위 몫 1만 가지 모두 PR #205 의 단위(몫 × 1000 반올림)와 같다(20억 원)");
  // 몫 칸 밖의 값(주소로는 오지 않는다)은 buildSettlementModel 이 0.1~1000 으로 먼저 자른다(없음·0·숫자 아님·무한 = 1, 0.1 미만·음수 = 0.1, 1000 초과 = 1000)
  // — 0.001 단위 반올림에는 그 꼴(지수 표기 없는 십진 글자)만 온다.
  for (const [weight, expected, label] of [
    [undefined, [1000, 1001], "없음 → 1"], [0, [1000, 1001], "0 → 1"], ["몫", [1000, 1001], "숫자 아님 → 1"], [Infinity, [1000, 1001], "무한 → 1"],
    [0.0004, [181, 1820], "0.0004 → 0.1"], [1e-7, [181, 1820], "1e-7 → 0.1"], [-5, [181, 1820], "음수 → 0.1"], [1e21, [1999, 2], "1e21 → 1000"],
  ]) t.eq(json(sharesOf(settle(2001, [weight, 1]), 2)), json(expected), `6-e′ 몫 칸 밖의 값 ${label} : 1 · 2,001원 = ${expected.join(" / ")}`);
}
// 6-f 비율·인원수 지문에는 계산식 표지가 들어간다(이 판 전에 연 화면의 완료를 거절). 동일·품목별 지문은 예전과 같다.
{
  const month = "2026-07", rows = [{ id: "r1", type: "expense", amount: 90000, user_id: "u0" }], members = people(2);
  const legacyDigest = async (mode, conditions) => (await sha256Hex(JSON.stringify([
    month, mode, settlementConditionPairs(mode, conditions).sort(),
    rows.map((row) => [String(row.id), Math.round(Number(row.amount || 0)), String(row.user_id || "")]).sort(),
    members.map((m) => [String(m.user_id), String(m.role || "member").toLowerCase()]).sort(),
  ]))).slice(0, 32);
  for (const [mode, conditions, changes] of [
    ["ratio", { weights: { u0: 0.7, u1: 0.3 } }, true], ["headcount", { weights: { u0: 2, u1: 1 } }, true],
    ["equal", {}, false], ["item", { itemParticipants: { r1: ["u0", "u1"] } }, false],
  ]) {
    const now = await settlementPreviewDigest({ month, mode, conditions, rows, members }), before = await legacyDigest(mode, conditions);
    t.eq(now !== before, changes, `6-f ${mode} 지문 ${changes ? "= 예전과 다름(계산식 표지)" : "= 예전과 같음"}`);
    t.eq(await settlementPreviewDigest({ month, mode, conditions, rows, members, allocationFormula: false }), before, `6-f ${mode} 표지를 뺀 지문(중복 확인에만 쓴다) = 이 판 전의 지문`);
  }
  // 6-f′ 환불 연결이 있는 v3 지문도 같다(Codex 2차 검토 — 위 대조는 연결 없는 지문만 봤다). 연결 하나: 지출 r1 의 환불 f1 10,000원(받은 사람 u0).
  const links = [{ id: "l1", expense_id: "r1", refund_id: "f1", amount: 10000, refund_amount: 10000, recipient_user_id: "u0" }];
  const legacyV3 = async (mode, conditions) => (await sha256Hex(JSON.stringify([
    "v3-refund-links", month, mode, settlementConditionPairs(mode, conditions).sort(),
    rows.map((row) => [String(row.id), Math.round(Number(row.amount || 0)), String(row.user_id || "")]).sort(),
    links.map((link) => [link.id, link.expense_id, link.refund_id, link.amount]).sort(),
    [...new Map(links.map((link) => [link.refund_id, [link.refund_id, link.refund_amount, link.recipient_user_id]])).values()].sort(),
  ]))).slice(0, 32);
  for (const [mode, conditions, changes] of [
    ["ratio", { weights: { u0: 0.7, u1: 0.3 } }, true], ["headcount", { weights: { u0: 2, u1: 1 } }, true],
    ["equal", {}, false], ["item", { itemParticipants: { r1: ["u0", "u1"] } }, false],
  ]) {
    const now = await settlementRefundDigest({ month, mode, conditions, rows, links, members }), before = await legacyV3(mode, conditions);
    t.eq(now !== before, changes, `6-f′ 환불 연결 v3 ${mode} 지문 ${changes ? "= 예전과 다름(계산식 표지)" : "= 예전과 같음"}`);
    t.eq(await settlementRefundDigest({ month, mode, conditions, rows, links, members, allocationFormula: false }), before, `6-f′ 환불 연결 v3 ${mode} 표지를 뺀 지문 = 이 판 전의 v3 지문`);
    t.eq(await settlementRefundDigest({ month, mode, conditions, rows, links: [], members }), await settlementPreviewDigest({ month, mode, conditions, rows, members }), `6-f′ 연결이 없으면 ${mode} v3 자리는 연결 없는 지문 그대로`);
  }
}
// 정산 저장 길의 지문 계산 수(Codex 3차 검토 #5): 지문 함수가 해시하는 글은 ‘["2026-07","ratio",…’ 또는 ‘["v3-refund-links","2026-07",…’ 로 시작한다.
// 이 판 전 지문(계산식 표지 없음)은 비교할 이력(같은 사람·달·방식·합계·메모의 5분 안 완료)이 있고 그 지문이 지금 지문과 다를 때만 만든다.
async function settlementDigestCount(run) {
  const subtle = globalThis.crypto.subtle;
  const own = Object.prototype.hasOwnProperty.call(subtle, "digest");
  const original = subtle.digest;
  let count = 0;
  subtle.digest = function digest(algorithm, data) {
    if (/^\["(?:v3-refund-links",")?\d{4}-\d{2}","(?:equal|ratio|headcount|item)",/.test(new TextDecoder().decode(data).slice(0, 80))) count += 1;
    return original.call(this, algorithm, data);
  };
  try { return { result: await run(), count }; } finally { if (own) subtle.digest = original; else delete subtle.digest; }
}
// 6-g 배포 경계의 같은 완료(Codex 2차 검토): 이 판 전에 완료한 정산(계산식 표지 없는 지문)을 배포 뒤 5분 안에 새 화면으로 다시 완료하면 지문만 달라 두 건이
// 저장됐다. 몫이 같은 완료는 ‘이미 완료’ 로 막고, 예전 식으로 몫이 달랐던 완료를 바로잡는 완료(0.7 : 0.3)는 새로 저장한다. 일반 저장과 환불 연결 저장 모두.
for (const refundLinks of [false, true]) {
  for (const [weights, label, expectSaved, shares] of [[["1", "1"], "1 : 1(두 식의 몫이 같다)", false, "45000/45000"], [["0.7", "0.3"], "0.7 : 0.3(예전 식은 62,999 / 27,001)", true, "62999/27001 · 63000/27000"]]) {
    await withClock("2026-07-15", () => fixture(async (fx) => {
      if (refundLinks) { fx.env.REFUND_LINKS_ENABLED = "1"; fx.db.accountbook_refund_links = []; }
      fx.db.transactions = fx.db.transactions.filter((row) => !(row.household_id === "house-home" && String(row.transaction_date || "").startsWith("2026-07")));
      fx.db.transactions.push({ id: "t-v229148-dedupe", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-10", type: "expense", amount: 90000, category: "식비", memo: "모임 저녁", payment_method: "카드", source: "web", raw_text: "모임 저녁 90000원", created_at: "2026-07-10T12:00:00.000Z" });
      const save = formFields((await page(fx, `/settlement-summary?month=2026-07&household_id=house-home&mode=ratio&weight_user-bin=${weights[0]}&weight_user-wifi=${weights[1]}`)).html, "/my/settlement/save");
      const form = new URLSearchParams(save.fields);
      form.set("confirmed", "yes");
      const setting = () => fx.db.accountbook_settings.find((row) => row.key === "settlement_history:house-home");
      const history = () => JSON.parse(String(setting()?.value || "[]")).filter((x) => x && x.status === "completed");
      const firstSave = await settlementDigestCount(() => post(fx, "/my/settlement/save", form));
      // 배포 직전에 저장된 완료처럼: 지문을 이 판 전의 지문으로, 0.7 : 0.3 은 몫도 예전 식의 값으로 바꾼다.
      const rows = fx.db.transactions.filter((row) => row.household_id === "house-home" && String(row.transaction_date).startsWith("2026-07") && row.type === "expense");
      const members = fx.db.household_members.filter((m) => m.household_id === "house-home" && !["blocked", "pending", "viewer"].includes(m.role));
      const w = Object.fromEntries([...save.fields].filter(([key]) => key.startsWith("weight_")).map(([key, value]) => [key.slice(7), Number(value)]));
      const items = JSON.parse(setting().value);
      const first = items[items.length - 1];
      first.rows_digest = await settlementPreviewDigest({ month: "2026-07", mode: "ratio", conditions: { weights: w }, rows, members, allocationFormula: false });
      if (weights[0] === "0.7") first.shares = first.shares.map((s) => { const share = s.share === 63000 ? 62999 : 27001; return { ...s, share, balance: s.paid - share }; });
      setting().value = JSON.stringify(items);
      const { result: again, count: againDigests } = await settlementDigestCount(() => post(fx, "/my/settlement/save", form));
      const outcomeText = (again.decoded.match(/msg=[a-z_]+|err=[a-z_]+/) || ["?"])[0];
      t.ok(firstSave.count === 1 && againDigests === 2 && outcomeText === (expectSaved ? "msg=settlement_completed" : "msg=settlement_already_completed") && history().map((h) => h.shares.map((s) => s.share).join("/")).join(" · ") === shares,
        `6-g ${refundLinks ? "환불 연결 저장" : "일반 저장"} ${label}: 배포 전 완료 뒤 새 화면으로 다시 완료 → ${outcomeText} · 이력 ${history().length}건 (${history().map((h) => h.shares.map((s) => s.share).join("/")).join(" · ")} · 지문 계산 ${firstSave.count}·${againDigests}번 — 앞 고침 2·2번)`);
      // 화면을 연 뒤 기록이 바뀐 완료(제출 지문이 다름)는 이 판 전 지문을 만들지 않고 거절한다.
      const stale = new URLSearchParams(form);
      stale.set("preview_digest", "f".repeat(32));
      const before = history().length;
      const { result: changed, count: changedDigests } = await settlementDigestCount(() => post(fx, "/my/settlement/save", stale));
      t.ok(/err=settlement_changed/.test(changed.decoded) && changedDigests === 1 && history().length === before,
        `6-g ${refundLinks ? "환불 연결 저장" : "일반 저장"} ${label}: 제출 지문이 다른 완료는 지문을 한 번만 만들고 거절 (${(changed.decoded.match(/err=[a-z_]+/) || ["?"])[0]} · ${changedDigests}번)`);
      // 지문이 아예 다른 이력(다른 조건)은 그대로 같은 완료가 아니다.
      if (!expectSaved) {
        const other = JSON.parse(setting().value);
        other[other.length - 1].rows_digest = "0".repeat(32);
        setting().value = JSON.stringify(other);
        const { result: third, count: thirdDigests } = await settlementDigestCount(() => post(fx, "/my/settlement/save", form));
        t.ok(/msg=settlement_completed/.test(third.decoded) && history().length === 2 && thirdDigests === 2, `6-g ${refundLinks ? "환불 연결 저장" : "일반 저장"} 지문이 다른 이력은 같은 완료로 보지 않는다(이력 ${history().length}건 · 지문 계산 ${thirdDigests}번)`);
      }
    }));
  }
}
// 6-g 중복 확인 도우미(settlementDuplicateCompletionV229148 — 두 저장 길이 함께 쓴다)의 단위 대조: 같은 완료인가 / 이 판 전 지문을 만든 수.
{
  const recent = (minutes = 1) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const sharesNow = [{ user_id: "user-bin", paid: 90000, share: 63000, balance: 27000 }, { user_id: "user-wifi", paid: 0, share: 27000, balance: -27000 }];
  const model = { totalExpense: 90000, people: sharesNow };
  const entry = (extra = {}) => ({ month: "2026-07", mode: "ratio", total_expense: 90000, note: "", completed_by: "user-bin", completed_at: recent(), rows_digest: "l".repeat(32), shares: sharesNow, ...extra });
  const check = async (history, extra = {}) => {
    let calls = 0;
    const duplicate = await settlementDuplicateCompletionV229148(history, { month: "2026-07", mode: "ratio", note: "", userId: "user-bin", model, digest: "d".repeat(32), legacyDigest: async () => { calls += 1; return "l".repeat(32); }, ...extra });
    return `${duplicate}/${calls}`;
  };
  for (const [label, history, extra, expected] of [
    ["이력 없음", [], {}, "false/0"],
    ["지금 지문과 같은 이력", [entry({ rows_digest: "d".repeat(32) })], {}, "true/0"],
    ["지문이 없던 예전 이력", [entry({ rows_digest: "" })], {}, "true/0"],
    ["이 판 전 지문 + 같은 몫", [entry()], {}, "true/1"],
    ["이 판 전 지문 + 같은 몫(행 순서·숫자 글자)", [entry({ shares: [{ user_id: "user-wifi", paid: "0", share: "27000", balance: "-27000" }, { ...sharesNow[0] }] })], {}, "true/1"],
    ["이 판 전 지문 + 다른 몫", [entry({ shares: sharesNow.map((p, i) => ({ ...p, share: p.share + (i ? 1 : -1) })) })], {}, "false/1"],
    ["다른 지문의 이력 둘", [entry({ rows_digest: "a".repeat(32) }), entry({ rows_digest: "b".repeat(32) })], {}, "false/1"],
    ["예전 지문을 넘기지 않음", [entry()], { legacyDigest: null }, "false/0"],
    ["동일 방식(계산식 표지 없음)", [entry({ mode: "equal", rows_digest: "a".repeat(32) })], { mode: "equal" }, "false/0"],
    ["5분이 지난 이력", [entry({ completed_at: recent(6) })], {}, "false/0"],
    ["다른 사람의 이력", [entry({ completed_by: "user-wifi" })], {}, "false/0"],
    ["다른 메모", [entry({ note: "다른 메모" })], {}, "false/0"],
    ["다른 합계", [entry({ total_expense: 90001 })], {}, "false/0"],
    ["다른 달", [entry({ month: "2026-06" })], {}, "false/0"],
  ]) t.eq(await check(history, extra), expected, `6-g 중복 확인 ‘${label}’ = ${expected}(같은 완료/이 판 전 지문을 만든 수)`);
  // 몫 칸이 빠졌거나 숫자가 아닌 이력(Codex 3차 검토 #6): 빠진 칸을 0원으로 읽어 지금 몫의 0원과 같다고 보면, 그 이력을 바로잡을 새 완료까지 막았다.
  for (const [label, shares, before] of [
    ["paid 없음", [sharesNow[0], { user_id: "user-wifi", share: 27000, balance: -27000 }], true],
    ["paid 가 null", [sharesNow[0], { ...sharesNow[1], paid: null }], true],
    ["paid 가 빈 글자", [sharesNow[0], { ...sharesNow[1], paid: "" }], true],
    ["숫자가 아닌 글자", [sharesNow[0], { ...sharesNow[1], paid: "없음" }], false],
    ["user_id 없음", [sharesNow[0], { paid: 0, share: 27000, balance: -27000 }], false],
    ["사람 하나가 빠짐", [sharesNow[0]], false],
  ]) t.eq(await check([entry({ shares })]), "false/1", `6-g 몫 칸이 온전하지 않은 이력(${label})은 같은 완료가 아니다(앞 고침 ${before})`);
}
// 6-g′ 환불 연결이 실제로 있는 달의 배포 경계(Codex 3차 검토 #7): 6-f′ 는 연결이 있는 v3 지문 함수만, 6-g 의 ‘환불 연결 저장’ 은 연결이 없는 달만 봐서
// 저장 길이 이 판 전 지문을 구할 때 연결(refund.links)을 빠뜨려도 둘 다 통과했다. 지출 90,000원에 환불 10,000원을 연결한 달을 완료하고, 그 이력의 지문을
// 이 판 전 v3 지문(연결·환불을 넣고 계산식 표지는 넣지 않는다 — 6-f′ 와 같은 식을 여기서 다시 적는다)으로 바꾼 뒤 새 화면으로 다시 완료한다.
// 몫이 같으면 ‘이미 완료’(이력 한 건), 몫이 다르면(예전 식) 새로 저장한다.
const REFUND_TX_COLS = ["id", "household_id", "user_id", "type", "amount", "category", "transaction_date"];
const EXPENSE_TX_COLS = ["id", "household_id", "user_id", "type", "amount", "category", "memo", "raw_text", "transaction_date"];
for (const [label, tweak, expectSaved] of [["몫이 같은 이력", false, false], ["몫이 다른 이력(예전 식)", true, true]]) {
  await withClock("2026-07-15", () => fixture(async (fx) => {
    fx.env.REFUND_LINKS_ENABLED = "1";
    fx.db.transactions = fx.db.transactions.filter((row) => !(row.household_id === "house-home" && String(row.transaction_date || "").startsWith("2026-07")));
    fx.db.transactions.push(
      { id: "t-v229148-r3-expense", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-10", type: "expense", amount: 90000, category: "식비", memo: "모임 저녁", payment_method: "카드", source: "web", raw_text: "모임 저녁 90000원", created_at: "2026-07-10T12:00:00.000Z" },
      { id: "t-v229148-r3-refund", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-12", type: "income", amount: 10000, category: "환급", memo: "모임 저녁 환불", payment_method: "카드", source: "web", raw_text: "환불 10000원", created_at: "2026-07-12T12:00:00.000Z" },
    );
    fx.db.accountbook_refund_links = [{ id: "link-v229148-r3", household_id: "house-home", expense_id: "t-v229148-r3-expense", refund_id: "t-v229148-r3-refund", amount: 10000, created_by: "user-bin", created_at: "2026-07-12T13:00:00.000Z" }];
    const txById = (id) => fx.db.transactions.find((row) => String(row.id) === String(id)) || null;
    const pickCols = (row, cols) => (row ? Object.fromEntries(cols.map((col) => [col, row[col] ?? null])) : null);
    // 연결 표의 환불·지출 끼워 읽기(PostgREST embed)는 픽스처에 없어 여기서 답한다(validate-refund-links-v22981.mjs 의 embedRows 와 같은 꼴).
    const stop = intercept(({ url, method }) => {
      if (url.hostname !== "mock.supabase.co" || url.pathname !== "/rest/v1/accountbook_refund_links" || method !== "GET" || !String(url.searchParams.get("select") || "").includes("refund:transactions!")) return undefined;
      const filters = url.searchParams.getAll("refund.transaction_date");
      const gte = filters.find((v) => v.startsWith("gte."))?.slice(4) || "", lt = filters.find((v) => v.startsWith("lt."))?.slice(3) || "";
      const rows = fx.db.accountbook_refund_links.map((l) => ({ l, refund: txById(l.refund_id), expense: txById(l.expense_id) }))
        .filter(({ refund }) => refund && (!gte || refund.transaction_date >= gte) && (!lt || refund.transaction_date < lt))
        .map(({ l, refund, expense }) => ({ id: l.id, household_id: l.household_id, expense_id: l.expense_id, refund_id: l.refund_id, amount: l.amount, created_at: l.created_at, refund: pickCols(refund, REFUND_TX_COLS), expense: pickCols(expense, EXPENSE_TX_COLS) }));
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const save = formFields((await page(fx, "/settlement-summary?month=2026-07&household_id=house-home&mode=ratio&weight_user-bin=1&weight_user-wifi=1")).html, "/my/settlement/save");
      const form = new URLSearchParams(save.fields);
      form.set("confirmed", "yes");
      const setting = () => fx.db.accountbook_settings.find((row) => row.key === "settlement_history:house-home");
      const history = () => JSON.parse(String(setting()?.value || "[]")).filter((x) => x && x.status === "completed");
      const firstSave = await settlementDigestCount(() => post(fx, "/my/settlement/save", form));
      const items = JSON.parse(setting().value);
      const first = items[items.length - 1];
      const w = Object.fromEntries([...save.fields].filter(([key]) => key.startsWith("weight_")).map(([key, value]) => [key.slice(7), Number(value)]));
      const expenseRows = fx.db.transactions.filter((row) => row.household_id === "house-home" && String(row.transaction_date).startsWith("2026-07") && row.type === "expense");
      const link = { id: "link-v229148-r3", expense_id: "t-v229148-r3-expense", refund_id: "t-v229148-r3-refund", amount: 10000, refund_amount: 10000, recipient_user_id: "user-bin" };
      first.rows_digest = (await sha256Hex(JSON.stringify([
        "v3-refund-links", "2026-07", "ratio", settlementConditionPairs("ratio", { weights: w }).sort(),
        expenseRows.map((row) => [String(row.id), Math.round(Number(row.amount || 0)), String(row.user_id || "")]).sort(),
        [[link.id, link.expense_id, link.refund_id, link.amount]],
        [[link.refund_id, link.refund_amount, link.recipient_user_id]],
      ]))).slice(0, 32);
      if (tweak) first.shares = first.shares.map((p, i) => { const share = p.share + (i ? 1 : -1); return { ...p, share, balance: p.paid - share }; });
      setting().value = JSON.stringify(items);
      const { result: again, count: againDigests } = await settlementDigestCount(() => post(fx, "/my/settlement/save", form));
      const outcomeText = (again.decoded.match(/msg=[a-z_]+|err=[a-z_]+/) || ["?"])[0];
      t.ok(first.schema_version === 3 && /msg=settlement_completed/.test(firstSave.result.decoded) && firstSave.count === 1 && againDigests === 2
        && outcomeText === (expectSaved ? "msg=settlement_completed" : "msg=settlement_already_completed") && history().length === (expectSaved ? 2 : 1),
        `6-g′ 환불 연결이 있는 달 ${label}: 배포 전 완료 뒤 새 화면으로 다시 완료 → ${outcomeText} · 이력 ${history().length}건 (v${first.schema_version} · 몫 ${history().map((h) => h.shares.map((p) => p.share).join("/")).join(" · ")} · 지문 계산 ${firstSave.count}·${againDigests}번)`);
    } finally { stop(); }
  }));
}
await withClock("2026-07-15", () => fixture(async (fx) => {
  fx.db.transactions = fx.db.transactions.filter((row) => !(row.household_id === "house-home" && String(row.transaction_date || "").startsWith("2026-07")));
  fx.db.transactions.push({ id: "t-v229148-g2", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-10", type: "expense", amount: 90000, category: "식비", memo: "모임 저녁", payment_method: "카드", source: "web", raw_text: "모임 저녁 90000원", created_at: "2026-07-10T12:00:00.000Z" });
  const Q = "month=2026-07&household_id=house-home&mode=ratio&weight_user-bin=0.7&weight_user-wifi=0.3";
  const save = formFields((await page(fx, `/settlement-summary?${Q}`)).html, "/my/settlement/save");
  const weights = Object.fromEntries([...save.fields].filter(([key]) => key.startsWith("weight_")).map(([key, value]) => [key.slice(7), Number(value)]));
  const rows = fx.db.transactions.filter((row) => row.household_id === "house-home" && String(row.transaction_date).startsWith("2026-07") && row.type === "expense");
  const members = fx.db.household_members.filter((m) => m.household_id === "house-home" && !["blocked", "pending", "viewer"].includes(m.role));
  const digest = save.fields.get("preview_digest");
  t.eq(await settlementPreviewDigest({ month: "2026-07", mode: "ratio", conditions: { weights }, rows, members }), digest, "6-f 화면의 지문을 같은 입력으로 다시 만들 수 있다(아래 대조의 전제)");
  // 이 판 전의 화면이 실었을 지문(계산식 표지 없음 — 그 화면은 62,999원 / 27,001원을 보였다).
  const before = (await sha256Hex(JSON.stringify([
    "2026-07", "ratio", settlementConditionPairs("ratio", { weights }).sort(),
    rows.map((row) => [String(row.id), Math.round(Number(row.amount || 0)), String(row.user_id || "")]).sort(),
    members.map((m) => [String(m.user_id), String(m.role || "member").toLowerCase()]).sort(),
  ]))).slice(0, 32);
  const history = () => JSON.parse(String(fx.db.accountbook_settings.find((row) => row.key === "settlement_history:house-home")?.value || "[]")).filter((x) => x && x.status === "completed");
  const stale = new URLSearchParams(save.fields);
  stale.set("preview_digest", before);
  stale.set("confirmed", "yes");
  const rejected = await post(fx, "/my/settlement/save", stale);
  t.ok(before !== digest && /err=settlement_changed/.test(rejected.decoded) && history().length === 0, `6-f 이 판 전에 연 비율 화면(지문 ${before.slice(0, 8)}…)으로는 완료를 저장하지 않는다 (${rejected.decoded.slice(0, 90)})`);
  const fresh = new URLSearchParams(save.fields);
  fresh.set("confirmed", "yes");
  const saved = await post(fx, "/my/settlement/save", fresh);
  const last = history().at(-1);
  t.ok(/msg=settlement_completed/.test(saved.decoded) && json(last?.shares?.map((s) => s.share).sort((a, b) => b - a)) === json([63000, 27000]), `6-f 지금 화면으로는 63,000원 / 27,000원으로 완료된다 (${json(last?.shares?.map((s) => s.share))})`);
}));

// ── 5. 운영 DB 권한 정리 기록 ──
{
  const sql = readFileSync(new URL("../migrations/V22_9_148_DB_ADVISOR_GRANTS_REVIEW_ONLY.sql", import.meta.url), "utf8");
  const lines = sql.split("\n");
  // V22.9.148(Codex 검토): 예전 검사는 줄에서 ‘raise exception’ 글자만 찾아 가드를 주석으로 바꿔도 통과했고, 적용한 문이 실행되는 채로 남아 문마다
  // 저장점을 두는 클라이언트(psql ON_ERROR_ROLLBACK)에서는 가드만 실패하고 그 문들과 commit 이 실행될 수 있었다.
  // V22.9.148(Codex 2차 검토): 그때 넣은 범용 토크나이저는 ‘--’ 주석을 LF 에서만 끝내(PostgreSQL 은 CR 에서도 끝낸다) ‘-- 설명\rSELECT 1;’ 의 뒤 문을
  // 주석으로 넘겼고, 겹친 블록 주석은 첫 ‘*/’ 에서 끊었다. 이 기록 파일의 모양을 그대로 본다 — CR·블록 주석은 두지 않고(저장소는 LF, .gitattributes),
  // 빈 줄과 ‘--’ 주석 줄을 뺀 나머지가 정해 둔 세 줄(begin·조건 없는 가드·rollback)과 글자 그대로 같아야 한다.
  const RECORD_EXECUTABLE_LINES = Object.freeze([
    "begin;",
    "do $review_only$ begin raise exception 'v229148_review_only_db_advisor_grants_already_applied_2026_11_27'; end $review_only$;",
    "rollback;",
  ]);
  const recordProblems = (text) => {
    const problems = [];
    if (!text.startsWith("-- 실행 금지(DO NOT RUN)")) problems.push("첫 줄이 실행 금지가 아니다");
    if (text.includes("\r")) problems.push("CR 이 있다(줄 끝은 LF 만 — PostgreSQL 은 CR 에서도 ‘--’ 주석을 끝낸다)");
    if (text.includes("/*") || text.includes("*/")) problems.push("블록 주석이 있다");
    const executable = text.split("\n").filter((line) => line.trim() && !line.trimStart().startsWith("--"));
    if (json(executable) !== json(RECORD_EXECUTABLE_LINES)) problems.push(`주석 아닌 줄이 begin·조건 없는 가드·rollback 세 줄이 아니다: ${executable.join(" | ").slice(0, 160)}`);
    return problems;
  };
  t.eq(json(recordProblems(sql)), "[]", "5 기록 파일: 첫 줄 실행 금지, CR·블록 주석 없음, 주석 아닌 줄은 begin·조건 없는 가드·rollback 세 줄뿐(적용한 문은 모두 주석)");
  // 대조 사례 — 검사가 실제로 떨어지는지 본다.
  const guardLine = lines.find((line) => line.startsWith("do $review_only$"));
  const mutants = {
    "가드를 주석으로": sql.replace(guardLine, `-- ${guardLine}`),
    "가드를 조건으로": sql.replace(guardLine, "do $review_only$ begin if false then raise exception 'v229148_review_only_db_advisor_grants_already_applied_2026_11_27'; end if; end $review_only$;"),
    "적용문 하나를 풀기": sql.replace("-- revoke all on function public.record_nlu_metric(", "revoke all on function public.record_nlu_metric("),
    "commit 을 풀기": sql.replace("\n-- commit;\n", "\ncommit;\n"),
    "블록 주석 안의 가드": sql.replace(guardLine, `/* ${guardLine} */`),
    // Codex 2차 검토의 대조본: CR 에서 끝나는 주석 뒤의 문, 겹친 블록 주석, 줄 끝 주석에 숨은 문.
    "CR 뒤의 문": `${sql}-- 설명\rselect 1;\n`,
    "겹친 블록 주석": `${sql}/* 바깥 /* 안 */ 바깥 */\n`,
    "가드 줄 끝의 문": sql.replace(guardLine, `${guardLine} commit;`),
    "빈 줄처럼 보이는 문": sql.replace("\nrollback;\n", "\nrollback;\n   select 1;\n"),
  };
  for (const [label, text] of Object.entries(mutants)) t.ok(text !== sql && recordProblems(text).length > 0, `5 대조: ${label} → 검사가 떨어진다 (${recordProblems(text)[0] || "떨어지지 않음"})`);
  // 이 검사의 전제: 기록 파일의 세 줄은 한 줄 안에서 따옴표·$태그$ 가 닫힌다(그래서 그 밖의 ‘--’ 줄은 문자열 안이 아니라 정말 주석이다).
  t.ok(RECORD_EXECUTABLE_LINES.every((line) => (line.match(/'/g) || []).length % 2 === 0 && (line.match(/\$review_only\$/g) || []).length % 2 === 0), "5 정해 둔 세 줄은 저마다 따옴표·$태그$ 가 그 줄 안에서 닫힌다");
  for (const statement of [
    "revoke all on function public.record_nlu_metric(timestamp with time zone, text, text, integer, text) from public, anon, authenticated;",
    "revoke all on function public.record_nlu_failure_sample(text, text, text, text, text, text) from public, anon, authenticated;",
    "grant execute on function public.record_nlu_metric(timestamp with time zone, text, text, integer, text) to service_role;",
    "grant execute on function public.record_nlu_failure_sample(text, text, text, text, text, text) to service_role;",
    "alter function public.set_updated_at() set search_path = '';",
    "alter function public.set_accountbook_settings_updated_at() set search_path = '';",
  ]) t.ok(lines.includes(`-- ${statement}`), `5 기록 파일에 적용한 문이 주석으로 그대로 있다: ${statement.slice(0, 60)}`);
  t.ok(lines.filter((line) => /^-- (?:revoke|grant|alter function)\b/.test(line)).length === 6, "5 적용한 바꾸는 문은 그 여섯뿐(되돌리기 문은 저장소에 적지 않는다)");
  const projectRef = /(?<![a-z])[a-z]{20}(?![a-z])/;
  t.ok(!projectRef.test(sql) && !/supabase\.co/i.test(sql), "5 기록 파일에 프로젝트 식별자·주소가 없다(공개 저장소)");
  const history = readFileSync(new URL("../SQL_HISTORY.md", import.meta.url), "utf8");
  const section = history.slice(history.indexOf("## V22.9.148 SQL 판단"), history.indexOf("## V22.9.147 SQL 판단"));
  t.ok(history.indexOf("## V22.9.148 SQL 판단") === 0 && section.includes("V22_9_148_DB_ADVISOR_GRANTS_REVIEW_ONLY.sql") && section.includes("2026-11-27 11:49:52") && !projectRef.test(section), "5 SQL_HISTORY 맨 위 V22.9.148 절에 운영 적용 줄(식별자 없음)");
  const calculator = readFileSync(new URL("../src/modules/public/group-settlement-v229147.js", import.meta.url), "utf8");
  // 두 계산의 대조(정수 몫)는 validate-v229147-group-settlement 가 본다. 여기서는 계산기 설명 주석이 이 판의 고침과 맞는지만 본다.
  t.ok(!calculator.includes("웹 정산에 남은 결함") && calculator.includes("V22.9.148") && !calculator.includes("1~3원"), "4 계산기 설명 주석이 웹 정산의 고침(V22.9.148)을 가리킨다(어긋남 폭은 ‘몇 원’)");
}

t.done();
