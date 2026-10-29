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
  const ledger = new Response(JSON.stringify({ version: "2.0", template: { outputs: [{ textCard: { title: "웹관리하기", description: "안내", buttons: [{ label: "웹가계부", action: "message", messageText: "웹가계부" }, { label: "도움말 보기", action: "message", messageText: "도움말 보기" }] } }] } }), { headers: { "content-type": "application/json" } });
  const group = await finish(ledger.clone(), groupPayload);
  t.deepEq(buttonsOf(group)[0], { label: "웹가계부", action: "webLink", webLinkUrl: `${BASE}/my` }, "Y-7-G 단톡방의 ‘웹가계부’ 메시지 버튼은 바로 열리는 링크 버튼이 된다 (예전: 누르면 주소 글을 받음)");
  const direct = await finish(ledger, directPayload);
  t.eq(buttonsOf(direct)[0].action, "message", "Y-7-G 1:1 의 ‘웹가계부’ 버튼은 웹 연결 코드를 주는 답으로 가므로 메시지 버튼으로 둔다");
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
  const inspect = (body, label) => {
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
  t.deepEq(buttonsOf(managed)[0], { label: "웹가계부", action: "webLink", webLinkUrl: `${BASE}/my` }, "단톡방 웹관리하기: 첫 버튼 ‘웹가계부’ 는 바로 열리는 링크");
  t.ok(textsOf(managed).some((text) => text.includes("‘웹가계부’를 눌러 로그인하면")), "단톡방 웹관리하기: ‘주소를 받아’ 대신 ‘눌러’ 로 안내");
  const invite = await say("@말해가계부 초대코드", OWNER);
  t.deepEq(links(invite).map((button) => [button.label, button.webLinkUrl]), [["참여자·초대 관리", `${BASE}/my/households`]], "단톡방 초대코드: 관리 주소는 ‘참여자·초대 관리’ 버튼");
  t.ok(buttonsOf(invite).some((button) => button.action === "message" && button.messageText === "단톡방연결"), "단톡방 초대코드: 원래 버튼(단톡방연결)은 그대로");
  const summary = await say("@말해가계부 이번달요약", OWNER);
  t.ok(links(summary).some((button) => button.label === "상세 분석 보기" && button.webLinkUrl.startsWith(`${BASE}/my/analysis?`)), "단톡방 이번달요약: ‘상세 분석 보기’ 는 링크 버튼");
  for (let i = 0; i < 22; i += 1) await say(`@말해가계부 간식${i} ${1000 + i}원`, OWNER);
  const daily = await say("@말해가계부 오늘기록", OWNER);
  t.ok(links(daily).some((button) => button.label === "웹 가계부 열기" && button.webLinkUrl.startsWith(`${BASE}/my?`)), "단톡방 오늘기록(20건 넘음): 전체를 볼 곳은 ‘웹 가계부 열기’ 버튼");
  inspect(daily, "단톡방 오늘기록(20건 넘음)");

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
    inspect(await say(utterance, solo, { group: false }), `1:1 ${utterance}`);
  }
});

t.done();
