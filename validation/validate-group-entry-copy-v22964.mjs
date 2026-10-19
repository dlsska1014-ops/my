// V22.9.64 — 단톡방 빈 멘션 안내 문구와 버튼 순서(카카오 승인권자 요청, 2026-10-19).
//
// 1) 이미 카카오톡 안에서 쓰는 챗봇이므로 사용자 응답에 "카카오톡에서" 같은 자기 지칭 문구를 넣지 않는다.
// 2) "아래 버튼으로 명령어를 고르거나 도움말에서 사용법을 확인해 주세요." 같은 버튼 설명 문구를 빼고,
//    친구와 함께 말 한마디로 기록하는 가계부라는 소개와 바로 따라 할 수 있는 예시만 둔다.
// 3) 버튼은 바로 행동할 수 있는 '챗봇 멘션하기'를 먼저, '도움말'을 그다음에 둔다.

import { readFileSync } from "node:fs";
import app from "../src/index.js";

let checks = 0;
const ok = (value, label) => { if (!value) throw new Error(`FAIL: ${label}`); checks += 1; };
const eq = (actual, expected, label) => { if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`); checks += 1; };

const env = {
  APP_NAME: "말해가계부",
  PUBLIC_BASE_URL: "https://malhaebook.com",
  INCOMPLETE_FEATURE_QA_ENABLED: "1",
  ADMIN_API_TOKEN: "qa-kakao-skill-token",
};

function payloadFor({ userKey, groupKey = "", utterance }) {
  return {
    intent: { id: "fallback-intent", name: "폴백 블록" },
    userRequest: {
      timezone: "Asia/Seoul",
      params: {},
      block: { id: "fallback-block", name: "폴백 블록" },
      utterance,
      lang: "ko",
      user: { id: userKey, type: "botUserKey", properties: { botUserKey: userKey, ...(groupKey ? { botGroupKey: groupKey } : {}) } },
    },
    bot: { id: "test-bot", name: "말해가계부" },
    action: { id: "fallback-action", name: "폴백", params: {}, detailParams: {}, clientExtra: {} },
    contexts: [],
  };
}

async function callSkill(payload) {
  const response = await app.fetch(new Request("https://malhaebook.com/skill", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${env.ADMIN_API_TOKEN}` },
    body: JSON.stringify(payload),
  }), env, {});
  return { response, data: JSON.parse(await response.text()) };
}

try {
  const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const versionText = readFileSync(new URL("../VERSION.txt", import.meta.url), "utf8").trim();
  eq((source.match(/const APP_VERSION = "([^"]+)"/) || [])[1], versionText, "APP_VERSION 이 VERSION.txt 와 같다");

  // 빈 멘션(@말해가계부만 보낸 경우) 응답
  for (const utterance of ["@말해가계부", "@말해가계부 ", " @말해가계부"]) {
    const result = await callSkill(payloadFor({ userKey: `qa-entry-copy-${checks}`, groupKey: "qa-group-entry-copy-v22964", utterance }));
    eq(result.response.status, 200, `${utterance}: 응답 성공`);
    const outputs = result.data?.template?.outputs || [];
    eq(outputs.length, 1, `${utterance}: 말풍선 하나`);
    const card = outputs[0]?.textCard;
    ok(card && typeof card === "object", `${utterance}: textCard 로 응답`);
    eq(card.title, "안녕하세요 😊 말해가계부예요", `${utterance}: 인사 제목 유지`);
    eq(card.description, "친구와 함께 말 한마디로 간단히 기록하는 가계부 챗봇이에요.\n예) @말해가계부 점심 12000원", `${utterance}: 새 소개 문구`);
    const text = `${card.title}\n${card.description}`;
    ok(!text.includes("카카오톡에서"), `${utterance}: '카카오톡에서' 자기 지칭 문구 없음`);
    ok(!text.includes("아래 버튼으로") && !text.includes("도움말에서 사용법"), `${utterance}: 버튼 설명 문구 없음`);
    ok(!/https?:\/\//.test(text), `${utterance}: URL 없음`);
    ok(text.length <= 80, `${utterance}: 짧은 안내 유지 (${text.length}자)`);
    const buttons = Array.isArray(card.buttons) ? card.buttons : [];
    eq(buttons.length, 2, `${utterance}: 버튼 두 개`);
    eq(buttons[0]?.action, "mention", `${utterance}: 첫 버튼은 바로 행동하는 챗봇 멘션`);
    eq(buttons[0]?.label, "챗봇 멘션하기", `${utterance}: 첫 버튼 이름`);
    // V22.9.68: 도움말은 버튼형 사용 설명서를 여는 메시지 버튼이다(버튼 이름 = 보낼 명령).
    eq(buttons[1]?.action, "message", `${utterance}: 두 번째 버튼은 설명서 메시지`);
    eq(buttons[1]?.messageText, "사용 설명서", `${utterance}: 설명서 버튼이 보낼 명령`);
    eq(buttons[1]?.label, "사용 설명서", `${utterance}: 두 번째 버튼 이름`);
    ok(!Object.hasOwn(result.data.template, "quickReplies"), `${utterance}: 단톡방 응답에 quickReplies 없음`);
  }

  // 1:1 빈 발화와 시작 안내도 "카카오톡에서" 문구를 쓰지 않는다.
  for (const utterance of ["@말해가계부", "시작"]) {
    const direct = await callSkill(payloadFor({ userKey: `qa-entry-direct-${checks}`, utterance }));
    eq(direct.response.status, 200, `1:1 ${utterance}: 응답 성공`);
    const body = JSON.stringify(direct.data);
    ok(!body.includes("카카오톡에서"), `1:1 ${utterance}: '카카오톡에서' 문구 없음`);
    ok(!body.includes('"action":"mention"'), `1:1 ${utterance}: 그룹 전용 멘션 버튼 없음`);
  }

  // 카카오 스킬 응답 모듈 전체에서 사용자에게 보내는 '카카오톡에서' 자기 지칭이 사라졌다.
  // reply-texts.js 의 운영자 진단 문구(오픈빌더 폴백 설명)는 관리자용이라 예외로 둔다.
  for (const file of ["response-builders.js", "household-budget-commands.js", "skill-handler.js", "group-links-first-record.js"]) {
    const moduleSource = readFileSync(new URL(`../src/modules/kakao/${file}`, import.meta.url), "utf8");
    ok(!moduleSource.includes("카카오톡에서"), `${file}: '카카오톡에서' 사용자 문구 없음`);
  }
  ok(source.includes("친구와 함께 말 한마디로 기록하는 말해가계부입니다."), "1:1 시작 안내 새 문구가 번들에 있다");
  ok(source.includes("말 한마디로 기록·예산·요약을 바로 사용할 수 있어요."), "가계부 연결 후 시작 안내 새 문구가 번들에 있다");

  console.log(`V22.9.64 단톡방 입장 문구·버튼 순서 검사 통과 (${checks} checks)`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
