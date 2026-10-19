// V22.9.65 — 버튼으로 따라 하는 카카오 사용 설명서.
//
// 1) 설명서 첫 화면과 기록·예산·리포트·정기지출·웹·함께 쓰기·고치기 화면이 단톡방과 1:1 모두에서 열린다.
// 2) 카드 규격: textCard 하나당 세로 버튼 최대 5개, 버튼 이름 14자 이하, 설명 400자 이하, 말풍선 최대 3개, URL 없음.
// 3) 그룹 전용 플러그인(mention·inviteMember·guide)은 단톡방에서만 쓰고 1:1 에는 보내지 않는다.
// 4) 버튼이 보내는 문장은 모두 설명서 화면이나 기존 명령으로 다시 처리된다(막다른 버튼 없음).
// 5) 기존 동작 명령·거래 문장은 설명서가 가로채지 않는다.
// 6) 단톡방에서 quickReplies 는 글자 목록 대신 눌러서 고르는 세로 메시지 버튼 카드가 된다.

import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { kakaoManualTopic } from "../src/modules/kakao/manual-guides.js";
import {
  isBudgetCommand, isGroupLinkInfoCommand, isInviteCommand, isLinkCommand, isRecentCommand, isSettlementCommand, isSummaryCommand,
} from "../src/modules/kakao/simple-commands.js";
import { isKakaoBudgetSetupCommand, isKakaoCreateFlowCommand, isKakaoJoinFlowCommand, isKakaoMemberAliasCommand } from "../src/modules/kakao/guided-flow-state.js";
import { isHouseholdSwitchCommand } from "../src/modules/kakao/intent-nlu.js";

let checks = 0;
const ok = (value, label) => { if (!value) throw new Error(`FAIL: ${label}`); checks += 1; };
const eq = (actual, expected, label) => { if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`); checks += 1; };

const env = { APP_NAME: "말해가계부", PUBLIC_BASE_URL: "https://malhaebook.com", INCOMPLETE_FEATURE_QA_ENABLED: "1", ADMIN_API_TOKEN: "qa-kakao-skill-token" };

function payloadFor({ userKey, groupKey = "", utterance }) {
  return {
    intent: { id: "fallback-intent", name: "폴백 블록" },
    userRequest: {
      timezone: "Asia/Seoul", params: {}, block: { id: "fallback-block", name: "폴백 블록" }, utterance, lang: "ko",
      user: { id: userKey, type: "botUserKey", properties: { botUserKey: userKey, ...(groupKey ? { botGroupKey: groupKey } : {}) } },
    },
    bot: { id: "test-bot", name: "말해가계부" },
    action: { id: "fallback-action", name: "폴백", params: {}, detailParams: {}, clientExtra: {} },
    contexts: [],
  };
}

async function callSkill(utterance, group) {
  const response = await app.fetch(new Request("https://malhaebook.com/skill", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${env.ADMIN_API_TOKEN}` },
    body: JSON.stringify(payloadFor({ userKey: `qa-manual-${checks}`, groupKey: group ? "qa-manual-group-v22965" : "", utterance })),
  }), env, {});
  return { response, data: JSON.parse(await response.text()) };
}

const KNOWN_COMMAND = (text) => isKakaoBudgetSetupCommand(text) || isBudgetCommand(text) || isRecentCommand(text) || isSummaryCommand(text)
  || isSettlementCommand(text) || isLinkCommand(text) || isInviteCommand(text) || isKakaoMemberAliasCommand(text) || isGroupLinkInfoCommand(text)
  || isKakaoCreateFlowCommand(text) || isKakaoJoinFlowCommand(text) || isHouseholdSwitchCommand(text) || /^단톡방 연결$/.test(text);
const GROUP_PLUGINS = new Set(["mention", "inviteMember", "guide"]);

const ENTRY = {
  home: "사용 설명서", record: "기록하는 법", budget: "예산 정하는 법", report: "리포트 보는 법",
  recurring: "정기지출 방법", web: "웹 관리 방법", together: "함께 쓰는 법", edit: "고치는 법",
};

try {
  const KAKAO_MANUAL_CARD_DESCRIPTION_MAX = 400;
  const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  ok(source.includes("function kakaoManualReply("), "설명서 응답 함수가 번들에 있다");

  const seenButtonTexts = new Set();
  for (const [topic, utterance] of Object.entries(ENTRY)) {
    eq(kakaoManualTopic(utterance), topic, `${utterance} → ${topic}`);
    eq(kakaoManualTopic(`@말해가계부 ${utterance}`), topic, `멘션이 붙어도 ${topic}`);
    eq(kakaoManualTopic(`${utterance} 알려줘`), topic, `‘알려줘’가 붙어도 ${topic}`);
    for (const group of [true, false]) {
      const where = group ? "단톡방" : "1:1";
      const { response, data } = await callSkill(utterance, group);
      eq(response.status, 200, `${where} ${topic}: 응답 성공`);
      eq(data.version, "2.0", `${where} ${topic}: 버전 2.0`);
      ok(!Object.hasOwn(data.template || {}, "quickReplies"), `${where} ${topic}: quickReplies 없음`);
      const outputs = data.template?.outputs || [];
      ok(outputs.length >= 1 && outputs.length <= 3, `${where} ${topic}: 말풍선 1~3개`);
      ok(outputs.every((o) => Object.keys(o).length === 1 && o.textCard), `${where} ${topic}: 모두 textCard`);
      for (const { textCard: card } of outputs) {
        ok(card.title && card.title.length <= 50, `${where} ${topic}: 제목 50자 이하`);
        ok(String(card.description || "").length <= KAKAO_MANUAL_CARD_DESCRIPTION_MAX, `${where} ${topic}: 설명 400자 이하`);
        ok(!/https?:\/\//.test(`${card.title}\n${card.description}`), `${where} ${topic}: 본문에 URL 없음`);
        ok(!String(card.description || "").includes("카카오톡에서"), `${where} ${topic}: ‘카카오톡에서’ 자기 지칭 없음`);
        eq(card.buttonLayout, "vertical", `${where} ${topic}: 세로 버튼`);
        ok(card.buttons.length >= 1 && card.buttons.length <= 5, `${where} ${topic}: 버튼 1~5개`);
        ok(card.buttons.every((b) => b.label && [...b.label].length <= 14), `${where} ${topic}: 버튼 이름 14자 이하`);
        eq(new Set(card.buttons.map((b) => b.messageText || b.action)).size, card.buttons.length, `${where} ${topic}: 같은 버튼이 두 번 나오지 않는다`);
        for (const b of card.buttons) {
          if (b.action === "message") {
            ok(b.messageText && !/https?:\/\//.test(b.messageText), `${where} ${topic}: ${b.label} 메시지 버튼`);
            seenButtonTexts.add(b.messageText);
          } else {
            ok(group && GROUP_PLUGINS.has(b.action), `${where} ${topic}: ${b.label} 플러그인은 단톡방에서만 (${b.action})`);
          }
        }
      }
      if (topic !== "home") {
        ok(outputs[0].textCard.buttons.some((b) => b.messageText === "사용 설명서"), `${where} ${topic}: 설명서 처음으로 돌아가는 버튼`);
      }
    }
  }

  // 모든 버튼 문장은 설명서 화면 또는 기존 명령으로 이어진다.
  for (const text of seenButtonTexts) {
    ok(!!kakaoManualTopic(text) || KNOWN_COMMAND(text), `버튼 문장 ‘${text}’ 이 처리되는 명령이다`);
  }
  for (const topic of Object.keys(ENTRY)) {
    if (topic === "home") continue;
    ok([...seenButtonTexts].some((text) => kakaoManualTopic(text) === topic), `첫 화면 등에서 ${topic} 화면으로 가는 버튼이 있다`);
  }

  // 단계 내용: 초등학생도 따라 하도록 번호 단계와 예시를 담는다.
  const record = (await callSkill("기록하는 법", true)).data.template.outputs[0].textCard;
  ok(record.description.includes("점심 12000원") && record.description.split("\n").length <= 4, "기록하는 법: 예시를 담은 짧은 안내");
  eq(record.buttons[0].action, "mention", "기록하는 법(단톡방): 첫 버튼은 바로 써 보는 챗봇 멘션");
  const recordDirect = (await callSkill("기록하는 법", false)).data.template.outputs[0].textCard;
  ok(recordDirect.buttons.every((b) => b.action === "message"), "기록하는 법(1:1): 플러그인 없이 메시지 버튼만");
  const budget = (await callSkill("예산 정하는 법", true)).data.template.outputs[0].textCard;
  ok(budget.description.includes("외식 예산설정"), "예산 정하는 법: 한 번에 설정하는 예시");
  eq(budget.buttons[0].messageText, "예산 설정", "예산 정하는 법: 첫 버튼은 실제 예산 설정 흐름");
  const recurring = (await callSkill("정기지출 설정 방법", true)).data.template.outputs[0].textCard;
  ok(recurring.description.includes("정기 수입·지출") && recurring.description.includes("매월"), "정기지출: 웹 정기 수입·지출 화면과 매월 자동 기록");
  const together = (await callSkill("함께 쓰는 법", true)).data.template.outputs[0].textCard;
  ok(together.buttons.some((b) => b.action === "inviteMember"), "함께 쓰기(단톡방): 친구 초대 플러그인");
  const togetherDirect = (await callSkill("함께 쓰는 법", false)).data.template.outputs[0].textCard;
  ok(!togetherDirect.buttons.some((b) => b.action === "inviteMember"), "함께 쓰기(1:1): 그룹 전용 초대 플러그인 없음");

  // 도움말·사용법은 설명서 첫 화면으로 답한다.
  for (const utterance of ["도움말", "사용법", "가이드", "@말해가계부 도움말"]) {
    for (const group of [true, false]) {
      const { data } = await callSkill(utterance, group);
      const first = data.template?.outputs?.[0]?.textCard;
      ok(first && first.title === "말해가계부 사용 설명서", `${group ? "단톡방" : "1:1"} ${utterance}: 설명서 첫 화면`);
    }
  }

  // OpenBuilder 블록 발화가 스킬로 넘어와도 설명서로 답한다(01_도움말_전체안내 → 첫 화면, 02_기록예시 → 기록하는 법).
  const firstTitle = async (utterance) => (await callSkill(utterance, true)).data.template?.outputs?.[0]?.textCard?.title || "";
  for (const utterance of ["처음 사용하는 법", "멍령어 알려줘", "가계부 사용법", "무엇을 할 수 있어", "명령어 알려줘", "가계부 사용법 알려줘", "사용법 알려줘", "메뉴 보여줘", "/도움말", "뭐할수있어", "뭐 할 수 있어", "안내", "설명", "가이드", "사용 방법", "사용법", "사용 설명서", "설명서"]) {
    eq(await firstTitle(utterance), "말해가계부 사용 설명서", `01 블록 발화 ‘${utterance}’ → 설명서 첫 화면`);
  }
  for (const utterance of ["수입 입력 예시", "지출 입력 예시", "어떻게 입력해", "가계부 입력 예시", "카톡 입력", "어떻게 입력", "수입 입력", "수입입력", "지출 입력", "지출입력", "입력하기", "입력 예시", "입력예시", "기록예시", "@말해가계부 입력 예시", "기록 방법"]) {
    eq(await firstTitle(utterance), "기록하는 법", `02 블록 발화 ‘${utterance}’ → 기록하는 법`);
  }
  ok(!(await firstTitle("기록 점심 12000원")), "‘기록 점심 12000원’은 거래 문장으로 남는다");

  // V22.9.67: 단톡방 메시지 버튼은 버튼 이름을 그대로 보낸다. 버튼 이름 = 보낼 명령, 이모지 없음, 짧은 안내.
  const PICTO = /[\p{Extended_Pictographic}\u{20E3}\u{FE0F}]/u;
  for (const [topic, utterance] of Object.entries(ENTRY)) {
    const { data } = await callSkill(utterance, true);
    for (const { textCard: card } of data.template.outputs) {
      ok(!PICTO.test(`${card.title}\n${card.description}`), `${topic}: 제목·설명에 이모지 없음(PC 카톡 글자 깨짐 방지)`);
      ok(String(card.description || "").split("\n").length <= 4 && String(card.description || "").length <= 120, `${topic}: 설명 4줄·120자 이하`);
      for (const b of card.buttons.filter((x) => x.action === "message")) {
        eq(b.label, b.messageText, `${topic}: 버튼 이름이 보낼 명령과 같다 (${b.label})`);
        ok(!PICTO.test(b.label), `${topic}: 버튼 이름에 이모지 없음 (${b.label})`);
      }
    }
    eq(data.template.outputs.length, 1, `${topic}: 말풍선 하나`);
  }
  // 예전 말풍선의 이모지 버튼 이름과 짧은 선택지 이름도 원래 화면·명령으로 이어진다.
  eq(await firstTitle("💰 예산 정하는 법"), "예산 정하는 법", "이모지가 붙은 예전 버튼 이름도 설명서로");
  eq(await firstTitle("@말해가계부 ✏️ 기록하는 법"), "기록하는 법", "멘션+이모지 버튼 이름도 설명서로");
  eq(await firstTitle("📊 리포트 보는 법"), "리포트 보는 법", "리포트 버튼 이름도 설명서로");
  eq(await firstTitle("🔁 매달 나가는 돈"), "정기지출 방법", "예전 매달 나가는 돈 버튼도 정기지출 화면으로");

  // 단톡방 선택지는 글과 버튼을 한 말풍선에 담고, 버튼 이름은 보낼 명령과 같다.
  {
    const start = (await callSkill("시작", true)).data.template.outputs;
    eq(start.length, 1, "단톡방 시작: 글과 버튼을 한 말풍선에");
    ok(start[0].textCard && start[0].textCard.description && start[0].textCard.buttons.length >= 3, "단톡방 시작: textCard 설명 + 버튼");
    ok(start[0].textCard.buttons.every((b) => b.label === b.messageText), "단톡방 시작: 버튼 이름 = 명령");
    ok(!start.some((o) => o.textCard?.title === "👇 눌러서 골라 주세요"), "별도 ‘눌러서 골라 주세요’ 말풍선 없음");
  }

  // 기존 동작 명령·거래 문장은 설명서가 가로채지 않는다.
  for (const text of ["예산 설정", "남은 예산", "오늘 기록 보기", "이번 달 요약", "정산", "웹 가계부 열기", "초대코드", "단톡방 연결", "내 이름 설정", "시작", "점심 12000원", "수정 01번 금액 13000", "삭제 01번", "통계", "자동차보험"]) {
    eq(kakaoManualTopic(text), "", `‘${text}’ 은 설명서가 가로채지 않는다`);
  }

  // 단톡방 quickReplies → 세로 메시지 버튼 카드(5개씩, 말풍선 3개 이내).
  const start = await callSkill("시작", true);
  const startOutputs = start.data.template.outputs;
  ok(startOutputs.length <= 3, "단톡방 시작: 말풍선 3개 이내");
  const startButtons = startOutputs.flatMap((o) => o.textCard?.buttons || []);
  ok(startButtons.length >= 3 && startButtons.every((b) => b.action === "message" && b.messageText), "단톡방 시작: 선택지가 메시지 버튼으로 바뀐다");
  ok(!startOutputs.some((o) => String(o.simpleText?.text || "").includes("선택하려면 아래 문구를 그대로 입력해 주세요.")), "단톡방 시작: 글자 선택 목록 없음");
  ok(startOutputs.filter((o) => o.textCard).every((o) => o.textCard.buttons.length <= 5), "단톡방 시작: 카드당 버튼 5개 이하");

  console.log(`V22.9.65 버튼형 사용 설명서 검사 통과 (${checks} checks)`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
