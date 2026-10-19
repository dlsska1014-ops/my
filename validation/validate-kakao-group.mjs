import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const env = {
  APP_NAME: "말해가계부",
  PUBLIC_BASE_URL: "https://malhaebook.com",
  INCOMPLETE_FEATURE_QA_ENABLED: "1",
  ADMIN_API_TOKEN: "qa-kakao-skill-token",
};

function skillPayload({ userKey, groupKey = "" }) {
  return {
    intent: { id: "start-intent", name: "시작" },
    userRequest: {
      timezone: "Asia/Seoul",
      params: {},
      block: { id: "start-block", name: "시작" },
      utterance: "시작",
      lang: "ko",
      user: {
        id: userKey,
        type: "botUserKey",
        properties: {
          botUserKey: userKey,
          ...(groupKey ? { botGroupKey: groupKey } : {}),
          futureKakaoField: "unknown-fields-must-be-tolerated",
        },
      },
      futureRequestField: { enabled: true },
    },
    bot: { id: "test-bot", name: "말해가계부" },
    action: { id: "start-action", name: "시작", params: {}, detailParams: {}, clientExtra: {} },
    contexts: [],
    futureRootField: ["ignored"],
  };
}

async function callSkill(payload, { authorized = true } = {}) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (authorized) headers.authorization = `Bearer ${env.ADMIN_API_TOKEN}`;
  const response = await app.fetch(new Request("https://malhaebook.com/skill", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  }), env, {});
  return { response, data: JSON.parse(await response.text()) };
}

const blockedPayload = await callSkill(skillPayload({ userKey: "qa-blocked-v2287" }), { authorized: false });
eq(blockedPayload.response.status, 200, "unauthenticated QA-shaped skill request returns the Kakao-safe response envelope");
ok(JSON.stringify(blockedPayload.data).includes("잠시 처리 흐름을 정리"), "unauthenticated QA-shaped skill request cannot execute the test conversation");

const blockedFixture = await app.fetch(new Request("https://malhaebook.com/kakao-skill-test-payload.json"), env, {});
eq(blockedFixture.status, 404, "Kakao test fixture is hidden without authenticated QA access");
const allowedFixture = await app.fetch(new Request("https://malhaebook.com/kakao-skill-test-payload.json", {
  headers: { authorization: `Bearer ${env.ADMIN_API_TOKEN}` },
}), env, {});
eq(allowedFixture.status, 200, "authenticated QA mode can still retrieve the Kakao test fixture");

const direct = await callSkill(skillPayload({ userKey: "qa-direct-v2287" }));
eq(direct.response.status, 200, "direct skill request succeeds");
eq(direct.data.version, "2.0", "direct response keeps Kakao version 2.0");
ok(Array.isArray(direct.data.template?.quickReplies), "direct chat keeps guided quick replies");
ok(direct.data.template.quickReplies.length >= 3, "direct chat keeps the start choices");
ok(direct.data.template.quickReplies.every((item) => item.action === "message" && item.messageText), "direct quick replies remain valid message actions");

const group = await callSkill(skillPayload({ userKey: "qa-group-v2287", groupKey: "qa-bot-group-v2287" }));
eq(group.response.status, 200, "group skill request with unknown future fields succeeds");
eq(group.data.version, "2.0", "group response keeps Kakao version 2.0");
ok(!Object.hasOwn(group.data.template || {}, "quickReplies"), "group response never emits unsupported quickReplies");
ok(Array.isArray(group.data.template?.outputs) && group.data.template.outputs.length >= 1, "group response has at least one output");
ok(group.data.template.outputs.length <= 3, "group response stays within the output limit");

const supported = new Set(["simpleText", "simpleImage", "textCard", "basicCard", "listCard", "itemCard"]);
ok(group.data.template.outputs.every((output) => Object.keys(output).length === 1 && supported.has(Object.keys(output)[0])), "group response only uses group-manual output components");
const groupText = group.data.template.outputs.map((output) => output?.simpleText?.text || "").join("\n");
// V22.9.65: 그룹에서 quickReplies 는 글자 목록이 아니라 textCard 세로 메시지 버튼으로 바뀐다.
const choiceButtons = group.data.template.outputs.flatMap((output) => output?.textCard?.buttons || []);
ok(!groupText.includes("선택하려면 아래 문구를 그대로 입력해 주세요."), "quick replies no longer become a typed-choice list");
ok(choiceButtons.length >= 3 && choiceButtons.every((b) => b.action === "message" && b.messageText && String(b.label || "").length <= 14), "quick replies become tappable message buttons");
ok(choiceButtons.some((b) => b.messageText === "기록 방법") && choiceButtons.some((b) => b.messageText === "새 가계부 만들기"), "first record and create choices are preserved as buttons");
ok(choiceButtons.some((b) => b.messageText === "초대코드로 참여"), "join choice is preserved as a button");
ok(group.data.template.outputs.filter((o) => o.textCard).every((o) => o.textCard.buttons.length <= 5 && o.textCard.buttonLayout === "vertical"), "choice cards keep at most five vertical buttons");
ok(groupText.length <= 950, "group simpleText remains within the safe length");

// 카카오 심사 요청: 단톡방에서 봇만 멘션한 빈 발화는 짧은 안내와 도움말·챗봇 멘션하기 버튼으로 응답한다.
const emptyMentionPayload = (opts) => {
  const payload = skillPayload(opts);
  payload.userRequest.utterance = "@말해가계부";
  return payload;
};
const groupEmpty = await callSkill(emptyMentionPayload({ userKey: "qa-group-empty-v22941", groupKey: "qa-bot-group-empty-v22941" }));
eq(groupEmpty.response.status, 200, "group empty mention succeeds");
eq(groupEmpty.data.version, "2.0", "group empty mention keeps Kakao version 2.0");
ok(!Object.hasOwn(groupEmpty.data.template || {}, "quickReplies"), "group empty mention never emits quickReplies");
eq(groupEmpty.data.template?.outputs?.length, 1, "group empty mention is a single bubble");
const emptyCard = groupEmpty.data.template.outputs[0]?.textCard;
ok(emptyCard && typeof emptyCard === "object", "group empty mention uses a textCard so plugin buttons can be attached");
const emptyButtons = Array.isArray(emptyCard?.buttons) ? emptyCard.buttons : [];
eq(emptyButtons.length, 2, "group empty mention offers exactly two buttons");
ok(emptyButtons.some((b) => b.action === "guide" && b.label === "도움말"), "group empty mention has the guide (도움말) action button");
ok(emptyButtons.some((b) => b.action === "mention" && b.label === "챗봇 멘션하기"), "group empty mention has the mention (챗봇 멘션하기) action button");
ok(emptyButtons.every((b) => String(b.label || "").length <= 8), "group empty mention button labels fit the horizontal 8-character limit");
const emptyText = `${emptyCard?.title || ""}\n${emptyCard?.description || ""}`;
ok(!emptyText.includes("선택하려면 아래 문구를 그대로 입력해 주세요."), "group empty mention drops the typed-choice list");
ok(!/https?:\/\//.test(emptyText), "group empty mention stays URL-free");
const fullStartText = [
  "안녕하세요 😊", "카카오톡에서 함께 쓰는 말해가계부입니다.", "", "먼저 가계부를 만들어 보세요!",
  "가족 생활비, 부부·커플, 모임 회비, 여행 경비처럼 용도에 맞게 만들 수 있어요.", "",
  "이미 초대코드가 있다면 기존 가계부에 바로 참여할 수 있습니다.", "",
  "선택하려면 아래 문구를 그대로 입력해 주세요.", "1. 새 가계부 만들기", "2. 초대코드로 참여", "3. 도움말",
].join("\n");
ok(emptyText.length * 2 <= fullStartText.length, "group empty mention text is at most half of the previous start guidance");

const directEmpty = await callSkill(emptyMentionPayload({ userKey: "qa-direct-empty-v22941" }));
eq(directEmpty.response.status, 200, "direct empty utterance still succeeds");
ok(Array.isArray(directEmpty.data.template?.quickReplies) && directEmpty.data.template.quickReplies.length >= 3, "direct empty utterance keeps the guided start quick replies");
ok(!JSON.stringify(directEmpty.data).includes('"action":"mention"'), "1:1 chat never receives the group-only mention action");

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
eq(group.response.headers.get("x-accountbook-version"), (source.match(/const APP_VERSION = "([^"]+)"/) || [])[1], "runtime header reports the challenge and activity UX release");
const userKeyStart = source.indexOf("function getKakaoUserKey(payload)");
const userKeyEnd = source.indexOf("function getKakaoIdentityAliases", userKeyStart);
const userKeySource = source.slice(userKeyStart, userKeyEnd);
ok(userKeySource.indexOf("props.botUserKey") < userKeySource.indexOf("props.appUserId"), "botUserKey stays ahead of appUserId");
ok(userKeySource.indexOf("props.appUserId") < userKeySource.indexOf("props.plusfriendUserKey"), "plusfriendUserKey remains legacy fallback only");

console.log(`smoke_kakao_group_manual_alignment: ${checks} checks passed`);
