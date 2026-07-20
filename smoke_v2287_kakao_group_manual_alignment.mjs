import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "./src/index.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const env = {
  APP_NAME: "똑똑한가계부",
  PUBLIC_BASE_URL: "https://ttokttok-accountbook.com",
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
    bot: { id: "test-bot", name: "똑똑한가계부" },
    action: { id: "start-action", name: "시작", params: {}, detailParams: {}, clientExtra: {} },
    contexts: [],
    futureRootField: ["ignored"],
  };
}

async function callSkill(payload) {
  const response = await app.fetch(new Request("https://ttokttok-accountbook.com/skill", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  }), env, {});
  return { response, data: JSON.parse(await response.text()) };
}

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
ok(groupText.includes("선택하려면 아래 문구를 그대로 입력해 주세요."), "quick replies become explicit typed-choice guidance");
ok(groupText.includes("1. 새 가계부 만들기"), "first guided choice is preserved as text");
ok(groupText.includes("2. 초대코드로 참여"), "second guided choice is preserved as text");
ok(groupText.length <= 950, "group simpleText remains within the safe length");
eq(group.response.headers.get("x-accountbook-version"), "V22.8.8-PREDICTABLE-ACTION-FEEDBACK", "runtime header reports V22.8.8");

const source = readFileSync(new URL("./src/index.js", import.meta.url), "utf8");
const userKeyStart = source.indexOf("function getKakaoUserKey(payload)");
const userKeyEnd = source.indexOf("function getKakaoIdentityAliases", userKeyStart);
const userKeySource = source.slice(userKeyStart, userKeyEnd);
ok(userKeySource.indexOf("props.botUserKey") < userKeySource.indexOf("props.appUserId"), "botUserKey stays ahead of appUserId");
ok(userKeySource.indexOf("props.appUserId") < userKeySource.indexOf("props.plusfriendUserKey"), "plusfriendUserKey remains legacy fallback only");

console.log(`smoke_kakao_group_manual_alignment: ${checks} checks passed`);
