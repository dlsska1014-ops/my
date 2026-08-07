// V22.8.78: 11단계 마무리 — 적다가 화면을 떠나도 내용이 남는다
//
// 저장 실패는 V22.8.76 에서 초안으로 살렸지만, 그 초안은 "제출할 때"만 남겼다.
// 새로고침이나 화면 이탈은 경고 없이 일어나므로(beforeunload 리스너가 없다)
// 적던 내용이 말없이 사라졌다. 이제 적는 동안에도 남긴다.
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";
let checks = 0;

function ok(value, message) {
  checks++;
  if (!value) throw new Error(`FAIL: ${message}`);
}

function eq(actual, expected, message) {
  ok(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

// ---------------------------------------------------------------------------
// 1. 적는 동안 초안을 남긴다
// ---------------------------------------------------------------------------
ok(source.includes('form.addEventListener("input", function() {'), "적는 동안에도 초안을 남긴다");
ok(source.includes("draftTimer = setTimeout(function() { rememberDraft(form); }, 400);"), "글자마다 저장하지 않고 잠시 멈췄을 때 남긴다");
ok(source.includes("var DRAFT_MAX_AGE_MS = 30 * 60 * 1000;"), "오래된 초안은 되살리지 않도록 시한을 둔다");
ok(source.includes("if (draft.at && Date.now() - Number(draft.at) > DRAFT_MAX_AGE_MS) return false;"), "시한이 지난 초안은 버린다");

// 금액도 메모도 없으면 "적던 중"이 아니다. 날짜·유형은 기본값이라 신호가 못 된다.
ok(source.includes('if (field && field.value && (name === "amount" || name === "memo")) typed = true;'), "금액이나 메모가 있을 때만 적던 중으로 본다");
ok(source.includes("if (!typed) { forgetDraft(); return; }"), "아무것도 안 적었으면 초안을 남기지 않는다");

// 되살릴 때 이미 채워진 칸을 덮으면 사용자가 방금 고친 값이 날아간다.
ok(source.includes('if (field.value && name !== "transaction_date") return;'), "이미 적혀 있는 칸은 덮지 않는다");

// 성공했을 때만 버려야 한다. 그 밖에는 되살릴 기회를 줘야 새로고침을 견딘다.
ok(source.includes('if (params.get("msg")) { forgetDraft(); return; }'), "저장에 성공했을 때만 초안을 버린다");
ok(!source.includes('if (!params.get("err")) forgetDraft();'), "실패가 아니면 무조건 버리던 규칙이 남아 있지 않다");
ok(source.includes("if (restoreDraft()) {"), "시트를 열 때 초안을 되살린다");

// 초안은 브라우저 안에만 둔다. 주소로 돌리면 메모가 방문 기록에 남는다.
ok(source.includes('var DRAFT_KEY = "abQuickInputDraft";'), "초안은 브라우저 안에 둔다");
ok(source.includes("return window.sessionStorage;"), "탭을 닫으면 사라지는 저장소를 쓴다");

// ---------------------------------------------------------------------------
// 2. 카카오 그룹방에서 두 사람이 동시에 입력해도 서로를 막지 않는다
// ---------------------------------------------------------------------------
// 중복 방지 열쇠에 사용자 키가 들어가야 한다. 대화방만으로 잠그면 한 사람이
// 적는 동안 다른 사람 기록이 "방금 같은 내용"으로 막힌다.
ok(
  source.includes('const key = `${String(userKey || "unknown").slice(0, 80)}|${stableShortHash(conversationScope)}|${stableShortHash(text)}`;'),
  "중복 방지가 사람·대화방·내용을 모두 구분한다",
);

const fixture = await createV2265QaFixture();
const say = async (utterance, userKey) => {
  const response = await app.fetch(new Request(`${ORIGIN}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userRequest: { utterance, user: { id: userKey, properties: {} } },
      action: { params: {}, detailParams: {} },
      bot: { id: "bot" },
      intent: { id: "i", name: "폴백블록" },
    }),
  }), fixture.env, {});
  return String(JSON.parse(await response.text())?.template?.outputs?.[0]?.simpleText?.text || "");
};

// 사람마다 가계부 개수가 달라 번호를 고정하면 안 된다. 안내에서 "우리집 생활비"의
// 번호를 읽어 고른다. 가계부가 하나뿐인 사람은 안내 단계에서 이미 선택되기도 한다.
async function selectSharedHousehold(userKey) {
  const greeting = await say("안녕", userKey);
  if (greeting.includes("선택했어요")) return greeting;
  const numbered = greeting.split("\n").find((line) => /^\s*\d+\.\s*우리집 생활비/.test(line));
  const number = numbered ? numbered.trim().split(".")[0] : "1";
  return say(number, userKey);
}

for (const userKey of ["kakao_login:2265", "kakao_login:2266"]) {
  const picked = await selectSharedHousehold(userKey);
  ok(picked.includes("선택했어요"), `${userKey} 가 가계부를 고른다`);
}

{
  const before = fixture.db.transactions.length;
  const [first, second] = await Promise.all([say("회식 30000", "kakao_login:2265"), say("회식 30000", "kakao_login:2266")]);
  eq(fixture.db.transactions.length - before, 2, "두 사람이 같은 말을 동시에 보내면 둘 다 남는다");
  ok(first.includes("저장했어요") && second.includes("저장했어요"), "두 사람 모두 저장 안내를 받는다");
}

{
  const before = fixture.db.transactions.length;
  await Promise.all([say("주차비 4000", "kakao_login:2265"), say("주차비 4000", "kakao_login:2265")]);
  eq(fixture.db.transactions.length - before, 1, "같은 사람의 동시 재전송은 한 건만 남는다");
}

{
  const before = fixture.db.transactions.length;
  await Promise.all([say("커피 3000", "kakao_login:2265"), say("택시 9000", "kakao_login:2266")]);
  eq(fixture.db.transactions.length - before, 2, "두 사람이 다른 말을 동시에 보내도 둘 다 남는다");
}

await fixture.cleanup?.();
console.log(`PASS: V22.8.78 draft persistence and group concurrency (${checks} checks)`);
