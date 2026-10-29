// V22.9.88 Y-7 — 카카오 그룹 챗봇 심사 의견(2026-10-29)의 동작 검사: 챗봇 답의 글에 http(s) 주소를 직접 넣지 않고,
// 버튼을 누르면 그 페이지가 바로 열리게 한다.
//
// ── 이 파일이 왜 생겼는지 ──
// 단톡방에서 ‘웹가계부’를 보내면 "웹 가계부 / https://malhaebook.com/my / 로그인 후 …" 처럼 주소를 글로 돌려줬다. 심사 담당자가
// "챗봇 응답에 http://~ url이 직접적으로 들어가지 않도록, 버튼 클릭 시 해당 페이지가 열리도록" 고쳐 달라고 했다. 같은 모양의 주소 줄이
// 요약의 ‘상세 분석 보기’, 초대코드의 ‘참여자·초대 관리’, 개인정보·키워드 안내, 하루 기록 목록 등 15곳 남짓에 있었다.
//
// ── 어떻게 잡는가 ──
// 1) 응답 마무리 함수(kakaoGroupCompatibleResponse)에 합성 응답을 넣어 바꾸는 규칙을 하나씩 본다.
// 2) 메모리 픽스처(DB·서버 없음)의 실제 /skill 로 단톡방·1:1 명령을 두루 보내, 어느 답의 글에도 주소가 없고 링크 버튼은 우리 주소만
//    여는지 본다. 예전 코드에서는 ‘(예전: …)’ 의 결과가 나온다.
// 사용: node validation/validate-kakao-link-buttons-v22988.mjs
import { kakaoGroupCompatibleResponse, kakaoText } from "../src/modules/kakao/response-builders.js";
import { KAKAO_REPRESENTATIVE_COMMANDS, KAKAO_SECONDARY_COMMANDS } from "../src/modules/public/site-config.js";
import { app, BASE, counter, fixture } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.88 Y-7 카카오 답 링크 버튼(글에 주소 없음·버튼으로 열기)");
const URL_TEXT = /https?:\/\//i;
const ROOM = "link-buttons-room";
const groupPayload = { userRequest: { utterance: "x", user: { id: "u", type: "botUserKey", properties: { botUserKey: "u" } }, chat: { id: ROOM, type: "botGroupKey", properties: { botGroupKey: ROOM } } } };
const directPayload = { userRequest: { utterance: "x", user: { id: "u", type: "botUserKey", properties: { botUserKey: "u" } } } };
const finish = async (response, payload) => (await kakaoGroupCompatibleResponse(response, payload, BASE)).json();
const cards = (body) => (body.template?.outputs || []).map((output) => output.textCard || output.basicCard).filter(Boolean);
const textsOf = (body) => (body.template?.outputs || []).flatMap((output) => {
  const value = Object.values(output)[0] || {};
  return [value.text, value.title, value.description].filter((text) => typeof text === "string");
});
const buttonsOf = (body) => cards(body).flatMap((card) => card.buttons || []);
const links = (body) => buttonsOf(body).filter((button) => button.action === "webLink");

// ── 1. 바꾸는 규칙 ──────────────────────────────────────────────────────────────
{
  const body = await finish(kakaoText(["👥 구성원 초대하기", "초대코드: ABC", "참여자·초대 관리", `${BASE}/my/households`].join("\n"), [["단톡방연결", "단톡방연결"], ["도움말 보기", "도움말 보기"]]), groupPayload);
  t.ok(textsOf(body).every((text) => !URL_TEXT.test(text)), "Y-7-A 단톡방 답 글에서 주소 줄을 뺀다 (예전: ‘https://malhaebook.com/my/households’ 가 글에 남음)");
  t.deepEq(links(body).map((button) => [button.label, button.webLinkUrl]), [["참여자·초대 관리", `${BASE}/my/households`]], "Y-7-A 주소는 링크 버튼이 되고, 바로 앞의 짧은 줄이 버튼 이름이 된다");
  t.eq(body.template.outputs.length, 1, "Y-7-A 글과 버튼이 한 말풍선에 들어간다");
  t.deepEq(buttonsOf(body).map((button) => button.action), ["webLink", "message", "message"], "Y-7-A 링크 버튼이 메시지 버튼보다 앞에 온다");
  t.ok(!cards(body)[0].description.includes("참여자·초대 관리"), "Y-7-A 버튼 이름으로 쓴 줄은 글에서 뺀다");
}
{
  const body = await finish(kakaoText(`키워드 등록·수정은 웹 가계부 설정 화면에서 할 수 있어요.\n${BASE}/my/settings`), groupPayload);
  t.deepEq(links(body).map((button) => button.label), ["설정 열기"], "Y-7-B 앞 줄이 문장이면 주소 경로로 버튼 이름을 정한다(/my/settings → 설정 열기)");
  t.ok(cards(body)[0].description.endsWith("할 수 있어요."), "Y-7-B 앞 문장은 글에 남는다");
}
{
  const body = await finish(kakaoText(`메모 https://evil.example/a?x=1 확인\n자세히 보기\n${BASE}/privacy.`), groupPayload);
  t.ok(textsOf(body).every((text) => !URL_TEXT.test(text) && !text.includes("evil.example")), "Y-7-C 다른 곳 주소는 글에서도 지운다 (예전: 글에 그대로)");
  t.ok(textsOf(body).some((text) => text.includes("메모 (링크) 확인")), "Y-7-C 다른 곳 주소 자리는 ‘(링크)’ 로 남긴다");
  t.deepEq(links(body).map((button) => button.webLinkUrl), [`${BASE}/privacy`], "Y-7-C 링크 버튼은 우리 주소만 연다(다른 곳 주소는 버튼으로 만들지 않음, 끝의 마침표는 주소가 아님)");
}
{
  const body = await finish(kakaoText(`Skill URL: ${BASE}/skill`), groupPayload);
  t.deepEq(links(body).map((button) => button.label), ["Skill URL"], "Y-7-D 한 줄 안의 ‘이름: 주소’ 는 이름을 버튼 이름으로 쓴다");
  t.ok(!cards(body)[0].description, "Y-7-D 주소만 있던 답은 글 없이 버튼 카드가 된다");
  t.eq(cards(body)[0].title, "바로 열기", "Y-7-D 글이 비면 카드 제목은 ‘바로 열기’");
}
{
  const long = `${"긴 안내 문장입니다. ".repeat(40)}\n상세 분석 보기\n${BASE}/my/analysis?month=2026-10`;
  const body = await finish(kakaoText(long), groupPayload);
  t.ok(body.template.outputs[0].simpleText && !URL_TEXT.test(body.template.outputs[0].simpleText.text), "Y-7-E 400자가 넘는 글은 말풍선 글로 두고 주소만 뺀다");
  t.eq(cards(body)[0]?.title, "바로 열기", "Y-7-E 링크 버튼은 뒤의 ‘바로 열기’ 카드에 둔다");
  t.deepEq(links(body).map((button) => button.label), ["상세 분석 보기"], "Y-7-E 버튼 이름은 앞 줄");
}
{
  const body = await finish(kakaoText(`안내\n자세히 보기\n${BASE}/privacy`, [["오늘기록", "오늘기록"]]), directPayload);
  t.deepEq(links(body).map((button) => button.webLinkUrl), [`${BASE}/privacy`], "Y-7-F 1:1 답도 주소를 링크 버튼으로 옮긴다 (예전: 글에 주소)");
  t.deepEq((body.template.quickReplies || []).map((reply) => reply.label), ["오늘기록"], "Y-7-F 1:1 의 바로가기(quickReplies)는 그대로 둔다");
  t.ok(textsOf(body).every((text) => !URL_TEXT.test(text)), "Y-7-F 1:1 답 글에도 주소가 없다");
  const plain = kakaoText("주소 없는 답", [["오늘기록", "오늘기록"]]);
  const before = await plain.clone().text();
  t.eq(await (await kakaoGroupCompatibleResponse(plain, directPayload, BASE)).text(), before, "Y-7-F 주소 없는 1:1 답은 바뀌지 않는다");
}
{
  const response = new Response(JSON.stringify({ version: "2.0", template: { outputs: [{ textCard: { description: `요약\n상세 분석 보기\n${BASE}/my/analysis`, buttons: [{ label: "오늘기록", action: "message", messageText: "오늘기록" }, { label: "기록하기", action: "mention" }], buttonLayout: "vertical" } }] } }), { headers: { "content-type": "application/json" } });
  const body = await finish(response, groupPayload);
  t.deepEq(buttonsOf(body).map((button) => button.label), ["상세 분석 보기", "오늘기록", "기록하기"], "Y-7-G 카드 글 속 주소는 그 카드 버튼 앞쪽에 넣고 ‘기록하기’(멘션)는 맨 아래에 둔다");
  // 1:1 은 같은 카드라도 ‘웹가계부’ 메시지 버튼을 그대로 둔다(1:1 답은 웹 연결 코드를 준다). 글에 주소를 넣어 마무리 함수가 카드를 실제로 고치게 한다.
  const ledgerCard = (description) => new Response(JSON.stringify({ version: "2.0", template: { outputs: [{ textCard: { title: "웹관리하기", description, buttons: [{ label: "웹가계부", action: "message", messageText: "웹가계부" }, { label: "도움말 보기", action: "message", messageText: "도움말 보기" }] } }] } }), { headers: { "content-type": "application/json" } });
  const group = await finish(ledgerCard("안내"), groupPayload);
  t.deepEq(buttonsOf(group)[0], { label: "웹가계부", action: "webLink", webLinkUrl: `${BASE}/my` }, "Y-7-G 단톡방의 ‘웹가계부’ 메시지 버튼은 바로 열리는 링크 버튼이 된다 (예전: 누르면 주소 글을 받음)");
  const direct = await finish(ledgerCard(`안내\n자세히 보기\n${BASE}/privacy`), directPayload);
  t.deepEq(buttonsOf(direct).map((button) => [button.label, button.action]), [["자세히 보기", "webLink"], ["웹가계부", "message"], ["도움말 보기", "message"]], "Y-7-G 1:1 은 카드 글 속 주소를 버튼으로 옮겨도 ‘웹가계부’ 는 메시지 버튼으로 둔다(웹 연결 코드를 주는 답)");
}
// 경계(같은 날 다시 본 것): 한글이 붙은 주소·목록 줄·괄호로 감싼 주소·말풍선 3개·줄 가운데 주소·카드 버튼 자리.
{
  const body = await finish(kakaoText(`웹 가계부 ${BASE}/my에서 보세요`), groupPayload);
  t.deepEq(links(body).map((button) => [button.label, button.webLinkUrl]), [["웹 가계부 열기", `${BASE}/my`]], "Y-7-H 주소 뒤에 붙은 한글은 주소가 아니다(버튼 주소가 /my%EC… 로 깨지지 않음)");
  t.eq(cards(body)[0].description, "웹 가계부에서 보세요", "Y-7-H 줄 가운데 주소를 뺀 나머지 글은 버튼 이름으로 쓰지 않고, 붙어 있던 낱말과 이어 글에 남긴다");
}
{
  const body = await finish(kakaoText(`카테고리\n• 택시: 8,000원\n${BASE}/my`), groupPayload);
  t.ok(cards(body)[0].description.endsWith("• 택시: 8,000원"), "Y-7-I 주소 바로 앞의 목록 줄은 버튼 이름으로 먹지 않는다(본문이 사라지지 않음)");
  t.deepEq(links(body).map((button) => button.label), ["웹 가계부 열기"], "Y-7-I 이때 버튼 이름은 주소 경로로 정한다");
  const header = await finish(kakaoText(`📊 이번 달\n${BASE}/my`), groupPayload);
  t.eq(cards(header)[0].description, "📊 이번 달", "Y-7-I 그림 글자로 시작하는 머리 줄도 버튼 이름으로 쓰지 않는다");
}
{
  const body = await finish(kakaoText(`웹 가계부(${BASE}/my)에서 확인하세요.`), groupPayload);
  t.eq(cards(body)[0].description, "웹 가계부에서 확인하세요.", "Y-7-J 괄호로 감싼 주소는 괄호까지 뺀다(빈 ‘(’ 가 남지 않음)");
  t.deepEq(links(body).map((button) => button.webLinkUrl), [`${BASE}/my`], "Y-7-J 닫는 괄호는 버튼 주소에 넣지 않는다");
  const foreign = await finish(kakaoText("메모 (https://example.com/a) 확인"), groupPayload);
  t.ok(textsOf(foreign).includes("메모 (링크) 확인"), "Y-7-J 괄호 속 다른 곳 주소는 ‘(링크)’ 하나로 남는다");
}
for (const [name, payload] of [["단톡방", groupPayload], ["1:1", directPayload]]) {
  const reply = (outputs) => finish(new Response(JSON.stringify({ version: "2.0", template: { outputs } }), { headers: { "content-type": "application/json" } }), payload);
  const short = await reply([{ simpleText: { text: `첫 말\n상세 분석 보기\n${BASE}/my/analysis` } }, { simpleText: { text: "둘째 말" } }, { simpleText: { text: "가".repeat(450) } }]);
  t.deepEq(links(short).map((button) => button.webLinkUrl), [`${BASE}/my/analysis`], `Y-7-K ${name} 말풍선이 3개이고 마지막 글이 길어도 링크 버튼을 버리지 않는다`);
  t.ok(short.template.outputs.length <= 3 && textsOf(short).every((text) => !URL_TEXT.test(text)), `Y-7-K ${name} 말풍선은 3개 이하이고 글에 주소가 없다`);
  // 세 말풍선이 모두 400자를 넘으면 이웃한 둘을 한 글 말풍선으로 합쳐 자리를 만든다(글은 그대로).
  const long = await reply([{ simpleText: { text: `${"나".repeat(420)}\n자세히 보기\n${BASE}/privacy` } }, { simpleText: { text: "다".repeat(420) } }, { simpleText: { text: "라".repeat(420) } }]);
  t.deepEq(links(long).map((button) => [button.label, button.webLinkUrl]), [["자세히 보기", `${BASE}/privacy`]], `Y-7-K ${name} 세 말풍선이 모두 긴 글이어도 링크 버튼을 버리지 않는다 (검토 전: 버튼 없이 주소만 사라짐)`);
  t.ok(long.template.outputs.length <= 3 && ["나", "다", "라"].every((ch) => textsOf(long).join("").includes(ch.repeat(420))), `Y-7-K ${name} 합친 뒤에도 글은 모두 남고 말풍선은 3개 이하`);
}
{
  // 1:1 말풍선이 3개여도 짧은 글 말풍선(웹 연결 코드처럼 복사할 글)을 카드로 바꾸지 않는다.
  const outputs = [{ simpleText: { text: "첫" } }, { simpleText: { text: `둘\n자세히 보기\n${BASE}/privacy` } }, { simpleText: { text: "코드 ABCD-EFGH" } }];
  const body = await finish(new Response(JSON.stringify({ version: "2.0", template: { outputs } }), { headers: { "content-type": "application/json" } }), directPayload);
  t.ok(body.template.outputs.some((output) => output.simpleText?.text === "코드 ABCD-EFGH"), "Y-7-L 1:1 의 짧은 글 말풍선(복사할 코드)은 카드로 바꾸지 않는다 (검토 전: 카드 설명이 됨)");
  t.deepEq(links(body).map((button) => button.webLinkUrl), [`${BASE}/privacy`], "Y-7-L 이때 링크는 다른 글 둘을 합쳐 만든 자리의 ‘바로 열기’ 카드에 둔다");
}
{
  // 줄 가운데·문장 끝의 주소: 남은 글을 버튼 이름으로 먹지 않는다. 다른 곳 주소 자리 ‘(링크)’ 도 글에 남는다. 감싼 따옴표는 함께 지운다.
  const sentence = await finish(kakaoText(`자세한 내용은 ${BASE}/privacy.`), groupPayload);
  t.ok(cards(sentence)[0]?.description === "자세한 내용은." && links(sentence)[0]?.label === "웹에서 보기", "Y-7-M 문장 끝의 주소는 문장을 글에 남기고 버튼 이름은 경로로 정한다 (검토 전: 문장이 버튼 이름 ‘자세한 내용은’ 이 됨)");
  const mixed = await finish(kakaoText(`메모 https://evil.example/x ${BASE}/my`), groupPayload);
  t.ok(cards(mixed)[0]?.description === "메모 (링크)" && links(mixed)[0]?.label === "웹 가계부 열기", "Y-7-M 다른 곳 주소 자리 ‘(링크)’ 는 글에 남고 버튼 이름이 되지 않는다");
  const quoted = await finish(kakaoText(`주소 '${BASE}/my' 에서`), groupPayload);
  t.ok(!/['‘’]/.test(cards(quoted)[0]?.description || "'"), "Y-7-M 따옴표로 감싼 주소는 따옴표까지 뺀다");
  const four = await finish(kakaoText(["가", `${BASE}/a`, "나", `${BASE}/b`, "다", `${BASE}/c`, "라", `${BASE}/d`].join("\n")), groupPayload);
  t.deepEq(links(four).map((button) => button.label), ["가", "나", "다", "라"], "Y-7-M 주소 4개도 모두 버튼이 된다 (검토 전: 3개까지만, 넷째 주소와 그 이름 줄이 사라짐)");
}
{
  // 카드 속 주소는 남은 버튼 자리에만 넣고 있던 버튼을 밀어내지 않는다. 링크를 넣으면 세로 배치.
  const four = [1, 2, 3, 4].map((n) => ({ label: `고르기${n}`, action: "message", messageText: `고르기${n}` }));
  const card = (description, buttons, buttonLayout) => new Response(JSON.stringify({ version: "2.0", template: { outputs: [{ textCard: { description, buttons, buttonLayout } }] } }), { headers: { "content-type": "application/json" } });
  const crowded = await finish(card(`안내\n자세히 보기\n${BASE}/privacy\n설정 열기\n${BASE}/my/settings`, four, "vertical"), groupPayload);
  t.ok(four.every((button) => buttonsOf(crowded).some((item) => item.messageText === button.messageText)), "Y-7-N 카드 속 주소 때문에 있던 메시지 버튼이 밀려나지 않는다 (검토 전: 5개를 넘는 버튼을 버림)");
  t.deepEq(links(crowded).map((button) => button.webLinkUrl).sort(), [`${BASE}/my/settings`, `${BASE}/privacy`], "Y-7-N 자리가 모자란 링크는 다른 카드에 붙는다");
  t.ok(cards(crowded).every((item) => (item.buttons || []).length <= 5), "Y-7-N 카드마다 버튼 5개 이하");
  const flat = await finish(card(`안내\n자세히 보기\n${BASE}/privacy`, four.slice(0, 2), "horizontal"), groupPayload);
  t.ok(cards(flat).every((item) => item.buttonLayout !== "horizontal" || (item.buttons || []).length <= 2), "Y-7-N 가로 배치 카드에 링크를 넣으면 세로 배치로 바꾼다(가로는 2개까지만 보인다)");
}

// ── 2. 실제 /skill: 단톡방·1:1 명령 두루 ────────────────────────────────────────────
await fixture(async (fx) => {
  fx.env.KAKAO_SKILL_SECRET = "synthetic-v22988-link-secret";
  async function say(utterance, user, { group = true } = {}) {
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    globalThis.__AB_KAKAO_INFLIGHT?.clear();
    const jobs = [];
    const userRequest = { utterance, user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
    if (group) userRequest.chat = { id: ROOM, type: "botGroupKey", properties: { botGroupKey: ROOM } };
    const response = await app.fetch(new Request(`${BASE}/skill`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET },
      body: JSON.stringify({ bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" }, userRequest }),
    }), fx.env, { waitUntil: (job) => jobs.push(job), passThroughOnException() {} });
    const body = await response.json();
    await Promise.allSettled(jobs);
    return body;
  }
  const opened = new Map(); // 링크 버튼 주소 → 그 답을 받은 사람(끝에서 그 사람으로 열어 본다)
  const inspect = (body, label, user = OWNER) => {
    for (const button of links(body)) if (!opened.has(button.webLinkUrl)) opened.set(button.webLinkUrl, { user, label });
    t.ok(textsOf(body).every((text) => !URL_TEXT.test(text)), `${label}: 답 글에 주소가 없다`);
    t.ok(links(body).every((button) => String(button.webLinkUrl).startsWith(`${BASE}/`) && button.label.length >= 1 && button.label.length <= 14), `${label}: 링크 버튼은 우리 주소를 열고 이름은 1~14자`);
    t.ok(cards(body).every((card) => (card.buttons || []).length <= 5) && (body.template?.outputs || []).length <= 3, `${label}: 카드당 버튼 5개·말풍선 3개 이하`);
  };

  const OWNER = "link-buttons-owner";
  await say("@말해가계부 점심 5만원", OWNER);
  t.ok(fx.db.transactions.some((tx) => tx.source_user_key === OWNER), "준비: 첫 기록으로 방 가계부가 생긴다");

  for (const utterance of ["웹가계부", "웹 가계부 열기", "링크"]) {
    const body = await say(`@말해가계부 ${utterance}`, OWNER);
    inspect(body, `단톡방 ${utterance}`);
    // 이 방 가계부 번호는 넣지 않는다: 단톡방 기록 계정과 웹 로그인 계정이 이어지지 않아, 웹 계정이 구성원이 아니면 404 가 된다.
    t.deepEq(links(body).map((button) => [button.label, button.webLinkUrl]), [["웹 가계부 열기", `${BASE}/my`]], `단톡방 ${utterance}: ‘웹 가계부 열기’ 버튼 하나가 /my 를 연다 (예전: 주소 글)`);
    t.eq(cards(body)[0]?.title, "웹 가계부", `단톡방 ${utterance}: 제목 ‘웹 가계부’ 카드`);
  }
  // 버튼을 누르면 카카오가 주소 뒤에 식별값을 붙인다. 웹은 그것으로 로그인하지 않고, 로그인돼 있으면 그 사람의 가계부로 바로 간다.
  const landing = (cookie) => app.fetch(new Request(`${BASE}/my?botUserKey=${OWNER}&appUserId=&botGroupKey=${ROOM}`, { headers: { accept: "text/html", ...(cookie ? { cookie } : {}) } }), fx.env, { waitUntil() {}, passThroughOnException() {} });
  const anonymous = await landing("");
  t.ok(anonymous.status === 200 && !anonymous.headers.get("set-cookie")?.includes("ab_user=") && (await anonymous.text()).includes("로그인"), "링크 도착(로그인 전): 카카오가 붙인 botUserKey 로 로그인하지 않고 로그인 화면을 보인다");
  const member = await landing(fx.cookie);
  t.ok(member.status === 303 && /^\/app\?/.test(member.headers.get("location") || "") && !/botUserKey|botGroupKey/.test(member.headers.get("location") || ""), "링크 도착(로그인 뒤): 내 가계부 화면으로 바로 가고 카카오가 붙인 값은 따라가지 않는다");
  const managed = await say("@말해가계부 웹관리하기", OWNER);
  inspect(managed, "단톡방 웹관리하기");
  t.deepEq(buttonsOf(managed)[0], { label: "웹가계부", action: "webLink", webLinkUrl: `${BASE}/my` }, "단톡방 웹관리하기: 첫 버튼 ‘웹가계부’ 는 바로 열리는 링크");
  t.ok(textsOf(managed).some((text) => text.includes("‘웹가계부’를 눌러 로그인하면")), "단톡방 웹관리하기: ‘주소를 받아’ 대신 ‘눌러’ 로 안내");
  const invite = await say("@말해가계부 초대코드", OWNER);
  inspect(invite, "단톡방 초대코드");
  t.deepEq(links(invite).map((button) => [button.label, button.webLinkUrl]), [["참여자·초대 관리", `${BASE}/my/households`]], "단톡방 초대코드: 관리 주소는 ‘참여자·초대 관리’ 버튼");
  t.ok(buttonsOf(invite).some((button) => button.action === "message" && button.messageText === "단톡방연결"), "단톡방 초대코드: 원래 버튼(단톡방연결)은 그대로");
  const summary = await say("@말해가계부 이번달요약", OWNER);
  inspect(summary, "단톡방 이번달요약");
  t.ok(links(summary).some((button) => button.label === "상세 분석 보기" && button.webLinkUrl.startsWith(`${BASE}/my/analysis?`)), "단톡방 이번달요약: ‘상세 분석 보기’ 는 링크 버튼");
  for (let i = 0; i < 22; i += 1) await say(`@말해가계부 간식${i} ${1000 + i}원`, OWNER);
  const daily = await say("@말해가계부 오늘기록", OWNER);
  t.ok(links(daily).some((button) => button.label === "웹 가계부 열기" && button.webLinkUrl.startsWith(`${BASE}/my?`)), "단톡방 오늘기록(20건 넘음): 전체를 볼 곳은 ‘웹 가계부 열기’ 버튼");
  inspect(daily, "단톡방 오늘기록(20건 넘음)");
  // 버튼 이름이 여는 화면과 맞다(예전 기본값 ‘상세 분석 보기’ 로 설정·가계부 관리가 열렸다 — 버튼이 되면서 눈에 띄었다).
  for (const step of ["예산설정", "전체 월 예산", "50만원"]) await say(`@말해가계부 ${step}`, OWNER);
  const budget = await say("@말해가계부 설정하기", OWNER);
  inspect(budget, "단톡방 예산 설정 끝");
  t.ok(links(budget).some((button) => button.label === "예산 설정 열기" && button.webLinkUrl.startsWith(`${BASE}/my/settings?`)), "단톡방 예산 설정 끝: 설정 화면 버튼 이름은 ‘예산 설정 열기’ (예전: ‘상세 분석 보기’)");
  const MAKER = "link-buttons-maker";
  for (const step of ["가계부 만들기", "1", "우리집 생활비"]) await say(step, MAKER, { group: false });
  const made = await say("네", MAKER, { group: false });
  inspect(made, "1:1 가계부 만들기 끝", MAKER);
  t.deepEq(links(made).map((button) => [button.label, button.webLinkUrl]), [["가계부 관리", `${BASE}/my/households`]], "1:1 가계부 만들기 끝: 가계부 관리 화면 버튼 이름은 ‘가계부 관리’ (예전: ‘상세 분석 보기’)");

  const sweep = [...new Set([
    ...KAKAO_REPRESENTATIVE_COMMANDS.map((item) => item.messageText),
    ...KAKAO_SECONDARY_COMMANDS.map((item) => item.messageText),
    "도움말 보기", "웹관리하기", "정기지출", "함께쓰기", "리포트보기", "예산정하기", "고치기", "기록하기",
    "개인정보", "키워드 안내", "입력 예시", "오픈빌더", "브랜드", "말해가계부", "밈", "메뉴", "남은예산", "정산", "참여 취소",
  ])];
  for (const utterance of sweep) {
    inspect(await say(`@말해가계부 ${utterance}`, OWNER), `단톡방 ${utterance}`);
    await say("@말해가계부 취소", OWNER);
    const solo = `link-buttons-solo-${sweep.indexOf(utterance)}`;
    inspect(await say(utterance, solo, { group: false }), `1:1 ${utterance}`, solo);
  }
  // 1:1 ‘웹가계부’ 의 웹 연결 코드는 글 말풍선에 그대로 있어 길게 눌러 복사할 수 있다. 웹 가계부는 뒤의 ‘바로 열기’ 카드 버튼.
  for (const utterance of ["웹가계부", "웹 가계부 열기"]) {
    const SOLO = "link-buttons-solo-web";
    await say("점심 5000원", SOLO, { group: false });
    const body = await say(utterance, SOLO, { group: false });
    inspect(body, `1:1 ${utterance}(웹 연결 코드)`, SOLO);
    t.ok(/[A-Z0-9]{8}(-[A-Z0-9]{8}){3}/.test(body.template?.outputs?.[0]?.simpleText?.text || ""), `1:1 ${utterance}: 웹 연결 코드는 첫 글 말풍선에 그대로 있다(카드 설명으로 바뀌지 않음)`);
    t.ok(links(body).some((button) => button.webLinkUrl === `${BASE}/my`), `1:1 ${utterance}: 웹 가계부는 링크 버튼으로 연다`);
  }

  // 라우터의 요청 제한 답은 응답 마무리 함수를 거치지 않는다(독립 검토가 찾은 길). 그 답에도 글에 주소가 없다.
  // 카카오 서버 한 곳(같은 IP·UA)에서 1분에 SKILL_IP_GUARD_LIMIT(가장 작게 60)을 넘으면 나온다. 새 IP 로 61번째 요청을 본다.
  fx.env.SKILL_IP_GUARD_LIMIT = "60";
  const guardHeaders = { "content-type": "application/json", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET, "cf-connecting-ip": "203.0.113.88", "user-agent": "link-buttons-guard" };
  let limited = null;
  for (let i = 0; i <= 60; i += 1) {
    const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: guardHeaders, body: "{}" }), fx.env, { waitUntil() {}, passThroughOnException() {} });
    if (i === 60) limited = await response.json();
  }
  delete fx.env.SKILL_IP_GUARD_LIMIT;
  t.ok(textsOf(limited).some((text) => text.includes("짧은 시간에 요청이 많아서")), "요청 제한 답(라우터): 61번째 요청은 요청 제한 답을 받는다");
  t.ok(textsOf(limited).every((text) => !URL_TEXT.test(text)), "요청 제한 답(라우터): 글에 주소가 없다 (검토 전: ‘가계부 확인 https://malhaebook.com/my’ 글)");
  t.deepEq(links(limited).map((button) => [button.label, button.webLinkUrl]), [["가계부 확인", `${BASE}/my`]], "요청 제한 답(라우터): 웹 가계부는 ‘가계부 확인’ 링크 버튼(단톡방·1:1 모두 쓰는 글 카드)");
  t.ok(!limited.template?.quickReplies, "요청 제한 답(라우터): 단톡방이 받지 못하는 바로가기(quickReplies)가 없다");

  // 버튼 주소를 그 답을 받은 사람의 로그인으로 열어 본다(넘겨주기는 세 번까지 따라감). 마지막 화면이 200 이고 로그인 화면이 아니어야 한다
  // (없는 화면·오류가 아니고, 로그인이 풀려 로그인 화면으로 튕기지도 않음). 단톡방 기록 계정과 웹 로그인 계정이 이어지지 않는 점(appUserId 없음)은
  // 여기서 보지 않는다 — 그 사람 자신의 로그인으로 연다.
  t.ok(opened.size >= 10, `링크 버튼 주소를 두루 모았다 (${opened.size}개)`);
  for (const [href, { user, label }] of opened) {
    const row = fx.db.users.find((item) => item.kakao_user_key === user);
    const cookie = row ? await fx.cookieFor(row.id) : "";
    let target = href;
    let response = null;
    for (let hop = 0; hop < 4; hop += 1) {
      response = await app.fetch(new Request(target, { headers: { accept: "text/html", ...(cookie ? { cookie } : {}) } }), fx.env, { waitUntil() {}, passThroughOnException() {} });
      const location = response.headers.get("location");
      if (![301, 302, 303, 307, 308].includes(response.status) || !location) break;
      target = new URL(location, target).href;
    }
    const html = response.status === 200 ? await response.text() : "";
    t.ok(Boolean(cookie) && response.status === 200 && !html.includes('action="/my/local-login"'), `${label}: 링크 버튼 주소를 받은 사람으로 열면 그 화면이 열린다 (${new URL(href).pathname} → ${new URL(target).pathname} ${response.status})`);
  }
  // 위 검사가 로그인 화면을 알아보는지: 로그인 없이 열면 로그인 화면이다.
  const bounce = await app.fetch(new Request(`${BASE}/my`, { headers: { accept: "text/html" } }), fx.env, { waitUntil() {}, passThroughOnException() {} });
  t.ok((await bounce.text()).includes('action="/my/local-login"'), "로그인 없이 /my 를 열면 로그인 화면(위 검사의 기준이 맞음)");
});

t.done();
