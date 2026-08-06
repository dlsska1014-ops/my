import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.73-CALENDAR-CHALLENGE-SECURITY"'), "runtime exposes the kakao parsing fix release");

// 1. 조사 제거는 낱말 끝에서만 일어나야 한다.
ok(source.includes('.replace(/([가-힣A-Za-z0-9]{2,})(에서|으로|에게|한테)(?=\\s|$)/g, "$1 ")'), "particles are stripped only at word endings");
ok(!/\.replace\(\/\(에서\|으로\|로\|에\|에게\|한테\|을\|를\|은\|는\|이\|가\|/.test(source), "the position-blind particle stripper is gone");

// 2. 접속사 분리는 낱말 경계에서만 일어나야 한다.
ok(source.includes("(?<=^|\\s)(?:그리고|또|추가로|다음으로)\\s+"), "conjunctions split only at word boundaries");
ok(source.includes("(?<=[가-힣]{2})(?:랑|하고)\\s+"), "particle-style conjunctions need a two-syllable stem");

// 3. 중복 방지는 실제 저장 뒤에만 걸려야 한다.
ok(source.includes("function armKakaoRepeatGuard("), "repeat guard is armed by a separate step");
ok(source.includes("armKakaoRepeatGuard(repeat.key, responsePreview)"), "repeat guard is armed from the response");
const guardStart = source.indexOf("function checkKakaoRepeatGuard(");
const guardBody = source.slice(guardStart, source.indexOf("\n}\n", guardStart));
ok(!guardBody.includes("AB_KAKAO_REPEAT_GUARD.set("), "the check step no longer locks the utterance by itself");

const ORIGIN = "https://ttokttok-accountbook.com";

async function say(fixture, utterance, userKey = "kakao_login:2265") {
  const payload = {
    userRequest: { utterance, user: { id: userKey, properties: {} } },
    action: { params: {}, detailParams: {} },
    bot: { id: "bot" },
    intent: { id: "intent", name: "폴백블록" },
  };
  const response = await app.fetch(new Request(`${ORIGIN}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }), fixture.env, {});
  const raw = await response.text();
  let text = raw;
  try { text = String(JSON.parse(raw)?.template?.outputs?.[0]?.simpleText?.text || raw); } catch (_error) {}
  return { status: response.status, text };
}

const savedMemo = (text) => {
  const m = String(text).match(/\d+번\s*-\s*(.+?)\s*\//);
  return m ? m[1].trim() : "";
};

const fixture = await createV2265QaFixture();
try {
  // 이 계정은 가계부가 둘이라 첫 발화에서 선택 안내가 뜬다. 선택을 마치고 시작한다.
  await say(fixture, "안녕");
  const picked = await say(fixture, "2");
  ok(picked.text.includes("선택했어요"), "가계부를 선택할 수 있다");

  // ── 메모 보존 ────────────────────────────────────────────────
  // 조사 제거와 접속사 분리가 낱말 안쪽을 건드리면 내용이 통째로 사라진다.
  const MEMO_WORDS = [
    "자동차점검", "타이어교체", "이발", "이사비용", "가스비", "이유식", "가전제품",
    "로또", "은행수수료", "이마트", "가습기", "이자", "가족외식", "은박지", "이불",
    "로션", "라이터", "가위", "이어폰", "가방", "에어컨", "사랑", "가랑비", "또또",
    "을지로식당", "생각", "하고",
  ];
  const broken = [];
  for (const word of MEMO_WORDS) {
    const reply = await say(fixture, `${word} 10000`);
    const memo = savedMemo(reply.text);
    eq(reply.status, 200, `${word}: 스킬이 200으로 응답한다`);
    if (memo !== word) broken.push(`${word}→${memo || "(사라짐)"}`);
  }
  eq(broken.join(", "), "", `메모가 입력 그대로 저장된다 (${broken.join(", ") || "이상 없음"})`);

  // 조사가 붙은 입력은 여전히 정리된다.
  for (const [utterance, expected] of [["마트에서 12000", "마트"], ["친구에게 20000", "친구"], ["병원 3000 결제", "병원"]]) {
    const reply = await say(fixture, utterance);
    eq(savedMemo(reply.text), expected, `"${utterance}" 의 조사·서술어는 계속 정리된다`);
  }

  // ── 여러 건 분리 ──────────────────────────────────────────────
  for (const utterance of ["커피 3100 그리고 점심 8100", "우유 3200랑 두부 8200", "택시 5300 또 버스 1300"]) {
    const before = fixture.db.transactions.length;
    const reply = await say(fixture, utterance);
    eq(fixture.db.transactions.length - before, 2, `"${utterance}" 는 2건으로 나뉘어 저장된다`);
    ok(/2건/.test(reply.text), `"${utterance}" 결과 안내에 건수가 나온다`);
  }

  // ── 중복 방지 ────────────────────────────────────────────────
  // 저장이 일어난 뒤에만 잠긴다.
  const dupBefore = fixture.db.transactions.length;
  const first = await say(fixture, "중복확인 4500");
  ok(first.text.includes("저장했어요"), "첫 입력은 저장된다");
  const second = await say(fixture, "중복확인 4500");
  ok(second.text.includes("방금 같은 내용"), "곧바로 같은 내용을 다시 보내면 막힌다");
  eq(fixture.db.transactions.length - dupBefore, 1, "중복 입력은 한 건만 저장된다");

  // 저장되지 않은 응답은 잠그지 않는다. 잠그면 다시 보내도 영영 저장되지 않는다.
  const failBefore = fixture.db.transactions.length;
  const miss1 = await say(fixture, "ㅁㄴㅇㄹㅎㅈ");
  const miss2 = await say(fixture, "ㅁㄴㅇㄹㅎㅈ");
  ok(!miss1.text.includes("방금 같은 내용"), "인식 실패 응답은 중복 안내가 아니다");
  ok(!miss2.text.includes("방금 같은 내용"), "인식 실패 뒤 같은 문구를 다시 보내도 막히지 않는다");
  eq(fixture.db.transactions.length, failBefore, "인식 실패는 아무것도 저장하지 않는다");
} finally {
  fixture.restore();
}

// 가계부를 고르는 중이라 저장되지 않은 요청도 잠기면 안 된다.
const second = await createV2265QaFixture();
try {
  const prompt = await say(second, "자동차점검 6만원");
  ok(prompt.text.includes("선택해 주세요"), "가계부가 여럿이면 선택 안내가 먼저 뜬다");
  eq(second.db.transactions.filter((t) => t.memo === "자동차점검").length, 0, "선택 안내 단계에서는 저장되지 않는다");
  await say(second, "2");
  const retry = await say(second, "자동차점검 6만원");
  ok(retry.text.includes("저장했어요"), "가계부를 고른 뒤 같은 문구를 다시 보내면 저장된다");
  eq(savedMemo(retry.text), "자동차점검", "재입력한 메모가 그대로 남는다");
  eq(second.db.transactions.filter((t) => t.memo === "자동차점검").length, 1, "재입력은 정확히 한 건만 저장한다");
} finally {
  second.restore();
}

console.log(`PASS: V22.8.69 kakao memo and repeat guard (${checks} checks)`);
